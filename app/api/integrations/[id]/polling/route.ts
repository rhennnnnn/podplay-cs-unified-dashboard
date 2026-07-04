import { NextResponse } from "next/server";

import { getIntegrationSettings } from "@/lib/api-health";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// GET — any authenticated user. Lightweight, public-safe subset of an
// integration's poll settings — this is what client components (e.g. the
// HubSpot board) poll to configure SWR's refreshInterval and cooldown
// countdown without exposing any admin-only field.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const settings = await getIntegrationSettings(params.id);
  if (!settings) {
    return NextResponse.json({ error: "Unknown integration." }, { status: 404 });
  }

  return NextResponse.json({
    autoPollIntervalMinutes: settings.auto_poll_interval_minutes,
    autoPollPaused: settings.auto_poll_paused,
    manualRefreshPaused: settings.manual_refresh_paused,
    pausedAll: settings.paused_all,
    nextRefreshAllowedAt: settings.next_refresh_allowed_at,
  });
}
