# Project Progress

## Volume MA & S/R Enhancements [done]
- [done] Volume MA(20) line overlaid on volume bars with toggle (on by default)
- [done] Volume MA(20) current value displayed in OHLCV metrics bar
- [done] S/R tester displays average volume per candle and MA20 ratio (e.g., 1.8× MA20)
- [done] S/R strength compares last 3 touches via average volume per candle & max range
- [done] Preserved previous-candle volume highlight

## Task 4a: Market Evidence Analysis Backend & UI [done]
- [done] Express route `POST /api/analyze` with server-side Gemini 3.8 Flash & Google Search grounding
- [done] Mandatory system instruction embedded without buy/sell verdicts
- [done] Structured JSON evidence schema (layer, side, label, tier, value, source_name, source_url, date, mechanism, side_basis)
- [done] Server drops items missing source_url or date
- [done] TopNav "Analysis" view with asset selector, "My thesis" text box, submit button, and evidence list UI

## Known Issues
- None. Build, lint, and dev server compile cleanly.
