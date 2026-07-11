// Regression guard for lib/mrp.ts matchByCompanyName / matchByCompanyNames.
//
// The tier functions below MIRROR lib/mrp.ts (kept in sync by hand — lib/mrp.ts
// can't be imported directly here: it pulls in googleapis + the "@/" path alias).
// Pulls the REAL cached MRP club list from the data_cache snapshot and asserts
// the canonical match cases so the Session 9 false-positive and the Session 14
// false-negative (Casa Pickle Space City) can never silently regress together.
//
// Run: node scripts/verify-mrp-match.mjs   (reads keys from .env.local)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = fs.readFileSync(path.join(root, ".env.local"), "utf8");
const get = (k) => (env.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1]?.trim().replace(/^["']|["']$/g, "");

// ---- mirror of lib/mrp.ts matcher ----
const GENERIC_TOKENS = new Set(["pickleball", "club", "the", "llc", "inc", "co", "ltd", "and", "of"]);
const normalize = (n) => n.toLowerCase().replace(/[^a-z0-9]/g, "");
const distinctiveTokens = (n) => n.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t && !GENERIC_TOKENS.has(t));
const distinctiveKey = (n) => distinctiveTokens(n).sort().join("|");
const findExact = (name, recs) => {
  const t = normalize(name);
  return t ? recs.find((r) => normalize(r.club) === t) ?? null : null;
};
const findTokenSet = (name, recs) => {
  const k = distinctiveKey(name);
  return k ? recs.find((r) => distinctiveKey(r.club) === k) ?? null : null;
};
const findTokenSubset = (name, recs) => {
  const tokens = distinctiveTokens(name);
  if (tokens.length === 0) return null;
  const matches = recs.filter((r) => {
    const rt = distinctiveTokens(r.club);
    if (rt.length === 0) return false;
    const [small, big] = tokens.length <= rt.length ? [tokens, rt] : [rt, tokens];
    const bigSet = new Set(big);
    return small.every((t) => bigSet.has(t));
  });
  return matches.length === 1 ? matches[0] : null;
};
const TIERS = [findExact, findTokenSet, findTokenSubset];
function matchByCompanyNames(names, recs) {
  const cands = (Array.isArray(names) ? names : [names]).filter((n) => n && n.trim());
  for (const tier of TIERS) for (const n of cands) {
    const hit = tier(n, recs);
    if (hit) return hit;
  }
  return null;
}
// ---- end mirror ----

const url = get("NEXT_PUBLIC_SUPABASE_URL") || get("SUPABASE_URL");
const key = get("SUPABASE_SERVICE_ROLE_KEY");

const CASES = [
  // [candidate name(s), expected club or null, label]
  [["Casa Pickle Space City", "Casa Pickle"], "Casa Pickle Space City", "onboarding name beats ambiguous parent"],
  ["Casa Pickle", null, "bare parent alone is ambiguous (Galleria + Space City) -> null"],
  ["Casa Pickle Galleria", "Casa Pickle Galleria", "sibling location resolves exactly"],
  ["Greystone Pickleball Club", "Greystone Pickleball", "Session 9: matches own row"],
  ["One+ Pickleball Club", "One+ Pickleball Club", "Session 9: NOT captured by Greystone"],
];

const res = await fetch(`${url}/rest/v1/data_cache?key=eq.mrp:records&select=data`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});
const records = (await res.json())[0]?.data ?? [];
console.log(`Loaded ${records.length} MRP records.\n`);

let failed = 0;
for (const [names, expected, label] of CASES) {
  const got = matchByCompanyNames(names, records)?.club ?? null;
  const ok = got === expected;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}\n      names=${JSON.stringify(names)} expected=${JSON.stringify(expected)} got=${JSON.stringify(got)}`);
}
console.log(`\n${failed === 0 ? "ALL PASS" : failed + " FAILED"}`);
process.exitCode = failed === 0 ? 0 : 1;
