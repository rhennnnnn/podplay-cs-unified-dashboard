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
  getStage,
  getStageProgress,
  hubspotFetch,
  mapLimit,
  tierToTrackerTier,
  type PipelineKey,
} from "@/lib/hubspot";
import type { PollTrigger } from "@/lib/api-health";
import { readSnapshot, writeSnapshot, type SnapshotKey } from "@/lib/snapshot";
import type { OnboardingListItem } from "@/components/onboarding/onboarding-types";

export const PIPELINE_SNAPSHOT_KEY: Record<PipelineKey, SnapshotKey> = {
  basic: "onboarding:basic",
  pro: "onboarding:pro",
};

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
  // When set (manual refresh), reuse prior contact/company/last-email enrichment
  // by deal id and SKIP the association + object batch reads AND the email sweep
  // entirely — only the deal search (stage/owner/props) is re-fetched. This keeps
  // a manual rebuild to a single HubSpot round trip so it finishes under Vercel
  // Hobby's 10s function cap (the sequential association+object+email fetches are
  // what pushed the larger Pro/Auto pipeline past it). The hourly cron still does
  // the full enrichment; deals absent from the prior snapshot get null enrichment
  // until the next cron. Takes precedence over priorLastEmails when both are set.
  priorEnrichment?: Record<string, Pick<OnboardingListItem, "contact" | "company" | "lastEmail">>;
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

  // Manual fast path: reuse prior enrichment, skip all association/object/email
  // round trips. One search call total — fits Vercel Hobby's 10s cap.
  if (opts.priorEnrichment) {
    const prior = opts.priorEnrichment;
    const deals: OnboardingListItem[] = all.map((r) => ({
      id: r.id,
      properties: r.properties,
      contact: prior[r.id]?.contact ?? null,
      company: prior[r.id]?.company ?? null,
      lastEmail: prior[r.id]?.lastEmail ?? null,
    }));
    return { deals, total };
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

// Manual-refresh rebuild for ONE pipeline: reads the prior snapshot and reuses
// its per-card enrichment (contact/company/last-email), so the rebuild only
// re-fetches the deal search (stage/owner/props) — a single HubSpot round trip
// that finishes well under Vercel Hobby's 10s function cap. Writes the snapshot
// back and returns the fresh data with its write timestamp. On a cold cache
// (no prior snapshot) it falls through to a full enrichment build.
//
// Two things this fixes for Manual Refresh on Pro/Auto(+), which silently
// no-opped before:
//   1. No server-to-server loopback fetch (the old route fetched its own
//      /api/hubspot/deals with hand-forwarded cookies — fragile on Vercel).
//   2. No association/object/email sweep on the larger Pro pipeline — that
//      sequential fan-out is what pushed the function past the 10s Hobby cap.
// The hourly cron (buildPipelineDeals with no priors) still does the full sweep.
export async function refreshPipelineSnapshot(
  pipeline: PipelineKey
): Promise<PipelineDeals & { fetchedAt: string }> {
  const snap = await readSnapshot<PipelineDeals>(PIPELINE_SNAPSHOT_KEY[pipeline]);
  const priorEnrichment = snap
    ? Object.fromEntries(
        snap.data.deals.map((d) => [d.id, { contact: d.contact, company: d.company, lastEmail: d.lastEmail }])
      )
    : undefined;
  const built = await buildPipelineDeals(pipeline, "manual", { priorEnrichment });
  const fetchedAt = new Date().toISOString();
  await writeSnapshot(PIPELINE_SNAPSHOT_KEY[pipeline], built).catch(() => {});
  return { ...built, fetchedAt };
}

export interface UpcomingOpening {
  id: string;
  name: string;
  tier: string;
  openingDate: string; // ISO
  readyPct: number; // stage progress used as a readiness proxy
  status: "on-track" | "at-risk" | "delayed";
}

// Reads the onboarding snapshots (never a live HubSpot call) and returns the
// non-closed openings falling inside a window around today, sorted soonest
// first. Used by the Overview "Upcoming openings" panel. Readiness % is derived
// from linear stage progress (the only per-deal completion signal available).
export async function getUpcomingOpenings(
  opts: { pastDays?: number; futureDays?: number; limit?: number } = {}
): Promise<UpcomingOpening[]> {
  const pastDays = opts.pastDays ?? 14;
  const futureDays = opts.futureDays ?? 21;
  const limit = opts.limit ?? 6;

  const [basic, pro] = await Promise.all([
    readSnapshot<PipelineDeals>(PIPELINE_SNAPSHOT_KEY.basic),
    readSnapshot<PipelineDeals>(PIPELINE_SNAPSHOT_KEY.pro),
  ]);
  const deals = [...(basic?.data.deals ?? []), ...(pro?.data.deals ?? [])];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const lowerBound = today.getTime() - pastDays * 86_400_000;
  const upperBound = today.getTime() + futureDays * 86_400_000;
  const weekOut = today.getTime() + 7 * 86_400_000;

  const items: UpcomingOpening[] = [];
  for (const d of deals) {
    const p = d.properties;
    if (!p.hs_pipeline || !p.hs_pipeline_stage) continue;
    const stage = getStage(p.hs_pipeline, p.hs_pipeline_stage);
    if (stage?.isClosed) continue; // completed/opened — not "upcoming"

    const openingStr = p.grand_opening ?? p.anticipated_opening;
    if (!openingStr) continue;
    const target = new Date(openingStr);
    if (Number.isNaN(target.getTime())) continue;
    target.setHours(0, 0, 0, 0);
    const t = target.getTime();
    if (t < lowerBound || t > upperBound) continue;

    const mia = stage?.label === "MIA/No Response";
    const overdue = t < today.getTime();
    const soon = !overdue && t <= weekOut;
    const status: UpcomingOpening["status"] = overdue || mia ? "delayed" : soon ? "at-risk" : "on-track";

    const prog = getStageProgress(p.hs_pipeline_stage, p.hs_pipeline);
    const readyPct = Math.round((prog.current / prog.total) * 100);

    items.push({
      id: d.id,
      name: p.hs_name ?? d.company?.name ?? "Untitled onboarding",
      tier: tierToTrackerTier(p.podplay_tier),
      openingDate: target.toISOString(),
      readyPct,
      status,
    });
  }

  items.sort((a, b) => new Date(a.openingDate).getTime() - new Date(b.openingDate).getTime());
  return items.slice(0, limit);
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
