// ICP.gershon.ai — 12-point USA Market Launch analysis (Gershon Consulting)
// Cloudflare Worker + Workers AI (no external API keys) + KV for reports.
import PAGE from "./page.html";
import HOME from "./home.html";
import SEED from "./seed.json";

export const VERSION = "1.3.0";
const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export const SECTIONS = ["Pitches creation","Problem identification","Ideal customer profiles","Market opportunity","Market entry justification","At a glance","Competition","Balanced scorecard","Tradeshow and conference opportunities","LinkedIn Sales Navigator","LinkedIn search links","Outreach email"];
const GROUPS = [[1,2,3],[4,5,6],[7,8,9],[10,12]];
const SPEC = {
1:"Four pitches: one-sentence pitch, detailed pitch (one paragraph), kid-friendly pitch, and a pitch of exactly 10 words. Label each in bold.",
2:"The central problem the company solves, why current approaches fall short, and the value proposition, in 2-4 short paragraphs.",
3:"A markdown table with columns Priority | Industry | Decision-makers (6 rows, priority 1 to 6). Then: the recommended initial ICP in one paragraph, its buying triggers, and likely objections.",
4:"A two-layer opportunity model (immediate commercial opportunity vs long-term platform opportunity) and an illustrative sizing: number of target US accounts x annual contract value or unit price = hypothetical annual opportunity. State that these are modeling assumptions, not established market-size figures.",
5:"Why the US now: the company's relevant commercial assets, any existing US footprint, and the recommended initial commercial strategy. End with what should be proven before expanding to other segments.",
6:"A markdown table 'Indicator | Company' with 5-6 positioning facts taken from the website text (founding year, HQ, US presence, flagship product, funding, customers). Add one line noting these are company-provided facts, not audited figures.",
7:"A markdown table 'Category | Examples | Differentiation to test' with 3-4 categories of US competitors or substitutes, naming real companies. Then one paragraph on the key commercial distinction, to be tested with customers rather than assumed.",
8:"Illustrative first-year targets as a markdown table 'Perspective | Objective | KPI and target' covering Financial, Customer, Internal processes, Learning and growth. Then name the first commercial initiative.",
9:"One short paragraph on which kinds of US tradeshows and conferences matter most for this company and why (the dated event list is produced separately).",
10:"LinkedIn Sales Navigator targeting split into 4-5 industry-specific campaigns. For each: a ### heading with the segment, then a 'Titles:' line and an 'Engagement signals:' line. End with one prioritization sentence.",
12:"A short cold outreach email (under 140 words) written AS the company to a US prospect, with [First Name] and [Company Name] placeholders, a specific hook, and a 20-minute meeting ask. Plain paragraphs."
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

function window6(now = new Date()) {
  const o = { month: "long", year: "numeric", timeZone: "UTC" };
  const f = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)), t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 6, 1));
  return f.toLocaleDateString("en-US", o) + " to " + t.toLocaleDateString("en-US", o);
}

export function windowBounds(now = new Date()) {
  const s = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const e = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 7, 0));
  return { start: s.toISOString().slice(0, 10), end: e.toISOString().slice(0, 10) };
}

export function buildPrompt(group, { url, name, notes, site, win, today }) {
  const want = group.map(n => `Section ${n} (${SECTIONS[n - 1]}): ${SPEC[n]}`).join("\n");
  const markers = group.map(n => `=== SECTION ${n} ===`).join(", ");
  let extra = group.includes(10) ? `\n=== SEARCHES === 4-5 lines, one per Sales Navigator segment, each "Segment name | keywords", where keywords are 1-4 short job-title or role phrases from the ICP separated by commas (for example: Head of Translational Medicine, Biomarker Discovery).` : "";
  if (group.includes(9)) extra += `\n=== EVENTS === 5-7 lines, one per real US tradeshow or conference taking place within ${win}, each exactly "Event name | start YYYY-MM-DD | end YYYY-MM-DD | City, State | importance 1-5 | official website URL". US locations only.`;
  return `You are the "USA Market Launch" analyst of Gershon Consulting, a New York firm that helps non-US companies enter the US market through LinkedIn outbound and commercial representation. Today is ${today}. US campaign window for events: ${win}.

Company website: ${url}
Company name: ${name || "(infer from the website)"}
Analyst notes (trust these most):
${notes || "(none)"}

Website text (fetched today; trust it over your own memory):
${site || "(website could not be read)"}

Write the following sections of the 12-point US market analysis for THIS company, in English, in markdown (paragraphs, **bold**, "- " bullets, pipe tables). Be specific and commercial, no filler. Never invent precise figures; label estimates as illustrative.

Sections to write:
${want}

Events (section 9) must fall within ${win}; drop anything outside that window.

Output format, exactly: first a line "=== COMPANY === <official company name>", then for each section a line with only its marker (${markers}) followed by the section content. Do not repeat these instructions or the section title in the content. Do not add anything else.${extra}`;
}

