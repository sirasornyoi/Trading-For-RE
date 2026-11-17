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

## Known Issues
- None
