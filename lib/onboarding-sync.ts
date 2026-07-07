// HubSpot + MRP sync/cache layer.
// Importers: app/api/mrp/route.ts, app/api/onboarding-sync/refresh/route.ts.
//
// Session 9 rework: the onboarding detail sheet's MRP lookup no longer depends
// on a pre-joined map keyed by a HubSpot company sweep — that join was fragile
// (any drift between the swept company name and the detail sheet's own company
// name meant an exact map.get() miss and a false "no matching MRP record").
// Instead MRP records are cached on their own (stale-while-revalidate) and the
// match runs directly against the company name the caller already has, via
// matchByCompanyName(). This also makes the sheet load instantly from cache.

import {
  batchReadAssociations,
  batchReadObjects,
  hubspotFetch,
  invalidateCache,
  ONBOARDING_OBJECT_TYPE,
  withCache,
} from "@/lib/hubspot";
import { getIntegrationSettings, markRefreshed, shouldAllowPoll, type PollTrigger } from "@/lib/api-health";
import { getHardwareRecords, matchByCompanyName, type MrpRecord } from "@/lib/mrp";

export interface SyncOutcome {
  hubspot: "ran" | "skipped" | "error";
  mrp: "ran" | "skipped" | "error";
}

// Matches the 60-minute auto-poll interval — the cache silently revalidates in
// the background once older than this; a manual refresh forces it immediately.
const MRP_TTL_MS = 60 * 60_000;
const COMPANIES_CACHE_KEY = "onboarding-sync:companies";

// ---- MRP record cache (stale-while-revalidate) --------------------------------
let mrpRecords: MrpRecord[] | null = null;
let mrpRecordsExpires = 0;
let mrpRefreshInFlight: Promise<void> | null = null;

async function refreshMrpRecordsOnce(trigger: PollTrigger): Promise<void> {
  const records = await getHardwareRecords(trigger);
  // getHardwareRecords returns [] on a paused/failed/empty read. Only overwrite
  // a populated cache when we actually got rows back, so a transient Sheets
  // error doesn't blank out data that's still perfectly good on screen.
  if (records.length > 0 || mrpRecords === null) {
    mrpRecords = records;
    mrpRecordsExpires = Date.now() + MRP_TTL_MS;
  }
}

// Serves cached MRP records immediately. If the cache is stale it kicks off a
// background refresh but still returns the current (stale) data at once — the
// user sees data instantly and can hit Refresh to force an update. Only a cold
// cache (nothing ever loaded) waits on a real read.
export async function getMrpRecords(trigger: PollTrigger = "auto"): Promise<MrpRecord[]> {
  if (mrpRecords !== null) {
    if (Date.now() > mrpRecordsExpires && !mrpRefreshInFlight) {
      mrpRefreshInFlight = refreshMrpRecordsOnce("auto").finally(() => {
        mrpRefreshInFlight = null;
      });
    }
    return mrpRecords;
  }
  if (!mrpRefreshInFlight) {
    mrpRefreshInFlight = refreshMrpRecordsOnce(trigger).finally(() => {
      mrpRefreshInFlight = null;
    });
  }
  await mrpRefreshInFlight;
  return mrpRecords ?? [];
}

// Forces a real, blocking MRP read (used by the manual Refresh button).
export async function refreshMrpRecords(trigger: PollTrigger = "manual"): Promise<void> {
  await refreshMrpRecordsOnce(trigger);
}

// The detail sheet's MRP lookup — matches directly against the cached records,
// no HubSpot-sweep join in the path.
export async function getMrpRecordForCompany(companyName: string): Promise<MrpRecord | null> {
  const records = await getMrpRecords("auto");
  return matchByCompanyName(companyName, records);
}

// ---- HubSpot company sweep (manual-refresh warmth) ----------------------------
interface CompanySearchResult {
  results: { id: string }[];
  paging?: { next?: { after: string } };
}

// A plain company-name sweep across every onboarding, shared via the same
// process-local cache lib/hubspot.ts's deals route uses.
async function listAllOnboardingCompanies(trigger: PollTrigger): Promise<string[]> {
  return withCache(COMPANIES_CACHE_KEY, MRP_TTL_MS, async () => {
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

// One entry point for the manual Refresh button: refresh HubSpot's company
// sweep and the MRP records, each gated independently by its own pause state.
export async function runOnboardingSync(trigger: PollTrigger): Promise<SyncOutcome> {
  const outcome: SyncOutcome = { hubspot: "skipped", mrp: "skipped" };

  // Manual refresh must be a real, non-cached read of both sources.
  if (trigger === "manual") {
    invalidateCache(COMPANIES_CACHE_KEY);
    mrpRecordsExpires = 0;
  }

  if (await shouldAllowPoll("hubspot", trigger)) {
    try {
      await listAllOnboardingCompanies(trigger);
      outcome.hubspot = "ran";
    } catch {
      outcome.hubspot = "error";
    }
  }

  if (await shouldAllowPoll("mrp_sheets", trigger)) {
    try {
      await refreshMrpRecords(trigger);
      outcome.mrp = "ran";
    } catch {
      outcome.mrp = "error";
    }
  }

  if (trigger === "manual") {
    if (outcome.hubspot === "ran") await markRefreshed("hubspot");
    if (outcome.mrp === "ran") await markRefreshed("mrp_sheets");
  }

  return outcome;
}

// Max of both integrations' next_refresh_allowed_at, so the Refresh button's
// cooldown doesn't re-enable until both are actually ready again.
export async function getCombinedNextRefreshAllowedAt(): Promise<string | null> {
  const [hubspot, mrp] = await Promise.all([getIntegrationSettings("hubspot"), getIntegrationSettings("mrp_sheets")]);
  const times = [hubspot?.next_refresh_allowed_at, mrp?.next_refresh_allowed_at].filter((t): t is string => Boolean(t));
  if (times.length === 0) return null;
  return times.reduce((max, t) => (new Date(t) > new Date(max) ? t : max));
}
