import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { importOnboardingById } from "@/lib/tracker-sync";

export const dynamic = "force-dynamic";

// Session 15C — per-record "Import Now". Runs the same auto-import path as the
// hourly cron for one onboarding, so a CSA can pull a record into the tracker
// immediately instead of waiting for the next tick. The DB unique index on
// hubspot_deal_id (migration 015) makes a race with the cron a safe no-op.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const email = userData.user?.email;
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let dealId: unknown;
  try {
    ({ dealId } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (typeof dealId !== "string" || !dealId.trim()) {
    return NextResponse.json({ error: "dealId is required" }, { status: 400 });
  }

  const result = await importOnboardingById(dealId, email);

  if (result.status === "not_found") {
    return NextResponse.json({ error: "Onboarding not found in the current snapshot." }, { status: 404 });
  }
  if (result.status === "error") {
    return NextResponse.json({ error: "Import failed." }, { status: 500 });
  }
  return NextResponse.json(result);
}
