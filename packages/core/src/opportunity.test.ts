import { describe, expect, it } from 'vitest'
import { rankOpportunities, scoreOpportunity, type OpportunityPool } from './opportunity.js'

function pool(overrides: Partial<OpportunityPool> = {}): OpportunityPool {
  return {
    name: 'gme / USDG 1%',
    address: '0xe9713f453adb9245b19559790c96f470a18f2fdf',
    feeTierPercent: 1,
    createdAt: new Date('2026-07-10T00:00:00Z'),
    marketCapUsd: 629_181,
    reserveUsd: 282_233,
    volume24hUsd: 25_767_875,
    volume6hUsd: 12_443_986,
    ...overrides,
  }
}

const now = new Date('2026-07-23T00:00:00Z')

describe('scoreOpportunity', () => {
  it('estimates daily fee return as volume/TVL times fee tier', () => {
    const scored = scoreOpportunity(pool(), now)
    // vol/tvl = 25767875/282233 = 91.3; x fee 1% => ~91.3%/day
    expect(scored.volumeToTvl).toBeCloseTo(91.3, 0)
    expect(Number(scored.estDailyFeeReturnPercent)).toBeCloseTo(91.3, 0)
  })

  it('passes the screen when all Evil Panda criteria are met', () => {
    const scored = scoreOpportunity(pool(), now)
    expect(scored.passesScreen).toBe(true)
    expect(scored.screenNotes).toEqual([])
  })

  it('flags each failing criterion in screenNotes', () => {
    const scored = scoreOpportunity(
      pool({
        marketCapUsd: 100_000, // below 250K
        volume24hUsd: 500_000, // below 1M
        createdAt: new Date('2026-07-22T12:00:00Z'), // 12h old (< 24h)
      }),
      now,
    )
    expect(scored.passesScreen).toBe(false)
    expect(scored.screenNotes.join(' ')).toMatch(/market cap/i)
    expect(scored.screenNotes.join(' ')).toMatch(/volume/i)
    expect(scored.screenNotes.join(' ')).toMatch(/24h|age|new/i)
  })

  it('classifies volume trend from the recent-vs-daily hourly rate', () => {
    // steady: h6/6 ~= h24/24
    expect(scoreOpportunity(pool({ volume24hUsd: 24_000_000, volume6hUsd: 6_000_000 }), now).volumeTrend).toBe('steady')
    // rising: recent hourly much higher
    expect(scoreOpportunity(pool({ volume24hUsd: 24_000_000, volume6hUsd: 12_000_000 }), now).volumeTrend).toBe(
      'rising',
    )
    // fading: recent hourly much lower
    expect(scoreOpportunity(pool({ volume24hUsd: 24_000_000, volume6hUsd: 2_000_000 }), now).volumeTrend).toBe('fading')
  })

  it('flags a low volume/TVL ratio below the 50% activity threshold', () => {
    const scored = scoreOpportunity(pool({ volume24hUsd: 100_000, reserveUsd: 1_000_000 }), now)
    expect(scored.screenNotes.join(' ')).toMatch(/volume\/tvl|activity/i)
  })
})

describe('rankOpportunities', () => {
  it('drops dust pools and ranks the rest by estimated daily fee return', () => {
    const ranked = rankOpportunities(
      [
        pool({ name: 'A 1%', volume24hUsd: 25_000_000, reserveUsd: 300_000 }), // ~83%/day
        pool({ name: 'DUST 1%', volume24hUsd: 5_000, reserveUsd: 2_000 }), // dust -> dropped
        pool({ name: 'B 0.05%', feeTierPercent: 0.05, volume24hUsd: 12_000_000, reserveUsd: 450_000 }), // ~1.3%/day
      ],
      now,
    )
    expect(ranked.map((entry) => entry.name)).toEqual(['A 1%', 'B 0.05%'])
    expect(ranked.some((entry) => entry.name === 'DUST 1%')).toBe(false)
  })

  it('ranks screen-passing pools above higher-yield pools that fail the screen', () => {
    const ranked = rankOpportunities(
      [
        // fails the screen (market cap too low) but has a far higher headline yield
        pool({ name: 'SPIKE 1%', marketCapUsd: 100_000, volume24hUsd: 25_000_000, reserveUsd: 200_000 }),
        // passes the screen with a modest yield
        pool({ name: 'SOLID 0.05%', feeTierPercent: 0.05, volume24hUsd: 12_000_000, reserveUsd: 450_000 }),
      ],
      now,
    )
    expect(ranked.map((entry) => entry.name)).toEqual(['SOLID 0.05%', 'SPIKE 1%'])
    expect(ranked[0]!.passesScreen).toBe(true)
  })
})
