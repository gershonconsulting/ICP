// POST /api/matrix-stats — read-only feed for the weekly "Client Platform Matrix" email
// (Supabase edge function `client-platform-matrix` in task.gershoncrm.com, column key `icp`).
// Same contract as social.gershon.ai, linalysis.net, nexashare.com, pulse, client and events:
//
//   Request : {"secret":"…","people":[{"key":"…","company":"…","emails":["a@b.com"]}]}
//             (the secret may also be sent as `Authorization: Bearer <secret>`)
//   Auth    : SHA-256 hex of the secret must equal MATRIX_SECRET_SHA256. Only the hash lives
//             here; the plain value is cc_health_config.matrix_stats_secret in the task
//             project. Mismatch -> 401 {"ok":false}. No new Worker secret is needed.
//   Response: {"ok":true,"platform":"icp","as_of":"<ISO>","results":[{"key","ok","note"}]}
//
// Matching: a person matches a saved ICP report by work-email domain == the report's website
// domain (freemail ignored), else by company name (case/accents/legal suffixes ignored).
// ok   = a saved 12-point report with at least one section exists for the company.
// note = "report <Mon YYYY> · N/12 sections · E events" (latest report wins); "no report".
// Reads KV only (one list + one GET per report) — never writes. It sits before the team
// password gate in src/index.js, so the sign-in flow is not involved.

export const MATRIX_STATS_PATH = "/api/matrix-stats";
const MATRIX_SECRET_SHA256 = "7031a38bde30c34db677585e85f696f51d78cc417e40d38572d20ebeb1c77569";
const FREEMAIL = new Set(["gmail.com", "googlemail.com", "yahoo.com", "yahoo.fr", "hotmail.com", "hotmail.fr",
  "outlook.com", "live.com", "msn.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com",
  "gmx.com", "gmx.de", "orange.fr", "free.fr", "wanadoo.fr", "laposte.net"]);
const SUFFIXES = new Set(["ag", "intl", "international", "inc", "incorporated", "llc", "ltd", "limited", "gmbh",
  "sa", "sas", "sarl", "sl", "srl", "spa", "bv", "nv", "plc", "corp", "corporation", "co", "company", "group",
  "holding", "holdings", "na", "usa", "us", "the", "bioinformatics", "biotech"]);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const reply = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
});

async function sha256Hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export function domainOf(u) {
  const s = String(u || "").trim().toLowerCase();
  if (!s) return "";
  const host = s.includes("@") && !s.includes("/") ? s.split("@").pop() : s.replace(/^[a-z]+:\/\//, "").split(/[/?#:]/)[0];
  return host.replace(/^www\./, "");
}

export function nameTokens(name) {
  const t = String(name || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  while (t.length > 1 && SUFFIXES.has(t[t.length - 1])) t.pop();
  while (t.length > 1 && t[0] === "the") t.shift();
  return t;
}

export function namesMatch(a, b) {
  if (!a.length || !b.length) return false;
  const A = a.join(" "), B = b.join(" ");
  if (A === B || A.replace(/ /g, "") === B.replace(/ /g, "")) return true;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  if (s.join("").length < 4) return false;
  return s.every((w, i) => l[i] === w);
}

// reports: newest first. Returns the latest report for this person, or null.
export function matchReport(reports, person) {
  const emails = (Array.isArray(person?.emails) ? person.emails : []).map(e => String(e || "").trim().toLowerCase()).filter(Boolean);
  const doms = emails.map(domainOf).filter(d => d && !FREEMAIL.has(d));
  if (doms.length) {
    const r = reports.find(x => { const d = domainOf(x.url); return d && doms.some(e => e === d || e.endsWith("." + d) || d.endsWith("." + e)); });
    if (r) return r;
  }
  const ct = nameTokens(person?.company);
  return ct.length ? reports.find(x => namesMatch(ct, nameTokens(x.company))) || null : null;
}

export function noteFor(r) {
  const n = Object.values(r.sections || {}).filter(v => String(v || "").trim()).length;
  if (!n) return { ok: false, note: "report empty" };
  const d = new Date(r.createdAt || "");
  const when = Number.isNaN(d.getTime()) ? "" : ` ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return { ok: true, note: `report${when} · ${Math.min(n, 12)}/12 sections · ${(r.events || []).length} events` };
}

export async function handleMatrixStats(request, env) {
  if (request.method !== "POST") return reply({ ok: false }, 405);
  let body = null;
  try { body = await request.json(); } catch { body = null; }
  const bearer = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const secret = typeof body?.secret === "string" && body.secret ? body.secret : bearer;
  if (!secret || (await sha256Hex(secret)) !== MATRIX_SECRET_SHA256) return reply({ ok: false }, 401);

  try {
    const people = Array.isArray(body?.people) ? body.people.slice(0, 200) : [];
    const l = await env.STORE.list({ prefix: "report:" });
    const reports = (await Promise.all(l.keys.map(k => env.STORE.get(k.name, "json")))).filter(Boolean)
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    const results = people.map(p => {
      const key = String(p?.key ?? "");
      const r = matchReport(reports, p);
      return r ? { key, ...noteFor(r) } : { key, ok: false, note: "no report" };
    });
    return reply({ ok: true, platform: "icp", as_of: new Date().toISOString(), results });
  } catch (error) {
    console.error("matrix-stats failed", { message: error?.message });
    return reply({ ok: false }, 500);
  }
}
