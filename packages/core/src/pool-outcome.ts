/**
 * Turns pool percentages into the shapes a person actually decides on: dollar
 * outcomes for a chosen notional, whether price is trending (a trending pool
 * leaves its range and converts divergence loss into a realized one), and which
 * fee tier of a pair currently pays best.
 *
 * Estimates from past third-party data. Not forecasts, not recommendations.
 */

export type PriceTrend = 'trending-up' | 'trending-down' | 'ranging'

/** A 24h move at or beyond this size, sustained in the 6h window, counts as a trend. */
const TREND_MAGNITUDE_PERCENT = 5

export type PriceChangeWindows = {
  h1?: number
  h6?: number
  h24?: number
}

/**
 * Classifies direction from price-change windows. A large 24h move whose recent
 * window points the other way is treated as choppy rather than trending — the
 * distinction that matters for whether a range will hold.
 */
export function classifyPriceTrend(changes: PriceChangeWindows): { trend: PriceTrend; magnitudePercent: number } {
  const h24 = changes.h24 ?? 0
  const h6 = changes.h6 ?? 0
  const magnitudePercent = h24
  if (Math.abs(h24) < TREND_MAGNITUDE_PERCENT) return { trend: 'ranging', magnitudePercent }
  if (h24 > 0 && h6 > 0) return { trend: 'trending-up', magnitudePercent }
  if (h24 < 0 && h6 < 0) return { trend: 'trending-down', magnitudePercent }
  return { trend: 'ranging', magnitudePercent }
}

export type PositionOutcomeInput = {
  notionalUsd: number
  medianDailyFeePercent: number
  impermanentLossPercent: number
  days: number
}

export type PositionOutcome = {
  notionalUsd: number
  dailyFeesUsd: number
  periodFeesUsd: number
  impermanentLossUsd: number
  netUsd: number
  /** Days of fees needed to cover the divergence loss; null when fees are zero. */
  breakevenDays: number | null
}

export function projectPositionOutcome(input: PositionOutcomeInput): PositionOutcome {
  if (!(input.notionalUsd > 0)) throw new RangeError('notionalUsd must be positive')
  const dailyFeesUsd = input.notionalUsd * (input.medianDailyFeePercent / 100)
  const periodFeesUsd = dailyFeesUsd * Math.max(0, input.days)
  const impermanentLossUsd = input.notionalUsd * (input.impermanentLossPercent / 100)
  const lossToRecover = Math.abs(Math.min(0, input.impermanentLossPercent))

  let breakevenDays: number | null
  if (lossToRecover === 0) breakevenDays = 0
  else if (input.medianDailyFeePercent <= 0) breakevenDays = null
  else breakevenDays = lossToRecover / input.medianDailyFeePercent

  return {
    notionalUsd: input.notionalUsd,
    dailyFeesUsd,
    periodFeesUsd,
    impermanentLossUsd,
    netUsd: periodFeesUsd + impermanentLossUsd,
    breakevenDays,
  }
}

/** Order-independent key for a pool pair, so "A / B" and "B / A" group together. */
export function normalizePairKey(poolName: string): string {
  const withoutFee = poolName.replace(/\s*\d+(?:\.\d+)?%\s*$/, '')
  return withoutFee
    .split('/')
    .map((part) => part.trim().toLowerCase())
    .sort()
    .join('/')
}

export type TierCandidate = {
  name: string
  address: string
  netReturnPercent: string | null
}

export type BestTier = {
  pair: string
  bestName: string
  bestAddress: string
  bestNetPercent: string
  /** How many other fee tiers of this pair were compared. */
  alternatives: number
}

/**
 * Best-performing fee tier per pair. The same pair often exists at several fee
 * tiers, and the highest fee tier is not automatically the best net earner.
 */
export function bestTierPerPair(pools: readonly TierCandidate[]): readonly BestTier[] {
  const groups = new Map<string, TierCandidate[]>()
  for (const pool of pools) {
    if (pool.netReturnPercent === null) continue
    const key = normalizePairKey(pool.name)
    const existing = groups.get(key)
    if (existing) existing.push(pool)
    else groups.set(key, [pool])
  }

  const results: BestTier[] = []
  for (const [key, candidates] of groups) {
    const sorted = [...candidates].sort(
      (left, right) => Number(right.netReturnPercent) - Number(left.netReturnPercent),
    )
    const best = sorted[0]!
    results.push({
      pair: key,
      bestName: best.name,
      bestAddress: best.address,
      bestNetPercent: best.netReturnPercent!,
      alternatives: sorted.length - 1,
    })
  }
  return results.sort((left, right) => Number(right.bestNetPercent) - Number(left.bestNetPercent))
}
