// Session 15D — field-level last-write-wins sync (server-only).
//
// Runs on the same cron heartbeat as 15B/15C (app/api/cron/refresh), AFTER the
// snapshots are rewritten and after runTrackerImportSync. For every SHARED_FIELD
// (lib/tracker-link.ts) on every linked `locations` row it decides, per field,
// whether the current HubSpot/MRP snapshot carries a genuinely NEWER value than
// whatever last wrote that field — and only then overwrites.
//
// Core protection (the failure mode the user flagged): a CSA's tracker edit must
// NEVER be reverted by a later poll carrying an OLDER value. This is enforced by
// the `location_field_sync` ledger:
//   - Every tracker UI edit records source='tracker' + the save timestamp
//     (POST /api/tracker/field-sync, wired from client-form-dialog).
//   - A HubSpot/MRP candidate only wins if its source timestamp is STRICTLY
//     newer than the ledger's recorded source_updated_at AND its value actually
//     differs from the current one.
//
// Timestamps ("as-of" the value, NOT when this code runs):
//   - HubSpot: the onboarding object's own hs_lastmodifieddate (falls back to
//     the snapshot's fetchedAt if somehow absent). Note this is object-level, so
//     an unrelated HubSpot edit bumps it too — acceptable per spec; the
//     value-differs guard stops needless writes.
//   - MRP: the snapshot's fetchedAt (the Sheet has no per-row modified time).
//   - Tracker: the moment the CSA saved (recorded by the write hook).
//
// First-sight seeding: 15A/15B never wrote ledger rows, so pre-existing values
// have none. On first encounter a NON-BLANK tracker value is seeded as
// source='tracker' @ now, which protects it — no external candidate can be
// strictly newer than "now" this tick, so nothing pre-existing is clobbered.
// Only changes observed AFTER 15D goes live propagate. A BLANK field with no
// ledger is filled from the candidate (recording the candidate's real source +
// timestamp), matching 15B's blanks-only backfill spirit.

import { createAdminClient } from "@/lib/supabase/admin";
import { readSnapshot } from "@/lib/snapshot";
import { shouldAllowAutoImport } from "@/lib/api-health";
import { tierToTrackerTier } from "@/lib/hubspot";
import { SHARED_FIELDS } from "@/lib/tracker-link";
import { toIsoDate } from "@/lib/track-opening-map";
import { parseFlexDate, isNa } from "@/lib/tracker-mrp";
import type { MrpRecord } from "@/lib/mrp";
import type { Location, LocationFieldSync, FieldSyncSource } from "@/lib/types";
import type { PipelineDeals } from "@/lib/onboarding-deals";
import type { OnboardingListItem } from "@/components/onboarding/onboarding-types";

type SharedField = (typeof SHARED_FIELDS)[number];

// Cap real overwrites/fills per tick (locations touched) so a large first-run
// drift can't blow the Vercel Hobby 10s cap. Seeding is bulk (one upsert) and
// not counted here. Remainder drains on the next heartbeat (idempotent).
const MAX_SYNC_WRITES_PER_TICK = 25;

const EPOCH = "1970-01-01T00:00:00.000Z";

export interface FieldSyncResult {
  linkedScanned: number; // linked rows examined
  seeded: number; // ledger baseline rows written for pre-existing values
  overwritten: number; // locations that had >=1 field overwritten/filled
  fieldsChanged: number; // total field values written
  capped: boolean;
  hubspotSkippedPaused: boolean;
  mrpSkippedPaused: boolean;
}

interface Candidate {
  source: FieldSyncSource;
  value: string | null;
  ts: string; // ISO — the "as-of" timestamp for this value
}

