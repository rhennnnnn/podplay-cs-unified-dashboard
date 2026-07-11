// Session 15A — one-off, idempotent backfill linker (server-only).
//
// Populates the two durable link columns on existing `locations` rows:
//   - hubspot_deal_id  (existing column) — matched against the HubSpot
//     onboarding snapshots by name.
//   - mrp_row_key      (new in 014_sync_state.sql) — the matched MRP row's
//     "Club" column value, stored so later sessions keep a link even if the
//     name-matcher output drifts.
//
// This session links ONLY these two columns. It never writes any other
// `locations` field value and never writes `location_field_sync` (Session 15D
// owns that). Reads come from the DB snapshot cache only (CONTEXT.md Data flow)
// — no live HubSpot/Sheets fetch. Re-running is a no-op: a row that already has
// both link columns set is skipped.

import { createAdminClient } from "@/lib/supabase/admin";
import { readSnapshot } from "@/lib/snapshot";
import { matchByCompanyNames, matchNames, type MrpRecord } from "@/lib/mrp";
import type { Location } from "@/lib/types";
import type { PipelineDeals } from "@/lib/onboarding-deals";
import type { OnboardingListItem } from "@/components/onboarding/onboarding-types";

// The shared field list Session 15D syncs (mirrors 014_sync_state.sql's comment).
// Declared here so 15D imports one canonical list rather than re-deriving it.
export const SHARED_FIELDS = ["opening_date", "presale_date", "delivery_date", "qc_date", "tier"] as const;

export interface LinkResult {
  scanned: number;
  hubspotLinked: number;
  mrpLinked: number;
  alreadyLinked: number; // rows that needed nothing (both links already present or no match found)
}

async function readOnboardingDeals(): Promise<OnboardingListItem[]> {
  const [basic, pro] = await Promise.all([
    readSnapshot<PipelineDeals>("onboarding:basic"),
    readSnapshot<PipelineDeals>("onboarding:pro"),
  ]);
  return [...(basic?.data.deals ?? []), ...(pro?.data.deals ?? [])];
}

// Match a location name against the onboarding snapshot: onboarding name first
// (locations.name is derived from it via Track Opening), company name as a
// fallback. Reuses the same 3-tier matcher as the MRP side (matchNames).
function matchDeal(locationName: string, deals: OnboardingListItem[]): OnboardingListItem | null {
  return (
    matchNames(locationName, deals, (d) => d.properties.hs_name) ??
    matchNames(locationName, deals, (d) => d.company?.name)
  );
}

export async function linkExistingRecords(actorEmail: string): Promise<LinkResult> {
  const admin = createAdminClient();

  const [{ data: locData, error }, deals, mrpSnap] = await Promise.all([
    admin.from("locations").select("*"),
    readOnboardingDeals(),
    readSnapshot<MrpRecord[]>("mrp:records"),
  ]);
  if (error) throw new Error(error.message);

  const locations = (locData ?? []) as unknown as Location[];
  const mrpRecords = mrpSnap?.data ?? [];

  const result: LinkResult = { scanned: locations.length, hubspotLinked: 0, mrpLinked: 0, alreadyLinked: 0 };

  for (const loc of locations) {
    const update: { hubspot_deal_id?: string; mrp_row_key?: string } = {};
    const logged: string[] = [];

    if (!loc.hubspot_deal_id) {
      const deal = matchDeal(loc.name, deals);
      if (deal) {
        update.hubspot_deal_id = deal.id;
        logged.push(`hubspot_deal_id=${deal.id}`);
      }
    }

    if (!loc.mrp_row_key) {
      const rec = matchByCompanyNames(loc.name, mrpRecords);
      if (rec?.club) {
        update.mrp_row_key = rec.club;
        logged.push(`mrp_row_key=${rec.club}`);
      }
    }

    if (Object.keys(update).length === 0) {
      result.alreadyLinked++;
      continue;
    }

    const { error: upErr } = await admin
      .from("locations")
      .update(update as never)
      .eq("id", loc.id);
    if (upErr) throw new Error(`Failed to link ${loc.id}: ${upErr.message}`);

    if (update.hubspot_deal_id) result.hubspotLinked++;
    if (update.mrp_row_key) result.mrpLinked++;

    await admin
      .from("activity_log")
      .insert({
        user_email: actorEmail,
        action: "updated",
        entity: loc.name,
        details: `Auto-linked (15A backfill): ${logged.join(", ")}`,
      } as never);
  }

  return result;
}
