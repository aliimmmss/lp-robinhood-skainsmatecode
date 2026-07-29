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
| Divergence loss | absent entirely | required net-positive after divergence loss | Its own top picks measured −39% and −35% divergence loss in two days. Gross fees alone hid that. |
| Exiting | `negative_pnl_never_authorizes_exit`; positions permanent | exit after 14 days if it has underperformed a plain hold for 7 straight days | Never exiting turns every bad entry into permanent dead capital while the headline APR reflects only the live earners. |
| Pool age | 1-day-old pools admitted via early ignition | minimum 72h | Its top four picks had 1–2 days of history. That is launch-frenzy farming. |
| Range | fixed 10% minimum | width chosen from measured in-range history | Our data: volatile pools closed inside ±10% on 11–30% of days, so a fixed 10% band is mostly out of range while still accruing divergence loss. |
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

## Starter vault — validation scale

At this size the vault is a **plumbing test, not an income strategy**. A $9.50 position at the pinned pools' measured rate earns roughly **$0.011/day, about $0.34/month**. The point is to confirm the machinery works: the vault opens a position, it appears in the dashboard's **My positions** panel, and Krystal's `vs holding` figure agrees with our own on-chain analysis. Those questions answer identically at $10 and at $1,000, and at $10 the first mistake costs nothing.

Do not judge yield from a vault this small. Dust and rounding distort the percentages more than real performance does.

### Agent instruction JSON — paste this

