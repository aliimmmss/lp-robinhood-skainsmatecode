// Post-deposit position tracking via Krystal's LP stats endpoint.
//
// Only this endpoint is usable for Robinhood Chain: their Liquidity Explorer
// (top_pools, pool_detail) rejects chain 4663, and the per-position endpoints
// (lp/userPositions, v2/balance/lp) are blocked to programmatic clients. This
// one answers with aggregate position analytics for an address, needs no key,
// and allows browser origins.
//
// The address is used for a read-only lookup and never leaves the browser
// except in this request. Nothing here can sign, move, or approve anything.

const ROBINHOOD_CHAIN_ID = 4663

export type PositionStats = {
  openPositionCount: number
  closedPositionCount: number
  currentPositionValue: number
  totalDepositValue: number
  pnl: number
  /** Value of the position against simply holding the deposited tokens. */
  compareWithHodl: number
  returnOnInvestment: number
  apr: number
  feeApr: number
  unclaimedFees: number
  earning24h: number
  totalFeeEarned: number
}

function num(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/** Basic shape check; avoids sending obviously malformed input to the API. */
export function isEvmAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value.trim())
}

export async function fetchPositionStats(address: string): Promise<PositionStats | null> {
  if (!isEvmAddress(address)) throw new Error('Enter a valid 0x wallet address')
  const url =
    `https://api.krystal.app/all/v1/lp/stats?addresses=${encodeURIComponent(address.trim())}` +
    `&chainIds=${ROBINHOOD_CHAIN_ID}`
  const response = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`Krystal request failed (${response.status})`)
  const payload = (await response.json()) as { statsByChain?: Record<string, Record<string, unknown>> }
  const stats = payload.statsByChain?.[String(ROBINHOOD_CHAIN_ID)]
  if (!stats) return null
  return {
    openPositionCount: num(stats.openPositionCount),
    closedPositionCount: num(stats.closedPositionCount),
    currentPositionValue: num(stats.currentPositionValue),
    totalDepositValue: num(stats.totalDepositValue),
    pnl: num(stats.pnl),
    compareWithHodl: num(stats.compareWithHodl),
    returnOnInvestment: num(stats.returnOnInvestment),
    apr: num(stats.apr),
    feeApr: num(stats.feeApr),
    unclaimedFees: num(stats.unclaimedFees),
    earning24h: num(stats.earning24h),
    totalFeeEarned: num(stats.totalFeeEarned),
  }
}
