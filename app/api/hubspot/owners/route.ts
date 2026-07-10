import { NextResponse } from "next/server";

import { fetchOwnersLive, type HubspotOwner } from "@/lib/hubspot";
import { readSnapshot, writeSnapshot } from "@/lib/snapshot";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Read the DB snapshot first (rebuilt hourly by the cron refresher), same
    // pattern as the deals/MRP cards — no live HubSpot call on a warm cache.
    const snap = await readSnapshot<HubspotOwner[]>("hubspot:owners");
    if (snap) return NextResponse.json({ owners: snap.data });

    // Cold/empty snapshot: fetch live once and write it so the next reader hits
    // the snapshot.
    const owners = await fetchOwnersLive();
    await writeSnapshot("hubspot:owners", owners);
    return NextResponse.json({ owners });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load owners." },
      { status: 502 }
    );
  }
}
