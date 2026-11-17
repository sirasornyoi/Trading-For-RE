# Task Progress

## Mode 1 · Market Analysis & Silver Terminal (แบบที่ 1)
- [done] Added domainOf(url) helper and strict domain verification against Google Search groundingSources in server.ts /api/analyze
- [done] Added today's dynamic date (ISO) in prompt, 30-day macro requirement, 4 mandatory search topics, and detailed T1/T2/T3 definitions
- [done] Added thesis_relation ("supports" | "contradicts") in EvidenceItem type, server prompt, and backend mapping
- [done] Enforced max 1,000 characters limit on thesis with 400 error response and UI counter
- [done] Filtered out evidence items lacking source_url or date (no '#' fallback)
- [done] Restructured MarketAnalysisView into 3 groups: Fundamental (60%), Technical (30%), News (10%)
- [done] Split each group into 2 columns: BULL | BEAR sorted by Tier T1 → T2 → T3
- [done] Added "หนุน thesis" and "ขัด thesis" list boxes (without score counting or winner declaration)
- [done] Updated verified badge to "พบโดเมนนี้ในผลค้นหา" / "ไม่พบในผลค้นหาจริง — ตรวจเองก่อนใช้"
- [done] Added aggregateTo4h (UTC 14400s bucket) in marketData.ts for Silver 4h timeframe
- [done] Updated fetchSilverKlines to request timeframe '1w' directly from server (5y data)

### Mode 1 fixes รอบ 2
- [done] Disallowed Google redirect domains (vertexaisearch.cloud.google.com, *.google.com) from being verified
- [done] Changed domain verification to match item domain against g.title only (not g.url)
- [done] Enforced strict verified rule when fallback grounding URL is used: verified only when g.title matches source_name
- [done] Added missing: boolean field in EvidenceItem and exempted items containing "ไม่พบข้อมูล" from url/date filtering
- [done] Rendered missing mandatory topics in top gray box ("หัวข้อบังคับที่ยังหาไม่เจอ") outside BULL/BEAR columns and thesis boxes
- [done] Added 'unclear' fallback to thesis_relation and added third box "ยังไม่ชัดว่าหนุนหรือขัด"
- [done] Updated `TradingChart.tsx` S/R controls: added toolbar "ลบเส้น S/R" button, panel "ลบเส้น" button, Trendline tooltip clarification, auto-clear S/R on symbol switch (preserved on timeframe switch), and `Esc` to exit S/R drawing mode
- [done] Updated Bullish Engulfing indicators in `TradingChart.tsx` to render as compact dots by default and expand the full `"Buyer จริง"` / `"อาจเป็น short covering"` label only on candle hover
- [done] Added 15s background price alert polling in `App.tsx` for all non-selected Binance/Yahoo assets using closed 1m high/low wicks (`gte` vs `high`, `lte` vs `low`), skipping CSV assets
- [done] Cleared `candles` immediately on symbol/timeframe switch in `App.tsx` and guarded REST/WebSocket messages with `activeChartKeyRef`; kept `TradingChart` mounted across TF switches for Binance/Yahoo assets
- [done] Reset `visibleCount=60`, `panOffset=0`, `priceScaleMultiplier=1`, `pricePanOffset=0`, and cleared `trendlines`/`trendlineRedoStack`/`trendlineStart`/`selectedTrendlineId` on symbol switch in `TradingChart.tsx`; reset Y-axis scale/pan on timeframe switch while preserving horizontal zoom
- [done] Enabled live Binance REST + WebSocket (`solusdt`) for `SOL/USDT` and `/api/klines` (`GC=F`) for `XAU/USD` with `"COMEX Gold Futures (GC=F)"` label and real Yahoo connection/error status in `App.tsx`
- [done] Updated `server.ts` `/api/klines` to respond with HTTP 400 `"ไม่รองรับ symbol นี้"` for unknown symbols instead of defaulting to Silver

## Mode 2 · Breakout Scalp (แบบที่ 2) Refinements
- [done] Added directional extreme detection (extremeUp vs extremeDown) and signed EMA50 H4 distance in Step 0
- [done] Updated Trend and Rebound logic: reject chasing extremes (❌ "ไม่ไล่"), validate counter-extremes for Rebound
- [done] Signed risk & reward calculations without Math.abs; flag "Stop อยู่ผิดฝั่ง entry" / "เป้าอยู่ผิดฝั่ง entry"
- [done] Enforced "รอแท่ง breakout" for candle extreme stop mode when trigger is pending (no fake candle substitution)
- [done] Added CPI/NFP/Fed event candle warning and zero-buffer spread warning with ❌ override in Step 5
- [done] Added bid price note to Step 5 [FACT] and strict data sufficiency checks with no mock indicator fallbacks
- [done] Implemented 3-step sequence for Impulse in Step 1 (Narrative -> Volume 3 bars -> HTF alignment)
- [done] Defaulted alerts to disabled (alertEnabled: false) across all assets
- [done] Added activeSelectionRef to drop stale async responses across asset and timeframe switches
- [done] Immediately clear candle state on asset/TF switch and render loading/error indicators
- [done] Built BreakoutScalpErrorBoundary to prevent white-screen crashes and offer retry button
- [done] Removed risk = 1 fallback in Step 7; display ❓ "คำนวณ 1R ไม่ได้" when riskAmount is null or <= 0
- [done] Made Step 4 ❓ only when latest closed bar has avg 20-bar vol = 0; valid trigger in other bars is displayed normally
- [done] Differentiated risk = 0 ("Stop กับ Entry ราคาเดียวกัน (ใส่ buffer)") and risk < 0 ("Stop อยู่ผิดฝั่ง entry") across Steps 5, 6, 8

