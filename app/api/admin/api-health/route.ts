import { NextResponse } from "next/server";

import { todayDateString } from "@/lib/api-health";
import { requireAdmin } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ApiIntegration } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET — admin only. Lists every tracked integration with a live-computed
// "used today" count: if requests_used_date has rolled over since the last
// real call, this reports 0 without needing a cron job to reset it.
export async function GET() {
  try {
    await requireAdmin();
  } catch (res) {
    return res as Response;
  }

  const admin = createAdminClient();
  const { data, error } = await admin.from("api_integrations").select("*").order("id");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const today = todayDateString();
  const integrations = ((data ?? []) as unknown as ApiIntegration[]).map((row) =>
    row.requests_used_date === today ? row : { ...row, requests_used_today: 0, requests_used_date: today }
  );

  return NextResponse.json({ integrations });
}
