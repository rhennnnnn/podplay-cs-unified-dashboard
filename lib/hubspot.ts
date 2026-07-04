// HubSpot Onboarding Panel — server-only constants and helpers.
//
// The panel tracks HubSpot's custom "Onboardings" object (objectTypeId 0-162),
// NOT the standard `deals` object. Discovered live via GET /crm/v3/pipelines/0-162
// against the real portal — PROMPTS.md assumed a deal-based "Basic (+)" /
// "Pro/Auto (+)" pipeline split, but the actual account splits onboardings into
// two pipelines on this custom object instead. Stage IDs below are real and
// pipelines rarely change, so they're stored as constants per spec rather than
// re-fetched on every request.

import { IntegrationPausedError, markRefreshed, recordCall, shouldAllowPoll, type PollTrigger } from "@/lib/api-health";

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

// "Has this client already sent us X" checklist — sourced from the real
// booleancheckbox properties on the Onboardings object (labels match HubSpot's
// own property labels exactly). `linkKey` points at a property that holds an
// actual URL for that item, when one exists, so the checklist can link straight
// to the artifact instead of just showing a checkmark.
export interface FormChecklistItem {
  key: string;
  label: string;
  linkKey?: string;
}

export const FORM_CHECKLIST_ITEMS: FormChecklistItem[] = [
  { key: "send_out_meeting_link", label: "Sent Forms and Meeting Link" },
  { key: "receive_design_form", label: "Receive Design Form" },
  { key: "receive_software_form", label: "Receive Software Form" },
  { key: "receive_ios___android_app_form", label: "Receive iOS & Android App Form" },
  { key: "receive_monitoring_form", label: "Receive Monitoring Form" },
  { key: "receive_terminal_form", label: "Receive Terminal Form" },
  { key: "receive_credit_card_authorization_form", label: "Receive Credit Card Authorization Form" },
  { key: "receive_stripe_express_account", label: "Receive Stripe Express Account" },
  { key: "cc_terminal_sent", label: "CC Terminal Sent" },
  { key: "confirm_environment_pricing_structure", label: "Confirm Environment Pricing Structure" },
  { key: "receive_approval_for_environment", label: "Receive Approval For Environment" },
  { key: "configure_environment", label: "Configure Environment" },
  { key: "send_out_environment", label: "Send Out Environment", linkKey: "env_link" },
  { key: "receive_feedback_on_environment", label: "Receive Feedback On Environment" },
  { key: "configure_hardware", label: "Configure Hardware" },
  { key: "schedule_hardware_delivery", label: "Schedule Hardware Delivery" },
  { key: "confirm_noc_access", label: "Confirm NOC Access" },
  { key: "qr_code_scanner", label: "QR Code Scanner" },
  { key: "send_native_phone_apps", label: "Send Native Phone Apps" },
  { key: "send_academy_courses", label: "Send Academy Courses" },
  { key: "share_customer_facing_considerations", label: "Share Customer-Facing Considerations" },
  { key: "pro_auto_kick_off_call", label: "Pro/Auto Kick-off Call" },
  { key: "send_csat_survey", label: "Send CSAT Survey" },
];

export function isFormChecked(value: string | null | undefined): boolean {
  return value === "true";
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
  const diffSec = Math.max(0, Math.round(diffMs / 1000));
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffMs / 60_000);
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
// stays cheap even as the portal grows past a couple hundred records. Cached —
// this alone is up to 10 HubSpot calls, and Overview is the page every CSA
// lands on first, so uncached it would be the single biggest source of load.
export async function getOnboardingOverviewStats(): Promise<OnboardingOverviewStats> {
  return withCache("overview-stats", 60_000, () => fetchOnboardingOverviewStats());
}

