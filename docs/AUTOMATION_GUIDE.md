# Automated LP (Krystal LP Automator) — how it works and how our analysis drives it

Research note, verified 2026-07-28. Nothing in this repository signs, submits, or authorizes anything. This document explains a third-party automation service and shows which of our measurements should decide its settings. Every signature is yours.

## Availability on Robinhood Chain

| Check | Result |
| --- | --- |
| Chain in Krystal's chain list | yes — `{"id":4663,"name":"robinhood"}` |
| Uniswap v2/v3/v4 with `supportPositions` | yes, per `lp_explorer/configs` |
| Automator contract (v3) | `0x6ed60864fb8fb610a65af5d16cef272548bc64d6` — **verified deployed, 21475 bytes of code** |
| Automator contract (v4) | `0x542298e710b32b49883577883b75b39ef18883ce` — **verified deployed, 14768 bytes** |
| Krystal's own docs | list auto-rebalance for Ethereum, Arbitrum, Base, BNB, Optimism, Polygon — **Robinhood is not listed** |

The contracts exist on-chain, so the feature is technically usable, but Robinhood is undocumented for it. Treat it as unannounced rather than supported: no documented support commitment, and less field time than the six chains they do list.

Separately, Krystal's pool analytics (`lp_explorer/top_pools`, `pool_detail`) reject chain 4663 outright, and the per-position endpoints are blocked to programmatic clients. Only `lp/stats` is usable, which is what our dashboard's position tracking uses.

## The mechanism

1. You mint a normal Uniswap v3 position yourself (see [DEPOSIT_RUNBOOK.md](DEPOSIT_RUNBOOK.md)). Automation manages an existing position; it does not create your first one.
2. You grant a **permit** over that position NFT to the automator contract (`lpAuto/getPermitSignature` then `addPermitSignature`).
3. You sign an **EIP-712 order** (`lpAuto/getOrderSignData` → `eth_signTypedData_v4` → `lpAuto/createOrder`) describing the conditions and the action.
4. Krystal's keeper watches the pool and executes when a condition is met. **No further signature from you per rebalance.**

Step 3 is the part that deserves care. A mint signature is one bounded action. This is *standing authority*: one signature authorizes an open-ended series of future position changes. `lpAuto/getOrders` lists what is armed and `deleteOrders` revokes.

## Order types

| Type | What it does | Trigger options |
| --- | --- | --- |
| `ORDER_TYPE_REBALANCE` | Closes and reopens the position around the current price | tick offset, price offset, or token ratio; optional `timeBuffer`; `recurring` |
| Auto-compound (within rebalance config) | Reinvests earned fees into the position | `minFeeEarnedUsd`, or `intervalInSecond` |
| Auto-exit | Exits the whole position into one token | condition + `tokenOutAddress` |
| `ORDER_TYPE_RANGE_ORDER` | Uses a one-sided range as a limit-order-style conversion | price condition |

## Mapping our analysis onto the settings

This is the point of having built the analysis. Each knob has a measurement that should set it.

| Krystal setting | Our measurement | How to use it |
| --- | --- | --- |
| Trigger band (`tickOffsetCondition.gte/lteTickOffset`, or price offset) | **In-range %** per ±1/2/5/10% band | Choose the narrowest band whose historical in-range share you can accept. Our data: pinned WETH/USDG held 100% of days at ±10%; PONS held 11%. |
| New range width (`tickOffsetAction.tickLower/UpperOffset`) | **Deposit plan** tick math + occupancy | Reuse the spacing-aligned ticks the deposit plan already computes for your chosen width. |
| `timeBuffer` (seconds outside range before acting) | **Price trend** classification | `ranging` → longer buffer, so noise does not cause churn. `trending-up/down` → a buffer only delays an inevitable rebalance. |
| `minFeeEarnedUsd` (auto-compound) | **Fees/day $** at your notional | Set it well above the gas cost of a compound, so compounding is never a net loss. |
| `intervalInSecond` (time-based compound) | **Fees/day $** | Pick an interval where accrued fees dwarf gas. At $1.63/day (pinned 0.05% pool, $1k), daily compounding is pointless; weekly-plus makes sense. |
| `maxGasProportion` (gas ceiling) | **Breakeven days**, net analysis | Gas has to stay a small fraction of the fees it protects. |
| `swapSlippage`, `liquiditySlippage` | **Volatility** (avg daily high–low range, ~3.1% on WETH/USDG) | Tight enough to block bad fills, loose enough that normal movement does not revert every rebalance. |
| **Whether to automate at all** | **Net after divergence loss** | The gate. If net is negative, automation loses money faster and more reliably. |

## The economics that decide whether this is a good idea

**Rebalancing realizes impermanent loss.** While price sits outside your range, divergence loss is on paper — recoverable if price returns. Rebalancing closes the position at that price, which sells the underperforming asset and buys the outperforming one. The loss becomes realized, and you pay gas and swap slippage to do it.

So automation earns its keep when a pool is **choppy around a level with strong fee income**: price wanders out, you re-center, fees keep accruing, and mean reversion does not punish the re-centering much.

It is actively harmful when a pool is **trending**: each rebalance locks in another slice of loss, then price keeps going and triggers the next one. Our own numbers show the shape of that trap — PONS/USDG paid 290% gross fees over ten days yet netted **−25.9%**, having closed inside a ±10% band on only 11% of days. Automating that pool would have crystallized that loss in installments and added gas each time.

Use our three filters before arming anything:

1. **Net after divergence loss is positive** — otherwise stop here.
2. **Yield is not spike-driven** (`stability.spikeDriven` false) — automation cannot outrun a volume spike that has already passed.
3. **Price is `ranging`, not trending** — the condition under which re-centering helps rather than hurts.

## Security assessment

- A permit plus a signed order gives a third-party contract standing authority over your position NFT. If the keeper or contract is compromised or buggy, positions are exposed. This is a materially larger grant than the one-off mint signature in our deposit runbook.
- I have **not** audited either automator contract. Verified-deployed is not verified-safe; it only means code exists at those addresses.
- Robinhood Chain is undocumented for this feature, so it has less operational history than the chains Krystal lists.
- Mitigations, in order of usefulness: start with an amount you would accept losing entirely; keep one position automated rather than several; check `lpAuto/getOrders` and revoke with `deleteOrders` when unsure; set a real `maxGasProportion`; prefer the pinned WETH/USDG pools, whose addresses we verify fail-closed, over discovered pools.
- This repository's own principle stands: verified contracts, exact approvals, and a human confirming each authority grant. Automation is in tension with that principle by design — it trades confirmation for convenience. That is a judgement only the position's owner can make.

## Practical order of operations

1. Wait for the dashboard to show a pool with **positive net after divergence loss**, `ok` stability, and a `ranging` price.
2. Mint the position manually via the deposit runbook. Record tick range and token ID.
3. Confirm it appears under **My positions** on the dashboard, sourced from `lp/stats`.
4. Let it run unautomated long enough to see real `vs holding` numbers.
5. Only then consider arming automation, using the settings table above, at an amount you would accept losing.
6. Re-check `vs holding` after automation. If it degrades, revoke the order — that is the whole measurement this project exists to produce.

Nothing here is financial advice, and no amount is recommended.
