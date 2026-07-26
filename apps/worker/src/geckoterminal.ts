import type { DailyCandle, OpportunityPool } from '@lp-mine/core'

const GECKOTERMINAL_BASE = 'https://api.geckoterminal.com/api/v2'
const ROBINHOOD_NETWORK = 'robinhood'

type RawPoolAttributes = {
  address?: unknown
  name?: unknown
  pool_created_at?: unknown
  market_cap_usd?: unknown
  reserve_in_usd?: unknown
  volume_usd?: { h6?: unknown; h24?: unknown }
  transactions?: { h24?: { buys?: unknown; sells?: unknown; buyers?: unknown; sellers?: unknown } }
  base_token_price_usd?: unknown
  quote_token_price_usd?: unknown
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** Parses the trailing "1%" / "0.05%" fee tier from a GeckoTerminal pool name. */
function parseFeeTierPercent(name: string): number | null {
  const match = /(\d+(?:\.\d+)?)%\s*$/.exec(name.trim())
  return match ? Number(match[1]) : null
}

/** Normalizes one GeckoTerminal pool. Returns null when required fields are unusable. */
export function normalizeGeckoPool(attributes: RawPoolAttributes): OpportunityPool | null {
  if (typeof attributes.name !== 'string' || typeof attributes.address !== 'string') return null
  if (typeof attributes.pool_created_at !== 'string') return null

  const feeTierPercent = parseFeeTierPercent(attributes.name)
  if (feeTierPercent === null) return null

  const createdAt = new Date(attributes.pool_created_at)
  if (Number.isNaN(createdAt.getTime())) return null

  const reserveUsd = toFiniteNumber(attributes.reserve_in_usd)
  const volume24hUsd = toFiniteNumber(attributes.volume_usd?.h24)
  const volume6hUsd = toFiniteNumber(attributes.volume_usd?.h6)
  if (reserveUsd === null || volume24hUsd === null || volume6hUsd === null) return null

  const tx = attributes.transactions?.h24
  const transactions24h =
    tx === undefined
      ? undefined
      : {
          buys: toFiniteNumber(tx.buys) ?? 0,
          sells: toFiniteNumber(tx.sells) ?? 0,
          buyers: toFiniteNumber(tx.buyers) ?? 0,
          sellers: toFiniteNumber(tx.sellers) ?? 0,
        }

  return {
    name: attributes.name,
    address: attributes.address,
    feeTierPercent,
    createdAt,
    marketCapUsd: toFiniteNumber(attributes.market_cap_usd),
    reserveUsd,
    volume24hUsd,
    volume6hUsd,
    ...(transactions24h ? { transactions24h } : {}),
    basePriceUsd: toFiniteNumber(attributes.base_token_price_usd),
    quotePriceUsd: toFiniteNumber(attributes.quote_token_price_usd),
  }
}

/**
 * Daily candles in pool-ratio terms (quote token priced in the base token), which
 * is the input divergence-loss and in-range math needs — a stablecoin's USD
 * candles would show almost no movement and understate risk.
 */
export async function fetchDailyCandles(
  poolAddress: string,
  days = 10,
  fetchImplementation: typeof fetch = fetch,
): Promise<readonly DailyCandle[]> {
  const url =
    `${GECKOTERMINAL_BASE}/networks/${ROBINHOOD_NETWORK}/pools/${poolAddress}/ohlcv/day` +
    `?limit=${days}&currency=token&token=quote`
  const response = await fetchImplementation(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`GeckoTerminal OHLCV request failed (${response.status}) for ${poolAddress}`)
  const payload: unknown = await response.json()
  const list =
    isRecord(payload) && isRecord(payload.data) && isRecord(payload.data.attributes)
      ? payload.data.attributes.ohlcv_list
      : undefined
  if (!Array.isArray(list)) return []

  const candles: DailyCandle[] = []
  for (const row of list) {
    if (!Array.isArray(row) || row.length < 6) continue
    const values = row.slice(0, 6).map((value) => toFiniteNumber(value))
    if (values.some((value) => value === null)) continue
    const [timestamp, open, high, low, close, volume] = values as number[]
    if (timestamp === undefined || close === undefined || close <= 0) continue
    candles.push({
      timestampSeconds: timestamp,
      open: open ?? close,
      high: high ?? close,
      low: low ?? close,
      close,
      volumeUsd: volume ?? 0,
    })
  }
  // Oldest first, so the first candle is the start of the observed window.
  return candles.sort((left, right) => left.timestampSeconds - right.timestampSeconds)
}

/** Fetches and normalizes Robinhood Chain pools from GeckoTerminal's free public API. */
export async function fetchRobinhoodOpportunityPools(
  pages = 3,
  fetchImplementation: typeof fetch = fetch,
): Promise<readonly OpportunityPool[]> {
  const pools: OpportunityPool[] = []
  for (let page = 1; page <= pages; page += 1) {
    const url = `${GECKOTERMINAL_BASE}/networks/${ROBINHOOD_NETWORK}/pools?page=${page}`
    const response = await fetchImplementation(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) {
      throw new Error(`GeckoTerminal request failed (${response.status}) for page ${page}`)
    }
    const payload: unknown = await response.json()
    const data = isRecord(payload) && Array.isArray(payload.data) ? payload.data : []
    if (data.length === 0) break
    for (const entry of data) {
      if (isRecord(entry) && isRecord(entry.attributes)) {
        const normalized = normalizeGeckoPool(entry.attributes as RawPoolAttributes)
        if (normalized) pools.push(normalized)
      }
    }
  }
  return pools
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
