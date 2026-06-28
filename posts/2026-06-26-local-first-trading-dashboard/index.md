---
title: "Building a Local-First, Read-Only Trading Dashboard with FastAPI + React"
date: 2026-06-26
summary: A self-hosted dashboard that aggregates read-only brokerage positions, delayed market data, macro feeds and a personal rule base, computes expectancy locally, and assembles an LLM prompt — strictly read-only, it never places an order. A post about the engineering, not the trading.
wechat_url:
tags: [webdev, dataviz, fastapi, react, self-hosting]
lang: en
translations: [zh]
---

<!-- English is the default version. 中文原文见 index.zh.md（站内点「中文」按钮切换）。 -->

# Building a Local-First, Read-Only Trading Dashboard with FastAPI + React

> **Up front, so there's no confusion:** this is a post about *software engineering*, not investing. The project is a read-only analytics panel. It does not place orders, does not emit buy/sell signals, and promises nothing about returns. Every number it shows is historical statistics or a deterministic formula. Nothing here is financial advice.

## Intro

I wanted a single screen that pulled together everything I look at before making a decision — positions, delayed quotes, a few technical indicators, some macro context, a news digest, and my own written "rules" — and then helped me *think*, not act. The hard constraints I set myself were unusual for a trading tool: **local-first, and read-only by default.** The app should be able to sit there all day touching nothing, and connect to my broker only when I explicitly press a button — and even then, only to *read*.

This post is about how that constraint shaped the architecture, and the engineering details I found interesting along the way.

---

## 1. Read-only by design, not by promise

The safety property I cared about most is enforced in several independent places, so it can't be "forgotten":

- **It doesn't connect to the broker by default.** The home view, the polling loop, the one-click plan — all run off a read-only saved snapshot plus free market data. Connecting to Interactive Brokers happens only on an explicit refresh request.
- **When it does connect, it connects read-only.** Every broker session is opened with `readonly=True`, and there is *no order-placement call anywhere in the codebase* — it only ever reads positions and account summary.
- **It degrades instead of lying.** If the gateway is offline, it doesn't fall back to fake data; it re-marks the last real snapshot with external quotes and labels the valuation mode (`live`, `snapshot_external_mark`, or `snapshot_stale`) so you always know how fresh the numbers are.

Read-only isn't a sentence in the README — it's the shape of the code.

## 2. Data honesty: better "don't use this" than a pretty fake

The most opinionated part of the project is that it would rather show you nothing than a number that looks right and isn't:

- If a quote's bid/ask spread exceeds a sane threshold (or bid > ask), the value is flagged unreliable and the UI literally says "distorted, don't use."
- If an option's implied volatility lands outside a plausible band, it's treated as bad — and the Greeks computed from it are discarded rather than displayed with false confidence.
- Paid data has a hard gate: fetching a real-time snapshot (which costs a small per-call fee) requires an explicit confirm in the UI, plus a server-side throttle so a double-click can't double-charge you.
- When option Greeks aren't available, the code says *why* — "not subscribed to the real-time options feed" — and falls back to delayed data with a locally computed estimate, instead of silently showing blanks.

A dashboard you can't trust at a glance is worse than no dashboard. So it spends real effort proving its own numbers.

## 3. The stack (and what's deliberately missing)

- **Frontend:** Vite 7 + React 19 + TypeScript, with an intentionally tiny dependency list — `react`, `react-dom`, an icon set, and a Markdown renderer. **No charting library.** The "visualization" is structured panels, tables, and status bars, not candlestick charts — which fits a tool about *reading context*, not staring at price.
- **Backend:** FastAPI + uvicorn, with effectively three Python dependencies; nearly everything else (HTTP, CSV, cookies, concurrency) is standard library. It was recently refactored from one big file into a dozen focused modules.
- **Data layers, by cost:** free by default (delayed quotes, technicals, fundamentals, options-chain IV, plus macro feeds and an economic calendar); a small per-call fee for a real-time snapshot; a monthly subscription for live options Greeks (off by default, auto-falls-back).

