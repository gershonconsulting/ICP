import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
// Load src/matrix-stats.js with the stored hash swapped for the hash of a test secret.
const SECRET = "test-matrix-secret";
const src = readFileSync(new URL("../src/matrix-stats.js", import.meta.url), "utf8")
  .replace(/const MATRIX_SECRET_SHA256 = "[0-9a-f]{64}"/, `const MATRIX_SECRET_SHA256 = "${createHash("sha256").update(SECRET).digest("hex")}"`);
const m = await import("data:text/javascript," + encodeURIComponent(src));

const mem = new Map(Object.entries({
  "report:meteorbiotech-com": { slug: "meteorbiotech-com", url: "https://meteorbiotech.com/", company: "Meteor Biotech", createdAt: "2026-10-05T14:00:00.000Z", sections: { 1: "a", 2: "b", 3: "c" }, events: [{}, {}, {}, {}] },
  "report:enzymicals-com": { slug: "enzymicals-com", url: "https://www.enzymicals.com/", company: "Enzymicals AG", createdAt: "2026-10-20T10:00:00.000Z", sections: {}, events: [] },
  "session:abc": "1"
}).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]));
const env = { STORE: {
  get: async (k, t) => { const v = mem.get(k); return v == null ? null : t === "json" ? JSON.parse(v) : v; },
  list: async ({ prefix = "" } = {}) => ({ keys: [...mem.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })) }),
  put: async () => { throw new Error("read-only"); }
} };
const post = (body, headers = {}) => new Request("https://icp.gershon.ai/api/matrix-stats", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

test("matrix-stats: wrong or missing secret -> 401, GET -> 405", async () => {
  let r = await m.handleMatrixStats(post({ secret: "x", people: [] }), env);
  assert.equal(r.status, 401); assert.deepEqual(await r.json(), { ok: false });
  r = await m.handleMatrixStats(post({ people: [] }), env); assert.equal(r.status, 401);
  r = await m.handleMatrixStats(new Request("https://icp.gershon.ai/api/matrix-stats"), env); assert.equal(r.status, 405);
});

test("matrix-stats: matches by email domain and company name", async () => {
  const r = await m.handleMatrixStats(post({ secret: SECRET, people: [
    { key: "248", company: "Meteor", emails: ["amos@meteorbiotech.com"] },
    { key: "246", company: "Enzymicals", emails: ["x@gmail.com"] },
    { key: "212", company: "Wallix", emails: ["a@wallix.com"] }
  ] }), env);
  assert.equal(r.status, 200);
  const b = await r.json();
  assert.equal(b.ok, true); assert.equal(b.platform, "icp"); assert.ok(!Number.isNaN(Date.parse(b.as_of)));
  assert.deepEqual(b.results, [
    { key: "248", ok: true, note: "report Oct 2026 · 3/12 sections · 4 events" },
    { key: "246", ok: false, note: "report empty" },
    { key: "212", ok: false, note: "no report" }
  ]);
});

test("matrix-stats: Bearer header accepted", async () => {
  const r = await m.handleMatrixStats(post({ people: [{ key: "1", company: "Meteor Biotech" }] }, { authorization: "Bearer " + SECRET }), env);
  assert.equal(r.status, 200); assert.equal((await r.json()).results[0].ok, true);
});
