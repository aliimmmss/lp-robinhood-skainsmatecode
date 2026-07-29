# Krystal auto-farm vault — plan, config, and your steps

A starting configuration for a Krystal Auto-Farm Vault on Robinhood Chain, derived from the measurements this repository produces. It keeps the parts of the published RAPTOR-X approach that are well-engineered and repairs the two places where that design can lose money quietly.

This is a configuration draft for you to review, not advice to deploy capital. Every signature and every amount is yours. Nothing in this repository can sign, move, or authorize anything.

## What we changed versus RAPTOR-X, and why

| Area | RAPTOR-X | This config | Reason |
| --- | --- | --- | --- |
| Divergence loss | absent entirely | required net-positive after divergence loss | Its own picks measured −39% and −35% divergence loss in two days. Gross fees alone hid that. |
| Exiting | `negative_pnl_never_authorizes_exit`, positions are permanent | exit on sustained net-negative after a grace period | Never exiting turns every bad entry into permanent dead capital while the headline APR reflects only the live earners. |
| Pool age | 1-day-old pools admitted via early ignition | minimum 72h, and 7-day history required for full size | Its top four picks had 1–2 days of history. That is launch-frenzy farming. |
| Range | 10% fixed minimum | width chosen from measured in-range history | Our data: volatile pools closed inside ±10% on 11–30% of days, so a 10% band is mostly out of range. |
| Absolute fees | $75/day floor | kept, unchanged | Good idea; we adopted it into our own screen. |
| Token safety | full firewall | kept, plus explorer verification | Genuinely strong; nothing to improve. |
| Position sizing | ≤1% pool TVL, ≤5% exit liquidity | kept, unchanged | Sound. |

## Agent instruction — copy and paste this

The instruction field takes a **short natural-language description**, not a config file. Krystal's own AI expands what you write into a structured strategy; the long JSON some vaults display is that generated output, not something a person typed. Krystal's documented examples are one-liners such as *"Maximize APR on ETH pairs while managing IL."*

Paste this (800 characters):

```text
Farm Robinhood Chain pools for net profit after impermanent loss, not headline APR. Enter only pools 72h+ old with a verified token contract, TVL above $25k, 24h volume above $25k, $75+/day absolute fees, and 50+ unique traders. Reject APR driven by a one-hour or one-day volume spike. Require expected fees to beat expected divergence loss by 20%. Set the range to the narrowest band the pool's recent daily closes held on 60%+ of days; skip the pool if none qualifies. Never rebalance into a sustained trend. Size positions near $200 and never above 1% of pool TVL. Harvest to ETH at $2, never compound. Hold through temporary out-of-range and one-off APR cooling. Exit only on contract failure, honeypot, depeg, impaired exit routes, or 7 straight days underperforming a simple hold after 14 days.
```

If the field rejects that length, this 438-character version keeps the load-bearing constraints:

```text
Farm Robinhood Chain pools for net profit after impermanent loss, not APR. Only pools 72h+ old, verified contract, TVL and volume over $25k, $75+/day fees. Require expected fees to beat divergence loss by 20%. Use the narrowest range the price held 60%+ of days, else skip. No rebalancing into trends. ~$200 per position, max 1% of TVL. Harvest to ETH, no compounding. Exit only on contract failure or 7 days underperforming a plain hold.
```

Every clause is load-bearing. In rough order of what Krystal's default behaviour is least likely to do on its own: **net after impermanent loss** rather than APR, the **72h age floor**, the **range chosen from actual in-range history**, and **not rebalancing into a trend**. If you have to cut further, cut from the end of the list, not the start.

## Verifying Krystal's expansion

After the agent expands your instruction, read what it generated and check it against the reference below. This is the same strategy expressed in the structured form Krystal produces, so it is a checklist for "did the AI understand the intent", not something to paste.

Watch for these specific ways an expansion can drift from the instruction:

- an age floor lower than 72 hours, or an "early ignition" exception that admits new pools anyway
- ranking or entry driven by APR with no divergence-loss term
- `compound` enabled, or permission to increase liquidity on an existing position
- a fixed range width instead of one derived from price history
- no exit condition at all, or conversely an exit on negative PnL alone
- position sizing without the 1%-of-TVL cap