## 4. Real-time without WebSockets

There's no socket plumbing here — just disciplined polling plus multi-level caching. The frontend probes broker connectivity and the portfolio every few seconds and refreshes macro on a slower cadence; the backend gives every source its own TTL (quotes seconds, options minutes, fundamentals and daily bars hours, the calendar a day). The decision endpoint fans out seven or eight cross-border fetches through a thread pool, so total latency is roughly the slowest single source rather than their sum, with a global semaphore capping concurrency so a free quote API doesn't start returning 429s.

## 5. Deterministic math, not prediction

The "expectancy" panel is pure arithmetic on history, and labeled as such everywhere:

- Break-even win rate is just `risk / (risk + reward)`.
- The historical hit-rate "backtest" walks two years of daily bars, treats each day as an entry, and asks whether price hit the target or the stop first within a fixed horizon — counting same-day double-touches conservatively as a loss.
- It can condition on the present: only sampling historical days in the same RSI bucket and trend as today.

Option Greeks are computed locally with Black-Scholes (delayed IV in, a risk-free rate from the 3-month Treasury). None of this predicts anything — it's a transparent way to *frame* a decision, which is exactly why it's safe to put on screen.

## 6. Six-stage retrieval over a personal rule base

The most fun engineering is the rule search. My trading "rules" live as notes; the app indexes them and retrieves the relevant ones to include in the prompt. It runs as a **provider-agnostic, degrade-gracefully pipeline**: lexical recall (with bigram tokenization for languages without word boundaries) → semantic vectors → multi-query expansion → section expansion → LLM rerank → a full-coverage pass. Any upper stage failing falls back to plain lexical — it never crashes. Embeddings are cached on disk with a signature over the content, so editing a note or switching providers recomputes automatically.

And a nice escape hatch: a single endpoint exports the entire rule set as plain text. Because the rule base is small, you can paste the whole thing into a long-context web LLM and get full-coverage retrieval for free, with no dependency on the server's LLM key at all.

## 7. The war stories

- **A half-open gateway froze the whole page.** The broker client's account/portfolio calls have *no timeout* on a slow gateway — I measured a ~54-second hang, and the old code held a lock the whole time, blocking everything. The fix: a single-flight executor with a hard timeout that returns the cached snapshot on time and lets the slow thread warm the cache in the background.
- **A data source quietly died.** One free historical-data provider's pages moved and then sprouted a JS anti-scraping challenge, so I migrated wholesale to another chart API (which itself needs a cookie + token handshake, refreshed every 30 minutes).
- **"Stale options" was a misdiagnosis.** A "distorted/unavailable" flag turned out to be *market-closed wide spreads*, not stale data — it tightens at the open. Knowing that let me harden the reliability check instead of chasing a non-bug.
- **Deployment is its own boss fight.** Browser cache making you think a deploy didn't land; `docker exec` needing `-i` to accept stdin; an SSH single-command argument ceiling forcing the built frontend to be base64-split into chunks; git-bash mangling absolute paths until `MSYS_NO_PATHCONV=1`.

## 8. Honest trade-offs

- **It's a single-user, personal tool.** CORS is pinned to localhost, there's no multi-tenant auth (it leans on a private network), and there's one account snapshot. Not a product.
- **Free data is delayed** (~15 minutes); truly real-time needs a paid subscription, and most Greeks are local estimates.
- **It leans on third-party, unofficial endpoints** that can change without notice — one already did.
- **There are MVP remnants** (mock routes and fixtures) still in the tree; the code is ahead of parts of the README.
- And again, the important one: **this is read-only analytics, not an auto-trader, and not advice.**

The interesting work here was never about markets. It was about building a tool that's honest about its data, safe by construction, and useful for thinking — three things worth caring about in any dashboard.

→ **[github.com/ZerbLion/trading-pannel](https://github.com/ZerbLion/trading-pannel)**
