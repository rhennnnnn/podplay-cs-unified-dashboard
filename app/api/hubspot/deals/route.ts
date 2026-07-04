import { NextRequest, NextResponse } from "next/server";

import {
  ONBOARDING_OBJECT_TYPE,
  PIPELINE_MAP,
  batchReadAssociations,
  batchReadObjects,
  getCacheTimestamp,
  getLastEmail,
  hubspotFetch,
  invalidateCache,
  mapLimit,
  withCache,
  type PipelineKey,
} from "@/lib/hubspot";
import { getIntegrationSettings, IntegrationPausedError } from "@/lib/api-health";

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
  const manual = params.get("manual") === "1";

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

  // Cache key covers every filter combo — identical requests from other CSAs
  // viewing the same pipeline/owner/search within the TTL hit this instead of
  // HubSpot. TTL is generous (5 min) because this now also does a per-card
  // last-email lookup below — a moderately expensive step that only needs to
  // run once per window, shared across every CSA, not on every poll.
  const cacheKey = `deals:${params.toString().replace(/&?manual=1/, "")}`;

  try {
    if (manual) {
      // Manual refresh must always be a real, non-cached upstream call —
      // drop whatever's cached so withCache below is forced to re-fetch.
      invalidateCache(cacheKey);
    }

    const result = await withCache(cacheKey, 5 * 60_000, async () => {
      const data = await hubspotFetch<SearchResponse>(
        `/crm/v3/objects/${ONBOARDING_OBJECT_TYPE}/search`,
        { method: "POST", body: JSON.stringify(body) },
        { trigger: manual ? "manual" : "auto" }
      );

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

      // This whole block only runs once per 5-minute cache window (shared by
      // every CSA), not per request, so a wider concurrency here is safe — it
      // cuts a ~15s cold load down to a few seconds without reintroducing the
      // per-request burst that caused the original rate-limit problem.
      const lastEmails = await mapLimit(data.results, 20, (r) => getLastEmail(r.id));

      const deals = data.results.map((r, i) => {
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

      return { deals, after: data.paging?.next?.after ?? null, total: data.total };
    });

    const settings = await getIntegrationSettings("hubspot");
    return NextResponse.json({
      ...result,
      pipeline: pipelineParam,
      fetchedAt: getCacheTimestamp(cacheKey),
      nextRefreshAllowedAt: settings?.next_refresh_allowed_at ?? null,
      manualRefreshPaused: settings?.manual_refresh_paused ?? false,
      pausedAll: settings?.paused_all ?? false,
    });
  } catch (err) {
    if (err instanceof IntegrationPausedError) {
      return NextResponse.json({ error: err.message, paused: true }, { status: 423 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load onboardings." },
      { status: 502 }
    );
  }
}