// Drop a first line where the model echoed the section title or its instruction.
export function cleanEcho(body, n) {
  const lines = body.split("\n"); const first = (lines[0] || "").replace(/[#*_:]/g, "").trim().toLowerCase();
  const title = (SECTIONS[n - 1] || "").toLowerCase(), spec = (SPEC[n] || "").slice(0, 40).toLowerCase();
  if (first && (first === title || first.startsWith(title + " ") || (spec && first.includes(spec.replace(/[#*_:]/g, "").slice(0, 30))))) lines.shift();
  return lines.join("\n").trim();
}

export function parseOutput(text, group) {
  const out = { sections: {}, searches: [], events: [], company: "" };
  const parts = String(text).split(/^\s*=== *(COMPANY|SEARCHES|EVENTS|SECTION \d+) *===[^\n]*$/m);
  // When the marker is on its own line, content follows; the COMPANY name may be on the marker line itself.
  const cm = String(text).match(/=== *COMPANY *===\s*([^\n]+)/); if (cm) out.company = cm[1].replace(/[*#]/g, "").trim();
  for (let i = 1; i < parts.length; i += 2) {
    const key = parts[i], body = (parts[i + 1] || "").trim();
    if (key.startsWith("SECTION")) { const n = +key.split(" ")[1]; if (group.includes(n) && body) out.sections[n] = cleanEcho(body, n); }
    else if (key === "EVENTS") out.events = parseEvents(body);
    else if (key === "SEARCHES") out.searches = body.split("\n").map(l => l.replace(/^[-*\d.\s]+/, "").split("|").map(s => s.trim())).filter(a => a.length >= 2 && a[0] && a[1]).map(a => ({ label: a[0].replace(/\*/g, ""), keywords: a[1].replace(/["*]/g, "") })).slice(0, 6);
  }
  return out;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export function parseEvents(body) {
  return String(body).split("\n").map(l => l.replace(/^[-*\d.\s]+(?=[A-Za-z])/, "").split("|").map(x => x.trim().replace(/^\*+|\*+$/g, "")))
    .filter(a => a.length >= 4 && a[0])
    .map(a => ({ name: a[0], start: (a[1].match(/\d{4}-\d{2}-\d{2}/) || [""])[0], end: (a[2].match(/\d{4}-\d{2}-\d{2}/) || [""])[0], location: a[3] || "", score: Math.max(1, Math.min(5, parseInt(a[4]) || 3)), url: (String(a[5] || "").match(/https?:\/\/[^\s)>\]]+/) || [""])[0], verified: false }))
    .filter(e => ISO.test(e.start)).map(e => ({ ...e, end: ISO.test(e.end) && e.end >= e.start ? e.end : e.start })).slice(0, 8);
}
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
export function fmtRange(a, b) {
  const [y1, m1, d1] = a.split("-").map(Number), [y2, m2, d2] = b.split("-").map(Number);
  if (a === b) return `${MONTHS[m1 - 1]} ${d1}, ${y1}`;
  if (y1 === y2 && m1 === m2) return `${MONTHS[m1 - 1]} ${d1}–${d2}, ${y1}`;
  if (y1 === y2) return `${MONTHS[m1 - 1]} ${d1} – ${MONTHS[m2 - 1]} ${d2}, ${y1}`;
  return `${MONTHS[m1 - 1]} ${d1}, ${y1} – ${MONTHS[m2 - 1]} ${d2}, ${y2}`;
}
export function eventsTable(events) {
  if (!events.length) return "No dated US events were found in the window. Run again, or check events.gershon.ai.";
  const rows = events.map(e => `| ${e.url ? `[${e.name}](${e.url})` : e.name} | ${fmtRange(e.start, e.end)}${e.verified ? " ✓" : " (to confirm)"} | ${e.location} | ${e.score}/5 |`).join("\n");
  return `| Event | Dates | Location | Importance |\n|---|---|---|---|\n${rows}\n\n✓ = dates checked on the event's official website. Reconfirm registration and booth deadlines before spending.`;
}
// Check each event's dates against its official website (best effort).
export async function verifyEvents(env, events, win) {
  return Promise.all(events.map(async e => {
    if (!e.url) return e;
    try {
      const text = htmlToText(await getPage(e.url)).slice(0, 7000);
      const out = await runAI(env, `Text from the official website of "${e.name}" (${e.url}):\n${text}\n\nFind the dates and city of the edition of this event that takes place between ${win.start} and ${win.end}. Reply with exactly one line: START=YYYY-MM-DD; END=YYYY-MM-DD; CITY=City, State; COUNTRY=Country — or reply NONE if the text does not state those dates.`, 140);
      const st = (out.match(/START=(\d{4}-\d{2}-\d{2})/) || [])[1], en = (out.match(/END=(\d{4}-\d{2}-\d{2})/) || [])[1], city = (out.match(/CITY=([^;\n]+)/) || [])[1], country = ((out.match(/COUNTRY=([^;\n]+)/) || [])[1] || "").trim();
      if (country && !/^(us|usa|u\.s\.a?\.?|united states( of america)?)$/i.test(country)) return { ...e, drop: true };
      if (st && st >= win.start && st <= win.end) return { ...e, start: st, end: en && en >= st ? en : st, location: city ? city.trim() : e.location, verified: true };
    } catch {}
    return e;
  }));
}

async function runAI(env, prompt, maxTokens = 3000) {
  const r = await env.AI.run(MODEL, { messages: [{ role: "user", content: prompt }], max_tokens: maxTokens, temperature: 0.3 });
  return typeof r === "string" ? r : (r.response ?? r.result?.response ?? "");
}

export async function analyze(env, { url, name, notes }) {
  const now = new Date();
  const site = await readSite(url);
  const ctx = { url, name, notes, site: site.text, win: window6(now), today: now.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) };
  const win = windowBounds(now); let events = [];
  const report = { slug: slug(url), url, company: name || "", createdAt: now.toISOString(), window: ctx.win, windowStart: win.start, windowEnd: win.end, sections: {}, searches: [], events: [], source: { siteRead: site.ok, pages: site.pages || [], error: site.error || null, model: MODEL }, errors: [] };
  await Promise.all(GROUPS.map(async g => {
    try {
      const p = parseOutput(await runAI(env, buildPrompt(g, ctx)), g);
      Object.assign(report.sections, p.sections);
      if (p.searches.length) report.searches = p.searches;
      if (p.events.length) events = p.events;
      if (!report.company && p.company) report.company = p.company;
      const missing = g.filter(n => !p.sections[n]); if (missing.length) report.errors.push("Sections " + missing.join(", ") + " came back empty");
    } catch (e) { report.errors.push("Sections " + g.join(", ") + ": " + (e.message || e)); }
  }));
  events = events.filter(e => e.start >= win.start && e.start <= win.end);
  report.events = (await verifyEvents(env, events, win)).filter(e => !e.drop && e.start >= win.start && e.start <= win.end).map(({ drop, ...e }) => e).sort((a, b) => a.start.localeCompare(b.start));
  report.sections[9] = [report.sections[9], eventsTable(report.events)].filter(Boolean).join("\n\n");
  if (!report.company) report.company = url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "");
  return report;
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

// Meteor Biotech sample: events with dates verified on the organizers' websites (Oct 2026).
const SEED_EVENTS = [
  { name: "SITC 2026 Annual Meeting (immuno-oncology)", start: "2026-11-04", end: "2026-11-08", location: "Phoenix, AZ", score: 4, url: "https://www.sitcancer.org/2026", verified: true },
  { name: "SLAS2027 International Conference & Exhibition", start: "2027-01-30", end: "2027-02-03", location: "San Diego, CA", score: 3, url: "https://www.slas.org/2027", verified: true },
  { name: "AGBT 2027 General Meeting (genomics technology)", start: "2027-03-01", end: "2027-03-04", location: "Orlando, FL", score: 5, url: "https://www.agbt.org", verified: true },
  { name: "AACR Annual Meeting 2027", start: "2027-04-02", end: "2027-04-07", location: "Orlando, FL", score: 5, url: "https://www.aacr.org", verified: true }
];
const SEED_9 = "For Meteor, the right rooms are where spatial-biology users and buyers meet: immuno-oncology and cancer research meetings (tumor microenvironment teams), genomics technology meetings (core directors and sequencing leaders) and lab instrumentation shows (core facility and automation buyers). USCAP 2027 is relevant for pathology but takes place in Vancouver, Canada, so it is outside this US list.";
async function ensureSeed(env) {
  if (await env.STORE.get("seeded:v2")) return;
  const seed = { ...SEED, windowStart: "2026-11-01", windowEnd: "2027-04-30", events: SEED_EVENTS, sections: { ...SEED.sections, 9: SEED_9 + "\n\n" + eventsTable(SEED_EVENTS) } };
  await env.STORE.put("report:" + SEED.slug, JSON.stringify(seed));
  await env.STORE.put("seeded:v2", "1");
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
async function listReports(env) {
  const l = await env.STORE.list({ prefix: "report:" });
  const all = await Promise.all(l.keys.map(k => env.STORE.get(k.name, "json")));
  return all.filter(Boolean).map(r => ({ slug: r.slug, company: r.company, url: r.url, createdAt: r.createdAt })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export default {
  async fetch(req, env) {
    const u = new URL(req.url), p = u.pathname;
    if (p === "/api/health") return json({ ok: true, version: VERSION, model: MODEL });
    if (p === "/api/selftest") {
      // Public end-to-end check (site read + Workers AI), max once per 10 minutes, nothing saved.
      const last = +(await env.STORE.get("selftest:last") || 0);
      if (Date.now() - last < 600000) return json({ error: "Self-test ran recently, retry later" }, 429);
      await env.STORE.put("selftest:last", String(Date.now()));
      const r = await analyze(env, { url: "https://www.cloudflare.com/", name: "", notes: "" });
      return json({ ok: Object.keys(r.sections).length === 11 && !r.errors.length, company: r.company, filled: Object.keys(r.sections), searches: r.searches, events: r.events, errors: r.errors, source: r.source, sections: r.sections });
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
    if (p === "/api/reports" && req.method === "GET") return json({ reports: await listReports(env) });
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
    const m = p.match(/^\/api\/reports\/([a-z0-9-]+)$/);
    if (m && req.method === "GET") { const r = await env.STORE.get("report:" + m[1], "json"); return r ? json(r) : json({ error: "Not found" }, 404); }
    if (m && req.method === "DELETE") { await env.STORE.delete("report:" + m[1]); return json({ ok: true }); }
    if (p === "/api/analyze" && req.method === "POST") {
      const b = await req.json(); const url = normalizeUrl(b.url);
      if (!url) return json({ error: "Enter a valid website" }, 400);
      const r = await analyze(env, { url, name: String(b.name || "").slice(0, 120), notes: String(b.notes || "").slice(0, 8000) });
      if (Object.keys(r.sections).length) await env.STORE.put("report:" + r.slug, JSON.stringify(r));
      return json(r);
    }
    return json({ error: "Not found" }, 404);
  }
};
