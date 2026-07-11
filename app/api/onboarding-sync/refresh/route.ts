import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { shouldAllowPoll } from "@/lib/api-health";
import { type PipelineKey } from "@/lib/hubspot";
import { refreshPipelineSnapshot } from "@/lib/onboarding-deals";
import { getCombinedNextRefreshAllowedAt, runOnboardingSync } from "@/lib/onboarding-sync";

export const dynamic = "force-dynamic";
// maxDuration is honored on paid Vercel plans; the production project is on
// Hobby (hard 10s cap regardless of this value). The manual refresh is kept
// under that cap by (a) rebuilding ONLY the viewed pipeline, (b) reusing the
// prior snapshot's enrichment so the HubSpot rebuild is a single search call
// (see refreshPipelineSnapshot), and (c) running the HubSpot and MRP refreshes
// concurrently below rather than back-to-back.
export const maxDuration = 60;

// POST — server-only. The Onboarding board's Refresh button calls this instead
// of hitting HubSpot directly, so one click refreshes both HubSpot and MRP,
// then re-runs the cross-check.
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  // Rebuild the currently-viewed pipeline's snapshot DIRECTLY (no server-to-
  // server loopback fetch to /api/hubspot/deals). refreshPipelineSnapshot reuses
  // the prior snapshot's enrichment, so this is one HubSpot search call.
  const pipelineParam = request.nextUrl.searchParams.get("pipeline");
  const pipelines: PipelineKey[] =
    pipelineParam === "basic" || pipelineParam === "pro" ? [pipelineParam] : ["basic", "pro"];

  // HubSpot rebuild and MRP refresh are independent — run them concurrently so
  // total wall-clock is max(hubspot, mrp), not their sum. Sequential execution
  // was part of what pushed Pro/Auto past the Hobby 10s cap.
  const hubspotTask = (async (): Promise<"ran" | "skipped" | "error"> => {
    try {
      if (!(await shouldAllowPoll("hubspot", "manual"))) return "skipped";
      await Promise.all(pipelines.map((p) => refreshPipelineSnapshot(p)));
      return "ran";
    } catch (err) {
      // Surface the real failure server-side so this class of bug is diagnosable
      // next time instead of a silent generic "error" outcome with no trace.
      console.error(
        `[onboarding-sync/refresh] HubSpot rebuild failed (pipelines=${pipelines.join(",")}):`,
        err
      );
      return "error";
    }
  })();

  const [hubspotOutcome, syncOutcome] = await Promise.all([hubspotTask, runOnboardingSync("manual")]);

  const nextRefreshAllowedAt = await getCombinedNextRefreshAllowedAt();

  return NextResponse.json({
    hubspot: hubspotOutcome,
    mrp: syncOutcome.mrp,
    nextRefreshAllowedAt,
  });
}
