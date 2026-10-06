// Finds or creates the KV namespace and writes its id into wrangler.toml (CI only).
import { readFileSync, writeFileSync } from "node:fs";
const { CLOUDFLARE_API_TOKEN: T, CLOUDFLARE_ACCOUNT_ID: A } = process.env;
const TITLE = "icp-gershon-ai-store";
const base = `https://api.cloudflare.com/client/v4/accounts/${A}/storage/kv/namespaces`;
const h = { authorization: `Bearer ${T}`, "content-type": "application/json" };
let id;
for (let page = 1; page < 20 && !id; page++) {
  const r = await (await fetch(`${base}?per_page=100&page=${page}`, { headers: h })).json();
  if (!r.success) throw new Error(JSON.stringify(r.errors));
  id = r.result.find(n => n.title === TITLE)?.id;
  if (r.result.length < 100) break;
}
if (!id) {
  const r = await (await fetch(base, { method: "POST", headers: h, body: JSON.stringify({ title: TITLE }) })).json();
  if (!r.success) throw new Error(JSON.stringify(r.errors));
  id = r.result.id; console.log("Created KV", id);
} else console.log("Using KV", id);
writeFileSync("wrangler.toml", readFileSync("wrangler.toml", "utf8").replace("__KV_ID__", id));
