# Krystal auto-farm vault — plan, configs, and your steps

Configuration for a Krystal Auto-Farm Vault on Robinhood Chain, derived from the measurements this repository produces. It keeps the parts of the published RAPTOR-X approach that are well engineered and repairs the two places where that design can lose money quietly.

This is a configuration draft for you to review, not advice to deploy capital. Every signature and every amount is yours. Nothing in this repository can sign, move, or authorize anything.

## Availability on Robinhood Chain

| Check | Result |
| --- | --- |
| Chain in Krystal's chain list | yes — `{"id":4663,"name":"robinhood"}` |
| Uniswap v2/v3/v4 with `supportPositions` | yes, per `lp_explorer/configs` |
| Automator contract (v3) | `0x6ed60864fb8fb610a65af5d16cef272548bc64d6` — **verified deployed, 21475 bytes** |
| Automator contract (v4) | `0x542298e710b32b49883577883b75b39ef18883ce` — **verified deployed, 14768 bytes** |
| Krystal's own docs | list auto-rebalance for Ethereum, Arbitrum, Base, BNB, Optimism, Polygon — **Robinhood is not listed** |

The contracts exist on-chain, so the feature works, but Robinhood is undocumented for it: no documented support commitment and less field time than the chains they do list. Neither contract has been audited by us; verified-deployed means code exists at those addresses, nothing more.

Separately, Krystal's pool analytics (`lp_explorer/top_pools`, `pool_detail`) reject chain 4663 outright, and the per-position endpoints are blocked to programmatic clients. Only `lp/stats` is usable, which is what our dashboard's position tracking uses.

## What we changed versus RAPTOR-X, and why

| Area | RAPTOR-X | This config | Reason |
| --- | --- | --- | --- |
| Divergence loss | absent entirely | handled by pair choice and a conservative fixed range, since the executor cannot model it | Its own top picks measured −39% and −35% divergence loss in two days. Gross fees alone hid that. The whitelist avoids the volatile pairs where it dominates. |
| Exiting | `negative_pnl_never_authorizes_exit`; positions permanent | exit after 14 days if it has underperformed a plain hold for 7 straight days | Never exiting turns every bad entry into permanent dead capital while the headline APR reflects only the live earners. |
| Pool age | 1-day-old pools admitted via early ignition | enforced by whitelist, not by a gate | Its top four picks had 1–2 days of history. Krystal cannot supply pool age on this chain, so the whitelist restricts the universe to pools verified as 27–48 days old. |
| Range | fixed 10% minimum | fixed 10%, justified by our own measurement | Krystal cannot supply the daily-close history needed to derive a width, so we fixed it at the value our analysis showed this pair respected on 100% of the last ten days. |
| Absolute fees | $75/day floor | kept | Good idea; we adopted it into our own screen too. |
| Token safety | full firewall | kept, plus explorer verification | Genuinely strong; nothing to improve. |
| Position sizing | ≤1% pool TVL, ≤5% exit liquidity | kept | Sound. |

## Measured costs on Robinhood Chain

Gas price observed at **0.0217 gwei**, which makes small positions far more viable here than on mainnet.

| Operation | Cost |
| --- | --- |
| ERC-20 approve | $0.0020 |
| Mint v3 position | $0.0204 |
| Collect fees (harvest) | $0.0073 |
| Rebalance (burn + mint) | $0.0285 |

## Krystal's data gap on chain 4663 — read this before configuring

Krystal's agent refuses to act when a mandatory criterion references data it does not hold for this chain. Observed refusals named, in order, **pool age**, **token contract verification**, and **unique traders in 24h**. Its Liquidity Explorer endpoints (`top_pools`, `pool_detail`) return "chain id 4663 not supported", which is the same gap seen from the other side.

What Krystal appears to have for Robinhood Chain: **TVL, 24h volume, 24h fees, APR, drawdown**. What it lacks: **pool age, contract verification, unique-trader counts, multi-day price history**.

Two consequences that shape everything below:

