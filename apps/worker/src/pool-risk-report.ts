import {
  assessOrganicVolume,
  computeInRangeHistory,
  computeYieldStability,
  estimateRangeImpermanentLoss,
  type DailyCandle,
  type InRangeHistory,
  type OrganicVolumeAssessment,
  type ScoredOpportunity,
  type YieldStability,
} from '@lp-mine/core'
import { fetchDailyCandles } from './geckoterminal.js'

const DEFAULT_RANGE_PERCENT = 10
const DEFAULT_HISTORY_DAYS = 10
/** Pools analyzed per run. Each costs one OHLCV call, so this is kept small. */
const DEFAULT_MAX_POOLS = 8
/**
 * Gap between OHLCV calls. The source's limit is shared across its endpoints and
 * tighter than its nominal 30/min, so this run stays well under it — the report
 * is rebuilt a few times a day, making a slow loop free.
 */
const REQUEST_SPACING_MS = 4_000
/** One retry after a rate-limit rejection, then give up for this run. */
const RATE_LIMIT_BACKOFF_MS = 10_000

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export type PoolRisk = {
  address: string
  name: string
  historyDays: number
  /** Divergence loss over the observed window for a +/-rangePercent band, as a percent string. */
  impermanentLossPercent: string | null
  /** Fee return over the window minus that divergence loss. */
  netReturnPercent: string | null
  grossFeeReturnPercent: string | null
  inRange: InRangeHistory | null
  stability: YieldStability | null
  organic: OrganicVolumeAssessment | null
  warnings: readonly string[]
}

export type PoolRiskReport = {
  mode: 'read-only'
  source: 'geckoterminal'
  generatedAt: string
  rangePercent: number
  pools: readonly PoolRisk[]
  disclaimer: string
}

/**
 * Risk metrics for one pool from its daily candles.
 *
 * The fee side reuses the same volume-over-TVL basis as the opportunity screen,
 * summed across the observed window, so gross and net are directly comparable.
 */
export function analyzePoolRisk(
  pool: ScoredOpportunity,
  candles: readonly DailyCandle[],
  rangePercent = DEFAULT_RANGE_PERCENT,
): PoolRisk {
  const warnings: string[] = []
  const base = { address: pool.address, name: pool.name, historyDays: candles.length }

  if (candles.length < 2) {
    return {
      ...base,
      impermanentLossPercent: null,
      netReturnPercent: null,
      grossFeeReturnPercent: null,
      inRange: null,
      stability: null,
      organic: null,
      warnings: ['insufficient candle history for risk analysis'],
    }
  }

  const first = candles[0]!
  const last = candles[candles.length - 1]!
  const stability = computeYieldStability(candles, {
    feeTierPercent: pool.feeTierPercent,
    reserveUsd: pool.reserveUsd,
  })
  const inRange = computeInRangeHistory(candles, last.close, rangePercent)

  // Divergence loss assumes the position was opened at the window's first close
  // with a band centered there, then held to the latest close.
  const il = estimateRangeImpermanentLoss({
    priceStart: first.close,
    priceEnd: last.close,
    rangeLowerPrice: first.close * (1 - rangePercent / 100),
    rangeUpperPrice: first.close * (1 + rangePercent / 100),
  })
  const ilPercent = il * 100

  // Gross assumes the position was in range for the whole window. Net discounts
  // it by the share of days that closed inside the band — a softer, still
  // evidence-based proxy for earning time than requiring an untouched band.
  const grossIfAlwaysInRange =
    pool.reserveUsd > 0
      ? candles.reduce(
          (total, candle) => total + (candle.volumeUsd * (pool.feeTierPercent / 100) * 100) / pool.reserveUsd,
          0,
        )
      : 0
  const gross = grossIfAlwaysInRange * inRange.closeInRangeDecimal

  if (!stability.sufficientHistory) warnings.push('fewer than three days of history')
  if (stability.spikeDriven) warnings.push('yield is spike-driven, not persistent')
  if (inRange.fullyInRangeDecimal < 0.5) {
    warnings.push(`price stayed fully inside +/-${rangePercent}% on only ${Math.round(inRange.fullyInRangeDecimal * 100)}% of days`)
  }
  const organic = pool.transactions24h
    ? assessOrganicVolume({ volume24hUsd: pool.volume24hUsd, ...pool.transactions24h })
    : null
  if (organic?.suspicious) warnings.push(`volume quality: ${organic.notes.join('; ')}`)

  return {
    ...base,
    impermanentLossPercent: ilPercent.toFixed(2),
    grossFeeReturnPercent: grossIfAlwaysInRange.toFixed(2),
    netReturnPercent: (gross + ilPercent).toFixed(2),
    inRange,
    stability,
    organic,
    warnings,
  }
}

/**
 * Fetches candles and builds risk metrics for the highest-priority pools.
 * Sequential by design: one OHLCV call per pool, well inside the source's limits.
 */
export async function buildPoolRiskReport(
  pools: readonly ScoredOpportunity[],
  options: { rangePercent?: number; maxPools?: number; historyDays?: number; now?: Date } = {},
): Promise<PoolRiskReport> {
  const rangePercent = options.rangePercent ?? DEFAULT_RANGE_PERCENT
  const maxPools = options.maxPools ?? DEFAULT_MAX_POOLS
  const historyDays = options.historyDays ?? DEFAULT_HISTORY_DAYS
  const now = options.now ?? new Date()

  const analyzed: PoolRisk[] = []
  let first = true
  for (const pool of pools.slice(0, maxPools)) {
    // The source allows roughly 30 requests per minute; pace the calls so a run
    // of ten pools cannot trip rate limiting.
    if (!first) await delay(REQUEST_SPACING_MS)
    first = false
    try {
      let candles: readonly DailyCandle[]
      try {
        candles = await fetchDailyCandles(pool.address, historyDays)
      } catch (error: unknown) {
        if (!(error instanceof Error) || !error.message.includes('429')) throw error
        await delay(RATE_LIMIT_BACKOFF_MS)
        candles = await fetchDailyCandles(pool.address, historyDays)
      }
      analyzed.push(analyzePoolRisk(pool, candles, rangePercent))
    } catch (error: unknown) {
      analyzed.push({
        address: pool.address,
        name: pool.name,
        historyDays: 0,
        impermanentLossPercent: null,
        netReturnPercent: null,
        grossFeeReturnPercent: null,
        inRange: null,
        stability: null,
        organic: null,
        warnings: [`candle fetch failed: ${error instanceof Error ? error.message : String(error)}`],
      })
    }
  }

  return {
    mode: 'read-only',
    source: 'geckoterminal',
    generatedAt: now.toISOString(),
    rangePercent,
    pools: analyzed,
    disclaimer:
      'Divergence loss, in-range history, and yield stability are estimates from third-party daily candles over a short window, using current TVL for every day. They describe the past and are not a forecast or a recommendation to deploy capital.',
  }
}