```json
{
  "system": "LP-MINE-NET",
  "version": "1.0.0-RH",
  "strategy_name": "LP-MINE-NET v1.0.0-RH Net-Truth Robinhood Chain Fee Farmer",
  "target_network": {
    "name": "Robinhood Chain",
    "chain_id": 4663,
    "native_gas_token": "ETH",
    "rpc_reference": "https://rpc.mainnet.chain.robinhood.com",
    "block_explorer_reference": "https://robinhoodchain.blockscout.com"
  },
  "primary_objective": "Grow realized ETH-denominated value by farming Robinhood Chain LP pools whose fee income is expected to exceed divergence loss, not merely whose gross fee yield or APR is high. Admit pools on pool-level fee truth, executable exit liquidity, token contract safety, and demonstrated price behaviour. Size positions so that a single failure cannot dominate the vault. Hold through ordinary drawdown and temporary out-of-range states, but do not hold indefinitely a position that has proven net-negative against simply holding its tokens.",
  "goal_statement_short": "Farm fee income that survives divergence loss. Enter on fee truth and safety, size small, hold through noise, and close positions that have demonstrably failed rather than holding them forever.",
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
      "open qualified positions when spendable ETH permits",
      "maintain range on incumbents when maintenance is economically justified",
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
    "target_gas_reserve_usd": 15,
    "hard_minimum_gas_reserve_usd": 10,
    "dynamic_gas_reserve_rule": "Retain the greater of $10 in ETH or five times the estimated cost of the most expensive authorized transaction.",
    "never_swap_reserved_gas_eth": true,
    "fund_new_positions_from_idle_eth_first": true,
    "never_use_incumbent_principal_to_fund_a_new_position": true
  },
  "portfolio_structure": {
    "position_count_policy": "Grow position count while distinct qualified pools and spendable ETH exist. No fixed target.",
    "unique_pair_required": true,
    "unique_primary_non_quote_token_required": true,
    "max_same_primary_token_positions": 1,
    "max_combined_deployed_fraction": 0.95,
    "soft_max_single_position_share_of_total_vault_value": 0.25
  },
  "candidate_admission_engine": {
    "mode": "net_truth_first",
    "allowed_quote_assets": ["ETH", "WETH", "USDG"],
    "required_pair_shape": "Exactly one allowed quote asset paired with one distinct non-quote token. Stablecoin-to-stablecoin pairs are blocked.",
    "rank_candidates_by": [
      "expected_net_return_after_divergence_loss",
      "fees_per_tvl_24h",
      "absolute_fees_24h",
      "in_range_history_share",
      "volume_per_tvl_24h",
      "executable_exit_liquidity",
      "token_safety",
      "route_simplicity"
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
    "reduced_size_band": {
      "enabled": true,
      "applies_when_history_days_between": [3, 7],
      "size_multiplier": 0.5,
      "must_pass_all_other_gates": true
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
    "mode": "fixed_unit_entry",
    "minimum_new_position_value_usd": 200,
    "default_new_position_value_usd": 200,
    "entry_funding_asset": "ETH",
    "additional_caps": {
      "position_must_not_exceed_fraction_of_pool_tvl": 0.01,
      "position_must_not_exceed_fraction_of_estimated_executable_exit_liquidity": 0.05,
      "reduced_history_size_multiplier": 0.5
    },
    "anti_fragmentation": {
      "do_not_open_any_position_below_usd": 200,
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
    "harvest_threshold_usd": 2.0,
    "harvest_is_non_blocking_best_effort": true,
    "realized_eth_use_order": [
      "restore the dynamic gas reserve",
      "accumulate until spendable ETH above the reserve reaches $200",
      "fund another distinct qualified position",
      "remain idle when no fully qualified use exists"
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
    "do_not_use_principal_from_any_incumbent_to_fund_a_new_position",
    "do_not_close_a_position_for_temporary_out_of_range_status_or_a_single_cooling_snapshot",
    "do_not_hold_indefinitely_a_position_that_has_underperformed_holding_its_tokens_for_over_a_week_and_no_longer_qualifies",
    "do_not_convert_execution_failure_into_churn"
  ],
  "final_instruction": "Operate as a net-truth Robinhood Chain fee farmer. Use APR only to nominate candidates. Admit a pool only when it is at least 72 hours old, its token contract is verified, pool-level fee truth and unique-trader counts hold up, entry and reverse exit routes quote within impact limits, and expected fee income over the holding horizon exceeds expected divergence loss with at least a 20% margin. Choose the range band that the pool's own recent daily closes actually respected at least 60% of the time; if no band reaches that, do not open. Fund each position with approximately $200 of ETH above a dynamic gas reserve, never exceeding 1% of pool TVL or 5% of executable exit liquidity, and halve size when history is between three and seven days. Harvest to ETH at $2 and do not compound. Hold through ordinary drawdown, temporary out-of-range states, and single-snapshot APR cooling. Maintain range in the same pool at most once per day when the condition persists across two scans and projected fee recovery exceeds execution cost, and never rebalance into a sustained trend. Close on verified contract failure, exploit, honeypot, depeg, impaired exit mechanics, or when a position at least 14 days old has underperformed simply holding its tokens for seven consecutive days and no longer meets entry thresholds. If any lookup or execution step fails, isolate the failure and hold."
}
```

