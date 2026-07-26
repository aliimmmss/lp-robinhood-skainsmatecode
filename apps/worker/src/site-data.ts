import { buildDepositPlan, type DepositPlan } from '@lp-mine/core'
import { ROBINHOOD_WETH_USDG_POOLS } from '@lp-mine/robinhood-univ3'
import { pathToFileURL } from 'node:url'
import { buildMonitorHealthReport, type MonitorHealthReport } from './monitor-health.js'
import { readMonitorHealthConfig } from './monitor-health-config.js'
import { buildPoolFeeReport, type PoolFeeReport } from './pools-fees.js'
import { buildOpportunityReport, type OpportunityReport } from './pools-opportunities.js'
import { buildPoolRiskReport, type PoolRiskReport } from './pool-risk-report.js'

// Canonical pinned pair decimals (verified in the registry smoke check).
const WETH_DECIMALS = 18
const USDG_DECIMALS = 6
const DEFAULT_RANGE_PERCENT = 10

/** Deposit plan for the highest-ranked deposit-ready pinned pool, if any. */
function buildTopDepositPlan(fees: PoolFeeReport, rangePercent: number): DepositPlan | null {
  const top = fees.pools.find((pool) => pool.status === 'complete' && pool.currentTick !== null)
  if (!top || top.currentTick === null) return null
  const registryPool = ROBINHOOD_WETH_USDG_POOLS.find((pool) => pool.feeTier === top.feeTier)
  if (!registryPool) return null
  return buildDepositPlan(
    {
      poolAddress: top.poolAddress,
      feeTier: top.feeTier,
      tickSpacing: registryPool.tickSpacing,
      currentTick: top.currentTick,
      token0Symbol: 'WETH',
      token1Symbol: 'USDG',
      token0Decimals: WETH_DECIMALS,
      token1Decimals: USDG_DECIMALS,
    },
    { rangePercent },
  )
}

const DEFAULT_FEE_WINDOW_SECONDS = 86_400
const DEFAULT_REFERENCE_LIQUIDITY = 10n ** 18n

/**
 * Single read-only snapshot consumed by the static monitoring site. Composes
 * the already-tested health and fee-yield reports so the site has one file to
 * render. schemaVersion lets the site detect an incompatible shape.
 */
export type SiteData = {
  schemaVersion: 1
  generatedAt: string
  health: MonitorHealthReport
  fees: PoolFeeReport
  depositPlan: DepositPlan | null
  opportunities: OpportunityReport | { error: string } | null
  risk: PoolRiskReport | { error: string } | null
  /** Our own on-chain price for the plan's pool against the third-party feed. */
  priceCrossCheck: {
    poolAddress: string
    onChainPrice: string
    thirdPartyPrice: string
    differencePercent: string
    agrees: boolean
  } | null
}

/** DB-only snapshot (offline-safe). Opportunities are attached separately. */
export function buildSiteData(environment: NodeJS.ProcessEnv = process.env, now = new Date()): SiteData {
  const healthConfig = readMonitorHealthConfig(environment)
  const health = buildMonitorHealthReport(healthConfig, now)
  const fees = buildPoolFeeReport(
    {
      databasePath: healthConfig.databasePath,
      windowSeconds: DEFAULT_FEE_WINDOW_SECONDS,
      referenceLiquidity: DEFAULT_REFERENCE_LIQUIDITY,
      limit: healthConfig.historyLimit,
    },
    now,
  )
  const depositPlan = buildTopDepositPlan(fees, DEFAULT_RANGE_PERCENT)
  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    health,
    fees,
    depositPlan,
    opportunities: null,
    risk: null,
    priceCrossCheck: null,
  }
}

/** Agreement threshold; wider than normal feed lag, narrow enough to catch a real break. */
const PRICE_AGREEMENT_TOLERANCE_PERCENT = 2

function buildPriceCrossCheck(
  plan: DepositPlan | null,
  opportunities: OpportunityReport,
): SiteData['priceCrossCheck'] {
  if (!plan) return null
  const match = opportunities.opportunities.find(
    (pool) => pool.address.toLowerCase() === plan.poolAddress.toLowerCase(),
  )
  if (!match) return null
  // The scanner reports USD prices per token; the plan's price is token1 per token0.
  const thirdParty =
    match.basePriceUsd && match.quotePriceUsd && match.quotePriceUsd > 0
      ? match.basePriceUsd / match.quotePriceUsd
      : null
  if (thirdParty === null) return null
  const onChain = Number(plan.currentPriceToken1PerToken0)
  if (!Number.isFinite(onChain) || onChain <= 0) return null
  // Either orientation may be the readable one; compare against the closer.
  const inverted = 1 / thirdParty
  const candidate = Math.abs(onChain - thirdParty) <= Math.abs(onChain - inverted) ? thirdParty : inverted
  const differencePercent = ((onChain - candidate) / candidate) * 100
  return {
    poolAddress: plan.poolAddress,
    onChainPrice: onChain.toFixed(2),
    thirdPartyPrice: candidate.toFixed(2),
    differencePercent: differencePercent.toFixed(2),
    agrees: Math.abs(differencePercent) <= PRICE_AGREEMENT_TOLERANCE_PERCENT,
  }
}

/** Full snapshot including the best-effort third-party opportunity feed. */
export async function assembleSiteData(
  environment: NodeJS.ProcessEnv = process.env,
  now = new Date(),
): Promise<SiteData> {
  const data = buildSiteData(environment, now)
  try {
    const opportunities = await buildOpportunityReport({ now })
    data.opportunities = opportunities
    data.priceCrossCheck = buildPriceCrossCheck(data.depositPlan, opportunities)
    // Risk analysis costs one OHLCV call per pool, so it runs here at deploy
    // time rather than in the browser's frequent refresh.
    try {
      data.risk = await buildPoolRiskReport(opportunities.opportunities, { rangePercent: DEFAULT_RANGE_PERCENT, now })
    } catch (error: unknown) {
      data.risk = { error: error instanceof Error ? error.message : String(error) }
    }
  } catch (error: unknown) {
    // A GeckoTerminal outage must not break the site build.
    data.opportunities = { error: error instanceof Error ? error.message : String(error) }
  }
  return data
}

export async function runSiteDataCommand(): Promise<void> {
  const data = await assembleSiteData()
  process.stdout.write(
    `${JSON.stringify(data, (_key, value: unknown) => (typeof value === 'bigint' ? value.toString() : value), 2)}\n`,
  )
}

const isEntrypoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (isEntrypoint) {
  runSiteDataCommand().catch((error: unknown) => {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  })
}
