import { describe, expect, it } from 'vitest'
import {
  assessOrganicVolume,
  computeInRangeHistory,
  computeYieldStability,
  estimateRangeImpermanentLoss,
  type DailyCandle,
} from './pool-risk.js'

function candle(overrides: Partial<DailyCandle> & { close: number }): DailyCandle {
  const { close } = overrides
  return {
    timestampSeconds: 1_784_000_000,
    open: close,
    high: close,
    low: close,
    volumeUsd: 1_000_000,
    ...overrides,
  }
}

describe('estimateRangeImpermanentLoss', () => {
  it('is zero when the price does not move', () => {
    const il = estimateRangeImpermanentLoss({
      priceStart: 2000,
      priceEnd: 2000,
      rangeLowerPrice: 1800,
      rangeUpperPrice: 2200,
    })
    expect(il).toBeCloseTo(0, 10)
  })

  it('matches the classic full-range formula in the wide-range limit', () => {
    // As the range widens toward (0, infinity) a v3 position behaves like v2.
    // v2 IL for a 2x price move is 2*sqrt(2)/3 - 1 = -5.719%.
    const il = estimateRangeImpermanentLoss({
      priceStart: 1,
      priceEnd: 2,
      rangeLowerPrice: 1e-9,
      rangeUpperPrice: 1e9,
    })
    expect(il).toBeCloseTo(-0.05719, 4)
  })

  it('amplifies loss for a narrow range compared with a wide one', () => {
    const narrow = estimateRangeImpermanentLoss({
      priceStart: 2000,
      priceEnd: 2200,
      rangeLowerPrice: 1900,
      rangeUpperPrice: 2100,
    })
    const wide = estimateRangeImpermanentLoss({
      priceStart: 2000,
      priceEnd: 2200,
      rangeLowerPrice: 1000,
      rangeUpperPrice: 4000,
    })
    expect(narrow).toBeLessThan(wide)
    expect(narrow).toBeLessThan(0)
  })

  it('is never positive: an LP position cannot beat holding on price alone', () => {
    for (const priceEnd of [500, 1500, 2000, 2500, 8000]) {
      const il = estimateRangeImpermanentLoss({
        priceStart: 2000,
        priceEnd,
        rangeLowerPrice: 1800,
        rangeUpperPrice: 2200,
      })
      expect(il).toBeLessThanOrEqual(1e-12)
    }
  })

  it('rejects invalid prices and ranges', () => {
    expect(() =>
      estimateRangeImpermanentLoss({ priceStart: 0, priceEnd: 1, rangeLowerPrice: 1, rangeUpperPrice: 2 }),
    ).toThrow(/positive/)
    expect(() =>
      estimateRangeImpermanentLoss({ priceStart: 1, priceEnd: 1, rangeLowerPrice: 2, rangeUpperPrice: 1 }),
    ).toThrow(/range/)
  })
})

describe('computeInRangeHistory', () => {
  const candles: DailyCandle[] = [
    candle({ close: 2000, high: 2010, low: 1990 }),
    candle({ close: 2050, high: 2060, low: 2040 }),
    candle({ close: 2400, high: 2450, low: 2300 }), // far outside a ±5% band
  ]

  it('reports the share of days whose close stayed inside the band', () => {
    // ±5% around 2000 -> [1900, 2100]; two of three closes inside
    const result = computeInRangeHistory(candles, 2000, 5)
    expect(result.days).toBe(3)
    expect(result.daysCloseInRange).toBe(2)
    expect(result.closeInRangeDecimal).toBeCloseTo(2 / 3, 6)
  })

  it('counts days that never traded outside the band separately', () => {
    const result = computeInRangeHistory(candles, 2000, 5)
    // day 3 breaches; days 1-2 stay fully inside
    expect(result.daysFullyInRange).toBe(2)
  })

  it('returns zeroed history with no candles instead of dividing by zero', () => {
    const result = computeInRangeHistory([], 2000, 5)
    expect(result.days).toBe(0)
    expect(result.closeInRangeDecimal).toBe(0)
  })
})

describe('computeYieldStability', () => {
  it('summarizes the daily fee-yield series and flags a one-day spike', () => {
    const spiky: DailyCandle[] = [
      candle({ close: 1, volumeUsd: 1_000_000 }),
      candle({ close: 1, volumeUsd: 1_000_000 }),
      candle({ close: 1, volumeUsd: 20_000_000 }), // spike
    ]
    const result = computeYieldStability(spiky, { feeTierPercent: 1, reserveUsd: 1_000_000 })
    expect(result.days).toBe(3)
    // median day: 1M volume * 1% / 1M TVL = 1%/day
    expect(Number(result.medianDailyReturnPercent)).toBeCloseTo(1, 6)
    expect(Number(result.maxDailyReturnPercent)).toBeCloseTo(20, 6)
    expect(result.spikeDriven).toBe(true)
  })

  it('does not flag a steady series', () => {
    const steady: DailyCandle[] = [
      candle({ close: 1, volumeUsd: 1_000_000 }),
      candle({ close: 1, volumeUsd: 1_100_000 }),
      candle({ close: 1, volumeUsd: 900_000 }),
    ]
    const result = computeYieldStability(steady, { feeTierPercent: 1, reserveUsd: 1_000_000 })
    expect(result.spikeDriven).toBe(false)
  })

  it('reports insufficient history below the three-day validation rule', () => {
    const result = computeYieldStability([candle({ close: 1 })], { feeTierPercent: 1, reserveUsd: 1_000_000 })
    expect(result.sufficientHistory).toBe(false)
  })
})

describe('assessOrganicVolume', () => {
  it('accepts volume spread across many unique traders', () => {
    const result = assessOrganicVolume({ volume24hUsd: 1_000_000, buys: 5_000, sells: 5_000, buyers: 2_000, sellers: 1_800 })
    expect(result.uniqueTraders).toBe(3_800)
    expect(result.suspicious).toBe(false)
  })

  it('flags high volume concentrated in very few traders', () => {
    const result = assessOrganicVolume({ volume24hUsd: 5_000_000, buys: 4_000, sells: 4_000, buyers: 5, sellers: 4 })
    expect(result.suspicious).toBe(true)
    expect(result.notes.join(' ')).toMatch(/trader/i)
  })

  it('flags a heavily one-sided flow', () => {
    const result = assessOrganicVolume({ volume24hUsd: 1_000_000, buys: 9_500, sells: 200, buyers: 900, sellers: 80 })
    expect(result.notes.join(' ')).toMatch(/one-sided|imbalance/i)
  })

  it('handles zero traders without dividing by zero', () => {
    const result = assessOrganicVolume({ volume24hUsd: 0, buys: 0, sells: 0, buyers: 0, sellers: 0 })
    expect(result.uniqueTraders).toBe(0)
    expect(Number.isFinite(result.volumePerTraderUsd)).toBe(true)
  })
})