## Vault settings

These are UI controls, separate from the instruction text. Krystal's documented options:

| Field | Options | Choose | Why |
| --- | --- | --- | --- |
| Risk Level | High Risk / Balanced / Safe | **Balanced** | High Risk biases toward the launch-frenzy pools this strategy deliberately excludes. Safe likely excludes everything on a chain this young. |
| Expected Return | Max Gain / Growth Mode / Steady Yield | **Steady Yield** | Max Gain optimizes the gross APR that hid a −25.9% net result in our own measurements. |
| Farming Style | Passive / Smart / Active | **Smart** | Passive will not rebalance at all, which this strategy needs. Active risks over-trading against the instruction's "never rebalance into a trend" rule. Krystal does not document what these three actually change, so treat this as a starting guess and revisit once you can see how often it acts. |

## Auto-farm permissions

| Permission | Grant | Why |
| --- | --- | --- |
| Open Position | yes | required to deploy |
| Harvest | yes | required to realize fees |
| Rebalance | yes | required for range maintenance |
| Compound | **no** | `compound_enabled` is false: harvest to ETH and deploy deliberately in $200 units instead of silently growing one position |
| Increase Liquidity | **no** | prevents the agent quietly concentrating the vault into one pool |

## Scopes panel

These are hard numeric gates the interface enforces, so they are more reliable than the same intent expressed in prose. Set them even where the instruction text already says the same thing.

| Field | Value | Reasoning |
| --- | --- | --- |
| Min. Range | **10%** | Floor only; the instruction widens it when price history demands. |
| Min. TVL | **$25,000** | Our exit-impact estimate: a $200 position is 0.8% of a $25k pool, inside the 1% cap. At $10k it would be 2%. |
| Whitelisted Pools | **see below** | The single highest-leverage field on this screen. |
| Max Drawdown (24h) | **-35** | Matches the 35% token-drawdown limit; the -50 placeholder tolerates a halving in a day. |
| Prioritize By | prefer **Fee**, or fees-per-TVL if offered. Avoid **APR** | APR is nomination, not proof — the finding this whole project rests on. Tell me the dropdown options and I will pick precisely. |

Multi-window minimums. The important trick: **requiring a 7-day figure implicitly requires 7 days of history**, which enforces the age floor in a way the UI can police.

| Field | 1h | 24h | 7d | 30d |
| --- | --- | --- | --- | --- |
| Min. APR | **0** | **30** | **20** | **0** |
| Min. Volume | **0** | **25000** | **175000** | **0** |
| Min. Fee | **0** | **75** | **525** | **0** |

Why those:

- **1h stays 0 deliberately.** A minimum here would *require* a one-hour spike — the exact false-ignition pattern we reject. Leaving it blank is a decision, not an omission.
- **APR 24h at 30%, not 70%+.** A higher APR floor pushes selection *toward* memecoins. Our pinned WETH/USDG pools measured roughly 61% gross annualized, so 30% admits sound pools while still excluding dead ones. This is the one place we deliberately go lower than the RAPTOR-X approach.
- **APR 7d at 20%** is below the 24h figure because a week-long average includes quiet days. Its real job is demanding a week of history.
- **Volume and Fee 7d are 7× the daily floors**, keeping the windows consistent.
- **30d stays 0** because Robinhood Chain itself is only about two months old; requiring 30-day figures would exclude nearly everything, including pools that are genuinely fine.

### Whitelisted Pools — the decision that matters most

Left empty, the agent selects from every pool on the chain and the numeric gates above are your only protection. Filled in, it can only touch pools you listed, and your own analysis replaces its pool-picking entirely.

