# Project Progress

## Task 3: Chart Enhancements & S/R Tester [done]
- [done] Binance history limit=1000 for all timeframes, native "1w" weekly interval
- [done] Added "1w" timeframe button for Binance assets in TradingChart toolbar
- [done] Bullish engulfing 3-case labels (Buyer จริง, ปิดเหนือ แต่ volume ต่ำ, อาจเป็น short covering — รอแท่งยืนยันที่ 2)
- [done] Support & Resistance tester: "วาดเส้น S/R" interactive placement, ±0.3% touch detection zone, clear button
- [done] Consecutive touching candles grouped into single touch (start date, candle count, total volume, max range)
- [done] 3-touch strength assessment using grouped volume and max range (never touch count)
- [done] Shared `computeVisiblePriceRange` function unifying chart rendering and click-to-price positioning

## Known Issues
- None. Build, lint, and runtime dev server healthy.
