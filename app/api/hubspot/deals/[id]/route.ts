import { NextRequest, NextResponse } from "next/server";

import {
  FORM_CHECKLIST_ITEMS,
  ONBOARDING_OBJECT_TYPE,
  batchReadObjects,
  getAssociatedIds,
  getContactFormSubmissions,
  hubspotFetch,
  mapLimit,
  withCache,
} from "@/lib/hubspot";

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
  "hardware_configuration_date",
  "installation_start_date",
  "onboarding_completed_date",
  "qc_call_installation_complete",
  "camera_adjustment_call",
  "internet_configuration_call",
  "kiosk_tv_app",
  "soft_open",
  "open_date",
  "podplay_project_manager",
  "relationship_owner",
  "courts",
  "experience_vertical",
  "go_viral",
  "door_access",
  "migration",
  "ios_app",
  "android_app",
  "web_app",
  "hs_createdate",
  "hs_lastmodifieddate",
  "env_link",
  "onboarding_deck",
  "linear_project",
  "stripe_id",
  ...FORM_CHECKLIST_ITEMS.flatMap((item) => (item.linkKey ? [item.key, item.linkKey] : [item.key])),
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
    const result = await withCache(`deal:${id}`, 45_000, async () => {
      const record = await hubspotFetch<OnboardingDetail>(
        `/crm/v3/objects/${ONBOARDING_OBJECT_TYPE}/${id}?properties=${DETAIL_PROPERTIES.join(",")}`
      );

      // Sheet only ever shows the first contact/company — cap well under HubSpot's
      // 100-input batch/read limit rather than pulling every association on
      // records with unusually large contact/company lists.
      const [contactIds, companyIds, noteIds] = await Promise.all([
        getAssociatedIds(ONBOARDING_OBJECT_TYPE, id, "contacts"),
        getAssociatedIds(ONBOARDING_OBJECT_TYPE, id, "companies"),
        getAssociatedIds(ONBOARDING_OBJECT_TYPE, id, "notes"),
      ]).then(([c, co, n]) => [c.slice(0, 10), co.slice(0, 10), n] as const);

      const [contacts, companies, notes] = await Promise.all([
        batchReadObjects<{
          firstname: string | null;
          lastname: string | null;
          email: string | null;
          phone: string | null;
          jobtitle: string | null;
          num_conversion_events: string | null;
          recent_conversion_event_name: string | null;
          recent_conversion_date: string | null;
        }>("contacts", contactIds, [
          "firstname",
          "lastname",
          "email",
          "phone",
          "jobtitle",
          "num_conversion_events",
          "recent_conversion_event_name",
          "recent_conversion_date",
        ]),
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

      const contactList = Object.values(contacts);
      const formSubmissionsByContact = await mapLimit(contactList, 4, (c) => getContactFormSubmissions(c.id));

      return {
        deal: record,
        contacts: contactList.map((c, i) => ({
          id: c.id,
          ...c.properties,
          formSubmissions: formSubmissionsByContact[i],
        })),
        companies: Object.values(companies).map((c) => ({ id: c.id, ...c.properties })),
        notes: Object.values(notes)
          .map((n) => ({ id: n.id, ...n.properties }))
          .sort((a, b) => new Date(b.hs_timestamp ?? 0).getTime() - new Date(a.hs_timestamp ?? 0).getTime()),
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load onboarding." },
      { status: 502 }
    );
  }
}