1. **A gate over unavailable data does not fail safe, it fails closed and permanently.** The agent will correctly refuse forever rather than guess. Never write such a gate.
2. **Declaring the facts inside the config does not help.** Custom keys asserting verified age or contract status are normalized away; the agent honours its own schema, not invented fields. Verified facts have to be enforced by *restricting the universe*, which is what the whitelist does.

So the safety that age and contract checks were providing moves into the whitelist, and the range that price history was going to derive becomes a fixed band our own analysis already justified. This is a genuine reduction in the config's generality: it is no longer a pool-discovery strategy, it is a constrained operator on three pre-vetted pools. That is the correct trade at this scale, but do not later widen the whitelist without restoring equivalent protection.

## Starter vault — validation scale

At this size the vault is a **plumbing test, not an income strategy**. A $9.50 position at the pinned pools' measured rate earns roughly **$0.011/day, about $0.34/month**. The point is to confirm the machinery works: the vault opens a position, it appears in the dashboard's **My positions** panel, and Krystal's `vs holding` figure agrees with our own on-chain analysis. Those questions answer identically at $10 and at $1,000, and at $10 the first mistake costs nothing.

Do not judge yield from a vault this small. Dust and rounding distort the percentages more than real performance does.

### Agent instruction JSON — paste this

```json
{
  "system": "LP-MINE-NET",
  "version": "1.1.0-RH-starter-whitelist",
  "strategy_name": "LP-MINE-NET Starter - Whitelist-Constrained Robinhood Chain Vault",
  "target_network": { "name": "Robinhood Chain", "chain_id": 4663, "native_gas_token": "ETH" },
  "operating_note": "Pool age, token contract verification, unique-trader counts and daily price history are NOT available from Krystal for chain 4663. Do not treat any of them as admission criteria. Those properties are guaranteed instead by the vault whitelist: only whitelisted pools may be used, and the operator verified on-chain that each is 27 to 48 days old and that both token contracts are verified on the Robinhood Chain block explorer. Judge candidates only on data that is actually available: TVL, volume, fees and drawdown.",
  "primary_objective": "Deploy nearly the whole balance as one liquidity position in a whitelisted WETH/USDG pool, retaining a small ETH gas reserve. Earn fee income while keeping the position inside a conservative range. Do not seek out new pools; the whitelist is the entire universe.",
  "capital_model": {
    "base_asset": "ETH",
    "harvest_asset_preference": "ETH",
    "compound_enabled": false,
    "target_gas_reserve_usd": 0.5,
    "hard_minimum_gas_reserve_usd": 0.25,
    "never_swap_reserved_gas_eth": true,
    "external_deposit_assumption": "none"
  },
  "portfolio_structure": {
    "position_count_policy": "Exactly one position at this scale. Never fragment the balance.",
    "max_combined_deployed_fraction": 0.95,
    "soft_max_single_position_share_of_total_vault_value": 1.0
  },
  "candidate_admission_engine": {
    "mode": "whitelist_only",
    "universe": "Only pools present in the vault whitelist. Never consider any pool outside it, for any reason.",
    "allowed_quote_assets": ["ETH", "WETH", "USDG"],
    "entry_thresholds_using_available_data_only": {
      "minimum_pool_tvl_usd": 25000,
      "minimum_pool_volume_24h_usd": 25000,
      "minimum_absolute_pool_fees_24h_usd": 75,
      "maximum_token_drawdown_24h": 0.35
    },
    "do_not_require": [
      "pool_age",
      "token_contract_verification_lookup",
      "unique_trader_counts",
      "multi_day_price_history",
      "seven_day_or_thirty_day_metrics"
    ],
    "if_a_metric_is_unavailable": "Treat it as not applicable rather than as a failed check, because the whitelist already constrains the universe to operator-verified pools. Never refuse to act solely because an unavailable metric could not be confirmed."
  },
  "position_sizing": {
    "mode": "deploy_available_balance_as_one_position",
    "default_new_position_value_usd": 9.5,
    "minimum_new_position_value_usd": 5,
    "entry_funding_asset": "ETH",
    "additional_caps": { "position_must_not_exceed_fraction_of_pool_tvl": 0.01 }
  },
  "range_system": {
    "mode": "fixed_conservative_band",
    "reference": "current_price",
    "lower_fraction": 0.1,
    "upper_fraction": 0.1,
    "rationale": "The operator measured this pair keeping its daily closes inside a 10 percent band on 100 percent of the last ten days, so a fixed band is used instead of deriving one from price history the executor cannot access.",
    "guardrails": {
      "adjust_existing_positions": true,
      "same_pool_only": true,
      "minimum_minutes_between_adjustments_per_position": 1440,
      "require_condition_on_two_consecutive_scans": true,
      "require_projected_fee_recovery_to_exceed_gas_slippage_and_rebalance_cost": true,
      "do_not_rebalance_into_a_sustained_trend": true,
      "rebalance_swap_policy": "Only the minimum swap between the pair assets needed to restore LP ratio."
    }
  },
  "exit_rules": {
    "hold_through_ordinary_drawdown": true,
    "out_of_range_alone_is_not_an_exit": true,
    "temporary_apr_cooling_is_not_an_exit": true,
    "emergency_exit_if_any_true": [
      "pool_or_token_contract_integrity_failure",
      "sell_or_liquidity_exit_route_becomes_materially_impaired",
      "pool_depeg_or_exploit_evidence_exists"
    ],
    "performance_exit": {
      "enabled": true,
      "minimum_position_age_days": 14,
      "exit_if_all_true": [
        "position_has_underperformed_holding_its_two_tokens_for_at_least_7_consecutive_days",
        "projected_fee_income_over_the_next_7_days_cannot_recover_the_shortfall"
      ]
    },
    "never_exit_solely_because": [
      "negative_unrealized_pnl",
      "temporarily_out_of_range",
      "apr_cooled_during_one_snapshot",
      "harvest_or_rate_lookup_failed"
    ]
  },
  "harvest_policy": {
    "enabled": true,
    "harvest_asset": "ETH",
    "compound_enabled": false,
    "harvest_threshold_usd": 0.1,
    "harvest_is_non_blocking_best_effort": true,
    "realized_eth_use_order": ["restore the gas reserve", "remain idle; do not open a second position"],
    "on_harvest_failure": { "keep_position_unchanged": true, "do_not_close": true, "retry_on_later_scan": true }
  },
  "execution_failure_firewall": {
    "enabled": true,
    "do_not_translate_failed_harvest_into_close_adjust_or_swap": true,
    "do_not_translate_failed_rate_lookup_into_position_exit": true,
    "preferred_response": "hold_position_and_idle_ETH_then_retry_on_a_later_scan"
  },
  "post_action_verification": {
    "enabled": true,
    "after_open_require": [
      "transaction_success",
      "nonzero_liquidity",
      "correct_token_pair",
      "correct_chain_id",
      "ETH_gas_reserve_remains_above_hard_minimum"
    ],
    "if_verification_fails": "stop_all_chained_actions_and_report_the_exact_failure"
  },
  "telemetry_and_debug": {
    "enabled": true,
    "report_admission_pass_fail_and_reason": true,
    "report_which_metrics_were_unavailable": true,
    "report_chosen_range_and_current_price": true,
    "report_gas_reserve_before_and_after_projected_action": true,
    "report_post_action_verification": true
  },
  "forbidden_behaviors": [
    "do_not_consider_any_pool_outside_the_whitelist",
    "do_not_refuse_to_act_because_pool_age_trader_counts_or_contract_verification_data_is_unavailable",
    "do_not_enter_on_apr_alone",
    "do_not_compound_harvests",
    "do_not_spend_reserved_gas_ETH",
    "do_not_open_more_than_one_position",
    "do_not_rebalance_into_a_sustained_directional_trend",
    "do_not_close_for_temporary_out_of_range_status_or_a_single_cooling_snapshot",
    "do_not_convert_execution_failure_into_churn"
  ],
  "final_instruction": "Operate only within the vault whitelist, which contains operator-verified WETH/USDG pools on Robinhood Chain. Pool age, token contract verification, unique-trader counts and multi-day price history are unavailable from Krystal on this chain: treat them as not applicable, never as failed checks, and never refuse to act because they could not be confirmed. Judge the whitelisted pool only on TVL, 24h volume, 24h fees and 24h drawdown. Deploy up to 95 percent of the balance as a single position, keeping about 0.50 USD of ETH for gas and never less than 0.25 USD. Use a fixed range of 10 percent below and 10 percent above the current price. Never exceed 1 percent of pool TVL. Harvest to ETH at 0.10 USD and never compound. Do not open a second position. Hold through ordinary drawdown, temporary out-of-range states and single-snapshot APR cooling. Adjust range in the same pool at most once per day, only when the condition persists across two scans and projected fee recovery exceeds execution cost, and never into a sustained trend. Close only on contract integrity failure, exploit, depeg, materially impaired exit routes, or when a position at least 14 days old has underperformed holding its two tokens for seven consecutive days. If any lookup or execution step fails, isolate the failure and hold."
}
```

