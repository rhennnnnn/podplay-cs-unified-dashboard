// Builds the enriched onboarding-deals payload for a whole pipeline.
//
// Extracted from app/api/hubspot/deals so both the read route and the cron
// refresher (which writes the DB snapshot) share one enrichment path. This
// fetches every deal in a pipeline (unfiltered) and enriches each with its
// primary contact, company, and last-email — the filtering by stage/owner/
// search is applied cheaply in-memory by the read route over the snapshot.

import {
  ONBOARDING_OBJECT_TYPE,
  PIPELINE_MAP,
  batchReadAssociations,
  batchReadObjects,
  getLastEmail,
  hubspotFetch,
  mapLimit,
  type PipelineKey,
} from "@/lib/hubspot";
import type { PollTrigger } from "@/lib/api-health";
import type { OnboardingListItem } from "@/components/onboarding/onboarding-types";

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

export interface PipelineDeals {
  deals: OnboardingListItem[];
  total: number;
}

export interface BuildOptions {
  // When set, skip the (expensive) per-card last-email lookup and reuse these
  // values by deal id instead. Used by the manual Refresh path so it finishes
  // well under the serverless timeout — the full email sweep only runs on the
  // hourly cron. Missing ids just get null until the next cron.
  priorLastEmails?: Record<string, OnboardingListItem["lastEmail"]>;
}

// Fetches and enriches every deal in one pipeline. Paginates fully (pipelines
// run ~40-60 records, so this is one or two pages) so the snapshot holds the
// complete set and the read route never needs a live call to fill gaps.
export async function buildPipelineDeals(
  pipeline: PipelineKey,
  trigger: PollTrigger,
  opts: BuildOptions = {}
): Promise<PipelineDeals> {
  const all: SearchResponse["results"] = [];
  let after: string | undefined;
  let total = 0;

  for (let page = 0; page < 10; page++) {
    const body: Record<string, unknown> = {
      filterGroups: [{ filters: [{ propertyName: "hs_pipeline", operator: "EQ", value: PIPELINE_MAP[pipeline].id }] }],
      sorts: [{ propertyName: "hs_lastmodifieddate", direction: "DESCENDING" }],
      properties: LIST_PROPERTIES,
      limit: 100,
    };
    if (after) body.after = after;

    const data = await hubspotFetch<SearchResponse>(
      `/crm/v3/objects/${ONBOARDING_OBJECT_TYPE}/search`,
      { method: "POST", body: JSON.stringify(body) },
      { trigger }
    );
    all.push(...data.results);
    total = data.total;
    after = data.paging?.next?.after;
    if (!after) break;
  }

  const ids = all.map((r) => r.id);
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

  // Skip the per-card email sweep when prior values are supplied (manual
  // refresh) — that lookup is what pushes a full rebuild past the serverless
  // timeout. Reuse the last snapshot's values; the hourly cron refreshes them.
  const lastEmails = opts.priorLastEmails
    ? all.map((r) => opts.priorLastEmails![r.id] ?? null)
    : await mapLimit(all, 20, (r) => getLastEmail(r.id));

  const deals: OnboardingListItem[] = all.map((r, i) => {
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
      lastEmail: lastEmails[i],
    };
  });

  return { deals, total };
}

// In-memory filtering the read route applies over a pipeline snapshot.
export function filterDeals(
  deals: OnboardingListItem[],
  opts: { stage?: string | null; owner?: string | null; search?: string | null }
): OnboardingListItem[] {
  const q = opts.search?.trim().toLowerCase();
  return deals.filter((d) => {
    if (opts.stage && d.properties.hs_pipeline_stage !== opts.stage) return false;
    if (opts.owner && d.properties.hubspot_owner_id !== opts.owner) return false;
    if (q) {
      const hay = [d.properties.hs_name, d.contact?.name, d.company?.name].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
