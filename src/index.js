// ICP.gershon.ai — 12-point USA Market Launch analysis (Gershon Consulting)
// Cloudflare Worker + Workers AI (no external API keys) + KV for reports.
import PAGE from "./page.html";
import HOME from "./home.html";
import SEED from "./seed.json";
import { MATRIX_STATS_PATH, handleMatrixStats } from "./matrix-stats.js";

export const VERSION = "1.9.2";
const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

// v1.9.0: section KEYS are stable storage ids (old reports keep working); ORDER is what is shown, numbered 01-12.
// Removed from the analysis: 8 Balanced scorecard, 9 Tradeshows (events have their own platform, events.gershon.ai),
// 12 single outreach email (replaced by 15, three sample emails). Added: 13 TAM/SAM/SOM, 14 LinkedIn groups, 15.
export const TITLES = { 1: "Pitches creation", 2: "Problem identification", 3: "Ideal customer profiles", 4: "Market opportunity", 13: "Market size: TAM, SAM, SOM", 5: "Market entry justification", 6: "At a glance", 7: "Competition", 10: "LinkedIn Sales Navigator", 11: "LinkedIn search links", 14: "Dedicated LinkedIn groups", 15: "Sample outreach emails" };
export const ORDER = [1, 2, 3, 4, 13, 5, 6, 7, 10, 11, 14, 15];
export const SECTIONS = ORDER.map(k => TITLES[k]);
const GROUPS = [[1, 2, 3], [4, 13, 5], [6, 7, 14], [10, 15]];
const EMAIL_A = "Hi [First Name],\nI'm reaching out from <Company>, a <HQ city or country>-based <what the company is, in plain words> <one credibility anchor from the website, e.g. years of experience, origin, flagship product>.\nWe believe <the company's conviction about its market, in one short sentence>.\nWe're bringing that to <the US / the initial ICP> <one concrete proof point from the website: live customers, deployments, a US site, a partner>, while <one line on what comes next>.\nGiven [Company Name]'s work in [specific project or sector], I thought there could be an interesting opportunity to explore how <our product> might <complement or support> your <relevant activity>.\nWould you be open to a 20-minute introductory conversation next week?\nBest regards,\n[Your Name]\n<Company>\n<company domain>";
const SPEC = {
1:"Four pitches: one-sentence pitch, detailed pitch (one paragraph), kid-friendly pitch, and a pitch of exactly 10 words. Label each in bold.",
2:"The central problem the company solves, why current approaches fall short, and the value proposition, in 2-4 short paragraphs.",
3:"A markdown table with columns Priority | Industry | Decision-makers (6 rows, priority 1 to 6). Then: the recommended initial ICP in one paragraph, its buying triggers, and likely objections.",
4:"A two-layer opportunity model: the immediate commercial opportunity (who buys first and why) vs the long-term platform opportunity (where the company can expand). Qualitative only; the sizing figures belong to the TAM, SAM, SOM section.",
13:"US market sizing in three layers. First a markdown table 'Layer | What it covers for this company | Illustrative US estimate | How it is calculated' with exactly three rows: TAM (Total Addressable Market: total US demand for this type of solution if the company had 100% market share), SAM (Serviceable Available Market: the part of the TAM that fits the company's actual product type, price point and the US segments/geography it can serve), SOM (Serviceable Obtainable Market: the realistic share it can capture in 3 years with its current budget, team and competition). Express each estimate as a range in US dollars per year, built bottom-up (number of US accounts x annual contract value or unit price) and say which figures are assumptions. SOM is typically 1-5% of SAM for a new entrant; justify the percentage. Then 2-3 bullets: the key assumptions to validate with customers, and where real figures can be found (industry reports, US Census/NAICS counts, analyst firms). State clearly that these are modeling estimates, not established market-size figures.",
5:"Why the US now: the company's relevant commercial assets, any existing US footprint, and the recommended initial commercial strategy. End with what should be proven before expanding to other segments.",
6:"A markdown table 'Indicator | Company' with 5-6 positioning facts taken from the website text (founding year, HQ, US presence, flagship product, funding, customers). Add one line noting these are company-provided facts, not audited figures.",
7:"The actual US competitors, by name. A markdown table 'Competitor | Website | HQ | What they sell | How they compete with this company' with 6-8 rows, one real named company per row (direct competitors first, then the main substitutes), each active in the US. The Competitor column holds only a company name (never a category or a description such as 'Large CDN providers'); Website is the company's real domain. Only list companies you are confident exist. Then one paragraph on the key commercial distinction, to be tested with customers rather than assumed.",
10:"LinkedIn Sales Navigator targeting split into 4-5 industry-specific campaigns. For each: a ### heading with the segment, then a 'Titles:' line listing 3-5 short real LinkedIn job titles separated by commas (e.g. Director of Genomics, Head of Spatial Biology) and an 'Engagement signals:' line. End with one prioritization sentence.",
14:"The LinkedIn groups where this company's US buyers and influencers gather, to join and engage in (comment, share expertise, never pitch). A markdown table 'Group | Who is in it | How to use it' with 6-8 rows. Name a real, well-known LinkedIn group only when you are confident it exists (typically the group of a US professional association or an established community); otherwise name the topic of the group to look for, in the form 'Groups about <topic>'. Then 2-3 bullets of group etiquette and a cadence (e.g. 2 useful comments a week per group). Add one line: membership sizes and activity must be checked on LinkedIn before joining.",
15:"Three sample outreach emails that THIS company (the one analysed, not Gershon Consulting) sends to a US prospect, each with a different approach. The sender is this company: write 'I\'m reaching out from <this company>', never mention Gershon Consulting. For each email: a ### heading 'Email 1 — Executive introduction', 'Email 2 — Problem-led' and 'Email 3 — Proof and peer-led', then a line '**Subject:** <subject line, under 8 words>', then the email. All three: short, warm, executive, one idea per paragraph, no hype words, no bullet points, under 120 words, signed [Your Name] / <Company>, never invent customers or figures (only facts from the website or notes).\nEmail 1 follows this structure exactly, each part its own paragraph:\n" + EMAIL_A + "\nEmail 2 opens with the specific problem the prospect's role faces (from the ICP), adds one insight on why current approaches fall short, says in one line how the company solves it, and ends with a low-friction question (e.g. 'Is this a priority for your team this year?').\nEmail 3 opens with one concrete proof point from the website (a customer type, a result, a deployment, a partner, a publication), connects it to the prospect's situation, and ends with a clear 20-minute call request."
};

