# Task Progress

## Mode 2 · Entry Tiers (ระยะ 0 / 1 / 2 / 3)
- [done] Created `src/services/entryTiers.ts` with Tier 1/2/3 checklists, Daily RSI zone evaluation, directional R/R (>= 1:3) validation, signal count (>= 2) validation, low-probe support, and independent per-tier time-stop evaluation (24h / 5-day / configurable market close warnings)
- [done] Created `src/components/EntryTiersPanel.tsx` with Tier 1–3 UI, "ไม้ทดลองที่ low" toggle + SL re-entry counter, signal inputs, Entry/SL/TP + auto R/R warning, independent per-tier time-stop timer + market close config, and HTF-gated "อัปเกรดระยะ" button (no scores, no Buy/Sell/Wait)
- [done] Integrated Entry Tiers selector bar (ระยะ 0 / 1 / 2 / 3) into `src/components/BreakoutScalpView.tsx` while keeping Tier 0 Breakout Scalp logic and Mode 1 untouched

## Known Issues
- None
