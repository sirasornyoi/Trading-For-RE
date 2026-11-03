# Task Progress

## Current Task: Mode 2 · Breakout Scalp (แบบที่ 2) Refinements
- [done] Added directional extreme detection (extremeUp vs extremeDown) and signed EMA50 H4 distance in Step 0
- [done] Updated Trend and Rebound logic: reject chasing extremes (❌ "ไม่ไล่"), validate counter-extremes for Rebound
- [done] Signed risk & reward calculations without Math.abs; flag "Stop อยู่ผิดฝั่ง entry" / "เป้าอยู่ผิดฝั่ง entry"
- [done] Enforced "รอแท่ง breakout" for candle extreme stop mode when trigger is pending (no fake candle substitution)
- [done] Added CPI/NFP/Fed event candle warning and zero-buffer spread warning with ❌ override in Step 5
- [done] Added bid price note to Step 5 [FACT] and strict data sufficiency checks with no mock indicator fallbacks
- [done] Implemented 3-step sequence for Impulse in Step 1 (Narrative -> Volume 3 bars -> HTF alignment)
- [done] Defaulted alerts to disabled (alertEnabled: false) across all assets

## Known Issues
- None
