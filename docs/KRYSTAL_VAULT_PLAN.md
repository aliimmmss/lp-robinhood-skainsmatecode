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
| Divergence loss | absent entirely | range width scales with measured volatility, and a 24h move cap excludes the worst pairs | Its own top picks measured −39% and −35% divergence loss in two days. Gross fees alone hid that. |
| Exiting | `negative_pnl_never_authorizes_exit`; positions permanent | exit after 14 days if it has underperformed a plain hold for 7 straight days | Never exiting turns every bad entry into permanent dead capital while the headline APR reflects only the live earners. |
| Pool age | 1-day-old pools admitted via early ignition | approximated by high TVL and volume floors, since age is unavailable | Its top four picks had 1–2 days of history. A pool holding $500k with $250k of daily volume is rarely two days old, though this is a proxy rather than a guarantee. |
| Range | fixed 10% minimum | four bands selected by 24h price change | Our data: volatile pools closed inside ±10% on 11–30% of days, so one fixed width cannot serve both a stable pair and a memecoin. |
| Absolute fees | $75/day floor | kept | Good idea; we adopted it into our own screen too. |
| Token safety | full firewall | **not available in-vault**; audited by us after entry | Krystal cannot check contracts on this chain. This is the one place the config is weaker than RAPTOR-X, and it is compensated by the position-share cap and post-entry review. |
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
2. **Declaring the facts inside the config does not help.** Custom keys asserting verified age or contract status are normalized away; the agent honours its own schema, not invented fields. Nor can the pool whitelist substitute: Krystal's pool database for this chain does not contain the liquid pools our registry verifies, so it cannot be populated with them.

So the protection that age and contract checks were providing has to come from thresholds over data that does exist. Two facts make that workable:

1. **A volume floor excludes dead and mispriced pools automatically.** Krystal indexes a WETH/USDG pool built on a different USDG contract which trades about $1,078 a day; any volume floor above $25,000 rejects it without needing to know anything about the token.
2. **24h price change is available and works as a volatility proxy.** That replaces the multi-day history the range system was going to use: a pool that moved under 2% in a day gets a tight band, one that moved 14% gets a wide one.

What is genuinely lost is contract-safety screening. The agent cannot check whether a token is a honeypot or has a transfer tax. That gap is covered from outside the vault: cap any single position at a third of the balance, and audit what it actually entered using our dashboard and the block explorer, rather than trusting it in advance.

## Multi-pool configuration

This config lets the agent choose among any pool that clears the thresholds, rather than a fixed pair. Applied to live data, the thresholds currently admit six pools: four WETH/USDG fee tiers, one tokenized-stock pair (nvda/USDG, which moved 2.3% in 24h), and one large memecoin pool (CASHCAT/WETH, 14.1% and by far the biggest fee generator at about $169,000 a day).

The single dial for how much memecoin exposure you accept is `maximum_price_change_24h_fraction`, and the matching UI field **Max Drawdown (24h)**:

| Value | Effect on the current universe |
| --- | --- |
| 0.25 (as written) | admits CASHCAT and everything quieter — six pools |
| 0.10 | excludes CASHCAT, keeps nvda and all WETH/USDG tiers |
| 0.05 | WETH/USDG tiers and nvda only |

Diversification is enforced two ways: no position may exceed 35% of vault value, and only one position per primary token — different fee tiers of the same pair are separate pools but not separate risks.

### Agent instruction JSON — paste this

