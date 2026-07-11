import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { shouldAllowPoll } from "@/lib/api-health";
import { type PipelineKey } from "@/lib/hubspot";
import { refreshPipelineSnapshot } from "@/lib/onboarding-deals";
import { getCombinedNextRefreshAllowedAt, runOnboardingSync } from "@/lib/onboarding-sync";

export const dynamic = "force-dynamic";
// The manual refresh does a full live rebuild (HubSpot pipeline enrichment +
// MRP), which for Pro/Auto (~56 deals with per-card email lookups) can exceed
// the default serverless timeout and silently fail — the board would then keep
// showing the old "Updated X ago". Give it the full window.
export const maxDuration = 60;

// POST — server-only. The Onboarding board's Refresh button calls this
// instead of hitting HubSpot directly, so one click refreshes BOTH HubSpot
// and MRP in sequence, then re-runs the cross-check.
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  // Rebuild the currently-viewed pipeline's snapshot DIRECTLY (no server-to-
  // server loopback fetch to /api/hubspot/deals). The old loopback pattern —
  // this handler fetching its own API route with hand-forwarded cookies — was
  // the confirmed cause of Manual Refresh silently no-opping on Pro/Auto(+):
  // the in-function round-trip added latency and a cookie-auth failure mode
  // that the larger Pro pipeline hit under the timeout. refreshPipelineSnapshot
  // is exactly what the deals route's manual path calls, so no behavior is
  // lost (prior-last-email reuse included).
  const pipelineParam = request.nextUrl.searchParams.get("pipeline");
  const pipelines: PipelineKey[] =
    pipelineParam === "basic" || pipelineParam === "pro" ? [pipelineParam] : ["basic", "pro"];

  let hubspotOutcome: "ran" | "skipped" | "error" = "skipped";
  try {
    const hubspotAllowed = await shouldAllowPoll("hubspot", "manual");
    if (hubspotAllowed) {
      await Promise.all(pipelines.map((p) => refreshPipelineSnapshot(p)));
      hubspotOutcome = "ran";
    }
  } catch (err) {
    // Surface the real failure server-side so this class of bug is diagnosable
    // next time instead of a silent generic "error" outcome with no trace.
    console.error(
      `[onboarding-sync/refresh] HubSpot rebuild failed (pipelines=${pipelines.join(",")}):`,
      err
    );
    hubspotOutcome = "error";
  }

  // THEN MRP + cross-check — only starts after the HubSpot call above resolves.
  const syncOutcome = await runOnboardingSync("manual");

  const nextRefreshAllowedAt = await getCombinedNextRefreshAllowedAt();

  return NextResponse.json({
    hubspot: hubspotOutcome,
    mrp: syncOutcome.mrp,
    nextRefreshAllowedAt,
  });
}