```json
{
  "system": "LP-MINE-NET",
  "version": "1.0.0-RH-starter",
  "strategy_name": "LP-MINE-NET Starter - Robinhood Chain Net-Truth Validation Vault",
  "target_network": {
    "name": "Robinhood Chain",
    "chain_id": 4663,
    "native_gas_token": "ETH",
    "rpc_reference": "https://rpc.mainnet.chain.robinhood.com",
    "block_explorer_reference": "https://robinhoodchain.blockscout.com"
  },
  "primary_objective": "Validate the full automation path at minimal scale while never entering a pool that fails the net-truth gates. Deploy nearly the whole balance as one position, retaining only a small ETH gas reserve. Admit pools on pool-level fee truth, executable exit liquidity, token contract safety, and demonstrated price behaviour, and only when expected fee income exceeds expected divergence loss. Prefer doing nothing over entering a pool that fails a gate.",
  "goal_statement_short": "Prove the machinery works at $10 without relaxing any safety or net-truth gate. One position, tiny gas reserve, no compounding.",
  "execution_contract": {
    "schema_mode": "strict_json_only",
    "stateless_assumption": true,
    "do_not_infer_unwritten_logic": true,
    "on_conflict": "follow_this_instruction_set",
    "decision_priority": [
      "obey network, token, pair, and execution hard blocks",
      "protect the ETH gas reserve",
      "validate token contracts and executable exit liquidity",
      "apply fee-truth and false-ignition gates",
      "require expected net-positive fee income after divergence loss",
      "open one qualified position when spendable ETH permits",
      "maintain range on the incumbent when maintenance is economically justified",
      "close only on safety failure or proven sustained net-negative performance",
      "harvest to ETH at threshold",
      "if any action or lookup fails, isolate the failure and hold"
    ]
  },
  "capital_model": {
    "base_asset": "ETH",
    "deployment_asset": "ETH",
    "harvest_asset_preference": "ETH",
    "compound_enabled": false,
    "external_deposit_assumption": "none",
    "gas_only_reserve_enabled": true,
    "target_gas_reserve_usd": 0.5,
    "hard_minimum_gas_reserve_usd": 0.25,
    "dynamic_gas_reserve_rule": "Retain the greater of $0.25 in ETH or ten times the estimated cost of the most expensive authorized transaction. Measured costs on this chain are about $0.02 to mint and $0.03 to rebalance, so a $0.50 reserve is ample.",
    "never_swap_reserved_gas_eth": true,
    "fund_new_positions_from_idle_eth_first": true,
    "never_use_incumbent_principal_to_fund_a_new_position": true
  },
  "portfolio_structure": {
    "position_count_policy": "Hold one position at this scale. Do not fragment a small balance across multiple positions.",
    "unique_pair_required": true,
    "unique_primary_non_quote_token_required": true,
    "max_same_primary_token_positions": 1,
    "max_combined_deployed_fraction": 0.95,
    "soft_max_single_position_share_of_total_vault_value": 1.0
  },
  "candidate_admission_engine": {
    "mode": "net_truth_first",
    "allowed_quote_assets": ["ETH", "WETH", "USDG"],
    "required_pair_shape": "Exactly one allowed quote asset paired with one distinct non-quote token. Stablecoin-to-stablecoin pairs are blocked.",
    "rank_candidates_by": [
      "expected_net_return_after_divergence_loss",
      "absolute_fees_7d",
      "fees_per_tvl_24h",
      "in_range_history_share",
      "executable_exit_liquidity",
      "token_safety"
    ],
    "standard_entry_thresholds": {
      "minimum_pool_age_hours": 72,
      "minimum_pool_tvl_usd": 25000,
      "minimum_pool_volume_24h_usd": 25000,
      "minimum_absolute_pool_fees_24h_usd": 75,
      "minimum_fees_per_tvl_24h": 0.006,
      "minimum_volume_per_tvl_24h": 0.25,
      "minimum_unique_traders_24h": 50,
      "maximum_volume_per_unique_trader_usd": 100000,
      "maximum_token_drawdown_24h": 0.35,
      "maximum_estimated_entry_price_impact_fraction": 0.02,
      "maximum_estimated_exit_price_impact_fraction": 0.04,
      "require_expected_fee_income_to_exceed_expected_divergence_loss": true,
      "minimum_expected_net_margin_fraction": 0.2
    },
    "full_size_requires": {
      "minimum_history_days": 7,
      "minimum_days_price_closed_within_target_band_fraction": 0.6,
      "yield_must_not_be_single_day_spike_driven": true
    },
    "minimum_data_quality": {
      "reject_zero_missing_or_stale_pool_tvl": true,
      "reject_zero_missing_or_stale_pool_volume": true,
      "reject_if_apr_cannot_be_reconciled_with_fee_and_tvl_data": true,
      "reject_if_only_token_level_metrics_are_available": true
    }
  },
  "false_ignition_filter": {
    "enabled": true,
    "apr_is_nomination_not_proof": true,
    "required_truth_metrics": [
      "fees_per_tvl_24h",
      "volume_per_tvl_24h",
      "absolute_fees_24h",
      "executable_exit_liquidity",
      "unique_trader_count"
    ],
    "minimum_truth_metrics_passed": 4,
    "single_hour_apr_burst_cannot_admit_alone": true,
    "require_apr_24h_support_for_apr_1h_spike": true,
    "deny_if_any_true": [
      "apr_1h_is_extreme_but_absolute_fees_24h_are_below_entry_floor",
      "aggregate_token_volume_is_high_but_candidate_pool_volume_is_below_entry_floor",
      "volume_is_high_but_unique_trader_count_is_very_low",
      "volume_is_high_but_fees_are_negligible_for_the_fee_tier",
      "pool_tvl_or_fee_data_appears_stale_or_self_inconsistent",
      "estimated_exit_price_impact_exceeds_limit",
      "price_move_is_parabolic_without_24h_fee_truth_support",
      "expected_divergence_loss_exceeds_expected_fee_income_over_the_holding_horizon"
    ]
  },
  "token_safety_firewall": {
    "enabled": true,
    "require_contract_address_resolution": true,
    "require_chain_id_match": 4663,
    "require_contract_verified_on_block_explorer": true,
    "require_standard_erc20_behavior_or_executor_confirmed_support": true,
    "never_identify_token_by_symbol_alone": true,
    "never_reuse_contract_addresses_from_other_chains": true,
    "reject_if_any_true": [
      "honeypot_or_sell_restriction_detected",
      "unbounded_or_unresolved_transfer_tax",
      "blacklist_or_whitelist_transfer_controls_create_exit_risk",
      "mint_authority_or_proxy_upgrade_risk_is_unresolved_and_material",
      "token_decimals_or_symbol_mapping_is_ambiguous",
      "buy_route_exists_but_sell_route_cannot_be_quoted",
      "token_contract_is_unverified_or_conflicts_across_data_sources",
      "liquidity_can_be_removed_or_trading_disabled_by_an_unresolved_privileged_controller"
    ]
  },
  "execution_viability_layer": {
    "enabled": true,
    "require_pair_to_be_openable_from_eth": true,
    "prefer_direct_eth_or_weth_routes": true,
    "require_swap_quote_before_open": true,
    "require_reverse_exit_quote_before_open": true,
    "maximum_route_hops": 2,
    "maximum_estimated_total_entry_cost_fraction_of_position": 0.015
  },
  "position_sizing": {
    "mode": "deploy_available_balance_as_one_position",
    "minimum_new_position_value_usd": 5,
    "default_new_position_value_usd": 9.5,
    "entry_funding_asset": "ETH",
    "additional_caps": {
      "position_must_not_exceed_fraction_of_pool_tvl": 0.01,
      "position_must_not_exceed_fraction_of_estimated_executable_exit_liquidity": 0.05
    },
    "anti_fragmentation": {
      "do_not_open_any_position_below_usd": 5,
      "maximum_dust_positions": 0
    }
  },
  "range_system": {
    "mode": "in_range_history_mapping",
    "reference": "current_price",
    "principle": "Choose the narrowest band the pool's own recent price behaviour supports, not a fixed width. A band the price leaves most days earns nothing while still accruing divergence loss.",
    "profiles": {
      "stable_quote_major_pair": { "lower_fraction": 0.10, "upper_fraction": 0.10 },
      "proven_seven_day_history": { "lower_fraction": 0.15, "upper_fraction": 0.15 },
      "volatile_or_short_history": { "lower_fraction": 0.30, "upper_fraction": 0.30 }
    },
    "selection_rule": "Pick the profile whose band contained the daily close on at least 60% of available days. If no profile reaches 60%, do not open the position.",
    "trend_bias": {
      "if_price_change_24h_above_0_05": { "lower_width_multiplier": 0.85, "upper_width_multiplier": 1.15 },
      "if_price_change_24h_below_negative_0_05": { "lower_width_multiplier": 1.20, "upper_width_multiplier": 0.80 },
      "otherwise": "centered"
    },
    "guardrails": {
      "minimum_total_range_fraction": 0.08,
      "adjust_existing_positions": true,
      "same_pool_only": true,
      "minimum_minutes_between_adjustments_per_position": 1440,
      "require_condition_on_two_consecutive_scans": true,
      "single_snapshot_noise_cannot_trigger_adjustment": true,
      "require_projected_fee_recovery_to_exceed_gas_slippage_and_rebalance_cost": true,
      "do_not_rebalance_into_a_sustained_trend": true,
      "rebalance_swap_policy": "Permit only the minimum swap between the incumbent pair assets needed to restore the target LP ratio."
    }
  },
  "exit_rules": {
    "hold_through_ordinary_drawdown": true,
    "out_of_range_alone_is_not_an_exit": true,
    "temporary_apr_cooling_is_not_an_exit": true,
    "emergency_exit_if_any_true": [
      "token_safety_or_contract_integrity_fails",
      "sell_or_liquidity_exit_route_becomes_materially_impaired",
      "pool_depeg_or_exploit_evidence_exists",
      "estimated_exit_price_impact_exceeds_0_10"
    ],
    "performance_exit": {
      "enabled": true,
      "rationale": "A position held forever that never recovers is a permanent loss reported as a holding. Give it time to work, then judge it against holding its tokens.",
      "minimum_position_age_days": 14,
      "exit_if_all_true": [
        "position_has_underperformed_simply_holding_its_two_tokens_for_at_least_7_consecutive_days",
        "pool_no_longer_meets_standard_entry_thresholds",
        "projected_fee_income_over_the_next_7_days_cannot_recover_the_shortfall",
        "exit_price_impact_remains_within_limits"
      ],
      "never_exit_solely_because": [
        "position_has_negative_unrealized_pnl",
        "position_is_temporarily_out_of_range",
        "apr_cooled_during_one_snapshot",
        "another_pool_has_a_higher_rank",
        "harvest_or_rate_lookup_failed"
      ]
    }
  },
  "harvest_policy": {
    "enabled": true,
    "harvest_asset": "ETH",
    "compound_enabled": false,
    "harvest_threshold_usd": 0.1,
    "harvest_is_non_blocking_best_effort": true,
    "realized_eth_use_order": [
      "restore the gas reserve",
      "remain idle; do not open a second position at this scale"
    ],
    "on_harvest_failure": {
      "keep_position_unchanged": true,
      "do_not_close": true,
      "do_not_adjust_range": true,
      "retry_on_later_scan": true
    }
  },
  "hard_blocks": {
    "blocked_pair_categories": [
      "stablecoin_to_stablecoin",
      "staked_ETH_to_ETH",
      "two_unrelated_non_quote_tokens",
      "any_pair_without_exactly_one_allowed_quote_asset",
      "any_pair_without_a_confirmed_ETH_funding_and_exit_route"
    ],
    "absolute_pool_rejections": {
      "pool_age_below_hours": 72,
      "pool_tvl_below_usd": 25000,
      "pool_volume_24h_below_usd": 25000,
      "pool_fees_24h_below_usd": 75,
      "unresolved_or_stale_pool_metrics": true,
      "token_contract_unverified": true
    }
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
      "position_registered",
      "nonzero_liquidity",
      "correct_token_pair",
      "correct_chain_id",
      "range_matches_authorized_range",
      "ETH_gas_reserve_remains_above_hard_minimum"
    ],
    "after_range_adjustment_require": [
      "transaction_success",
      "same_pool_and_pair_as_incumbent",
      "nonzero_liquidity",
      "new_range_matches_authorized_range",
      "no_proceeds_were_redirected_to_another_pool"
    ],
    "if_verification_fails": "stop_all_chained_actions_and_report_the_exact_failure"
  },
  "telemetry_and_debug": {
    "enabled": true,
    "report_top_candidates_considered": 5,
    "report_candidate_contract_address_and_pool_address": true,
    "report_pool_level_metrics_not_token_level_metrics": true,
    "report_expected_net_return_after_divergence_loss": true,
    "report_in_range_history_share_and_chosen_band": true,
    "report_unique_trader_count_and_volume_per_trader": true,
    "report_admission_pass_fail_and_reason": true,
    "report_token_safety_pass_fail_and_reason": true,
    "report_entry_and_reverse_exit_quote_status": true,
    "report_position_vs_holding_comparison_per_position": true,
    "report_gas_reserve_before_and_after_projected_action": true,
    "report_post_action_verification": true
  },
  "forbidden_behaviors": [
    "do_not_enter_on_apr_alone",
    "do_not_use_token_market_cap_as_pool_liquidity",
    "do_not_use_aggregate_token_volume_as_candidate_pool_volume",
    "do_not_open_a_pool_younger_than_72_hours",
    "do_not_open_a_pool_whose_token_contract_is_unverified",
    "do_not_open_when_expected_divergence_loss_exceeds_expected_fee_income",
    "do_not_choose_a_range_the_price_leaves_on_most_days",
    "do_not_rebalance_into_a_sustained_directional_trend",
    "do_not_reuse_contract_addresses_from_another_chain",
    "do_not_spend_reserved_gas_ETH",
    "do_not_compound_harvests",
    "do_not_fragment_a_small_balance_into_multiple_positions",
    "do_not_close_a_position_for_temporary_out_of_range_status_or_a_single_cooling_snapshot",
    "do_not_hold_indefinitely_a_position_that_has_underperformed_holding_its_tokens_for_over_a_week_and_no_longer_qualifies",
    "do_not_convert_execution_failure_into_churn"
  ],
  "final_instruction": "Operate as a validation-scale net-truth fee farmer on Robinhood Chain. Deploy up to 95% of the balance as a single position and retain the rest as an ETH gas reserve of about $0.50, never below $0.25. Use APR only to nominate candidates. Admit a pool only when it is at least 72 hours old, its token contract is verified on the block explorer, pool TVL and 24h volume both exceed $25,000, absolute fees exceed $75 per day, at least 50 unique traders traded it in 24 hours, entry and reverse exit routes quote inside impact limits, and expected fee income over the holding horizon exceeds expected divergence loss by at least 20%. Choose the range band that the pool's own recent daily closes respected on at least 60% of days; if no band reaches that, do not open a position at all. Never exceed 1% of pool TVL or 5% of executable exit liquidity. Harvest to ETH at $0.10 and never compound. Do not open a second position at this scale. Hold through ordinary drawdown, temporary out-of-range states, and single-snapshot APR cooling. Maintain range in the same pool at most once per day, only when the condition persists across two scans and projected fee recovery exceeds execution cost, and never rebalance into a sustained trend. Close on verified contract failure, exploit, honeypot, depeg, impaired exit mechanics, or when a position at least 14 days old has underperformed simply holding its two tokens for seven consecutive days. If any lookup or execution step fails, isolate the failure and hold."
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
| Scopes | Min. APR | 1h **0** · 24h **30** · 7d **20** · 30d **0** |
| Scopes | Min. Volume | 1h **0** · 24h **25000** · 7d **175000** · 30d **0** |
| Scopes | Min. Fee | 1h **0** · 24h **75** · 7d **525** · 30d **0** |
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
