# ICP.gershon.ai

Gershon Consulting's 12-point "USA Market Launch" analysis as an app (same 12 sections as the GPT USA / bit.ly/GPTUSA).
Input a company website; the Worker reads the site (home + about/product/technology pages), runs Cloudflare Workers AI
(Llama 3.3 70B, no external API key) and returns: pitches, problem, ICPs, market, entry case, at a glance, competition,
balanced scorecard, US events (next 6 months), Sales Navigator targeting, LinkedIn search links, outreach email.

- Stack: one Cloudflare Worker (`src/index.js`), page in `src/page.html`, KV `STORE` (reports, sessions, password hash), Workers AI binding `AI`.
- Deploy: push to `main` -> GitHub Actions -> tests -> KV ensured -> `wrangler deploy` (custom domain icp.gershon.ai declared in wrangler.toml).
- Access: single team password, chosen on the first visit.
- Sister app: events.gershon.ai (gershonconsulting/events-gershon-ai).
