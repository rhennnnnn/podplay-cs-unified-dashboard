import { NextRequest, NextResponse } from "next/server";

import {
  ONBOARDING_OBJECT_TYPE,
  PIPELINE_MAP,
  batchReadAssociations,
  batchReadObjects,
  hubspotFetch,
  type PipelineKey,
} from "@/lib/hubspot";

export const dynamic = "force-dynamic";

const LIST_PROPERTIES = [
  "hs_name",
  "hs_pipeline",
  "hs_pipeline_stage",
  "hubspot_owner_id",
  "podplay_tier",
  "deal_type",
  "anticipated_opening",
  "grand_opening",
  "hs_createdate",
  "hs_lastmodifieddate",
];

interface OnboardingProps {
  hs_name: string | null;
  hs_pipeline: string | null;
  hs_pipeline_stage: string | null;
  hubspot_owner_id: string | null;
  podplay_tier: string | null;
  deal_type: string | null;
  anticipated_opening: string | null;
  grand_opening: string | null;
  hs_createdate: string;
  hs_lastmodifieddate: string;
}

interface SearchResponse {
  results: { id: string; properties: OnboardingProps; createdAt: string; updatedAt: string }[];
  paging?: { next?: { after: string } };
  total: number;
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const pipelineParam = params.get("pipeline") ?? "all";
  const stage = params.get("stage");
  const owner = params.get("owner");
  const search = params.get("search");
  const after = params.get("after");

  const filters: { propertyName: string; operator: string; value: string }[] = [];
  if (pipelineParam !== "all" && (pipelineParam === "basic" || pipelineParam === "pro")) {
    filters.push({ propertyName: "hs_pipeline", operator: "EQ", value: PIPELINE_MAP[pipelineParam as PipelineKey].id });
  }
  if (stage) filters.push({ propertyName: "hs_pipeline_stage", operator: "EQ", value: stage });
  if (owner) filters.push({ propertyName: "hubspot_owner_id", operator: "EQ", value: owner });

  const body: Record<string, unknown> = {
    filterGroups: filters.length > 0 ? [{ filters }] : [],
    sorts: [{ propertyName: "hs_lastmodifieddate", direction: "DESCENDING" }],
    properties: LIST_PROPERTIES,
    limit: 100,
  };
  if (search) body.query = search;
  if (after) body.after = after;

  try {
    const data = await hubspotFetch<SearchResponse>(`/crm/v3/objects/${ONBOARDING_OBJECT_TYPE}/search`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    const ids = data.results.map((r) => r.id);
    const [contactAssoc, companyAssoc] = await Promise.all([
      batchReadAssociations(ONBOARDING_OBJECT_TYPE, "contacts", ids),
      batchReadAssociations(ONBOARDING_OBJECT_TYPE, "companies", ids),
    ]);

    const contactIds = Array.from(new Set(Object.values(contactAssoc).flat()));
    const companyIds = Array.from(new Set(Object.values(companyAssoc).flat()));

    const [contacts, companies] = await Promise.all([
      batchReadObjects<{ firstname: string | null; lastname: string | null; email: string | null }>(
        "contacts",
        contactIds,
        ["firstname", "lastname", "email"]
      ),
      batchReadObjects<{ name: string | null; domain: string | null }>("companies", companyIds, ["name", "domain"]),
    ]);

    const deals = data.results.map((r) => {
      const contactId = contactAssoc[r.id]?.[0];
      const companyId = companyAssoc[r.id]?.[0];
      const contact = contactId ? contacts[contactId] : undefined;
      const company = companyId ? companies[companyId] : undefined;

      return {
        id: r.id,
        properties: r.properties,
        contact: contact
          ? {
              id: contactId!,
              name: [contact.properties.firstname, contact.properties.lastname].filter(Boolean).join(" "),
              email: contact.properties.email,
            }
          : null,
        company: company ? { id: companyId!, name: company.properties.name, domain: company.properties.domain } : null,
      };
    });

    return NextResponse.json({ deals, after: data.paging?.next?.after ?? null, total: data.total });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load onboardings." },
      { status: 502 }
    );
  }
}
