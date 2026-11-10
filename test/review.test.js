import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8")
  .replace('import PAGE from "./page.html";', 'const PAGE = "";')
  .replace('import HOME from "./home.html";', 'const HOME = "";')
  .replace('import SEED from "./seed.json";', 'const SEED = {};')
  .replace('from "./matrix-stats.js";', 'from "' + new URL("../src/matrix-stats.js", import.meta.url) + '";');
const mod = await import("data:text/javascript," + encodeURIComponent(src));

const base = () => ({ slug: "acme-com", url: "https://acme.com/", company: "Acme", sections: { 1: "Pitch", 2: "P", 3: "I", 4: "M", 13: "T", 5: "E", 6: "G", 7: "C", 10: "### Labs\nTitles: A", 14: "| Group |", 15: "### Email 1" }, searches: [{ label: "Labs", keywords: "genomics" }], groups: [{ name: "AACR", keywords: "cancer research" }] });

test("editing a section saves the text and approves it", () => {
  const r = mod.applySectionEdit(base(), 1, { text: "  New pitch \r\n", approve: true }, new Date("2026-11-10T00:00:00Z"));
  assert.equal(r.sections[1], "New pitch");
  assert.deepEqual(r.review[1], { approved: true, edited: true, at: "2026-11-10T00:00:00.000Z" });
  assert.equal(mod.reviewCount(r).done, 1);
});
test("approving without a text change keeps the AI text and is not marked edited", () => {
  const r = mod.applySectionEdit(base(), 1, { approve: true });
  assert.equal(r.sections[1], "Pitch");
  assert.equal(r.review[1].approved, true);
  assert.equal(r.review[1].edited, false);
});
test("the original report object is not mutated", () => {
  const b = base(); mod.applySectionEdit(b, 1, { text: "Changed" });
  assert.equal(b.sections[1], "Pitch"); assert.equal(b.review, undefined);
});
test("section 11 and removed sections (8 scorecard, 9 events, 12 old email) cannot be edited", () => {
  for (const n of [11, 8, 9, 12, 16]) assert.throws(() => mod.applySectionEdit(base(), n, { text: "x" }), /cannot be edited/);
});
test("an empty section cannot be approved without text", () => {
  const b = base(); delete b.sections[13];
  assert.throws(() => mod.applySectionEdit(b, 13, { approve: true }), /empty/);
  assert.equal(mod.applySectionEdit(b, 13, { text: "TAM table", approve: true }).sections[13], "TAM table");
});
test("empty and oversized text is refused", () => {
  assert.throws(() => mod.applySectionEdit(base(), 2, { text: "   " }), /cannot be empty/);
  assert.throws(() => mod.applySectionEdit(base(), 2, { text: "a".repeat(20001) }), /too long/);
});
test("section 10 save can carry regenerated searches, sanitized", () => {
  const r = mod.applySectionEdit(base(), 10, { text: "### Pharma\nTitles: B", searches: [{ label: "Pharma", keywords: "oncology" }, { label: "", keywords: "x" }, "junk"] });
  assert.deepEqual(r.searches, [{ label: "Pharma", keywords: "oncology" }]);
  const keep = mod.applySectionEdit(base(), 10, { text: "### Pharma", searches: [] });
  assert.deepEqual(keep.searches, [{ label: "Labs", keywords: "genomics" }]);
});
test("section 14 save can carry regenerated groups, sanitized", () => {
  const r = mod.applySectionEdit(base(), 14, { text: "| G |", groups: [{ name: "Spatial biology", keywords: "spatial omics" }, { name: "x" }, 5] });
  assert.deepEqual(r.groups, [{ name: "Spatial biology", keywords: "spatial omics" }]);
});
test("unapprove keeps the edited flag", () => {
  const a = mod.applySectionEdit(base(), 1, { text: "Changed" });
  const b = mod.applySectionEdit(a, 1, { approve: false });
  assert.deepEqual([b.review[1].approved, b.review[1].edited], [false, true]);
});
test("reviewCount covers the 11 editable sections", () => {
  assert.deepEqual(mod.reviewCount({}), { done: 0, total: 11 });
  let r = base(); for (const n of mod.EDITABLE) r = mod.applySectionEdit(r, n, { approve: true });
  assert.deepEqual(mod.reviewCount(r), { done: 11, total: 11 });
});
test("rewrite prompt carries the current text and the editor's instruction", () => {
  const p = mod.buildPrompt([2], { url: "u", today: "t", current: "Old text", instruction: "shorter, for hospitals" });
  assert.match(p, /Current version \(improve on it/);
  assert.match(p, /Old text/);
  assert.match(p, /Editor's instruction for this rewrite \(follow it\): shorter, for hospitals/);
  assert.ok(p.includes("=== SECTION 2 ==="));
  assert.ok(!mod.buildPrompt([2], { url: "u", today: "t" }).includes("rewrite"));
});

// Route-level check with an in-memory KV and a fake Workers AI.
function env(aiText) {
  const kv = new Map();
  return { kv, AI: { run: async () => ({ response: aiText }) }, STORE: {
    get: async (k, t) => { const v = kv.get(k); return v == null ? null : t === "json" ? JSON.parse(v) : v; },
    put: async (k, v) => { kv.set(k, v); }, delete: async k => { kv.delete(k); },
    list: async ({ prefix }) => ({ keys: [...kv.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true }) } };
}
async function signedIn(e) { e.kv.set("config:pw", "x"); e.kv.set("session:t", "1"); e.kv.set("seeded:v3", "1"); e.kv.set("report:acme-com", JSON.stringify(base())); }
const call = (e, path, method, body) => mod.default.fetch(new Request("https://icp.gershon.ai" + path, { method, headers: { cookie: "icp=t", "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }), e);

test("PUT /api/reports/:slug/sections/:n saves and returns the review count", async () => {
  const e = env(""); await signedIn(e);
  const res = await call(e, "/api/reports/acme-com/sections/2", "PUT", { text: "Edited problem", approve: true });
  assert.equal(res.status, 200);
  const d = await res.json();
  assert.equal(d.report.sections[2], "Edited problem");
  assert.deepEqual(d.review, { done: 1, total: 11 });
  assert.equal(JSON.parse(e.kv.get("report:acme-com")).sections[2], "Edited problem");
});
test("GET of an old report shows its email as sample email 1", async () => {
  const e = env(""); await signedIn(e);
  e.kv.set("report:old-com", JSON.stringify({ slug: "old-com", url: "https://old.com/", company: "Old", sections: { 12: "Hi there" } }));
  const d = await (await call(e, "/api/reports/old-com", "GET")).json();
  assert.match(d.sections[15], /Email 1 — Executive introduction\n\nHi there/);
});
test("PUT on section 11 is refused, unknown report is 404, signed-out is 401", async () => {
  const e = env(""); await signedIn(e);
  assert.equal((await call(e, "/api/reports/acme-com/sections/11", "PUT", { text: "x" })).status, 400);
  assert.equal((await call(e, "/api/reports/nope/sections/2", "PUT", { text: "x" })).status, 404);
  const out = await mod.default.fetch(new Request("https://icp.gershon.ai/api/reports/acme-com/sections/2", { method: "PUT", body: "{}" }), e);
  assert.equal(out.status, 401);
});
test("POST .../regenerate returns a draft and saves nothing", async () => {
  const e = env("=== COMPANY === Acme\n=== SECTION 2 ===\nA sharper problem statement.");
  await signedIn(e);
  const realFetch = globalThis.fetch; globalThis.fetch = async () => new Response("<title>Acme</title><p>We make widgets</p>", { status: 200 });
  try {
    const res = await call(e, "/api/reports/acme-com/sections/2/regenerate", "POST", { instruction: "shorter" });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).text, "A sharper problem statement.");
    assert.equal(JSON.parse(e.kv.get("report:acme-com")).sections[2], "P");
  } finally { globalThis.fetch = realFetch; }
});
test("regenerate reports an empty AI answer as an error", async () => {
  const e = env("nothing useful"); await signedIn(e);
  const realFetch = globalThis.fetch; globalThis.fetch = async () => new Response("<p>x</p>", { status: 200 });
  try { const res = await call(e, "/api/reports/acme-com/sections/2/regenerate", "POST", {}); assert.equal(res.status, 502); }
  finally { globalThis.fetch = realFetch; }
});
test("section 14 save keeps only genuine linkedin.com/groups links", () => {
  const r = mod.applySectionEdit(base(), 14, { text: "| G |", groups: [{ name: "A", keywords: "a", url: "https://www.linkedin.com/groups/123/", title: "Real A" }, { name: "B", keywords: "b", url: "https://evil.example/groups/1" }] });
  assert.deepEqual(r.groups, [{ name: "A", keywords: "a", url: "https://www.linkedin.com/groups/123/", title: "Real A" }, { name: "B", keywords: "b" }]);
});
