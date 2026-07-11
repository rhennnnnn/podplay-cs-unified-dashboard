import { NextRequest, NextResponse } from "next/server";

import { getCallerProfile } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { SHARED_FIELDS } from "@/lib/tracker-link";
import type { LocationFieldSync } from "@/lib/types";

export const dynamic = "force-dynamic";

// Session 15D Part C — tracker-side write hook for the last-write-wins ledger.
//
// The tracker UI saves `locations` edits directly via the browser Supabase
// client, but `location_field_sync` is service-role-write-only (15A RLS). So a
// CSA edit records its authorship through this route: for each SHARED_FIELD the
// UI just wrote, upsert a ledger row with source='tracker' and the save time
// (now). Without this, the next cron sync has no record that the tracker was the
// most-recent writer and a stale HubSpot/MRP value could wrongly win.
//
// Any authenticated user may call it (same trust level as editing a location).
export async function POST(req: NextRequest) {
  const profile = await getCallerProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { locationId?: string; fields?: Record<string, string | null> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const locationId = body.locationId;
  const fields = body.fields;
  if (!locationId || !fields || typeof fields !== "object") {
    return NextResponse.json({ error: "locationId and fields are required" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const rows: LocationFieldSync[] = [];
  for (const field of SHARED_FIELDS) {
    if (!(field in fields)) continue; // only record fields the UI actually wrote
    const raw = fields[field];
    rows.push({
      location_id: locationId,
      field_name: field,
      source: "tracker",
      source_updated_at: now,
      value: raw === "" ? null : (raw ?? null),
      updated_at: now,
    });
  }

  if (rows.length === 0) return NextResponse.json({ recorded: 0 });

  const admin = createAdminClient();
  const { error } = await admin
    .from("location_field_sync")
    .upsert(rows as never, { onConflict: "location_id,field_name" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ recorded: rows.length });
}
