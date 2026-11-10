# ICP.gershon.ai — STATUS (updated 2026-11-10)

Live: https://icp.gershon.ai · Health: /api/health · Repo: gershonconsulting/ICP (branch main)
Deploy: Cloudflare Workers Builds (Worker icp-gershon-ai). GitHub link shows "disconnected" → trigger the
Deploy Hook "claude-deploy" or "Deploy" in the Cloudflare dashboard after each push. Full notes: HANDOFF.txt

## Done
- ✅ v1.9.0 LIVE 2026-11-10 (v1.9.1: emails written as the analysed company, never as Gershon; SOM 1-5% of SAM) — sections now: 01 Pitches · 02 Problem · 03 ICPs · 04 Market opportunity · 05 TAM/SAM/SOM (new) ·
  06 Entry · 07 At a glance · 08 Competition · 09 Sales Nav · 10 Search links · 11 LinkedIn groups (new) · 12 Three sample
  emails (new, replaces the single email). Removed: Balanced scorecard, Tradeshows/events (calendar, .ics). Old reports
  upgraded on read (old email → sample email 1); missing new sections → Regenerate.
- ✅ v1.8.0 LIVE 2026-11-10 (PR #4 merged, Deploy Hook run, /api/health = 1.8.0) — review before the PDF: each AI
  section (all but 11) has Edit (markdown + preview), Regenerate (optional instruction, draft only until saved) and
  Approve; review bar "x of 11 approved"; PDF/HTML/email ask first when sections are not approved and refuse while an
  edit is unsaved. API: PUT /api/reports/:slug/sections/:n, POST …/sections/:n/regenerate. Brand red → #FE1B04.
- ✅ v1.7.0 — reports list de-duplicated (newest per company by root domain or company name); new runs replace
  older copies; sidebar Recent / A–Z view with letter headers, count and search
- ✅ v1.6.0 — /api/matrix-stats for the Client Platform Matrix
- ✅ v1.5.0 — Sales Navigator links rebuilt, GPT USA-style email

## Open
- ❌ Verified LinkedIn IDs for industry, headcount, function
- ❌ Some sites block reading (fallback r.jina.ai / paste in Notes)
- ❌ Re-authorize Cloudflare GitHub app so pushes deploy on their own
