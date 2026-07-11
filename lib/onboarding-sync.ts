// MRP record cache + refresh.
// Importers: app/api/mrp/route.ts, app/api/onboarding-sync/refresh/route.ts,
// app/api/cron/refresh/route.ts.
//
// The onboarding detail sheet's MRP lookup matches a company name directly
// against the cached MRP records (matchByCompanyName) — no HubSpot company
// sweep / pre-joined map, which was fragile (any name drift caused a false
// "no matching MRP record"). Records are cached in the DB snapshot
// (data_cache 'mrp:records') so reads are instant and survive restarts; a
// process-local copy backs cold reads before the first snapshot exists.

import { getIntegrationSettings, markRefreshed, shouldAllowPoll, type PollTrigger } from "@/lib/api-health";
import { getHardwareRecords, matchByCompanyNames, type MrpRecord } from "@/lib/mrp";
import { readSnapshot, writeSnapshot } from "@/lib/snapshot";

export interface SyncOutcome {
  hubspot: "ran" | "skipped" | "error";
  mrp: "ran" | "skipped" | "error";
}

// Matches the 60-minute auto-poll interval.
const MRP_TTL_MS = 60 * 60_000;

let mrpRecords: MrpRecord[] | null = null;
let mrpRecordsExpires = 0;
let mrpRefreshInFlight: Promise<void> | null = null;

async function refreshMrpRecordsOnce(trigger: PollTrigger): Promise<void> {
  const records = await getHardwareRecords(trigger);
  // getHardwareRecords returns [] on a paused/failed/empty read. Only overwrite
  // populated data when we actually got rows back, so a transient Sheets error
  // doesn't blank out data that's still perfectly good on screen.
  if (records.length > 0 || mrpRecords === null) {
    mrpRecords = records;
    mrpRecordsExpires = Date.now() + MRP_TTL_MS;
    if (records.length > 0) await writeSnapshot("mrp:records", records).catch(() => {});
  }
}

// Process-local stale-while-revalidate copy — only used as a fallback before
// the DB snapshot has been written.
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

// Forces a real, blocking MRP read and rewrites the snapshot (manual Refresh
// and the cron job).
export async function refreshMrpRecords(trigger: PollTrigger = "manual"): Promise<void> {
  await refreshMrpRecordsOnce(trigger);
}

// Detail-sheet lookup — prefers the DB snapshot (instant, shared), falls back
// to the process-local copy before the first snapshot exists. Accepts one or
// more candidate names (the specific onboarding name AND its parent company),
// so a less-specific parent that maps to several sheet rows doesn't shadow an
// exact match on the specific name.
export async function getMrpRecordForCompany(
  companyName: string | string[]
): Promise<MrpRecord | null> {
  const snap = await readSnapshot<MrpRecord[]>("mrp:records");
  const records = snap?.data ?? (await getMrpRecords("auto"));
  return matchByCompanyNames(companyName, records);
}

// Manual Refresh button's MRP half (HubSpot half is handled by the deals route
// with ?manual=1, which rewrites its own snapshots).
export async function runOnboardingSync(trigger: PollTrigger): Promise<SyncOutcome> {
  const outcome: SyncOutcome = { hubspot: "skipped", mrp: "skipped" };

  if (await shouldAllowPoll("mrp_sheets", trigger)) {
    try {
      await refreshMrpRecords(trigger);
      outcome.mrp = "ran";
      if (trigger === "manual") await markRefreshed("mrp_sheets");
    } catch {
      outcome.mrp = "error";
    }
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
