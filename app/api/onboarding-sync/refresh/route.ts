import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { shouldAllowPoll } from "@/lib/api-health";
import { getCombinedNextRefreshAllowedAt, runOnboardingSync } from "@/lib/onboarding-sync";

export const dynamic = "force-dynamic";

// POST — server-only. The Onboarding board's Refresh button calls this
// instead of hitting HubSpot directly, so one click refreshes BOTH HubSpot
// and MRP in sequence, then re-runs the cross-check.
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  // Refreshes the board's own filtered cache for whatever the caller is
  // currently viewing (pipeline/owner/search passed through as query params)
  // by calling the existing deals route's manual path — not re-implemented
  // here, per Session 7's cache being the single source of truth for that data.
  let hubspotOutcome: "ran" | "skipped" | "error" = "skipped";
  try {
    const hubspotAllowed = await shouldAllowPoll("hubspot", "manual");
    if (hubspotAllowed) {
      const url = new URL("/api/hubspot/deals", request.url);
      const forwardParams = ["pipeline", "owner", "search"];
      for (const key of forwardParams) {
        const value = request.nextUrl.searchParams.get(key);
        if (value) url.searchParams.set(key, value);
      }
      if (!url.searchParams.get("pipeline")) url.searchParams.set("pipeline", "basic");
      url.searchParams.set("manual", "1");

      const res = await fetch(url.toString(), { headers: { cookie: request.headers.get("cookie") ?? "" } });
      hubspotOutcome = res.ok ? "ran" : "error";
    }
  } catch {
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
