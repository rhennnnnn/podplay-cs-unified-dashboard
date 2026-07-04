import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface PatchBody {
  requests_limit_per_day?: number | null;
  auto_poll_interval_minutes?: number;
  auto_poll_paused?: boolean;
  manual_refresh_paused?: boolean;
  paused_all?: boolean;
}

// PATCH — admin only. Updates any subset of the control fields; stamps
// updated_by with the caller's email.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  let caller;
  try {
    caller = await requireAdmin();
  } catch (res) {
    return res as Response;
  }

  const body = (await request.json()) as PatchBody;
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: caller.email };

  if ("requests_limit_per_day" in body) {
    updates.requests_limit_per_day = body.requests_limit_per_day;
  }
  if ("auto_poll_interval_minutes" in body) {
    const interval = body.auto_poll_interval_minutes;
    if (!Number.isInteger(interval) || (interval as number) < 1) {
      return NextResponse.json({ error: "Interval must be a whole number of minutes, at least 1." }, { status: 400 });
    }
    updates.auto_poll_interval_minutes = interval;
  }
  if ("auto_poll_paused" in body) updates.auto_poll_paused = body.auto_poll_paused;
  if ("manual_refresh_paused" in body) updates.manual_refresh_paused = body.manual_refresh_paused;
  if ("paused_all" in body) updates.paused_all = body.paused_all;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("api_integrations")
    .update(updates as never)
    .eq("id", params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ integration: data });
}
