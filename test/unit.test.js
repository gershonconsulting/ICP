import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// Load index.js without the wrangler-only imports.
const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8")
  .replace('import PAGE from "./page.html";', 'const PAGE = "";')
  .replace('import HOME from "./home.html";', 'const HOME = "";')
  .replace('import SEED from "./seed.json";', 'const SEED = {};')
  .replace('from "./matrix-stats.js";', 'from "' + new URL("../src/matrix-stats.js", import.meta.url) + '";');
const mod = await import("data:text/javascript," + encodeURIComponent(src));

test("slug", () => { assert.equal(mod.slug("https://www.meteorbiotech.com/about"), "meteorbiotech-com"); });
test("normalizeUrl", () => { assert.equal(mod.normalizeUrl("meteorbiotech.com"), "https://meteorbiotech.com/"); assert.equal(mod.normalizeUrl(""), ""); });
test("htmlToText strips scripts", () => { assert.equal(mod.htmlToText("<p>Hi</p><script>x()</script><p>there &amp; you</p>"), "Hi\nthere & you"); });
test("pickLinks keeps same-host about/product pages", () => {
  const l = mod.pickLinks('<a href="/about-us">a</a><a href="https://x.com/about">b</a><a href="/product">c</a><a href="/blog">d</a>', "https://meteorbiotech.com/");
  assert.deepEqual(l, ["https://meteorbiotech.com/about-us", "https://meteorbiotech.com/product"]);
});
test("parseOutput", () => {
  const t = "=== COMPANY === Meteor Biotech\n=== SECTION 10 === LinkedIn\n### Cores\nTitles: X\n=== SECTION 15 === Emails\n### Email 1 — Executive introduction\nHi [First Name],\n=== SEARCHES ===\n- Cores | spatial biology core\n- Pharma | translational oncology";
  const p = mod.parseOutput(t, [10, 15]);
  assert.equal(p.company, "Meteor Biotech");
  assert.match(p.sections[10], /Titles: X/);
  assert.match(p.sections[15], /First Name/);
  assert.equal(p.searches.length, 2);
  assert.equal(p.searches[1].keywords, "translational oncology");
});
test("parseOutput reads the GROUPS block of section 14", () => {
  const p = mod.parseOutput("=== SECTION 14 ===\n| Group | Who | How |\n|---|---|---|\n| AACR | x | y |\n=== GROUPS ===\n- AACR members | cancer research\n2. Groups about spatial biology | spatial biology, spatial omics", [14]);
  assert.match(p.sections[14], /AACR/);
  assert.deepEqual(p.groups[1], { name: "Groups about spatial biology", keywords: "spatial biology, spatial omics" });
});
test("12 sections shown; scorecard, events and the single email are gone", () => {
  assert.equal(mod.ORDER.length, 12);
  assert.deepEqual(mod.SECTIONS.slice(4, 5), ["Market size: TAM, SAM, SOM"]);
  for (const gone of [8, 9, 12]) assert.ok(!mod.ORDER.includes(gone));
  assert.ok(!mod.SECTIONS.some(t => /scorecard|tradeshow|conference/i.test(t)));
  assert.equal(mod.SECTIONS[11], "Sample outreach emails");
  assert.ok(mod.SECTIONS.includes("Dedicated LinkedIn groups"));
});
test("prompt covers every AI section across groups, with TAM/SAM/SOM, groups and three emails", () => {
  const all = [[1,2,3],[4,13,5],[6,7,14],[10,15]].map(g => mod.buildPrompt(g, { url: "u", today: "t" })).join("");
  for (const n of mod.EDITABLE) assert.ok(all.includes("=== SECTION " + n + " ==="), "section " + n);
  assert.match(all, /TAM \(Total Addressable Market/); assert.match(all, /SAM \(Serviceable Available Market/); assert.match(all, /SOM \(Serviceable Obtainable Market/);
  assert.match(all, /=== GROUPS ===/);
  assert.match(all, /Email 1 — Executive introduction/); assert.match(all, /Email 2 — Problem-led/); assert.match(all, /Email 3 — Proof and peer-led/);
  assert.ok(!/=== EVENTS ===|tradeshow|scorecard/i.test(all));
  assert.match(mod.buildPrompt([15], { url: "u", today: "t" }), /never mention Gershon Consulting/);
});
test("cleanEcho drops echoed instruction line", () => {
  const p = mod.parseOutput("=== SECTION 4 ===\nMarket opportunity: A two-layer opportunity model: the immediate...\nReal content", [4]);
  assert.equal(p.sections[4], "Real content");
  const q = mod.parseOutput("=== SECTION 13 ===\n**Market size: TAM, SAM, SOM**\n| Layer |", [13]);
  assert.equal(q.sections[13], "| Layer |");
});
test("upgradeReport turns an old single email into sample email 1 and keeps its approval", () => {
  const r = mod.upgradeReport({ sections: { 12: "Hi [First Name],", 8: "old scorecard" }, review: { 12: { approved: true } } });
  assert.match(r.sections[15], /^### Email 1 — Executive introduction\n\nHi \[First Name\],$/);
  assert.equal(r.review[15].approved, true);
  const n = { sections: { 15: "new" } }; assert.equal(mod.upgradeReport(n), n);
});

test("siteKey ignores www, subdomains, paths and protocol", () => {
  assert.equal(mod.siteKey("https://www.meteorbiotech.com/about"), "meteorbiotech.com");
  assert.equal(mod.siteKey("http://app.meteorbiotech.com"), "meteorbiotech.com");
  assert.equal(mod.siteKey("https://shop.example.co.uk/x"), "example.co.uk");
});
test("nameKey ignores case, accents, punctuation and legal suffixes", () => {
  assert.equal(mod.nameKey("Météor Biotech, Inc."), mod.nameKey("meteor biotech"));
});
test("dedupeReports keeps newest per company", () => {
  const { kept, dupes } = mod.dedupeReports([
    { slug: "meteorbiotech-com", company: "Meteor Biotech", url: "https://meteorbiotech.com/", createdAt: "2026-10-05T00:00:00Z" },
    { slug: "app-meteorbiotech-com", company: "Meteor", url: "https://app.meteorbiotech.com/", createdAt: "2026-10-20T00:00:00Z" },
    { slug: "meteor-bio", company: "Meteor Biotech Inc", url: "https://meteor.bio/", createdAt: "2026-10-01T00:00:00Z" },
    { slug: "acme-com", company: "Acme", url: "https://acme.com/", createdAt: "2026-10-02T00:00:00Z" }
  ]);
  assert.deepEqual(kept.map(r => r.slug), ["app-meteorbiotech-com", "acme-com"]);
  assert.equal(dupes.length, 2);
});
