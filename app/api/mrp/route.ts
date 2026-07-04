import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getIntegrationStatus } from "@/lib/api-health";
import { getJoinedRecord, isJoinedCacheStale, runOnboardingSync } from "@/lib/onboarding-sync";

export const dynamic = "force-dynamic";

// GET ?company= — server-only. Serves the cached joined HubSpot+MRP result;
// triggers a sync only if the cache is stale. Never exposes the service
// account key or raw Sheets API responses beyond mapped fields.
export async function GET(request: NextRequest) {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const company = request.nextUrl.searchParams.get("company");
  if (!company) {
    return NextResponse.json({ error: "?company= is required." }, { status: 400 });
  }

  if (isJoinedCacheStale()) {
    await runOnboardingSync("auto");
  }

  const record = await getJoinedRecord(company);
  const mrpStatus = await getIntegrationStatus("mrp_sheets");

  return NextResponse.json({ record, mrpStatus });
}