```json
{
  "system": "LP-MINE-NET",
  "version": "2.0.0-RH-multipool",
  "strategy_name": "LP-MINE-NET Multi-Pool - Gated Discovery on Robinhood Chain",
  "target_network": { "name": "Robinhood Chain", "chain_id": 4663, "native_gas_token": "ETH" },
  "operating_note": "Pool age, token contract verification, unique-trader counts and multi-day price history are NOT available from Krystal for chain 4663. Never treat any of them as an admission criterion and never refuse to act because one could not be confirmed. Judge candidates only on data that is available: TVL, 24h volume, 24h fees, and 24h price change. The thresholds below are set so that a dead or mispriced pool cannot pass on TVL alone, because it will fail the volume and absolute-fee floors.",
  "primary_objective": "Farm fee income across several distinct qualified pools on Robinhood Chain, judged on real fee dollars rather than APR. Diversify across pairs so no single pool dominates. Match the range width to each pool's measured volatility. Hold through ordinary noise, and close only on safety failure or sustained underperformance against holding the tokens.",
  "capital_model": {
    "base_asset": "ETH",
    "harvest_asset_preference": "ETH",
    "compound_enabled": false,
    "target_gas_reserve_usd": 0.5,
    "hard_minimum_gas_reserve_usd": 0.25,
    "never_swap_reserved_gas_eth": true,
    "external_deposit_assumption": "none",
    "note_on_reserve": "Scale the reserve with the balance: about 5 percent of vault value, floored at 0.25 USD. Measured costs on this chain are 0.02 USD to mint and 0.03 USD to rebalance."
  },
  "portfolio_structure": {
    "position_count_policy": "Open additional distinct positions while qualified candidates and spendable ETH remain, up to the diversification cap. Prefer a new distinct pool over enlarging an existing position.",
    "max_combined_deployed_fraction": 0.95,
    "soft_max_single_position_share_of_total_vault_value": 0.35,
    "unique_pair_required": true,
    "max_same_primary_token_positions": 1,
    "note_on_same_token": "Several fee tiers of the same pair are separate pools but not separate risks. Count them as one exposure to that token."
  },
  "candidate_admission_engine": {
    "mode": "gated_discovery_using_available_data_only",
    "allowed_quote_assets": ["ETH", "WETH", "USDG"],
    "require_at_least_one_allowed_quote_asset": true,
    "blocked_pair_categories": ["stablecoin_to_stablecoin", "staked_ETH_to_ETH", "two_unrelated_non_quote_tokens"],
    "entry_thresholds": {
      "minimum_pool_tvl_usd": 500000,
      "minimum_pool_volume_24h_usd": 250000,
      "minimum_absolute_pool_fees_24h_usd": 500,
      "minimum_fees_per_tvl_24h": 0.0005,
      "minimum_volume_per_tvl_24h": 0.2,
      "maximum_price_change_24h_fraction": 0.25
    },
    "do_not_require": [
      "pool_age",
      "token_contract_verification_lookup",
      "unique_trader_counts",
      "multi_day_price_history",
      "seven_day_or_thirty_day_metrics"
    ],
    "if_a_metric_is_unavailable": "Treat it as not applicable rather than as a failed check. Never refuse to act solely because an unavailable metric could not be confirmed.",
    "rank_candidates_by": [
      "absolute_fees_24h",
      "fees_per_tvl_24h",
      "pool_tvl_usd",
      "lower_price_change_24h"
    ],
    "reject_if_any_true": [
      "volume_is_high_but_absolute_fees_are_below_the_floor",
      "tvl_is_high_but_volume_is_below_the_floor",
      "pool_metrics_are_missing_zero_or_self_inconsistent",
      "the_pool_is_already_represented_by_another_position_on_the_same_primary_token"
    ]
  },
  "position_sizing": {
    "mode": "fixed_unit_entry_scaled_to_balance",
    "default_new_position_value_usd": 200,
    "minimum_new_position_value_usd": 25,
    "entry_funding_asset": "ETH",
    "additional_caps": {
      "position_must_not_exceed_fraction_of_pool_tvl": 0.01,
      "position_must_not_exceed_soft_single_position_share": 0.35
    },
    "note_on_sizing": "Set default_new_position_value_usd to roughly one third of vault value so three to four positions fit inside the diversification cap. Never below 25 USD, because a smaller position makes rebalancing and dust a material share of returns."
  },
  "range_system": {
    "mode": "volatility_banded_from_available_data",
    "reference": "current_price",
    "principle": "Multi-day price history is unavailable, so derive the band from 24h price change, which is available. A quiet pair gets a tight band that earns more per dollar; a volatile pair gets a wide band so the position stays in range instead of accruing divergence loss while earning nothing.",
    "bands_by_absolute_price_change_24h": [
      { "if_change_below_fraction": 0.02, "lower_fraction": 0.1, "upper_fraction": 0.1 },
      { "if_change_below_fraction": 0.05, "lower_fraction": 0.15, "upper_fraction": 0.15 },
      { "if_change_below_fraction": 0.15, "lower_fraction": 0.25, "upper_fraction": 0.25 },
      { "otherwise": true, "lower_fraction": 0.35, "upper_fraction": 0.35 }
    ],
    "guardrails": {
      "minimum_total_range_fraction": 0.08,
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
      "pool_depeg_or_exploit_evidence_exists",
      "pool_volume_24h_collapses_below_one_tenth_of_the_entry_floor"
    ],
    "performance_exit": {
      "enabled": true,
      "minimum_position_age_days": 14,
      "exit_if_all_true": [
        "position_has_underperformed_holding_its_two_tokens_for_at_least_7_consecutive_days",
        "pool_no_longer_meets_entry_thresholds",
        "projected_fee_income_over_the_next_7_days_cannot_recover_the_shortfall"
      ]
    },
    "never_exit_solely_because": [
      "negative_unrealized_pnl",
      "temporarily_out_of_range",
      "apr_cooled_during_one_snapshot",
      "another_pool_has_a_higher_rank",
      "harvest_or_rate_lookup_failed"
    ]
  },
  "harvest_policy": {
    "enabled": true,
    "harvest_asset": "ETH",
    "compound_enabled": false,
    "harvest_threshold_usd": 2.0,
    "harvest_is_non_blocking_best_effort": true,
    "realized_eth_use_order": [
      "restore the gas reserve",
      "accumulate until spendable ETH reaches one position unit",
      "fund another distinct qualified pool",
      "remain idle when no qualified use exists"
    ],
    "on_harvest_failure": { "keep_position_unchanged": true, "do_not_close": true, "retry_on_later_scan": true }
  },
  "execution_failure_firewall": {
    "enabled": true,
    "abort_remaining_actions_for_position_after_any_failure": true,
    "do_not_translate_failed_harvest_into_close_adjust_or_swap": true,
    "do_not_translate_failed_rate_lookup_into_position_exit": true,
    "do_not_translate_failed_open_into_an_unrelated_fallback_open": true,
    "preferred_response": "hold_position_and_idle_ETH_then_retry_on_a_later_scan"
  },
  "post_action_verification": {
    "enabled": true,
    "after_open_require": [
      "transaction_success",
      "nonzero_liquidity",
      "correct_token_pair",
      "correct_chain_id",
      "range_matches_authorized_band",
      "ETH_gas_reserve_remains_above_hard_minimum"
    ],
    "after_range_adjustment_require": [
      "transaction_success",
      "same_pool_and_pair_as_incumbent",
      "nonzero_liquidity",
      "no_proceeds_were_redirected_to_another_pool"
    ],
    "if_verification_fails": "stop_all_chained_actions_and_report_the_exact_failure"
  },
  "telemetry_and_debug": {
    "enabled": true,
    "report_top_candidates_considered": 5,
    "report_candidate_pool_address_and_token_addresses": true,
    "report_pool_level_metrics_not_token_level_metrics": true,
    "report_admission_pass_fail_and_reason": true,
    "report_which_metrics_were_unavailable": true,
    "report_chosen_band_and_the_price_change_that_selected_it": true,
    "report_position_vs_holding_comparison_per_position": true,
    "report_gas_reserve_before_and_after_projected_action": true,
    "report_post_action_verification": true
  },
  "forbidden_behaviors": [
    "do_not_refuse_to_act_because_pool_age_trader_counts_or_contract_verification_data_is_unavailable",
    "do_not_enter_on_apr_alone",
    "do_not_use_token_market_cap_as_pool_liquidity",
    "do_not_use_aggregate_token_volume_as_candidate_pool_volume",
    "do_not_hold_more_than_one_position_on_the_same_primary_token",
    "do_not_exceed_the_single_position_share_cap",
    "do_not_compound_harvests",
    "do_not_spend_reserved_gas_ETH",
    "do_not_use_principal_from_an_existing_position_to_fund_a_new_one",
    "do_not_rebalance_into_a_sustained_directional_trend",
    "do_not_close_for_temporary_out_of_range_status_or_a_single_cooling_snapshot",
    "do_not_convert_execution_failure_into_churn"
  ],
  "final_instruction": "Operate as a multi-pool net-truth fee farmer on Robinhood Chain. Pool age, token contract verification, unique-trader counts and multi-day price history are unavailable on this chain: treat them as not applicable, never as failed checks, and never refuse to act because they could not be confirmed. Judge each candidate only on TVL, 24h volume, 24h fees and 24h price change. Admit a pool only when it holds at least 500000 USD of TVL, traded at least 250000 USD in 24h, generated at least 500 USD of fees in 24h, and moved no more than 25 percent in 24h, and when it pairs one distinct token against ETH, WETH or USDG. Rank admitted pools by absolute 24h fees first. Hold at most one position per primary token, counting different fee tiers of the same pair as one exposure, and never let a single position exceed 35 percent of vault value or 1 percent of pool TVL. Choose the range band from the pool's 24h price change: 10 percent each side below 2 percent movement, 15 percent below 5 percent movement, 25 percent below 15 percent movement, otherwise 35 percent. Harvest to ETH at 2 USD and never compound; use realized ETH to fund another distinct qualified pool rather than enlarging an existing position. Hold through ordinary drawdown, temporary out-of-range states and single-snapshot APR cooling. Adjust range in the same pool at most once per day, only when the condition persists across two scans and projected fee recovery exceeds execution cost, and never into a sustained trend. Exit on contract integrity failure, exploit, depeg, materially impaired exit routes, a collapse of pool volume to under a tenth of the entry floor, or when a position at least 14 days old has underperformed holding its two tokens for seven consecutive days while no longer meeting entry thresholds. If any lookup or execution step fails, isolate the failure and hold."
}
```