const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export function slug(u) {
  return (String(u).toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/?#].*$/, "").replace(/[^a-z0-9.-]/g, "").replace(/\./g, "-")) || ("c" + Date.now());
}
export function normalizeUrl(u) { u = String(u || "").trim(); if (!u) return ""; if (!/^https?:\/\//i.test(u)) u = "https://" + u; try { return new URL(u).toString(); } catch { return ""; } }

export function htmlToText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(br|\/p|\/div|\/h\d|\/li|\/tr)[^>]*>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n+/g, "\n").trim();
}
function metaOf(html) {
  const g = re => (html.match(re) || [])[1] || "";
  return [g(/<title[^>]*>([^<]*)<\/title>/i), g(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i), g(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)/i)].filter(Boolean).join(" — ");
}
export function pickLinks(html, base) {
  const out = new Set(); const host = new URL(base).host;
  for (const m of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    try { const u = new URL(m[1], base); if (u.host !== host) continue;
      if (/about|company|team|product|technology|solution|platform|service|customer|news/i.test(u.pathname)) out.add(u.toString().replace(/\/$/, ""));
    } catch {}
  }
  return [...out].slice(0, 4);
}
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
async function getPage(url) {
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, "accept": "text/html,application/xhtml+xml", "accept-language": "en-US,en;q=0.9" }, redirect: "follow" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return (await r.text()).slice(0, 400000);
  } catch (e) {
    // Fallback: public reader service, for sites that block datacenter traffic.
    const r = await fetch("https://r.jina.ai/" + url, { headers: { "accept": "text/plain" } });
    const t = await r.text();
    if (!r.ok || /returned error [45]\d\d/i.test(t)) throw new Error(e.message + " (site blocks automated reading)");
    return "<p>" + t.replace(/</g, "&lt;").replace(/\n/g, "</p><p>") + "</p>";
  }
}
export async function readSite(url) {
  const pages = []; let home = "";
  try { home = await getPage(url); pages.push({ url, meta: metaOf(home), text: htmlToText(home).slice(0, 6000) }); } catch (e) { return { ok: false, error: String(e.message || e), text: "" }; }
  const links = pickLinks(home, url);
  const subs = await Promise.allSettled(links.map(async l => { const h = await getPage(l); return { url: l, meta: metaOf(h), text: htmlToText(h).slice(0, 3000) }; }));
  for (const s of subs) if (s.status === "fulfilled") pages.push(s.value);
  const text = pages.map(p => `## ${p.url}\n${p.meta}\n${p.text}`).join("\n\n").slice(0, 16000);
  return { ok: true, pages: pages.map(p => p.url), text };
}

