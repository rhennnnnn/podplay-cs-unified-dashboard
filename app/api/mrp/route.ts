import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getIntegrationStatus } from "@/lib/api-health";
import { getMrpRecordForCompany } from "@/lib/onboarding-sync";

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

  // Accepts one or more `company` params — the caller sends the specific
  // onboarding name AND the parent company name, most-specific first.
  const companies = request.nextUrl.searchParams.getAll("company").filter((c) => c.trim());

  // No company known yet (e.g. the detail sheet fired this before its own
  // deal-detail fetch resolved a company name) — nothing to join, but the
  // caller still needs the real mrpStatus (access_pending, etc.) rather than
  // an error, so it can render the correct empty state instead of a generic
  // "unavailable" fallback.
  if (companies.length === 0) {
    const mrpStatus = await getIntegrationStatus("mrp_sheets");
    return NextResponse.json({ record: null, mrpStatus });
  }

  // Match directly against the cached MRP records (stale-while-revalidate) —
  // no HubSpot-sweep join in the path, so a company present in the sheet
  // always resolves regardless of how its name was swept.
  const mrp = await getMrpRecordForCompany(companies);
  const mrpStatus = await getIntegrationStatus("mrp_sheets");

  return NextResponse.json({ record: { companyName: companies[0], mrp }, mrpStatus });
}
