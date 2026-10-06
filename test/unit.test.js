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
