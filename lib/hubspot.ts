// HubSpot Onboarding Panel — server-only constants and helpers.
//
// The panel tracks HubSpot's custom "Onboardings" object (objectTypeId 0-162),
// NOT the standard `deals` object. Discovered live via GET /crm/v3/pipelines/0-162
// against the real portal — PROMPTS.md assumed a deal-based "Basic (+)" /
// "Pro/Auto (+)" pipeline split, but the actual account splits onboardings into
// two pipelines on this custom object instead. Stage IDs below are real and
// pipelines rarely change, so they're stored as constants per spec rather than
// re-fetched on every request.

export const ONBOARDING_OBJECT_TYPE = "0-162";

export const HUBSPOT_BASE_URL = "https://api.hubapi.com";

export type PipelineKey = "basic" | "pro";

export interface HubspotStage {
  id: string;
  label: string;
  displayOrder: number;
  isClosed: boolean;
}

export interface HubspotPipeline {
  key: PipelineKey;
  id: string;
  label: string;
  stages: HubspotStage[];
}

export const PIPELINE_MAP: Record<PipelineKey, HubspotPipeline> = {
  basic: {
    key: "basic",
    id: "800363951",
    label: "Basic(+) Onboarding",
    stages: [
      { id: "1176600468", label: "Pre-Onboarding Steps", displayOrder: 0, isClosed: false },
      { id: "1176600469", label: "Intake Sent", displayOrder: 1, isClosed: false },
      { id: "1176450674", label: "Config & Training", displayOrder: 2, isClosed: false },
      { id: "1294017939", label: "Migration Steps", displayOrder: 3, isClosed: false },
      { id: "1176450675", label: "Needs QC", displayOrder: 4, isClosed: false },
      { id: "1363804011", label: "QC Finished", displayOrder: 5, isClosed: false },
      { id: "1176600470", label: "Completed", displayOrder: 6, isClosed: true },
      { id: "1325386753", label: "MIA/No Response", displayOrder: 7, isClosed: false },
    ],
  },
  pro: {
    key: "pro",
    id: "ba9cdbd6-e220-45b2-a5a2-d67ebdcbade6",
    label: "Pro/Auto(+) Onboarding",
    stages: [
      { id: "8e2b21d0-7a90-4968-8f8c-a8525cc49c70", label: "Pre-Onboarding Steps", displayOrder: 0, isClosed: false },
      { id: "1293775210", label: "Intake Sent", displayOrder: 1, isClosed: false },
      { id: "1169789589", label: "Config & Training", displayOrder: 2, isClosed: false },
      { id: "600b692d-a3fe-4052-9cd7-278b134d7941", label: "Migration Steps", displayOrder: 3, isClosed: false },
      { id: "1169789590", label: "Hardware Install", displayOrder: 4, isClosed: false },
      { id: "1169789591", label: "Needs QC", displayOrder: 5, isClosed: false },
      { id: "1363567270", label: "QC Finished", displayOrder: 6, isClosed: false },
      { id: "de53e7d9-6b57-4701-b576-92de01c9ed65", label: "Completed", displayOrder: 7, isClosed: true },
      { id: "1325393545", label: "MIA/No Response", displayOrder: 8, isClosed: false },
    ],
  },
};

export function getPipelineByKey(key: PipelineKey): HubspotPipeline {
  return PIPELINE_MAP[key];
}

export function getPipelineById(pipelineId: string): HubspotPipeline | undefined {
  return Object.values(PIPELINE_MAP).find((p) => p.id === pipelineId);
}

export function getStage(pipelineId: string, stageId: string): HubspotStage | undefined {
  return getPipelineById(pipelineId)?.stages.find((s) => s.id === stageId);
}

// Tier lives on the `podplay_tier` property of the onboarding record, not on
// the pipeline split (PROMPTS.md assumed pipeline = tier; real data has tier
// as an independent field: Basic / Plus (Basic+) / Pro / Autonomous+).
export const TIER_OPTIONS = ["Basic", "Plus", "Pro", "Autonomous+"] as const;
export type TierValue = (typeof TIER_OPTIONS)[number];

export const TIER_LABEL: Record<string, string> = {
  Basic: "Basic",
  Plus: "Basic+",
  Pro: "Pro",
  "Autonomous+": "Autonomous+",
};

// Maps a HubSpot tier value to the tracker's `locations.tier` select options.
export function tierToTrackerTier(tier: string | null): string {
  if (tier === "Pro" || tier === "Autonomous+") return "Pro/Auto (+)";
  return "Basic (+)";
}

export function getStageBadgeColor(stageId: string, pipelineId: string): string {
  const pipeline = getPipelineById(pipelineId);
  const stage = pipeline?.stages.find((s) => s.id === stageId);
  if (!pipeline || !stage) return "bg-muted text-muted-foreground";

  if (stage.label === "MIA/No Response") return "bg-destructive/15 text-destructive";
  if (stage.isClosed) return "bg-accent/15 text-accent-foreground dark:text-accent";
  if (stage.displayOrder === 0) return "bg-muted text-muted-foreground";
  return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
}

export function getStageProgress(stageId: string, pipelineId: string): { current: number; total: number } {
  const pipeline = getPipelineById(pipelineId);
  if (!pipeline) return { current: 0, total: 1 };
  // MIA/No Response is a side-track, not a step — exclude it from the linear count.
  const linearStages = pipeline.stages.filter((s) => s.label !== "MIA/No Response");
  const stage = pipeline.stages.find((s) => s.id === stageId);
  const index = stage ? linearStages.findIndex((s) => s.id === stage.id) : -1;
  return { current: index === -1 ? 0 : index + 1, total: linearStages.length };
}

