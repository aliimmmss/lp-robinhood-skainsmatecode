# Live vault log

Running record of the Krystal auto-farm vault, measured independently of Krystal's own reporting. Read-only observation; nothing here signs or moves anything.

## Addresses

| Role | Address |
| --- | --- |
| Vault (a contract, not an EOA) | `0xcb643dab200b5c7949b6fa5065c8fa386c19da6b` |
| Funding wallet | `0xc1D0f0c01F7819A441C7b1Ded1FBB98DA1f34e66` |

Position NFTs are held by the vault contract. Krystal's `lp/stats` accepts either address and reports them separately.

## Settings in force

Vault preferences were switched to **High Risk / Max Gain / Active** on 2026-07-29, deliberately, to farm memecoin pools. Before that it ran Balanced / Steady Yield / Smart. Any comparison across that boundary is not like-for-like.

## Baseline — 2026-07-29

Two readings about ten minutes apart, which is itself the useful part of the record.

| Metric | Reading 1 | Reading 2 |
| --- | --- | --- |
| Open / closed positions | 2 / 4 | 2 / 4 |
| Position value | $5.8947 | $5.7734 |
| Total deposited | $6.3877 | $6.3877 |
| PnL | −$0.4930 | −$0.6144 |
| **vs holding** | **−$0.1081** | **−$0.1616** |
| Fees earned (all unclaimed) | $0.0596 | $0.0589 |
| Krystal APR | 3.73% | 3.76% |

Funding wallet at the same time: 1 open / 2 closed, $13.7433 current against $16.5062 deposited, PnL −$2.7629, **vs holding −$0.0344**, fees $0.7805.

Two things worth carrying forward:

- **PnL and `vs holding` diverge sharply.** The wallet is down $2.76 in total but only about three cents against simply holding its tokens: almost all of the loss is token price, not the decision to provide liquidity. Judge the strategy on `vs holding`; judge the market on PnL.
- **Krystal's `returnOnInvestment` field is unusable.** It reported −771% and −1673%, which is a division artifact rather than a return. Ignore it.

## Positions at baseline

| NFT | Pair | Fee | Ticks | Status |
| --- | --- | --- | --- | --- |
| 537482 | CASHCAT / WETH | 1% | −109800 to −105600 | open, **in range** (54% across band) |
| 535872 | WETH / PONS | 1% | 106600 to 112200 | open, **out of range above the ceiling** |
| 521738 | CASHCAT / WETH | 1% | −108400 to −104400 | closed — superseded by 537482 |
| 501400 | WETH / USDG | 0.01% | −201859 to −199852 | closed |
| 415638, 407351 | Uniswap v4 positions | — | — | — |

Notes:

- 521738 → 537482 is a **same-pool range adjustment**, not rotation: same pair, shifted band. That is the behaviour the config intends.
- 501400 was the pinned WETH/USDG 0.01% pool. The vault held it and exited, moving into memecoins. That is the `Max Drawdown` dial doing what it is set to do; tightening it to −10 makes CASHCAT and PONS ineligible.
- Post-entry contract audit passed: **CASHCAT** (`0x020bfc65…`, 36,686 holders) and **PONS** (`0x39dbed3a…`, 22,118 holders) are both verified on the explorer. The in-vault safety gap we accepted did not bite here.

## The PONS excursion — the informative event

At tick 112745 the pool sits **545 ticks above the position ceiling** of 112200, about 5.6% past the edge.

Direction matters more than the fact of being out of range. Token0 is WETH and token1 is PONS, so a rising tick means more PONS per WETH, meaning **PONS fell against WETH**. Above the upper bound a v3 position is entirely token1, so the position sold all its WETH on the way down and now holds roughly **103 PONS, about $2.46, and zero WETH** — one hundred percent of the asset that fell.

This is why `vs holding` degraded from −$0.11 to −$0.16 in ten minutes while fees stayed flat near $0.06: the position was converting into the loser while earning nothing.

What happens next is the thing to watch:

- **If it rebalances**, the loss becomes realized, plus about $0.029 of gas and swap slippage. A later PONS recovery no longer helps.
- **If it holds** and PONS returns inside the band, the loss reverses on its own.

The config clause `do_not_rebalance_into_a_sustained_trend` exists for exactly this decision. With an hourly scan and `require_condition_on_two_consecutive_scans`, the earliest it can act is roughly two hours after going out of range, at most once per day per position.

## What to check next session

1. Did the PONS position get rebalanced, held, or closed? That single event reveals how Active mode distinguishes a trend from noise.
2. `vs holding` for both addresses — the only metric that answers whether providing liquidity beat doing nothing.
3. Churn: four closed positions inside about a day was already high, and Active with Max Gain should raise it. Each rebalance costs about $0.029, negligible per event but material against $0.06 of total fees earned.
4. Whether new positions appear, and if so whether their tokens are verified.

## Scale caveat

The vault holds under $6 and the funding wallet under $17. At this size dust and rounding distort percentages more than performance does, and a few days is not a sample. The value of this log is understanding how the machinery behaves on real capital at a cost that does not matter — not estimating a return.
