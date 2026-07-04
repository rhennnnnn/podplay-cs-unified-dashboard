import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// PATCH — admin only. Sets auto_poll_interval_minutes on BOTH hubspot and
// mrp_sheets rows in one call, since MRP is meaningless without a fresh
// HubSpot list to match against — they poll on the same schedule. Every
// other field (status/usage/error/pause toggles) stays fully independent.
export async function PATCH(request: NextRequest) {
  let caller;
  try {
    caller = await requireAdmin();
  } catch (res) {
    return res as Response;
  }

  const { minutes } = (await request.json()) as { minutes?: number };
  if (!Number.isInteger(minutes) || (minutes as number) < 1) {
    return NextResponse.json({ error: "Interval must be a whole number of minutes, at least 1." }, { status: 400 });
  }

  const admin = createAdminClient();
  const updates = {
    auto_poll_interval_minutes: minutes,
    updated_at: new Date().toISOString(),
    updated_by: caller.email,
  };

  const { data, error } = await admin
    .from("api_integrations")
    .update(updates as never)
    .in("id", ["hubspot", "mrp_sheets"])
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ integrations: data });
}
