/**
 * LP opportunity scoring, adapted from the pool-selection criteria discussed on
 * the MeteoraIDN channel (Evil Panda's screen), applied to Uniswap v3 pools:
 *
 * - market cap >= $250K
 * - 24h volume >= $1M
 * - pool age >= 24h (brand-new pools are rug-prone)
 * - volume / active TVL >= 0.5 (the primary "is volume big" signal)
 * - rank by estimated daily fee return = (volume/TVL) * fee rate
 *
 * These are descriptive research signals from third-party data, not on-chain
 * verified evidence and not a recommendation to deploy capital.
 */

export const OPPORTUNITY_CRITERIA = Object.freeze({
  minMarketCapUsd: 250_000,
  minVolume24hUsd: 1_000_000,
  minAgeHours: 24,
  minVolumeToTvl: 0.5,
})

const MIN_MARKET_CAP_USD = OPPORTUNITY_CRITERIA.minMarketCapUsd
const MIN_VOLUME_24H_USD = OPPORTUNITY_CRITERIA.minVolume24hUsd
const MIN_AGE_HOURS = OPPORTUNITY_CRITERIA.minAgeHours
const MIN_VOLUME_TO_TVL = OPPORTUNITY_CRITERIA.minVolumeToTvl

// Light dust filter (user-selected): only drop near-empty pools.
const DUST_MIN_VOLUME_24H_USD = 50_000
const DUST_MIN_RESERVE_USD = 10_000

export type OpportunityPool = {
  name: string
  address: string
  feeTierPercent: number
  /** 24h trade counts, when the source provides them (used for organic-volume checks). */
  transactions24h?: { buys: number; sells: number; buyers: number; sellers: number }
  createdAt: Date
  marketCapUsd: number | null
  reserveUsd: number
  volume24hUsd: number
  volume6hUsd: number
}

export type VolumeTrend = 'rising' | 'steady' | 'fading'

export type ScoredOpportunity = {
  name: string
  address: string
  feeTierPercent: number
  ageHours: number
  marketCapUsd: number | null
  reserveUsd: number
  volume24hUsd: number
  volumeToTvl: number
  estDailyFeeReturnPercent: string
  volumeTrend: VolumeTrend
  passesScreen: boolean
  screenNotes: readonly string[]
  transactions24h?: { buys: number; sells: number; buyers: number; sellers: number }
}

export function scoreOpportunity(pool: OpportunityPool, now = new Date()): ScoredOpportunity {
  const ageHours = Math.max(0, (now.getTime() - pool.createdAt.getTime()) / 3_600_000)
  const volumeToTvl = pool.reserveUsd > 0 ? pool.volume24hUsd / pool.reserveUsd : 0
  const estDailyFeeReturnPercent = (volumeToTvl * pool.feeTierPercent).toFixed(2)

  // recent (h6) vs full-day hourly rate
  const recentHourly = pool.volume6hUsd / 6
  const dayHourly = pool.volume24hUsd / 24
  const trendRatio = dayHourly > 0 ? recentHourly / dayHourly : 1
  const volumeTrend: VolumeTrend = trendRatio >= 1.2 ? 'rising' : trendRatio <= 0.8 ? 'fading' : 'steady'

  const screenNotes: string[] = []
  if (pool.marketCapUsd === null || pool.marketCapUsd < MIN_MARKET_CAP_USD) {
    screenNotes.push(`market cap below $${MIN_MARKET_CAP_USD.toLocaleString()}`)
  }
  if (pool.volume24hUsd < MIN_VOLUME_24H_USD) {
    screenNotes.push(`24h volume below $${MIN_VOLUME_24H_USD.toLocaleString()}`)
  }
  if (ageHours < MIN_AGE_HOURS) {
    screenNotes.push('pool is newer than 24h')
  }
  if (volumeToTvl < MIN_VOLUME_TO_TVL) {
    screenNotes.push('volume/TVL activity below 0.5')
  }

  return {
    name: pool.name,
    address: pool.address,
    feeTierPercent: pool.feeTierPercent,
    ageHours,
    marketCapUsd: pool.marketCapUsd,
    reserveUsd: pool.reserveUsd,
    volume24hUsd: pool.volume24hUsd,
    volumeToTvl,
    estDailyFeeReturnPercent,
    volumeTrend,
    passesScreen: screenNotes.length === 0,
    screenNotes,
    ...(pool.transactions24h ? { transactions24h: pool.transactions24h } : {}),
  }
}

/**
 * Screen-passing pools rank above failing ones, then by estimated daily fee
 * return within each group. Ranking purely by yield buries every depositable
 * pool beneath short-lived volume spikes in tiny-market-cap tokens.
 */
export function rankOpportunities(pools: readonly OpportunityPool[], now = new Date()): readonly ScoredOpportunity[] {
  return pools
    .filter((pool) => pool.volume24hUsd >= DUST_MIN_VOLUME_24H_USD && pool.reserveUsd >= DUST_MIN_RESERVE_USD)
    .map((pool) => scoreOpportunity(pool, now))
    .sort((left, right) => {
      if (left.passesScreen !== right.passesScreen) return left.passesScreen ? -1 : 1
      return Number(right.estDailyFeeReturnPercent) - Number(left.estDailyFeeReturnPercent)
    })
}