export function buildPrompt(group, { url, name, notes, site, today, instruction, current }) {
  const want = group.map(n => `Section ${n} (${TITLES[n]}): ${SPEC[n]}`).join("\n");
  const markers = group.map(n => `=== SECTION ${n} ===`).join(", ");
  let extra = group.includes(10) ? `\n=== SEARCHES === 4-5 lines, one per Sales Navigator segment, each "Segment name | keywords", using exactly the same segment names as the ### headings of section 10, where keywords are 2-4 short INDUSTRY or TOPIC terms (not job titles) that people in that segment put in their LinkedIn profile, separated by commas (for example: spatial biology, genomics, single cell).` : "";
  if (group.includes(14)) extra += `\n=== GROUPS === 6-8 lines, one per row of the section 14 table, each "Group name or topic | 2-4 search keywords" (keywords that would find that group in LinkedIn's group search, e.g. "spatial biology").`;
  return `You are the "USA Market Launch" analyst of Gershon Consulting, a New York firm that helps non-US companies enter the US market through LinkedIn outbound and commercial representation. Today is ${today}.

Company website: ${url}
Company name: ${name || "(infer from the website)"}
Analyst notes (trust these most):
${notes || "(none)"}

Website text (fetched today; trust it over your own memory):
${site || "(website could not be read)"}

Write the following sections of the 12-point US market analysis for THIS company, in English, in markdown (paragraphs, **bold**, "- " bullets, pipe tables). Be specific and commercial, no filler. Never invent precise figures; label estimates as illustrative.

Sections to write:
${want}
${rewriteBlock(instruction, current)}
Output format, exactly: first a line "=== COMPANY === <official company name>", then for each section a line with only its marker (${markers}) followed by the section content. Do not repeat these instructions or the section title in the content. Do not add anything else.${extra}`;
}

// Extra prompt block used when one section is regenerated from the report screen.
export function rewriteBlock(instruction, current) {
  const i = String(instruction || "").trim(), c = String(current || "").trim();
  if (!i && !c) return "";
  return `\nThis is a rewrite of an existing section.${c ? `\nCurrent version (improve on it, keep what is right):\n"""\n${c.slice(0, 6000)}\n"""` : ""}${i ? `\nEditor's instruction for this rewrite (follow it): ${i.slice(0, 600)}` : ""}\n`;
}