For a first vault, whitelisting the four on-chain-verified WETH/USDG pools from our registry is the conservative option: modest measured yield (net roughly +0.8% to +1.2% over ten days), 100% in-range, contract addresses we verify fail-closed. Leaving it empty is how you find the higher-yield pools, and also how you end up in a two-day-old launch pool. You can widen it later; you cannot un-lose capital.

## Execution Config panel

| Field | Value | Reasoning |
| --- | --- | --- |
| Max. Swap Slippage | **0.5%** | Keep the default. A reverted rebalance costs $0.03; a bad fill costs real value. Raise to 1% only if you whitelist volatile pools and see rebalances failing. |
| Max. Liquidity Slippage | **0.5%** | Same reasoning. |
| Max. Withdraw Slippage | **0.5%** | This one governs exits. Keeping it tight is what stops a panic unwind at a bad price. |
| Cool-down Period | **1 hour** | Scan often, act rarely: the instruction limits any single position to one adjustment per day, so a short cooldown costs nothing and lets safety exits happen promptly. Raise it if you observe over-trading. |
| Max. Value Per Strategy | **25–30%**, but see the arithmetic below | Caps how much of the vault lands in one position; 25% implies at least four. |
| Gas Fee Ceiling | switch to **$** and set **$0.50** | Measured Robinhood Chain costs: mint $0.020, harvest $0.007, rebalance $0.029. A percentage ceiling of 10% on a $200 position authorizes $20 of gas — roughly 700× the real cost. An absolute $0.50 leaves ample headroom while blocking a genuine gas spike. |
| Strict Cap | **On** | Enforces the per-strategy cap rather than treating it as advisory. Krystal does not document the exact difference, so this is the cautious reading. |
| Default Asset | **ETH** | The strategy is ETH-denominated throughout: gas in ETH, harvest to ETH, entries funded from ETH. Matching the denomination avoids conversion drift in the caps. |

### Max Value Per Strategy conflicts with a small vault

The instruction sizes positions near $200. A percentage cap turns that into a minimum vault size:

| Cap | Smallest vault where a $200 position is allowed |
| --- | --- |
| 100% | $200 |
| 50% | $400 |
| 30% | $667 |
| 25% | $800 |

If the vault holds less than the figure in the right column, the cap forbids the position size the instruction asks for, and the agent will either do nothing or quietly pick one of the two to ignore. Resolve it deliberately, one of three ways:

1. Fund enough that 25–30% clears $200 (about $700–800), and keep the diversification cap.
2. Start with the cap at 100% and accept a single position until harvests grow the balance.
3. Lower the position size in the instruction text to match a smaller vault, remembering that rebalancing at $0.029 is a meaningful drag on a $20 position and trivial on a $200 one.

There is no right answer here; it depends on the amount you have decided to risk, which is yours to choose.

## Your steps — the parts only you can do

1. **Fund a fresh wallet** with an amount you would accept losing entirely. Do not use your main wallet. This grants standing authority to an automation contract.
2. **Create the vault** at defi.krystal.app on Robinhood Chain, with the settings tables above.
3. **Paste the instruction text** (the 800-character block) into the preferences field, then **read what the agent generates** and check it against the drift list above. If it dropped the age floor or the divergence-loss requirement, restate that clause and regenerate before funding.
4. **Set permissions** exactly as listed — specifically leave Compound and Increase Liquidity off.
5. **Review and sign** the vault creation and permission transactions in your own wallet. Read what each one authorizes. I cannot do this step and will not ask you for keys.
6. **Record the vault address**, then paste your wallet address into the **My positions** panel on our dashboard so you can track it independently of Krystal's own reporting.
7. **Wait a week before judging it.** Compare our dashboard's `vs holding` figure against the vault's claimed APR. Those two numbers disagreeing is the single most useful signal you will get.
8. **Revoke if it disagrees badly.** Delete the orders and withdraw. Standing authority should not outlive your confidence in it.

## What to expect, honestly

This configuration will earn **less headline APR** than RAPTOR-X. It refuses 1-day-old launch pools, demands 72 hours of history, requires verified contracts, and needs expected fees to beat expected divergence loss with a margin. Those exclusions are exactly where the four-figure APRs come from.

What it aims to produce instead is a number that stays true when you subtract divergence loss and count the positions that did not work. Whether that trade is worth it is your judgement, and the honest answer will only exist after several weeks of `vs holding` data — not before.
