/**
 * Risk-side pool analysis: the counterweight to headline fee yield.
 *
 * Fee yield alone is misleading — a pool can pay well and still lose against
 * simply holding the two tokens. These functions estimate divergence loss for a
 * concentrated range, how often price historically stayed inside a band, whether
 * a yield is persistent or spike-driven, and whether reported volume looks like
 * it came from real traders.
 *
 * All outputs are estimates from third-party daily candles. They describe the
 * past; they do not predict returns and are not a recommendation.
 */

/** One daily OHLCV candle expressed in pool-ratio terms (token1 per token0). */
export type DailyCandle = {
  timestampSeconds: number
  open: number
  high: number
  low: number
  close: number
  volumeUsd: number
}

export type RangeIlInput = {
  priceStart: number
  priceEnd: number
  rangeLowerPrice: number
  rangeUpperPrice: number
}

/** Token amounts of a unit-liquidity v3 position at price `price`, clamped to its range. */
function unitPositionAmounts(
  price: number,
  lower: number,
  upper: number,
): { amount0: number; amount1: number } {
  const clamped = Math.min(Math.max(price, lower), upper)
  const sqrtP = Math.sqrt(clamped)
  return {
    amount0: 1 / sqrtP - 1 / Math.sqrt(upper),
    amount1: sqrtP - Math.sqrt(lower),
  }
}

/**
 * Divergence (impermanent) loss of a Uniswap v3 range position versus holding
 * the position's opening token amounts, as a decimal (-0.05 = 5% below HODL).
 *
 * Uses exact v3 position values rather than the full-range approximation, so a
 * narrow range correctly shows amplified loss and a position whose price has
 * left the range shows the fully-converted outcome.
 */
export function estimateRangeImpermanentLoss(input: RangeIlInput): number {
  const { priceStart, priceEnd, rangeLowerPrice, rangeUpperPrice } = input
  if (!(priceStart > 0) || !(priceEnd > 0)) throw new RangeError('prices must be positive')
  if (!(rangeLowerPrice > 0) || !(rangeUpperPrice > rangeLowerPrice)) {
    throw new RangeError('range must satisfy 0 < lower < upper')
  }

  const opening = unitPositionAmounts(priceStart, rangeLowerPrice, rangeUpperPrice)
  const closing = unitPositionAmounts(priceEnd, rangeLowerPrice, rangeUpperPrice)

  // Both valued in token1 terms at the ending price.
  const hodlValue = opening.amount0 * priceEnd + opening.amount1
  const positionValue = closing.amount0 * priceEnd + closing.amount1
  if (!(hodlValue > 0)) return 0
  return positionValue / hodlValue - 1
}

export type InRangeHistory = {
  days: number
  daysCloseInRange: number
  daysFullyInRange: number
  closeInRangeDecimal: number
  fullyInRangeDecimal: number
  rangePercent: number
}

/**
 * How often price historically sat inside a symmetric band around `centerPrice`.
 * `daysCloseInRange` counts days that ended inside the band; `daysFullyInRange`
 * counts days that never traded outside it (the stricter, fee-earning view).
 */
export function computeInRangeHistory(
  candles: readonly DailyCandle[],
  centerPrice: number,
  rangePercent: number,
): InRangeHistory {
  if (!(centerPrice > 0)) throw new RangeError('centerPrice must be positive')
  if (!(rangePercent > 0)) throw new RangeError('rangePercent must be positive')
  const lower = centerPrice * (1 - rangePercent / 100)
  const upper = centerPrice * (1 + rangePercent / 100)

  let closeInRange = 0
  let fullyInRange = 0
  for (const candle of candles) {
    if (candle.close >= lower && candle.close <= upper) closeInRange += 1
    if (candle.low >= lower && candle.high <= upper) fullyInRange += 1
  }
  const days = candles.length
  return {
    days,
    daysCloseInRange: closeInRange,
    daysFullyInRange: fullyInRange,
    closeInRangeDecimal: days === 0 ? 0 : closeInRange / days,
    fullyInRangeDecimal: days === 0 ? 0 : fullyInRange / days,
    rangePercent,
  }
}

export type YieldStability = {
  days: number
  sufficientHistory: boolean
  medianDailyReturnPercent: string
  minDailyReturnPercent: string
  maxDailyReturnPercent: string
  spikeDriven: boolean
}

/** Minimum days before a measured yield is treated as validated rather than luck. */
const MINIMUM_VALIDATION_DAYS = 3
/** A max day this many times the median means the average is spike-driven. */
const SPIKE_MULTIPLE = 3

function median(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

/**
 * Daily fee-return series implied by each day's volume against current TVL.
 *
 * TVL history is not available from the source, so today's reserve is used for
 * every day. That makes the series a like-for-like comparison of volume, not a
 * reconstruction of what a position actually earned.
 */
export function computeYieldStability(
  candles: readonly DailyCandle[],
  pool: { feeTierPercent: number; reserveUsd: number },
): YieldStability {
  const usable = pool.reserveUsd > 0 ? candles : []
  const series = usable.map((candle) => (candle.volumeUsd * (pool.feeTierPercent / 100) * 100) / pool.reserveUsd)
  const med = median(series)
  const max = series.length > 0 ? Math.max(...series) : 0
  const min = series.length > 0 ? Math.min(...series) : 0
  return {
    days: candles.length,
    sufficientHistory: candles.length >= MINIMUM_VALIDATION_DAYS,
    medianDailyReturnPercent: med.toFixed(3),
    minDailyReturnPercent: min.toFixed(3),
    maxDailyReturnPercent: max.toFixed(3),
    spikeDriven: med > 0 && max > med * SPIKE_MULTIPLE,
  }
}

export type OrganicVolumeInput = {
  volume24hUsd: number
  buys: number
  sells: number
  buyers: number
  sellers: number
}

export type OrganicVolumeAssessment = {
  uniqueTraders: number
  tradesPerTrader: number
  volumePerTraderUsd: number
  buyShareDecimal: number
  suspicious: boolean
  notes: readonly string[]
}

/** Volume concentrated in very few wallets, or extremely one-sided, is a wash-trading tell. */
const MAX_VOLUME_PER_TRADER_USD = 100_000
const MIN_UNIQUE_TRADERS = 50
const MAX_ONE_SIDED_SHARE = 0.9

export function assessOrganicVolume(input: OrganicVolumeInput): OrganicVolumeAssessment {
  const uniqueTraders = input.buyers + input.sellers
  const trades = input.buys + input.sells
  const volumePerTraderUsd = uniqueTraders > 0 ? input.volume24hUsd / uniqueTraders : 0
  const tradesPerTrader = uniqueTraders > 0 ? trades / uniqueTraders : 0
  const buyShareDecimal = trades > 0 ? input.buys / trades : 0

  const notes: string[] = []
  if (input.volume24hUsd > 0 && uniqueTraders < MIN_UNIQUE_TRADERS) {
    notes.push(`only ${uniqueTraders} unique traders in 24h`)
  }
  if (volumePerTraderUsd > MAX_VOLUME_PER_TRADER_USD) {
    notes.push(`$${Math.round(volumePerTraderUsd).toLocaleString()} volume per trader`)
  }
  if (trades > 0 && (buyShareDecimal > MAX_ONE_SIDED_SHARE || buyShareDecimal < 1 - MAX_ONE_SIDED_SHARE)) {
    notes.push('one-sided flow imbalance')
  }

  return {
    uniqueTraders,
    tradesPerTrader,
    volumePerTraderUsd,
    buyShareDecimal,
    suspicious: notes.length > 0,
    notes,
  }
}