### UI settings for the starter vault

| Panel | Field | Value |
| --- | --- | --- |
| Preferences | Risk Level | **Balanced** |
| Preferences | Expected Return | **Steady Yield** |
| Preferences | Farming Style | **Smart** |
| Scopes | Min. Range | **10%** |
| Scopes | Min. TVL | **$25,000** |
| Scopes | Whitelisted Pools | see note below |
| Scopes | Max Drawdown (24h) | **-35** |
| Scopes | Prioritize By | **Fee (7d)** |
| Scopes | Min. APR | **all four left 0** |
| Scopes | Min. Volume | 1h **0** · 24h **25000** · 7d **0** · 30d **0** |
| Scopes | Min. Fee | 1h **0** · 24h **75** · 7d **0** · 30d **0** |

The 7d and 30d columns must be **0**, not the earlier values. They were chosen to force a history requirement, which is exactly the data Krystal lacks here — leaving them set reintroduces the same permanent refusal through the interface instead of the JSON. Min APR goes to 0 for the same reason: with the universe restricted to three verified pools, an APR floor adds nothing the fee and volume floors do not already cover, and risks blocking on a metric Krystal may not compute for this chain.
| Execution | Max. Swap Slippage | **0.5%** |
| Execution | Max. Liquidity Slippage | **0.5%** |
| Execution | Max. Withdraw Slippage | **0.5%** |
| Execution | Cool-down Period | **1 hour** |
| Execution | Max. Value Per Strategy | **100%** |
| Execution | Gas Fee Ceiling | **$** mode, **0.15** |
| Execution | Strict Cap | **On** |
| Execution | Default Asset | **ETH** |
| Permissions | Open Position / Harvest / Rebalance | **on** |
| Permissions | Compound / Increase Liquidity | **off** |

