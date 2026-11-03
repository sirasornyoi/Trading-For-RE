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

## Known Issues
- None
