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

/** Extracts the "<network>_0xabc" token id GeckoTerminal returns into a bare address. */
function tokenAddressFromId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = /(0x[0-9a-fA-F]{40})/.exec(value)
  return match ? match[1]! : null
}

export type BlockscoutTokenSafety = {
  address: string
  verified: boolean
  isProxy: boolean
  contractName: string | null
}

const BLOCKSCOUT_BASE = 'https://robinhoodchain.blockscout.com/api/v2'

/**
 * Contract-verification signal for a token from Robinhood Chain's explorer.
 *
 * This is a weak signal deliberately: a verified contract can still be a
 * honeypot, and a proxy means an owner can change behaviour later. Unverified is
 * the meaningful red flag. Real honeypot and transfer-tax detection needs trade
 * simulation, which this does not do.
 */
export async function fetchTokenSafety(
  address: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<BlockscoutTokenSafety> {
  const response = await fetchImplementation(`${BLOCKSCOUT_BASE}/smart-contracts/${address}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) return { address, verified: false, isProxy: false, contractName: null }
  const payload: unknown = await response.json()
  if (!isRecord(payload)) return { address, verified: false, isProxy: false, contractName: null }
  return {
    address,
    verified: payload.is_verified === true,
    isProxy: typeof payload.proxy_type === 'string' && payload.proxy_type.length > 0,
    contractName: typeof payload.name === 'string' ? payload.name : null,
  }
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
        if (!normalized) continue
        // Token address lives in relationships, not attributes.
        const relationships = isRecord(entry.relationships) ? entry.relationships : undefined
        const baseToken = isRecord(relationships?.base_token) ? relationships.base_token : undefined
        const baseData = isRecord(baseToken?.data) ? baseToken.data : undefined
        const baseTokenAddress = tokenAddressFromId(baseData?.id)
        pools.push(baseTokenAddress ? { ...normalized, baseTokenAddress } : normalized)
      }
    }
  }
  return pools
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
