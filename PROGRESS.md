# Task Progress

## Current Task: Mode 1 Fixes (หน้าวิเคราะห์หลักฐานตลาด + ข้อมูลราคา Silver)
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
- [done] Preserved BreakoutScalpView.tsx and breakoutScalp.ts intact without any changes

## Mode 2 · Breakout Scalp (แบบที่ 2) Status
- [done] Completed all checklist 0–8, 1m/5m data, and alert background monitors

## Known Issues
- None
