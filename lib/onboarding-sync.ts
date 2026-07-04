// Sequential HubSpot -> MRP -> cross-check sync chain, Session 6.
// Importers: app/api/mrp/route.ts, app/api/onboarding-sync/refresh/route.ts.
// Not two independent pollers — MRP data is only useful once matched against
// the current HubSpot company list, so step 2 always awaits step 1.

import {
  batchReadAssociations,
  batchReadObjects,
  hubspotFetch,
  ONBOARDING_OBJECT_TYPE,
  withCache,
} from "@/lib/hubspot";
import { getIntegrationSettings, markRefreshed, shouldAllowPoll, type PollTrigger } from "@/lib/api-health";
import { getHardwareRecords, matchByCompanyName, type MrpRecord } from "@/lib/mrp";

export interface JoinedOnboardingRecord {
  companyName: string;
  mrp: MrpRecord | null;
}

export interface SyncOutcome {
  hubspot: "ran" | "skipped" | "error";
  mrp: "ran" | "skipped" | "error";
}

const JOINED_TTL_MS = 5 * 60_000;
const COMPANIES_CACHE_KEY = "onboarding-sync:companies";

let joinedMap: Map<string, JoinedOnboardingRecord> = new Map();
let joinedMapExpires = 0;

interface CompanySearchResult {
  results: { id: string }[];
  paging?: { next?: { after: string } };
}

// A plain company-name sweep across every onboarding, shared via the same
// process-local cache lib/hubspot.ts's deals route uses — this does not
// duplicate a separate polling path, just a different (unfiltered) query
// against the same cached, gated hubspotFetch.
async function listAllOnboardingCompanies(trigger: PollTrigger): Promise<string[]> {
  return withCache(COMPANIES_CACHE_KEY, JOINED_TTL_MS, async () => {
    const names = new Set<string>();
    let after: string | undefined;
    for (let page = 0; page < 10; page++) {
      const body: Record<string, unknown> = { filterGroups: [], properties: ["hs_name"], limit: 100 };
      if (after) body.after = after;

      const data = await hubspotFetch<CompanySearchResult>(
        `/crm/v3/objects/${ONBOARDING_OBJECT_TYPE}/search`,
        { method: "POST", body: JSON.stringify(body) },
        { trigger }
      );

      const ids = data.results.map((r) => r.id);
      const companyAssoc = await batchReadAssociations(ONBOARDING_OBJECT_TYPE, "companies", ids);
      const companyIds = Array.from(new Set(Object.values(companyAssoc).flat()));
      const companies = await batchReadObjects<{ name: string | null }>("companies", companyIds, ["name"]);
      Object.values(companies).forEach((c) => {
        if (c.properties.name) names.add(c.properties.name);
      });

      after = data.paging?.next?.after;
      if (!after) break;
    }
    return Array.from(names);
  });
}

// The one entry point for both the auto interval trigger and the manual
// Refresh button. Awaits HubSpot fully before starting MRP — real space
// between the two calls, never fired in parallel.
export async function runOnboardingSync(trigger: PollTrigger): Promise<SyncOutcome> {
  const outcome: SyncOutcome = { hubspot: "skipped", mrp: "skipped" };

  let companyNames: string[] = [];
  const hubspotAllowed = await shouldAllowPoll("hubspot", trigger);
  if (hubspotAllowed) {
    try {
      companyNames = await listAllOnboardingCompanies(trigger);
      outcome.hubspot = "ran";
    } catch {
      outcome.hubspot = "error";
    }
  }

  let mrpRecords: MrpRecord[] = [];
  const mrpAllowed = await shouldAllowPoll("mrp_sheets", trigger);
  if (mrpAllowed) {
    try {
      mrpRecords = await getHardwareRecords(trigger);
      outcome.mrp = "ran";
    } catch {
      outcome.mrp = "error";
    }
  }

  const joined = new Map<string, JoinedOnboardingRecord>();
  for (const name of companyNames) {
    joined.set(name, { companyName: name, mrp: matchByCompanyName(name, mrpRecords) });
  }
  joinedMap = joined;
  joinedMapExpires = Date.now() + JOINED_TTL_MS;

  if (trigger === "manual") {
    if (outcome.hubspot === "ran") await markRefreshed("hubspot");
    if (outcome.mrp === "ran") await markRefreshed("mrp_sheets");
  }

  return outcome;
}

export function isJoinedCacheStale(): boolean {
  return Date.now() > joinedMapExpires;
}

// Reads the cached joined result — the onboarding detail sheet's MRP section
// calls this via GET /api/mrp, never a fresh per-open Sheets API call.
export async function getJoinedRecord(companyName: string): Promise<JoinedOnboardingRecord | null> {
  if (isJoinedCacheStale()) {
    await runOnboardingSync("auto");
  }
  return joinedMap.get(companyName) ?? null;
}

// Max of both integrations' next_refresh_allowed_at, so the Refresh button's
// cooldown doesn't re-enable until both are actually ready again.
export async function getCombinedNextRefreshAllowedAt(): Promise<string | null> {
  const [hubspot, mrp] = await Promise.all([getIntegrationSettings("hubspot"), getIntegrationSettings("mrp_sheets")]);
  const times = [hubspot?.next_refresh_allowed_at, mrp?.next_refresh_allowed_at].filter((t): t is string => Boolean(t));
  if (times.length === 0) return null;
  return times.reduce((max, t) => (new Date(t) > new Date(max) ? t : max));
}