// MRP "M/D/YYYY" (or ISO) -> date-only ISO "YYYY-MM-DD"; null for empty/N/A.
function toIsoFromFlex(value: string | null | undefined): string | null {
  const d = parseFlexDate(value);
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function newer(a: string, b: string): boolean {
  return new Date(a).getTime() > new Date(b).getTime();
}

// Values compare equal when both normalize to "nothing" (null / "" / N/A) or are
// the same trimmed string. Prevents a stale poll re-writing the same value.
function sameValue(a: string | null, b: string | null): boolean {
  const na = isNa(a);
  const nb = isNa(b);
  if (na && nb) return true;
  if (na !== nb) return false;
  return (a as string).trim() === (b as string).trim();
}

// All external candidates a field could receive from the currently-allowed
// sources, keyed by field. opening_date can come from BOTH HubSpot and MRP.
function collectCandidates(
  loc: Location,
  deal: OnboardingListItem | undefined,
  dealFetchedAt: string,
  mrp: MrpRecord | undefined,
  mrpFetchedAt: string,
  allowHubspot: boolean,
  allowMrp: boolean
): Map<SharedField, Candidate[]> {
  const out = new Map<SharedField, Candidate[]>();
  const add = (field: SharedField, c: Candidate) => {
    const list = out.get(field) ?? [];
    list.push(c);
    out.set(field, list);
  };

  if (allowHubspot && deal) {
    const ts = deal.properties.hs_lastmodifieddate || dealFetchedAt;
    const opening = toIsoDate(deal.properties.grand_opening ?? deal.properties.anticipated_opening) || null;
    if (opening) add("opening_date", { source: "hubspot", value: opening, ts });
    // Only emit a tier candidate when HubSpot actually has one — tierToTrackerTier
    // maps null to "Basic (+)", which we must NOT fabricate as an authoritative value.
    if (deal.properties.podplay_tier) {
      add("tier", { source: "hubspot", value: tierToTrackerTier(deal.properties.podplay_tier), ts });
    }
    // presale_date: the HubSpot "pre-sale date" property is a documented carry-over
    // that must be created in the HubSpot UI first — no read path exists yet, so no
    // candidate is emitted. Wire it here once the property lands.
  }

  if (allowMrp && mrp) {
    const delivery = toIsoFromFlex(mrp.hardwareDeliveryDate);
    if (delivery) add("delivery_date", { source: "mrp", value: delivery, ts: mrpFetchedAt });
    const opening = toIsoFromFlex(mrp.grandOpening ?? mrp.softOpening);
    if (opening) add("opening_date", { source: "mrp", value: opening, ts: mrpFetchedAt });
  }

  return out;
}

export async function runFieldSync(actorEmail: string): Promise<FieldSyncResult> {
  const admin = createAdminClient();

  const result: FieldSyncResult = {
    linkedScanned: 0,
    seeded: 0,
    overwritten: 0,
    fieldsChanged: 0,
    capped: false,
    hubspotSkippedPaused: false,
    mrpSkippedPaused: false,
  };

  const allowHubspot = await shouldAllowAutoImport("hubspot");
  const allowMrp = await shouldAllowAutoImport("mrp_sheets");
  result.hubspotSkippedPaused = !allowHubspot;
  result.mrpSkippedPaused = !allowMrp;
  if (!allowHubspot && !allowMrp) return result; // nothing to sync from

  const [{ data: locData, error }, basicSnap, proSnap, mrpSnap] = await Promise.all([
    admin.from("locations").select("*"),
    readSnapshot<PipelineDeals>("onboarding:basic"),
    readSnapshot<PipelineDeals>("onboarding:pro"),
    readSnapshot<MrpRecord[]>("mrp:records"),
  ]);
  if (error) throw new Error(error.message);

  const locations = (locData ?? []) as unknown as Location[];
  const linked = locations.filter((l) => l.hubspot_deal_id || l.mrp_row_key);
  result.linkedScanned = linked.length;
  if (linked.length === 0) return result;

  // Snapshot lookups.
  const dealFetchedAt = basicSnap?.fetchedAt ?? proSnap?.fetchedAt ?? new Date().toISOString();
  const dealById = new Map<string, OnboardingListItem>();
  for (const d of [...(basicSnap?.data.deals ?? []), ...(proSnap?.data.deals ?? [])]) dealById.set(d.id, d);
  const mrpFetchedAt = mrpSnap?.fetchedAt ?? new Date().toISOString();
  const mrpByClub = new Map((mrpSnap?.data ?? []).map((r) => [r.club, r]));

  // Existing ledger for just the linked rows.
  const { data: ledgerData } = await admin
    .from("location_field_sync")
    .select("*")
    .in(
      "location_id",
      linked.map((l) => l.id)
    );
  const ledger = new Map<string, LocationFieldSync>();
  for (const row of (ledgerData ?? []) as unknown as LocationFieldSync[]) {
    ledger.set(`${row.location_id} ${row.field_name}`, row);
  }

  const now = new Date().toISOString();
  const seedRows: LocationFieldSync[] = [];
  // Grouped by location so each changed row is a single UPDATE + one activity log.
  interface PendingChange {
    loc: Location;
    updates: Partial<Record<SharedField, string | null>>;
    ledgerWrites: LocationFieldSync[];
    logLines: string[];
  }
  const pending: PendingChange[] = [];

  for (const loc of linked) {
    const deal = loc.hubspot_deal_id ? dealById.get(loc.hubspot_deal_id) : undefined;
    const mrp = loc.mrp_row_key ? mrpByClub.get(loc.mrp_row_key) : undefined;
    const candidatesByField = collectCandidates(loc, deal, dealFetchedAt, mrp, mrpFetchedAt, allowHubspot, allowMrp);

    let change: PendingChange | null = null;

    for (const field of SHARED_FIELDS) {
      const candidates = candidatesByField.get(field);
      if (!candidates || candidates.length === 0) continue;
      // Newest candidate wins when a field has more than one source.
      const cand = candidates.reduce((a, b) => (newer(b.ts, a.ts) ? b : a));

      const current = (loc[field] ?? null) as string | null;
      const ledgerRow = ledger.get(`${loc.id} ${field}`);

      // First sight of a non-blank value: seed a tracker baseline @ now to
      // protect it, and skip this tick (no external candidate can beat "now").
      if (!ledgerRow && !isNa(current)) {
        seedRows.push({
          location_id: loc.id,
          field_name: field,
          source: "tracker",
          source_updated_at: now,
          value: current,
          updated_at: now,
        });
        continue;
      }

      const baseTs = ledgerRow?.source_updated_at ?? EPOCH;
      if (!newer(cand.ts, baseTs) || sameValue(cand.value, current)) continue;

      // Real overwrite / blank-fill.
      change ??= { loc, updates: {}, ledgerWrites: [], logLines: [] };
      change.updates[field] = cand.value;
      change.ledgerWrites.push({
        location_id: loc.id,
        field_name: field,
        source: cand.source,
        source_updated_at: cand.ts,
        value: cand.value,
        updated_at: now,
      });
      change.logLines.push(
        `${field}: "${current ?? "—"}" -> "${cand.value ?? "—"}" (${cand.source} @ ${cand.ts} beats ${baseTs})`
      );
      result.fieldsChanged++;
    }

    if (change) {
      pending.push(change);
      if (pending.length >= MAX_SYNC_WRITES_PER_TICK) {
        result.capped = true;
        break;
      }
    }
  }

  // Bulk-seed baselines (one round trip, not rate-limited).
  if (seedRows.length) {
    const { error: seedErr } = await admin
      .from("location_field_sync")
      .upsert(seedRows as never, { onConflict: "location_id,field_name" });
    if (!seedErr) result.seeded = seedRows.length;
  }

  // Apply real changes: per-location UPDATE + ledger upserts + one audit log.
  for (const change of pending) {
    const { error: upErr } = await admin
      .from("locations")
      .update(change.updates as never)
      .eq("id", change.loc.id);
    if (upErr) {
      result.fieldsChanged -= change.logLines.length;
      continue;
    }

    await admin
      .from("location_field_sync")
      .upsert(change.ledgerWrites as never, { onConflict: "location_id,field_name" });

    await admin.from("activity_log").insert({
      user_email: actorEmail,
      action: "updated",
      entity: change.loc.name,
      details: `Sync (last-write-wins): ${change.logLines.join("; ")}`,
    } as never);

    result.overwritten++;
  }

  return result;
}
