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
- [done] Grounding source verification: domain matching between source_url and groundingChunks, returning verified flag and groundingSources list
- [done] TopNav "Analysis" view with asset selector, "My thesis" text box, submit button, and evidence list UI
- [done] MarketAnalysisView displays red "ลิงก์ไม่พบในผลค้นหาจริง" badge for items where verified is false
- [done] Cleaned up unused `src/components/AnalysisView.tsx`

## Known Issues
- None. Build, lint, and dev server compile cleanly.
