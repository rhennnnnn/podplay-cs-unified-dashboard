import { NextRequest, NextResponse } from "next/server";

import { runTrackerImportSync } from "@/lib/tracker-sync";
import { runFieldSync } from "@/lib/tracker-field-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Lightweight sync-only heartbeat (17A hardening). Runs the tracker import
// sweep + field-level last-write-wins sync over the snapshots that ALREADY
// exist in data_cache — it does NOT rebuild them (no HubSpot/Sheets fetch), so
// it finishes in a few seconds rather than the ~48s the full /api/cron/refresh
// takes to rebuild every snapshot first.
//
// Why a separate endpoint: on /api/cron/refresh the sync runs LAST, after four
// external snapshot rebuilds. If that heavy chain is ever truncated (a slower
// external call, a tighter platform duration cap), the sync is the first thing
// starved — so a fresh HubSpot/MRP change wouldn't reach the tracker. This job
// is scheduled on its own offset pg_cron tick (30 * * * *) so the sync gets an
// independent, fast pass every hour regardless of the rebuild's duration.
// Both halves self-gate on shouldAllowAutoImport / shouldAllowPoll and cap
// their own writes-per-tick, so running twice an hour is idempotent and safe.
async function runSync() {
  const out: Record<string, unknown> = {};

  try {
    out.trackerSync = await runTrackerImportSync("system@cron-sync");
  } catch {
    out.trackerSync = "error";
  }

  try {
    out.fieldSync = await runFieldSync("system@cron-sync");
  } catch {
    out.fieldSync = "error";
  }

  return { synced: true, ...out, at: new Date().toISOString() };
}

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed — never run unauthenticated
  const provided = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
  return provided === secret;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Forbidden" }, { status: 401 });
  return NextResponse.json(await runSync());
}

// GET support so a browser check or a GET-issuing scheduler can trigger it too.
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Forbidden" }, { status: 401 });
  return NextResponse.json(await runSync());
}
