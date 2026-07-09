import { NextRequest, NextResponse } from "next/server";

import { type PipelineKey } from "@/lib/hubspot";
import { getIntegrationSettings, IntegrationPausedError, shouldAllowPoll } from "@/lib/api-health";
import { buildPipelineDeals, filterDeals } from "@/lib/onboarding-deals";
import { readSnapshot, writeSnapshot, type SnapshotKey } from "@/lib/snapshot";
import type { OnboardingListItem } from "@/components/onboarding/onboarding-types";

export const dynamic = "force-dynamic";

const SNAPSHOT_KEY: Record<PipelineKey, SnapshotKey> = {
  basic: "onboarding:basic",
  pro: "onboarding:pro",
};

// Serves the pre-fetched DB snapshot (written by the cron refresh every 60 min)
// so the board renders instantly, with stage/owner/search filtering applied
// in-memory. `fetchedAt` reflects the snapshot's real age, so the board's
// "Updated X ago" indicator shows when the shown data was actually pulled.
// Falls back to a live build if the snapshot doesn't exist yet (pre-first-cron)
// or a manual refresh forces one.
async function loadPipeline(
  pipeline: PipelineKey,
  manual: boolean
): Promise<{ deals: OnboardingListItem[]; total: number; fetchedAt: string }> {
  const snap = await readSnapshot<{ deals: OnboardingListItem[]; total: number }>(SNAPSHOT_KEY[pipeline]);
  if (!manual && snap) {
    return { deals: snap.data.deals, total: snap.data.total, fetchedAt: snap.fetchedAt };
  }
  // Cold snapshot or manual refresh — build live and persist so the next read
  // (and every other session) is instant. On manual, reuse the existing
  // snapshot's last-email values instead of re-sweeping them per card, so the
  // rebuild finishes under the serverless timeout (the hourly cron does the
  // full email sweep).
  const priorLastEmails =
    manual && snap
      ? Object.fromEntries(snap.data.deals.map((d) => [d.id, d.lastEmail]))
      : undefined;
  const built = await buildPipelineDeals(pipeline, manual ? "manual" : "auto", { priorLastEmails });
  const fetchedAt = new Date().toISOString();
  await writeSnapshot(SNAPSHOT_KEY[pipeline], built).catch(() => {});
  return { deals: built.deals, total: built.total, fetchedAt };
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const pipelineParam = params.get("pipeline") ?? "all";
  const stage = params.get("stage");
  const owner = params.get("owner");
  const search = params.get("search");
  const manual = params.get("manual") === "1";

  try {
    // A manual refresh must respect the pause state — don't force a live pull
    // when an admin has paused polling.
    if (manual && !(await shouldAllowPoll("hubspot", "manual"))) {
      throw new IntegrationPausedError("HubSpot polling is currently paused by an admin.");
    }

    const pipelines: PipelineKey[] =
      pipelineParam === "basic" || pipelineParam === "pro" ? [pipelineParam] : ["basic", "pro"];

    const loaded = await Promise.all(pipelines.map((p) => loadPipeline(p, manual)));
    const allDeals = loaded.flatMap((l) => l.deals);
    const total = loaded.reduce((sum, l) => sum + l.total, 0);
    // Oldest snapshot wins — the indicator should reflect the least-fresh data on screen.
    const fetchedAt = loaded
      .map((l) => l.fetchedAt)
      .reduce((oldest, t) => (new Date(t) < new Date(oldest) ? t : oldest), loaded[0].fetchedAt);

    const deals = filterDeals(allDeals, { stage, owner, search });

    const settings = await getIntegrationSettings("hubspot");
    return NextResponse.json({
      deals,
      after: null,
      total,
      pipeline: pipelineParam,
      fetchedAt: new Date(fetchedAt).getTime(),
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