async function fetchOnboardingOverviewStats(): Promise<OnboardingOverviewStats> {
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

// Runs `fn` over `items` with at most `limit` in flight at once. Used for the
// per-card last-email lookup on the board — without a cap, fetching ~50 cards'
// worth of associations+batch-reads all at once is exactly the burst that
// tripped HubSpot's rate limit earlier.
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export const EMAIL_DIRECTION_LABEL: Record<string, string> = {
  EMAIL: "PodPlay",
  INCOMING_EMAIL: "Client",
  FORWARDED_EMAIL: "Forwarded",
  DRAFT_EMAIL: "Draft",
};

export interface LastEmail {
  timestamp: string;
  direction: string;
}

// Fetches the single most recent email logged on an onboarding record. Kept
// separate from the general activity feed (notes/calls/tasks) because the
// board only needs this one signal per card, cheaply, for every card at once.
export async function getLastEmail(dealId: string): Promise<LastEmail | null> {
  const emailIds = (await getAssociatedIds(ONBOARDING_OBJECT_TYPE, dealId, "emails")).slice(0, 100);
  if (emailIds.length === 0) return null;

  const emails = await batchReadObjects<{ hs_timestamp: string | null; hs_email_direction: string | null }>(
    "emails",
    emailIds,
    ["hs_timestamp", "hs_email_direction"]
  );

  let latest: LastEmail | null = null;
  for (const e of Object.values(emails)) {
    const ts = e.properties.hs_timestamp;
    if (!ts) continue;
    if (!latest || new Date(ts).getTime() > new Date(latest.timestamp).getTime()) {
      latest = { timestamp: ts, direction: e.properties.hs_email_direction ?? "EMAIL" };
    }
  }
  return latest;
}

// Card color coding by staleness of the last email — only meaningful while the
// onboarding is still active, so closed/MIA stages never get flagged.
export function getLastEmailUrgency(
  lastEmail: LastEmail | null,
  stageIsClosed: boolean
): "none" | "warning" | "critical" {
  if (stageIsClosed || !lastEmail) return "none";
  const days = (Date.now() - new Date(lastEmail.timestamp).getTime()) / 86_400_000;
  if (days >= 7) return "critical";
  if (days >= 4) return "warning";
  return "none";
}

export interface ContactFormSubmission {
  title: string;
  timestamp: number;
  formId: string;
  submissionId: string;
}

interface LegacyContactProfile {
  "form-submissions"?: {
    title?: string;
    timestamp: number;
    "form-type": string;
    "form-id": string;
    "conversion-id": string;
  }[];
}

// Legacy Contacts v1 API — still the only endpoint that returns a contact's
// full form submission history (title + date) by name. Modern v3 contact
// properties only expose the single MOST RECENT conversion, not the full list.
// `conversion-id` doubles as the submission ID HubSpot's UI uses in its
// per-submission deep link — confirmed by matching a real submission URL.
// "Contact Support Form" is a general support-request form, not an
// onboarding form — excluded so this list only shows onboarding-relevant
// submissions.
const EXCLUDED_FORM_TITLES = new Set(["Contact Support Form"]);

export async function getContactFormSubmissions(contactId: string): Promise<ContactFormSubmission[]> {
  try {
    const profile = await hubspotFetch<LegacyContactProfile>(`/contacts/v1/contact/vid/${contactId}/profile`);
    return (profile["form-submissions"] ?? [])
      .filter((s) => s["form-type"] === "HUBSPOT" && s.title && !EXCLUDED_FORM_TITLES.has(s.title))
      .map((s) => ({ title: s.title!, timestamp: s.timestamp, formId: s["form-id"], submissionId: s["conversion-id"] }))
      .sort((a, b) => b.timestamp - a.timestamp);
  } catch {
    return [];
  }
}

// Deep link to the exact submission's answer view — confirmed working:
// https://app.hubspot.com/submissions/{portal}/form/{formGuid}/submissions/{submissionId}
export function getFormSubmissionUrl(portalId: string, formId: string, submissionId: string): string {
  const redirect = encodeURIComponent(`https://app.hubspot.com/forms/${portalId}/views/all_forms`);
  return `https://app.hubspot.com/submissions/${portalId}/form/${formId}/submissions/${submissionId}?redirectUrl=${redirect}`;
}

// Process-local cache shared across every request this server instance handles.
// With ~10 CSAs viewing the same board/detail/owners data concurrently, this
// collapses N nearly-simultaneous browser polls into a single HubSpot call:
// the first caller populates the entry (and in-flight callers await the same
// pending promise instead of firing their own request), everyone after reads
// the cached value until it expires. Not a distributed cache (each warm
// serverless instance has its own), but on a small team's traffic this is
// what keeps normal usage well under HubSpot's rate limit.
interface CacheEntry<T> {
  expires: number;
  fetchedAt: number;
  value?: T;
  promise?: Promise<T>;
}
const cacheStore = new Map<string, CacheEntry<unknown>>();

export async function withCache<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const entry = cacheStore.get(key) as CacheEntry<T> | undefined;
  if (entry && entry.expires > now) {
    if (entry.promise) return entry.promise;
    if (entry.value !== undefined) return entry.value;
  }

  const fetchedAt = Date.now();
  const promise = fn()
    .then((value) => {
      cacheStore.set(key, { expires: Date.now() + ttlMs, fetchedAt, value });
      return value;
    })
    .catch((err) => {
      cacheStore.delete(key);
      throw err;
    });

  cacheStore.set(key, { expires: now + ttlMs, fetchedAt, promise });
  return promise;
}

// The timestamp of the data currently served for `key` — same value for every
// caller sharing the cache entry, so "Updated X ago" reads identically for
// every CSA instead of drifting per browser tab's own fetch time.
export function getCacheTimestamp(key: string): number | null {
  return cacheStore.get(key)?.fetchedAt ?? null;
}

// Forces the next withCache(key, ...) call to do a real fetch instead of
// serving a stale entry — used by manual refresh, which must always be a
// real, non-cached upstream call.
export function invalidateCache(key: string): void {
  cacheStore.delete(key);
}

// Server-only fetch wrapper — never import this from a client component.
// Every call here is gated by the shared api_integrations kill switch
// (lib/api-health.ts) and reports its outcome back to it. `trigger` defaults
// to "auto" (background polling); pass "manual" only from the one real
// user-initiated refresh call per request so the manual-refresh pause/cooldown
// applies to the right check.
export async function hubspotFetch<T>(
  path: string,
  init?: RequestInit,
  opts?: { trigger?: PollTrigger }
): Promise<T> {
  const trigger = opts?.trigger ?? "auto";
  const allowed = await shouldAllowPoll("hubspot", trigger);
  if (!allowed) {
    throw new IntegrationPausedError("HubSpot polling is currently paused by an admin.");
  }

  const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
  if (!token) throw new Error("HUBSPOT_PRIVATE_APP_TOKEN is not configured.");

  let res: Response;
  try {
    res = await fetch(`${HUBSPOT_BASE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
      cache: "no-store",
    });
  } catch (err) {
    await recordCall("hubspot", { success: false, errorMessage: err instanceof Error ? err.message : "Network error" });
    throw err;
  }

  if (!res.ok) {
    const body = await res.text();
    await recordCall("hubspot", { success: false, statusCode: res.status, errorMessage: body.slice(0, 500) });
    throw new Error(`HubSpot API error ${res.status}: ${body}`);
  }

  await recordCall("hubspot", { success: true });
  if (trigger === "manual") await markRefreshed("hubspot");
  return res.json() as Promise<T>;
}
