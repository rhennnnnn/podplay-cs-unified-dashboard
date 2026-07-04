import { createAdminClient } from "@/lib/supabase/admin";
import type { ApiIntegration, ApiIntegrationStatus } from "@/lib/types";

export type PollTrigger = "auto" | "manual";

// How many auto-poll intervals of silence since the last success before a
// failing integration is escalated from down/broken to unresponsive. There's
// no consecutive-failure counter column (per spec) — this derives the same
// signal from the gap between last_success_at and now.
const UNRESPONSIVE_GAP_MULTIPLIER = 3;

export function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

async function getRow(integrationId: string): Promise<ApiIntegration | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("api_integrations").select("*").eq("id", integrationId).maybeSingle();
  return (data as unknown as ApiIntegration) ?? null;
}

// Records the outcome of one real upstream call. Every function in this file
// fails open — a health-tracking read/write error must never break the
// actual HubSpot/MRP call it's wrapping.
export async function recordCall(
  integrationId: string,
  result: { success: boolean; statusCode?: number; errorMessage?: string }
): Promise<void> {
  try {
    const admin = createAdminClient();
    const row = await getRow(integrationId);
    if (!row) return;

    const now = new Date();
    const usedToday = row.requests_used_date === todayDateString() ? row.requests_used_today + 1 : 1;

    const updates: Record<string, unknown> = {
      requests_used_today: usedToday,
      requests_used_date: todayDateString(),
      updated_at: now.toISOString(),
    };

    if (result.success) {
      updates.status = "active" satisfies ApiIntegrationStatus;
      updates.last_success_at = now.toISOString();
    } else {
      // 403 is a real permission gap (Viewer share not granted yet), not an
      // outage — checked before the generic 4xx->"broken" rule so the Health
      // panel shows the true cause instead of a misleading "broken" badge.
      let status: ApiIntegrationStatus =
        result.statusCode === 403
          ? "access_pending"
          : result.statusCode === 429 || (result.statusCode ?? 0) >= 500 || !result.statusCode
            ? "down"
            : "broken";

      if (status !== "access_pending" && row.last_success_at) {
        const gapMs = now.getTime() - new Date(row.last_success_at).getTime();
        const thresholdMs = UNRESPONSIVE_GAP_MULTIPLIER * row.auto_poll_interval_minutes * 60_000;
        if (gapMs > thresholdMs) status = "unresponsive";
      }

      updates.status = status;
      updates.last_error_at = now.toISOString();
      updates.last_error_message = (result.errorMessage ?? "Unknown error").slice(0, 500);
    }

    await admin.from("api_integrations").update(updates as never).eq("id", integrationId);
  } catch {
    // best-effort — never throw from here
  }
}

export type IntegrationPollSettings = Pick<
  ApiIntegration,
  "auto_poll_interval_minutes" | "auto_poll_paused" | "manual_refresh_paused" | "paused_all" | "next_refresh_allowed_at"
>;

// Lightweight status-only read — used by the MRP route to pick the right
// empty state (access_pending vs no-match vs generic failure) without
// pulling the full IntegrationPollSettings shape.
export async function getIntegrationStatus(integrationId: string): Promise<ApiIntegrationStatus | null> {
  const row = await getRow(integrationId);
  return row?.status ?? null;
}

export async function getIntegrationSettings(integrationId: string): Promise<IntegrationPollSettings | null> {
  const row = await getRow(integrationId);
  if (!row) return null;
  return {
    auto_poll_interval_minutes: row.auto_poll_interval_minutes,
    auto_poll_paused: row.auto_poll_paused,
    manual_refresh_paused: row.manual_refresh_paused,
    paused_all: row.paused_all,
    next_refresh_allowed_at: row.next_refresh_allowed_at,
  };
}

export async function shouldAllowPoll(integrationId: string, trigger: PollTrigger): Promise<boolean> {
  try {
    const settings = await getIntegrationSettings(integrationId);
    if (!settings) return true; // not configured yet — nothing to gate on
    if (settings.paused_all) return false;
    if (trigger === "auto") return !settings.auto_poll_paused;

    if (settings.manual_refresh_paused) return false;
    if (settings.next_refresh_allowed_at && new Date(settings.next_refresh_allowed_at).getTime() > Date.now()) {
      return false;
    }
    return true;
  } catch {
    return true; // fail open — a health-table outage shouldn't take down the real feature
  }
}

// Shared 60s cooldown — same value regardless of who or what triggered the
// successful, non-cached refresh.
export async function markRefreshed(integrationId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin
      .from("api_integrations")
      .update({ next_refresh_allowed_at: new Date(Date.now() + 60_000).toISOString() } as never)
      .eq("id", integrationId);
  } catch {
    // best-effort
  }
}

export class IntegrationPausedError extends Error {
  constructor(message = "This integration is currently paused by an admin.") {
    super(message);
    this.name = "IntegrationPausedError";
  }
}