## Mode 2 · Entry Tiers (ระยะ 0 / 1 / 2 / 3)
- [done] Added `src/services/entryTiers.ts` with Tier 1/2/3 checklists, Daily RSI zone evaluation, directional R/R (>= 1:3) validation, signal count (>= 2) validation, low-probe support, and independent per-tier time-stop evaluation
- [done] Added `src/components/EntryTiersPanel.tsx` for Tiers 1–3 UI with "ไม้ทดลองที่ low", signals & Entry/SL/TP inputs, auto R/R warning, independent per-tier timer, and HTF-gated upgrade button (no scores, no Buy/Sell/Wait)
- [done] Integrated Entry Tiers selector bar (ระยะ 0 / 1 / 2 / 3) into `src/components/BreakoutScalpView.tsx` while keeping Tier 0 Breakout Scalp logic and Mode 1 untouched
- [done] Updated tier upgrade to stop the previous tier's timer (`enteredAt = null`) and start the new tier's timer immediately (`enteredAt = Date.now()`)
- [done] Restricted market close time input and near-market-close warnings to `XAU/USD` and `XAG/USD` (hidden for crypto assets)
- [done] Added `src/components/EntryTierChart.tsx` with Daily/H4/H1/(Weekly in Tier 3) candlestick chart, `[ตั้ง Entry]`/`[ตั้ง SL]`/`[ตั้ง TP]` click-to-set via `coordinateToPrice`, Esc/cancel mode, horizontal `createPriceLine` overlays, and `decimals` rounding synced with inputs and `evaluateTierRR`
- [done] Enhanced `EntryTierChart.tsx` with EMA20/50/100/200 (`calculateEMA`), Volume + MA20 with zero-volume notice, RSI 14 pane (`calculateRSI`) with 30/70 dashed lines, <=35/>=65 shading & Daily RSI header, 3-bar Swing High/Low markers, R/R shaded zones & distance labels, expanded legend, and separate localStorage indicator persistence
- [done] Added per-field `✕` clear buttons next to Entry/SL/TP inputs in `EntryTiersPanel.tsx` and toolbar `"ลบเส้นทั้งหมด"` button in `EntryTierChart.tsx` (scoped strictly to the active tier)
- [done] Fixed `EntryTierChart.tsx` EMA visibility & Swing markers after chart rebuild (`indicatorsRef` + `chartVersion`), preserved zoom/pan across 5m refreshes and Volume/RSI pane toggles (`getVisibleLogicalRange`/`setVisibleLogicalRange`), and added dashed light-green `TP1` line + `✕` clear button (included in `"ลบเส้นทั้งหมด"`)
- [done] Updated Entry Tiers RSI zone thresholds from 35/65 to 30/70 in `evaluateDailyRsi` (`src/services/entryTiers.ts`) and RSI pane shading (`src/components/EntryTierChart.tsx`), removed near-30/70 labels, and updated low-probe checklist text to `ราคาที่/ใกล้ Low + RSI Daily ใกล้ 30 (ดุลพินิจ)`

## Crypto Data Source Migration · Binance (USDT) → Kraken (USD)
- [done] Added `GET /api/kraken/ohlc` proxy in `server.ts` mapping `BTC/USD`→`XBTUSD`, `ETH/USD`→`ETHUSD`, `SOL/USD`→`SOLUSD` and returning `{ time, open, high, low, close, volume }` with Kraken error 502 handling
- [done] Created `src/services/krakenData.ts` with `fetchKrakenKlines`, `subscribeKrakenOhlc` (`wss://ws.kraken.com/v2`), and one-time `migrateUsdtToUsdStorage` (`apextrade_migrated_usdt_to_usd_v1`)
- [done] Switched crypto symbols (`BTC/USD`, `ETH/USD`, `SOL/USD`), defaults, data source labels (`Kraken`), and all Mode 1 + Mode 2 REST/WS/background monitors from Binance (`fetchBinanceKlines` removed) to Kraken

## Known Issues
- None