Reasoning for the less obvious ones:

- **Max Value Per Strategy 100%** because a percentage cap becomes a minimum vault size. At 25%, a $9.50 position would require a $38 vault; at 30% it needs $32. With one intended position, 100% removes the contradiction.
- **Gas Fee Ceiling $0.15** against measured costs of $0.02 to mint and $0.03 to rebalance — roughly 5× headroom, while a 10% ceiling on a $9.50 position would authorize $0.95, about 33× the real cost.
- **1h minimums stay 0 deliberately.** A value there would *require* a one-hour spike, the exact false-ignition pattern this strategy rejects. Blank is a decision, not an omission.
- **Min APR 24h at 30, not 70+.** A higher APR floor pushes selection toward memecoins. Our pinned WETH/USDG pools measured about 61% gross annualized, so 30 admits sound pools while excluding dead ones. This is deliberately lower than published practice.
- **7d fields do double duty.** Requiring a 7-day figure implicitly requires seven days of history, letting the interface enforce the age floor.
- **30d stays 0** because Robinhood Chain is only about two months old; requiring 30-day figures would exclude nearly everything, including sound pools.
- **Prioritize By Fee (7d)** ranks by absolute fee dollars over a window long enough to exclude spikes. Avoid every APR option: APR is nomination, not proof. Avoid Volume, since our own gate rejects high volume with negligible fees. Avoid TVL, which is the blue-chip drift trap. `Drawdown (most stable)` is a defensible alternative that optimizes the divergence-loss side instead of the fee side.

