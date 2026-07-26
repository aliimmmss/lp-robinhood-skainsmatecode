import { describe, expect, it } from 'vitest'
import { bestTierPerPair, classifyPriceTrend, normalizePairKey, projectPositionOutcome } from './pool-outcome.js'

describe('classifyPriceTrend', () => {
  it('calls a sustained move in one direction a trend', () => {
    expect(classifyPriceTrend({ h1: 1.2, h6: 6.4, h24: 18.5 }).trend).toBe('trending-up')
    expect(classifyPriceTrend({ h1: -1.1, h6: -7.2, h24: -21.3 }).trend).toBe('trending-down')
  })

  it('calls a small or conflicting move ranging', () => {
    expect(classifyPriceTrend({ h1: 0.2, h6: -0.4, h24: 1.1 }).trend).toBe('ranging')
    // large 24h move but the recent window went the other way: choppy, not trending
    expect(classifyPriceTrend({ h1: -2, h6: -5, h24: 20 }).trend).toBe('ranging')
  })

  it('reports the 24h magnitude it judged on', () => {
    expect(classifyPriceTrend({ h1: 1, h6: 6, h24: 18.5 }).magnitudePercent).toBeCloseTo(18.5, 6)
  })

  it('treats missing windows as ranging rather than guessing', () => {
    expect(classifyPriceTrend({}).trend).toBe('ranging')
  })
})

describe('projectPositionOutcome', () => {
  it('converts percentages into dollar figures for a notional', () => {
    const result = projectPositionOutcome({
      notionalUsd: 1_000,
      medianDailyFeePercent: 0.5,
      impermanentLossPercent: -2,
      days: 10,
    })
    expect(result.dailyFeesUsd).toBeCloseTo(5, 6) // 0.5% of 1000
    expect(result.periodFeesUsd).toBeCloseTo(50, 6) // 10 days
    expect(result.impermanentLossUsd).toBeCloseTo(-20, 6) // -2% of 1000
    expect(result.netUsd).toBeCloseTo(30, 6)
  })

  it('reports how many days of fees cover the divergence loss', () => {
    const result = projectPositionOutcome({
      notionalUsd: 1_000,
      medianDailyFeePercent: 0.5,
      impermanentLossPercent: -2,
      days: 10,
    })
    expect(result.breakevenDays).toBeCloseTo(4, 6) // 2% / 0.5% per day
  })

  it('returns no breakeven when fees are zero', () => {
    const result = projectPositionOutcome({
      notionalUsd: 1_000,
      medianDailyFeePercent: 0,
      impermanentLossPercent: -2,
      days: 10,
    })
    expect(result.breakevenDays).toBeNull()
  })

  it('needs no breakeven when there is no loss to recover', () => {
    const result = projectPositionOutcome({
      notionalUsd: 1_000,
      medianDailyFeePercent: 0.5,
      impermanentLossPercent: 0,
      days: 10,
    })
    expect(result.breakevenDays).toBe(0)
  })

  it('rejects a non-positive notional', () => {
    expect(() =>
      projectPositionOutcome({ notionalUsd: 0, medianDailyFeePercent: 1, impermanentLossPercent: 0, days: 1 }),
    ).toThrow(/notional/)
  })
})

describe('normalizePairKey', () => {
  it('treats the same pair in either order as one key', () => {
    expect(normalizePairKey('USDG / WETH 0.01%')).toBe(normalizePairKey('WETH / USDG 1%'))
  })

  it('keeps different pairs distinct', () => {
    expect(normalizePairKey('gme / USDG 1%')).not.toBe(normalizePairKey('nvda / USDG 1%'))
  })
})

describe('bestTierPerPair', () => {
  it('picks the highest-net fee tier for each pair', () => {
    const best = bestTierPerPair([
      { name: 'USDG / WETH 0.01%', address: '0xa', netReturnPercent: '1.05' },
      { name: 'USDG / WETH 0.05%', address: '0xb', netReturnPercent: '1.23' },
      { name: 'gme / USDG 1%', address: '0xc', netReturnPercent: '0.08' },
    ])
    expect(best).toHaveLength(2)
    const wethUsdg = best.find((entry) => entry.pair.includes('weth'))!
    expect(wethUsdg.bestAddress).toBe('0xb')
    expect(wethUsdg.alternatives).toBe(1)
  })

  it('ignores pools without a net figure', () => {
    const best = bestTierPerPair([
      { name: 'USDG / WETH 0.01%', address: '0xa', netReturnPercent: null },
      { name: 'USDG / WETH 0.05%', address: '0xb', netReturnPercent: '1.23' },
    ])
    expect(best).toHaveLength(1)
    expect(best[0]!.bestAddress).toBe('0xb')
  })

  it('returns nothing when no pool has a net figure', () => {
    expect(bestTierPerPair([{ name: 'x / y 1%', address: '0xa', netReturnPercent: null }])).toEqual([])
  })
})