// Drop a first line where the model echoed the section title or its instruction.
export function cleanEcho(body, n) {
  const lines = body.split("\n"); const first = (lines[0] || "").replace(/[#*_:]/g, "").trim().toLowerCase();
  const title = (TITLES[n] || "").replace(/[#*_:]/g, "").toLowerCase(), spec = (SPEC[n] || "").slice(0, 40).toLowerCase();
  if (first && (first === title || first.startsWith(title + " ") || (spec && first.includes(spec.replace(/[#*_:]/g, "").slice(0, 30))))) lines.shift();
  return lines.join("\n").trim();
}

const pairs = body => body.split("\n").map(l => l.replace(/^[-*\d.\s]+/, "").split("|").map(s => s.trim())).filter(a => a.length >= 2 && a[0] && a[1]);
export function parseOutput(text, group) {
  const out = { sections: {}, searches: [], groups: [], company: "" };
  const parts = String(text).split(/^\s*=== *(COMPANY|SEARCHES|GROUPS|EVENTS|SECTION \d+) *===[^\n]*$/m);
  // When the marker is on its own line, content follows; the COMPANY name may be on the marker line itself.
  const cm = String(text).match(/=== *COMPANY *===\s*([^\n]+)/); if (cm) out.company = cm[1].replace(/[*#]/g, "").trim();
  for (let i = 1; i < parts.length; i += 2) {
    const key = parts[i], body = (parts[i + 1] || "").trim();
    if (key.startsWith("SECTION")) { const n = +key.split(" ")[1]; if (group.includes(n) && body) out.sections[n] = cleanEcho(body, n); }
    else if (key === "SEARCHES") out.searches = pairs(body).map(a => ({ label: a[0].replace(/\*/g, ""), keywords: a[1].replace(/["*]/g, "") })).slice(0, 6);
    else if (key === "GROUPS") out.groups = pairs(body).map(a => ({ name: a[0].replace(/\*/g, ""), keywords: a[1].replace(/["*]/g, "") })).slice(0, 8);
  }
  return out;
}

async function runAI(env, prompt, maxTokens = 3500) {
  const r = await env.AI.run(MODEL, { messages: [{ role: "user", content: prompt }], max_tokens: maxTokens, temperature: 0.3 });
  return typeof r === "string" ? r : (r.response ?? r.result?.response ?? "");
}
const todayStr = now => now.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export async function analyze(env, { url, name, notes }) {
  const now = new Date();
  const site = await readSite(url);
  const ctx = { url, name, notes, site: site.text, today: todayStr(now) };
  const report = { slug: slug(url), url, company: name || "", notes: notes || "", createdAt: now.toISOString(), version: VERSION, sections: {}, searches: [], groups: [], source: { siteRead: site.ok, pages: site.pages || [], error: site.error || null, model: MODEL }, errors: [] };
  await Promise.all(GROUPS.map(async g => {
    try {
      const p = parseOutput(await runAI(env, buildPrompt(g, ctx)), g);
      Object.assign(report.sections, p.sections);
      if (p.searches.length) report.searches = p.searches;
      if (p.groups.length) report.groups = p.groups;
      if (!report.company && p.company) report.company = p.company;
      const missing = g.filter(n => !p.sections[n]); if (missing.length) report.errors.push("Sections " + missing.join(", ") + " came back empty");
    } catch (e) { report.errors.push("Sections " + g.join(", ") + ": " + (e.message || e)); }
  }));
  if (report.groups.length) report.groups = await resolveGroups(report.groups);
  if (!report.company) report.company = url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "");
  return report;
}

// ---- LinkedIn groups: find each group's real page (linkedin.com/groups/<id>) through public web search (v1.9.2) ----
const GROUP_RE = /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/groups\/(\d{3,12})/i;
const unent = t => String(t || "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
export const cleanGroupTitle = t => unent(t).replace(/\s*[|\-–—]\s*(groups?\s*[|\-–—]\s*)?linkedin\s*$/i, "").replace(/\s*[|\-–—]\s*groups?\s*$/i, "").trim();
// Bing RSS: <item><title>…</title><link>…</link>
export function parseBingRss(xml) {
  const out = [];
  for (const m of String(xml).matchAll(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<link>([\s\S]*?)<\/link>/gi)) {
    const g = unent(m[2]).match(GROUP_RE); if (g) out.push({ id: g[1], title: cleanGroupTitle(m[1]) });
  }
  return out;
}
// DuckDuckGo HTML: <a class="result__a" href="//duckduckgo.com/l/?uddg=<encoded url>">Title</a>
export function parseDdgHtml(html) {
  const out = [];
  for (const m of String(html).matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    let u = unent(m[1]); const q = u.match(/[?&]uddg=([^&]+)/); if (q) { try { u = decodeURIComponent(q[1]); } catch {} }
    const g = u.match(GROUP_RE); if (g) out.push({ id: g[1], title: cleanGroupTitle(m[2]) });
  }
  return out;
}
async function searchGroups(q) {
  const tries = [
    ["https://www.bing.com/search?format=rss&count=10&q=" + encodeURIComponent(q), parseBingRss],
    ["https://html.duckduckgo.com/html/?q=" + encodeURIComponent(q), parseDdgHtml]
  ];
  for (const [url, parse] of tries) {
    try {
      const r = await fetch(url, { headers: { "user-agent": UA, "accept-language": "en-US,en;q=0.9" } });
      if (!r.ok) continue; const found = parse(await r.text()); if (found.length) return found;
    } catch {}
  }
  return [];
}
// Adds url (direct group page) and title (the group's real name) to each group when search finds one; never invents a link.
export async function resolveGroups(groups, search = searchGroups) {
  const list = groups || [];
  // Per group: the group's own name first (quoted), then its keywords.
  const found = await Promise.all(list.map(async g => {
    const topic = String(g.name || "").replace(/^groups about\s+/i, "").trim(), kw = String(g.keywords || "").split(",")[0].trim();
    const qs = [/^groups about/i.test(g.name || "") ? "" : `site:linkedin.com/groups "${topic}"`, kw ? `site:linkedin.com/groups ${kw}` : `site:linkedin.com/groups ${topic}`].filter(Boolean);
    const hits = [];
    for (const q of qs) { const h = await search(q).catch(() => []); hits.push(...h); if (h.length > 1) break; }
    return hits;
  }));
  const used = new Set();
  return list.map((g, i) => {
    const hit = (found[i] || []).find(h => h.id && !used.has(h.id));
    if (!hit) return { name: g.name, keywords: g.keywords };
    used.add(hit.id);
    return { name: g.name, keywords: g.keywords, url: "https://www.linkedin.com/groups/" + hit.id + "/", title: hit.title || g.name };
  });
}

// Reports made before v1.9.0: their single outreach email (old section 12) becomes the first sample email.
// Old sections 8 and 9 stay stored but are no longer shown; 13 and 14 show as "not generated" until regenerated.
export function upgradeReport(r) {
  if (!r || !r.sections) return r;
  const s = r.sections; if (String(s[15] || "").trim() || !String(s[12] || "").trim()) return r;
  const out = { ...r, sections: { ...s, 15: "### Email 1 — Executive introduction\n\n" + String(s[12]).trim() } };
  if (r.review && r.review[12]) out.review = { ...r.review, 15: r.review[12] };
  return out;
}

// ---- section review: edit, regenerate and approve before the PDF (v1.8.0) ----
// Section 11 (Sales Navigator links) is built from sections 3 and 10, so it is never edited directly.
export const EDITABLE = ORDER.filter(n => n !== 11);
export function reviewCount(r) {
  const rv = (r && r.review) || {};
  return { done: EDITABLE.filter(n => rv[n] && rv[n].approved).length, total: EDITABLE.length };
}
const clip = (v, n) => String(v ?? "").slice(0, n);
function cleanSearches(list) {
  if (!Array.isArray(list)) return null;
  return list.map(x => ({ label: clip(x && x.label, 120).trim(), keywords: clip(x && x.keywords, 200).trim() })).filter(x => x.label && x.keywords).slice(0, 6);
}
function cleanGroups(list) {
  if (!Array.isArray(list)) return null;
  return list.map(x => {
    const o = { name: clip(x && x.name, 160).trim(), keywords: clip(x && x.keywords, 200).trim() };
    const u = String(x && x.url || ""); const m = u.match(GROUP_RE);
    if (m) { o.url = "https://www.linkedin.com/groups/" + m[1] + "/"; o.title = clip(x.title || o.name, 160).trim(); }
    return o;
  }).filter(x => x.name && x.keywords).slice(0, 8);
}
// Applies a save from the editor. body = { text?, approve?, searches?, groups? }. Returns the updated report.
export function applySectionEdit(r, n, body, now = new Date()) {
  if (!EDITABLE.includes(n)) throw Object.assign(new Error("This section cannot be edited"), { status: 400 });
  const b = body || {}; const out = { ...r, sections: { ...(r.sections || {}) }, review: { ...(r.review || {}) } };
  let edited = !!(out.review[n] && out.review[n].edited);
  if (b.text !== undefined) {
    const t = String(b.text).replace(/\r/g, "").trim();
    if (!t) throw Object.assign(new Error("The section cannot be empty"), { status: 400 });
    if (t.length > 20000) throw Object.assign(new Error("The section is too long (20,000 characters maximum)"), { status: 400 });
    if (t !== String(out.sections[n] || "").trim()) edited = true;
    out.sections[n] = t;
  }
  if (b.approve !== false && !String(out.sections[n] || "").trim()) throw Object.assign(new Error("This section is empty: regenerate or write it before approving"), { status: 400 });
  if (n === 10) { const s = cleanSearches(b.searches); if (s && s.length) out.searches = s; }
  if (n === 14) { const g = cleanGroups(b.groups); if (g && g.length) out.groups = g; }
  if (b.approve === false) out.review[n] = { approved: false, edited, at: now.toISOString() };
  else out.review[n] = { approved: true, edited, at: now.toISOString() };
  out.updatedAt = now.toISOString();
  return out;
}
// Writes one section again with the AI. Returns a draft { text, searches?, groups? }; nothing is saved here.
export async function regenerateSection(env, r, n, instruction) {
  if (!EDITABLE.includes(n)) throw Object.assign(new Error("This section cannot be regenerated"), { status: 400 });
  const now = new Date(); const site = await readSite(r.url);
  const ctx = { url: r.url, name: r.company, notes: r.notes || "", site: site.text, today: todayStr(now), instruction, current: (r.sections || {})[n] };
  const p = parseOutput(await runAI(env, buildPrompt([n], ctx)), [n]);
  if (!p.sections[n]) throw Object.assign(new Error("The AI returned nothing for this section. Try again."), { status: 502 });
  const out = { text: p.sections[n] };
  if (n === 10 && p.searches.length) out.searches = p.searches;
  if (n === 14 && p.groups.length) out.groups = await resolveGroups(p.groups);
  return out;
}

// ---- auth (single team password, set on first visit) ----
async function sha(s) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join(""); }
function cookie(req, k) { return ((req.headers.get("cookie") || "").match(new RegExp("(?:^|; )" + k + "=([^;]+)")) || [])[1]; }
async function authed(req, env) {
  const h = await env.STORE.get("config:pw"); if (!h) return "setup";
  const t = cookie(req, "icp"); return t && (await env.STORE.get("session:" + t)) ? "ok" : "no";
}
async function newSession(env) { const t = crypto.randomUUID().replace(/-/g, ""); await env.STORE.put("session:" + t, "1", { expirationTtl: 60 * 60 * 24 * 60 }); return t; }
const setCookie = t => `icp=${t}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 60}`;

async function ensureSeed(env) {
  if (await env.STORE.get("seeded:v3")) return;
  await env.STORE.put("report:" + SEED.slug, JSON.stringify(SEED));
  await env.STORE.put("seeded:v3", "1");
}

// ---- email (Resend) ----
async function emailConfig(env) {
  const c = (await env.STORE.get("config:email", "json")) || {};
  return { key: env.RESEND_API_KEY || c.key || "", fromName: c.fromName || "ICP by Gershon.AI", fromEmail: c.fromEmail || "icp@gershon.ai", cc: c.cc ?? "olivier@gershonconsulting.com" };
}
const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[a-z]{2,}$/i;
export function parseList(v) { return String(v || "").split(/[,;\s]+/).map(x => x.trim()).filter(Boolean); }
const b64 = s => { const bytes = new TextEncoder().encode(s); let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(bin); };
async function sendEmail(env, { to, cc, subject, html, filename, docHtml }) {
  const c = await emailConfig(env);
  if (!c.key) throw Object.assign(new Error("Email is not set up yet: add the Resend key in Settings."), { status: 400 });
  const body = { from: `${c.fromName} <${c.fromEmail}>`, to, subject, html };
  if (cc.length) body.cc = cc;
  if (docHtml) body.attachments = [{ filename, content: b64(docHtml) }];
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: "Bearer " + c.key, "content-type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error("Resend: " + (d.message || d.error || r.status)), { status: 502 });
  return d.id;
}
// Duplicate detection: same website (root domain, ignoring www/app/en… subdomains and paths) or same company name.
const MULTI_TLD = /\.(co|com|org|net|ac|gov|edu)\.[a-z]{2}$/;
export function siteKey(u) {
  let h = String(u || "").toLowerCase().trim().replace(/^https?:\/\//, "").replace(/[/?#:].*$/, "").replace(/\.$/, "");
  if (!h) return "";
  const parts = h.split(".");
  return parts.slice(MULTI_TLD.test(h) ? -3 : -2).join(".");
}
export function nameKey(n) {
  return String(n || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|co|company|gmbh|sas|sa|sarl|bv|ag|plc|pty|srl|spa)\b\.?/g, "")
    .replace(/[^a-z0-9]/g, "");
}
// Keeps the newest report of each company; returns { kept, dupes } (dupes = older copies, newest first).
export function dedupeReports(list) {
  const sorted = list.filter(r => r && r.slug).slice().sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const seen = new Set(), kept = [], dupes = [];
  for (const r of sorted) {
    const keys = [siteKey(r.url) && "s:" + siteKey(r.url), nameKey(r.company) && "n:" + nameKey(r.company)].filter(Boolean);
    if (keys.some(k => seen.has(k))) { dupes.push(r); keys.forEach(k => seen.add(k)); continue; }
    keys.forEach(k => seen.add(k)); kept.push(r);
  }
  return { kept, dupes };
}
async function allReports(env) {
  const out = []; let cursor;
  do { const l = await env.STORE.list({ prefix: "report:", cursor }); out.push(...l.keys); cursor = l.list_complete ? null : l.cursor; } while (cursor);
  return (await Promise.all(out.map(k => env.STORE.get(k.name, "json")))).filter(Boolean);
}
async function listReports(env) {
  const { kept, dupes } = dedupeReports(await allReports(env));
  return { reports: kept.map(r => ({ slug: r.slug, company: r.company, url: r.url, createdAt: r.createdAt })), hiddenDuplicates: dupes.length };
}

export default {
  async fetch(req, env) {
    const u = new URL(req.url), p = u.pathname;
    if (p === "/api/health") return json({ ok: true, version: VERSION, model: MODEL });
    // Read-only Client Platform Matrix feed (column "icp"); own secret check, before the team password gate.
    if (p === MATRIX_STATS_PATH) return handleMatrixStats(req, env);
    if (p === "/api/selftest") {
      // Public end-to-end check (site read + Workers AI), max once per 10 minutes, nothing saved.
      const last = +(await env.STORE.get("selftest:last") || 0);
      if (Date.now() - last < 600000) return json({ error: "Self-test ran recently, retry later" }, 429);
      await env.STORE.put("selftest:last", String(Date.now()));
      const r = await analyze(env, { url: "https://www.cloudflare.com/", name: "", notes: "" });
      return json({ ok: Object.keys(r.sections).length === EDITABLE.length && !r.errors.length, company: r.company, filled: Object.keys(r.sections), searches: r.searches, groups: r.groups, errors: r.errors, source: r.source, sections: r.sections });
    }
    const html = b => new Response(b, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    if (p === "/" || p === "/index.html") return html(HOME);
    if (p === "/app" || p === "/app/") return html(PAGE);
    if (!p.startsWith("/api/")) return new Response("Not found", { status: 404 });

    const state = await authed(req, env);
    if (p === "/api/session") return json({ state, version: VERSION });
    if (p === "/api/setup" && req.method === "POST") {
      if (state !== "setup") return json({ error: "Password already set" }, 409);
      const { password } = await req.json(); if (!password || password.length < 8) return json({ error: "Use at least 8 characters" }, 400);
      await env.STORE.put("config:pw", await sha("icp:" + password)); const t = await newSession(env);
      return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json", "set-cookie": setCookie(t) } });
    }
    if (p === "/api/login" && req.method === "POST") {
      const { password } = await req.json(); const h = await env.STORE.get("config:pw");
      if (!h || (await sha("icp:" + password)) !== h) return json({ error: "Wrong password" }, 401);
      const t = await newSession(env);
      return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json", "set-cookie": setCookie(t) } });
    }
    if (state !== "ok") return json({ error: "Sign in first" }, 401);

    await ensureSeed(env);
    if (p === "/api/reports" && req.method === "GET") return json(await listReports(env));
    if (p === "/api/settings" && req.method === "GET") { const c = await emailConfig(env); return json({ emailReady: !!c.key, keyFromSecret: !!env.RESEND_API_KEY, fromName: c.fromName, fromEmail: c.fromEmail, cc: c.cc }); }
    if (p === "/api/settings" && req.method === "POST") {
      const b = await req.json(); const cur = (await env.STORE.get("config:email", "json")) || {};
      const next = { ...cur, fromName: String(b.fromName || cur.fromName || "ICP by Gershon.AI").slice(0, 80), fromEmail: EMAIL_RE.test(b.fromEmail || "") ? b.fromEmail : (cur.fromEmail || "icp@gershon.ai"), cc: parseList(b.cc).filter(x => EMAIL_RE.test(x)).join(", ") };
      if (b.resendKey) { if (!/^re_[A-Za-z0-9_]{10,}$/.test(b.resendKey.trim())) return json({ error: "That does not look like a Resend key (it starts with re_)." }, 400); next.key = b.resendKey.trim(); }
      await env.STORE.put("config:email", JSON.stringify(next)); return json({ ok: true });
    }
    const em = p.match(/^\/api\/reports\/([a-z0-9-]+)\/email$/);
    if (em && req.method === "POST") {
      const r = await env.STORE.get("report:" + em[1], "json"); if (!r) return json({ error: "Report not found" }, 404);
      const b = await req.json(); const to = parseList(b.to), cc = parseList(b.cc);
      if (!to.length || [...to, ...cc].some(x => !EMAIL_RE.test(x))) return json({ error: "Check the email addresses." }, 400);
      if (to.length + cc.length > 20) return json({ error: "20 recipients maximum." }, 400);
      if (!b.html || b.html.length > 900000) return json({ error: "Report content missing." }, 400);
      try {
        const id = await sendEmail(env, { to, cc, subject: String(b.subject || "ICP report — " + r.company).slice(0, 200), html: b.html, filename: (r.slug || "report") + "-icp-report.html", docHtml: b.docHtml || "" });
        const log = r.sent || []; log.push({ at: new Date().toISOString(), to, cc, id }); r.sent = log.slice(-20);
        await env.STORE.put("report:" + r.slug, JSON.stringify(r));
        return json({ ok: true, id });
      } catch (e) { return json({ error: e.message }, e.status || 500); }
    }
    const sec = p.match(/^\/api\/reports\/([a-z0-9-]+)\/sections\/(\d{1,2})(\/regenerate)?$/);
    if (sec) {
      const r = upgradeReport(await env.STORE.get("report:" + sec[1], "json")); if (!r) return json({ error: "Report not found" }, 404);
      const n = +sec[2]; const b = await req.json().catch(() => ({}));
      try {
        if (sec[3] && req.method === "POST") return json(await regenerateSection(env, r, n, clip(b.instruction, 600)));
        if (!sec[3] && req.method === "PUT") {
          const next = applySectionEdit(r, n, b);
          await env.STORE.put("report:" + r.slug, JSON.stringify(next));
          return json({ ok: true, report: next, review: reviewCount(next) });
        }
      } catch (e) { return json({ error: e.message || String(e) }, e.status || 500); }
      return json({ error: "Not found" }, 404);
    }
    const m = p.match(/^\/api\/reports\/([a-z0-9-]+)$/);
    if (m && req.method === "GET") { const r = upgradeReport(await env.STORE.get("report:" + m[1], "json")); return r ? json(r) : json({ error: "Not found" }, 404); }
    if (m && req.method === "DELETE") { await env.STORE.delete("report:" + m[1]); return json({ ok: true }); }
    if (p === "/api/analyze" && req.method === "POST") {
      const b = await req.json(); const url = normalizeUrl(b.url);
      if (!url) return json({ error: "Enter a valid website" }, 400);
      const r = await analyze(env, { url, name: String(b.name || "").slice(0, 120), notes: String(b.notes || "").slice(0, 8000) });
      if (Object.keys(r.sections).length) {
        await env.STORE.put("report:" + r.slug, JSON.stringify(r));
        // A new run replaces any older report of the same company saved under another address.
        const sk = siteKey(r.url), nk = nameKey(r.company);
        const older = (await allReports(env)).filter(o => o.slug !== r.slug && ((sk && siteKey(o.url) === sk) || (nk && nameKey(o.company) === nk)));
        await Promise.all(older.map(o => env.STORE.delete("report:" + o.slug)));
      }
      return json(r);
    }
    return json({ error: "Not found" }, 404);
  }
};