export interface HubspotOwner {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface ActivityItem {
  type: "note" | "email" | "call" | "task";
  timestamp: string;
  ownerId: string | null;
  preview: string;
}

const ACTIVITY_ICON_LABEL: Record<ActivityItem["type"], string> = {
  note: "Note added",
  email: "Email sent",
  call: "Call logged",
  task: "Task",
};

export function formatLastActivity(items: ActivityItem[]): { icon: ActivityItem["type"]; label: string } | null {
  if (items.length === 0) return null;
  const [latest] = items;
  return { icon: latest.type, label: `${ACTIVITY_ICON_LABEL[latest.type]} ${formatRelativeTime(latest.timestamp)}` };
}

export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = now - then;
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay === 1) return "yesterday";
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatDateWithRelative(dateStr: string | null): { absolute: string; overdue: boolean } | null {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  const today = new Date();
  target.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const overdue = target.getTime() < today.getTime();
  return {
    absolute: target.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }),
    overdue,
  };
}

export interface HubspotObjectResult<P = Record<string, string | null>> {
  id: string;
  properties: P;
  createdAt: string;
  updatedAt: string;
}

interface AssociationBatchResult {
  results: { from: { id: string }; to: { toObjectId: string; associationTypes: unknown[] }[] }[];
}

// Returns a map of sourceId -> associated object IDs (first page only, sufficient
// for card/summary display where we only need the primary contact/company).
export async function batchReadAssociations(
  fromType: string,
  toType: string,
  ids: string[]
): Promise<Record<string, string[]>> {
  if (ids.length === 0) return {};
  const data = await hubspotFetch<AssociationBatchResult>(
    `/crm/v4/associations/${fromType}/${toType}/batch/read`,
    { method: "POST", body: JSON.stringify({ inputs: ids.map((id) => ({ id })) }) }
  );
  const map: Record<string, string[]> = {};
  for (const r of data.results) {
    map[r.from.id] = r.to.map((t) => t.toObjectId);
  }
  return map;
}

export async function batchReadObjects<P = Record<string, string | null>>(
  objectType: string,
  ids: string[],
  properties: string[]
): Promise<Record<string, HubspotObjectResult<P>>> {
  if (ids.length === 0) return {};
  const data = await hubspotFetch<{ results: HubspotObjectResult<P>[] }>(
    `/crm/v3/objects/${objectType}/batch/read`,
    { method: "POST", body: JSON.stringify({ inputs: ids.map((id) => ({ id })), properties }) }
  );
  const map: Record<string, HubspotObjectResult<P>> = {};
  for (const r of data.results) map[r.id] = r;
  return map;
}

export async function getAssociatedIds(
  fromType: string,
  fromId: string,
  toType: string
): Promise<string[]> {
  try {
    const data = await hubspotFetch<{ results: { id: string }[] }>(
      `/crm/v3/objects/${fromType}/${fromId}/associations/${toType}`
    );
    return data.results.map((r) => r.id);
  } catch {
    return [];
  }
}

export interface OnboardingOverviewStats {
  total: number;
  stuck: number;
  overdueOpenings: number;
  openingThisWeek: number;
}

interface OverviewSearchResult {
  results: {
    properties: {
      hs_pipeline: string | null;
      hs_pipeline_stage: string | null;
      anticipated_opening: string | null;
      grand_opening: string | null;
    };
  }[];
  paging?: { next?: { after: string } };
}

// Aggregates lightweight stats across every onboarding for the dashboard Overview
// page. Paginates the search endpoint (100/page) up to a small page cap so this
// stays cheap even as the portal grows past a couple hundred records.
export async function getOnboardingOverviewStats(): Promise<OnboardingOverviewStats> {
  const stats: OnboardingOverviewStats = { total: 0, stuck: 0, overdueOpenings: 0, openingThisWeek: 0 };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekFromNow = new Date(today.getTime() + 7 * 86_400_000);

  let after: string | undefined;
  const MAX_PAGES = 10;

  for (let page = 0; page < MAX_PAGES; page++) {
    const body: Record<string, unknown> = {
      filterGroups: [],
      properties: ["hs_pipeline", "hs_pipeline_stage", "anticipated_opening", "grand_opening"],
      limit: 100,
    };
    if (after) body.after = after;

    const data = await hubspotFetch<OverviewSearchResult>(`/crm/v3/objects/${ONBOARDING_OBJECT_TYPE}/search`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    for (const r of data.results) {
      stats.total++;
      const stage =
        r.properties.hs_pipeline && r.properties.hs_pipeline_stage
          ? getStage(r.properties.hs_pipeline, r.properties.hs_pipeline_stage)
          : undefined;

      if (stage?.label === "MIA/No Response") {
        stats.stuck++;
        continue;
      }
      if (stage?.isClosed) continue;

      const openingDate = r.properties.grand_opening ?? r.properties.anticipated_opening;
      if (!openingDate) continue;
      const target = new Date(openingDate);
      target.setHours(0, 0, 0, 0);
      if (target.getTime() < today.getTime()) stats.overdueOpenings++;
      else if (target.getTime() <= weekFromNow.getTime()) stats.openingThisWeek++;
    }

    after = data.paging?.next?.after;
    if (!after) break;
  }

  return stats;
}

// Server-only fetch wrapper — never import this from a client component.
export async function hubspotFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
  if (!token) throw new Error("HUBSPOT_PRIVATE_APP_TOKEN is not configured.");

  const res = await fetch(`${HUBSPOT_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HubSpot API error ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}
