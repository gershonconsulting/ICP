import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// Load index.js without the wrangler-only imports.
const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8")
  .replace('import PAGE from "./page.html";', 'const PAGE = "";')
  .replace('import HOME from "./home.html";', 'const HOME = "";')
  .replace('import SEED from "./seed.json";', 'const SEED = {};');
const mod = await import("data:text/javascript," + encodeURIComponent(src));

test("slug", () => { assert.equal(mod.slug("https://www.meteorbiotech.com/about"), "meteorbiotech-com"); });
test("normalizeUrl", () => { assert.equal(mod.normalizeUrl("meteorbiotech.com"), "https://meteorbiotech.com/"); assert.equal(mod.normalizeUrl(""), ""); });
test("htmlToText strips scripts", () => { assert.equal(mod.htmlToText("<p>Hi</p><script>x()</script><p>there &amp; you</p>"), "Hi\nthere & you"); });
test("pickLinks keeps same-host about/product pages", () => {
  const l = mod.pickLinks('<a href="/about-us">a</a><a href="https://x.com/about">b</a><a href="/product">c</a><a href="/blog">d</a>', "https://meteorbiotech.com/");
  assert.deepEqual(l, ["https://meteorbiotech.com/about-us", "https://meteorbiotech.com/product"]);
});
test("parseOutput", () => {
  const t = "=== COMPANY === Meteor Biotech\n=== SECTION 10 === LinkedIn\n### Cores\nTitles: X\n=== SECTION 12 === Email\nHi [First Name],\n=== SEARCHES ===\n- Cores | spatial biology core\n- Pharma | translational oncology";
  const p = mod.parseOutput(t, [10, 12]);
  assert.equal(p.company, "Meteor Biotech");
  assert.match(p.sections[10], /Titles: X/);
  assert.match(p.sections[12], /First Name/);
  assert.equal(p.searches.length, 2);
  assert.equal(p.searches[1].keywords, "translational oncology");
});
test("prompt has all 12 sections across groups", () => {
  const all = [[1,2,3],[4,5,6],[7,8,9],[10,12]].map(g => mod.buildPrompt(g, { url: "u", win: "w", today: "t" })).join("");
  for (const n of [1,2,3,4,5,6,7,8,9,10,12]) assert.ok(all.includes("=== SECTION " + n + " ==="));
});
test("cleanEcho drops echoed instruction line", () => {
  const p = mod.parseOutput("=== SECTION 4 ===\nMarket opportunity: A two-layer opportunity model (immediate commercial...\nReal content", [4]);
  assert.equal(p.sections[4], "Real content");
  const q = mod.parseOutput("=== SECTION 4 ===\nReal content only", [4]);
  assert.equal(q.sections[4], "Real content only");
});
test("parseEvents reads structured lines and drops undated ones", () => {
  const ev = mod.parseEvents("- SITC 2026 | 2026-11-04 | 2026-11-08 | Phoenix, AZ | 4 | https://www.sitcancer.org/2026\n2. **AACR 2027** | 2027-04-02 | 2027-04-07 | Orlando, FL | 5 | https://www.aacr.org\nBad line | soon | later | X | 3 | none");
  assert.equal(ev.length, 2);
  assert.deepEqual([ev[0].name, ev[0].start, ev[0].end, ev[0].score], ["SITC 2026", "2026-11-04", "2026-11-08", 4]);
  assert.equal(ev[1].name, "AACR 2027");
});
test("fmtRange formats ranges", () => {
  assert.equal(mod.fmtRange("2026-11-04", "2026-11-08"), "Nov 4–8, 2026");
  assert.equal(mod.fmtRange("2027-01-30", "2027-02-03"), "Jan 30 – Feb 3, 2027");
  assert.equal(mod.fmtRange("2026-12-30", "2027-01-02"), "Dec 30, 2026 – Jan 2, 2027");
});
test("windowBounds = next 6 full months", () => {
  assert.deepEqual(mod.windowBounds(new Date(Date.UTC(2026, 9, 6))), { start: "2026-11-01", end: "2027-04-30" });
});
test("verifyEvents uses dates found on the official site", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("<html><body>SITC 2026 · Nov. 4–8, 2026 · Phoenix Convention Center</body></html>", { status: 200 });
  const env = { AI: { run: async () => ({ response: "START=2026-11-04; END=2026-11-08; CITY=Phoenix, AZ" }) } };
  const out = await mod.verifyEvents(env, [{ name: "SITC 2026", start: "2026-11-10", end: "2026-11-12", location: "?", score: 4, url: "https://x.org", verified: false }], { start: "2026-11-01", end: "2027-04-30" });
  globalThis.fetch = realFetch;
  assert.equal(out[0].verified, true); assert.equal(out[0].start, "2026-11-04"); assert.equal(out[0].location, "Phoenix, AZ");
});
test("parseOutput picks up EVENTS block", () => {
  const p = mod.parseOutput("=== SECTION 9 ===\nPara\n=== EVENTS ===\nSLAS2027 | 2027-01-30 | 2027-02-03 | San Diego, CA | 3 | https://slas.org", [9]);
  assert.equal(p.events.length, 1); assert.equal(p.sections[9], "Para");
});
