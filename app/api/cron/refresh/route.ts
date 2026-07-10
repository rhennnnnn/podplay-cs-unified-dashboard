import { NextRequest, NextResponse } from "next/server";

import { buildPipelineDeals } from "@/lib/onboarding-deals";
import { refreshMrpRecords } from "@/lib/onboarding-sync";
import { writeSnapshot } from "@/lib/snapshot";
import { fetchOwnersLive, type PipelineKey } from "@/lib/hubspot";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Refreshes every DB snapshot the dashboard reads (onboarding deals per
// pipeline + MRP records). Invoked by Supabase pg_cron every 60 minutes via
// net.http_post with the shared secret header; also callable manually with the
// same header. This is the ONLY place that pulls HubSpot/Sheets on a schedule —
// user page loads just read the resulting snapshots instantly.
async function runRefresh() {
  const out: Record<string, "ok" | "error"> = {};

  try {
    await refreshMrpRecords("auto"); // writes the mrp:records snapshot
    out.mrp = "ok";
  } catch {
    out.mrp = "error";
  }

  try {
    await writeSnapshot("hubspot:owners", await fetchOwnersLive());
    out.owners = "ok";
  } catch {
    out.owners = "error";
  }

  for (const pipeline of ["basic", "pro"] as PipelineKey[]) {
    try {
      const built = await buildPipelineDeals(pipeline, "auto");
      await writeSnapshot(`onboarding:${pipeline}`, built);
      out[pipeline] = "ok";
    } catch {
      out[pipeline] = "error";
    }
  }

  return { refreshed: true, ...out, at: new Date().toISOString() };
}

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed — never run unauthenticated
  const provided = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
  return provided === secret;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Forbidden" }, { status: 401 });
  return NextResponse.json(await runRefresh());
}

// GET support so Vercel Cron (which issues GET) or a browser check can trigger
// it too — same secret required.
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Forbidden" }, { status: 401 });
  return NextResponse.json(await runRefresh());
}
