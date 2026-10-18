# Project Progress

## Volume MA & S/R Enhancements [done]
- [done] Volume MA(20) line overlaid on volume bars with toggle (on by default)
- [done] Volume MA(20) returns null for the first 19 candles instead of partial average
- [done] Volume MA(20) current value displayed in OHLCV metrics bar
- [done] S/R tester displays average volume per candle and MA20 ratio (e.g., 1.8× MA20)
- [done] S/R strength compares last 3 touches via average volume per candle & max range
- [done] Preserved previous-candle volume highlight

## Task 4a: Market Evidence Analysis Backend & UI [done]
- [done] Express route `POST /api/analyze` with server-side Gemini 3.8 Flash & Google Search grounding
- [done] Strict validation: drops any item whose layer, side, label, or tier is invalid (no defaults filled)
- [done] Drops items without source_url or date
- [done] Grounding source verification: builds domain from `chunk.web.domain` or `chunk.web.title`, normalizes both sides, compares main name before TLD, returns `verified` flag, and keeps `web.uri` as clickable link
- [done] Logs one sample `groundingChunk` to the server console for structure inspection
- [done] TopNav "Analysis" view with asset selector, "My thesis" text box, submit button, and evidence list UI
- [done] MarketAnalysisView displays red "ลิงก์ไม่พบในผลค้นหาจริง" badge for items where verified is false
- [done] Cleaned up unused `src/components/AnalysisView.tsx`

## Task 5a: TradingView Lightweight Charts Integration [done]
- [done] Installed `lightweight-charts` v5
- [done] Created `src/components/LwChart.tsx` with attributionLogo enabled (license requirement)
- [done] Two-pane layout: Candlesticks in main pane (pane 0), volume histogram colored by candle direction in lower pane (pane 1) with Volume MA(20) line (null for first 19 candles)
- [done] Crosshair in normal mode with price label on right axis and time label on bottom axis
- [done] Top-left legend updating on hover (fallback to latest candle): O, H, L, C, change % vs previous close, Volume, Vol MA(20)
- [done] Chart switcher toggle "กราฟใหม่ / กราฟเดิม" above the chart defaulting to new chart (TradingChart.tsx preserved)

## Known Issues
- None. Build, lint, and dev server compile cleanly.