**Whitelisted Pools** is the highest-leverage field here. Left empty, the agent picks from every pool on the chain and the numeric gates are your only protection. Filled with the four on-chain-verified WETH/USDG pools from our registry, your analysis replaces its pool selection entirely: modest measured yield, 100% in-range, addresses we verify fail-closed. For a first vault the whitelist is the conservative option. You can widen it later; you cannot un-lose capital.

## Scaling up later

When you increase the balance, change only these fields. Everything else — every safety gate, every threshold, the range system — stays identical.

| Field | Starter | Scaled |
| --- | --- | --- |
| `version` | `1.0.0-RH-starter` | `1.0.0-RH` |
| `target_gas_reserve_usd` | 0.5 | 15 |
| `hard_minimum_gas_reserve_usd` | 0.25 | 10 |
| `default_new_position_value_usd` | 9.5 | 200 |
| `minimum_new_position_value_usd` | 5 | 200 |
| `anti_fragmentation.do_not_open_any_position_below_usd` | 5 | 200 |
| `harvest_threshold_usd` | 0.1 | 2.0 |
| `soft_max_single_position_share_of_total_vault_value` | 1.0 | 0.25 |
| `position_count_policy` | one position | grow while qualified candidates and funds exist |
| `harvest_policy.realized_eth_use_order` | restore gas, then idle | restore gas, accumulate to $200, fund another position |
| UI: Max. Value Per Strategy | 100% | 25% |
| UI: Gas Fee Ceiling | $0.15 | $0.50 |

A percentage cap sets a floor on vault size, because it must still permit one whole position:

| Cap | Smallest vault permitting a $200 position |
| --- | --- |
| 100% | $200 |
| 50% | $400 |
| 30% | $667 |
| 25% | $800 |

Below the right-hand figure, the cap forbids the position size the config asks for and the agent will either stall or silently ignore one of the two. Keep the cap and the position size consistent whenever you change either.

## Verifying what Krystal generates

Krystal's agent may still normalize or reinterpret parts of the config. After saving, read back what it stored and check for these specific drifts:

- an age floor below 72 hours, or an "early ignition" style exception that admits new pools anyway
- ranking or entry driven by APR with no divergence-loss term
- `compound` enabled, or permission to increase liquidity
- a fixed range width instead of one derived from price history
- no exit condition, or conversely an exit on negative PnL alone
- position sizing without the 1%-of-TVL cap
- a gas reserve larger than the position it is meant to protect

If a clause was dropped, restate that clause and save again **before funding**.

## Your steps

1. **Fund a fresh wallet** with the amount you have decided to risk. Not your main wallet: this grants standing authority to an automation contract neither of us has audited.
2. **Create the vault** at defi.krystal.app on Robinhood Chain.
3. **Paste the starter JSON**, then set every UI field from the table.
4. **Read back the stored config** and check the drift list above.
5. **Review and sign** the vault creation and permission transactions in your own wallet. Read what each authorizes. I cannot do this step and will not ask you for keys.
6. **Paste your wallet address** into the **My positions** panel on our dashboard, so you can measure the vault independently of Krystal's own reporting.
7. **Wait a week before judging it.** Compare our `vs holding` figure against the vault's claimed APR. Those two numbers disagreeing is the most useful signal you will get.
8. **Revoke if it disagrees badly.** Delete the orders and withdraw. Standing authority should not outlive your confidence in it.

## What to expect, honestly

This configuration will earn **less headline APR** than RAPTOR-X. It refuses pools under 72 hours old, demands verified contracts, requires seven days of history, and needs expected fees to beat expected divergence loss with a margin. Those exclusions are exactly where four-figure APRs come from.

At starter scale it should earn roughly a third of a dollar a month, which is the wrong reason to run it. The right reason is that by the end of a week you will know whether the automation does what it claims, measured against an independent source, having risked almost nothing to find out.

One further caution worth repeating: the same pool measured **net −25.9%** early in this project's analysis and **+367%** a few days later, from the same maths on a different ten-day window. Any figure computed from a short window on a two-month-old chain can invert. Only `vs holding`, accumulated over weeks, settles anything.