### UI settings for the starter vault

| Panel | Field | Value |
| --- | --- | --- |
| Preferences | Risk Level | **Balanced** |
| Preferences | Expected Return | **Steady Yield** |
| Preferences | Farming Style | **Smart** |
| Scopes | Min. Range | **10%** |
| Scopes | Min. TVL | **$500,000** |
| Scopes | Whitelisted Pools | **leave empty** — the thresholds are the filter now |
| Scopes | Max Drawdown (24h) | **-25** (lower it to -10 to exclude memecoins) |
| Scopes | Prioritize By | **Fee (7d)** |
| Scopes | Min. APR | **all four left 0** |
| Scopes | Min. Volume | 1h **0** · 24h **250000** · 7d **0** · 30d **0** |
| Scopes | Min. Fee | 1h **0** · 24h **500** · 7d **0** · 30d **0** |

The 7d and 30d columns must be **0**, not the earlier values. They were chosen to force a history requirement, which is exactly the data Krystal lacks here — leaving them set reintroduces the same permanent refusal through the interface instead of the JSON. Min APR goes to 0 for the same reason: the fee and volume floors already express the same requirement in absolute dollars, which is the more honest measure, and an APR floor risks blocking on a metric Krystal may not compute for this chain.
| Execution | Max. Swap Slippage | **0.5%** |
| Execution | Max. Liquidity Slippage | **0.5%** |
| Execution | Max. Withdraw Slippage | **0.5%** |
| Execution | Cool-down Period | **1 hour** |
| Execution | Max. Value Per Strategy | **35%** (or 100% while the balance only supports one position) |
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

**Whitelisted Pools** deserves a note, because it looks like the safest lever and is not usable here. Krystal's pool database for chain 4663 does not contain the liquid pools our registry verifies: searching it surfaces a WETH/USDG pool built on a *different* USDG contract (`0x2ce3e396…`, 18 decimals, unverified) whose pool trades about $1,078 a day, against $149,000,000 a day in the pool our registry pins. So the whitelist cannot be populated with the pools you would actually want.

That is why this config leaves it empty and relies on thresholds instead. The volume floor does the same job from the other direction: it rejects that dead pool automatically, without needing to know anything about which USDG is canonical.

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
