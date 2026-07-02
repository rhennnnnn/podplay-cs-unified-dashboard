import { NextRequest, NextResponse } from "next/server";

import { ONBOARDING_OBJECT_TYPE, batchReadObjects, getAssociatedIds, hubspotFetch } from "@/lib/hubspot";

export const dynamic = "force-dynamic";

const DETAIL_PROPERTIES = [
  "hs_name",
  "hs_pipeline",
  "hs_pipeline_stage",
  "hubspot_owner_id",
  "podplay_tier",
  "deal_type",
  "company_address",
  "company_domain",
  "anticipated_opening",
  "grand_opening",
  "membership_presale_date",
  "hardware_delivery_date",
  "installation_start_date",
  "onboarding_completed_date",
  "soft_open",
  "open_date",
  "podplay_project_manager",
  "relationship_owner",
  "courts",
  "experience_vertical",
  "go_viral",
  "door_access",
  "hs_createdate",
  "hs_lastmodifieddate",
];

interface OnboardingDetail {
  id: string;
  properties: Record<string, string | null>;
  createdAt: string;
  updatedAt: string;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;

  try {
    const record = await hubspotFetch<OnboardingDetail>(
      `/crm/v3/objects/${ONBOARDING_OBJECT_TYPE}/${id}?properties=${DETAIL_PROPERTIES.join(",")}`
    );

    const [contactIds, companyIds, noteIds] = await Promise.all([
      getAssociatedIds(ONBOARDING_OBJECT_TYPE, id, "contacts"),
      getAssociatedIds(ONBOARDING_OBJECT_TYPE, id, "companies"),
      getAssociatedIds(ONBOARDING_OBJECT_TYPE, id, "notes"),
    ]);

    const [contacts, companies, notes] = await Promise.all([
      batchReadObjects<{ firstname: string | null; lastname: string | null; email: string | null; phone: string | null; jobtitle: string | null }>(
        "contacts",
        contactIds,
        ["firstname", "lastname", "email", "phone", "jobtitle"]
      ),
      batchReadObjects<{ name: string | null; domain: string | null; phone: string | null }>(
        "companies",
        companyIds,
        ["name", "domain", "phone"]
      ),
      batchReadObjects<{ hs_note_body: string | null; hs_timestamp: string | null; hubspot_owner_id: string | null }>(
        "notes",
        noteIds.slice(0, 5),
        ["hs_note_body", "hs_timestamp", "hubspot_owner_id"]
      ),
    ]);

    return NextResponse.json({
      deal: record,
      contacts: Object.values(contacts).map((c) => ({ id: c.id, ...c.properties })),
      companies: Object.values(companies).map((c) => ({ id: c.id, ...c.properties })),
      notes: Object.values(notes)
        .map((n) => ({ id: n.id, ...n.properties }))
        .sort((a, b) => new Date(b.hs_timestamp ?? 0).getTime() - new Date(a.hs_timestamp ?? 0).getTime()),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load onboarding." },
      { status: 502 }
    );
  }
}
