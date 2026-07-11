// Session 15A — admin-triggered, idempotent backfill linker.
// POST rebuilds the two durable link columns (hubspot_deal_id, mrp_row_key) on
// existing `locations` rows from the current snapshots. Safe to re-run: a
// fully-linked row is skipped. This is a backfill, not a poll — nothing calls
// it automatically.

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/permissions";
import { linkExistingRecords } from "@/lib/tracker-link";

export const dynamic = "force-dynamic";

export async function POST() {
  let actorEmail = "";
  try {
    const profile = await requireAdmin();
    actorEmail = profile.email;
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }

  try {
    const result = await linkExistingRecords(actorEmail);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Linker failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
