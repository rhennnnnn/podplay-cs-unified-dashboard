import { NextRequest, NextResponse } from "next/server";

import { ONBOARDING_OBJECT_TYPE, batchReadObjects, getAssociatedIds, withCache, type ActivityItem } from "@/lib/hubspot";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { dealId: string } }) {
  const { dealId } = params;

  try {
    const items = await withCache(`activity:${dealId}`, 45_000, () => fetchActivity(dealId));
    return NextResponse.json({ activity: items });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load activity." },
      { status: 502 }
    );
  }
}

// HubSpot's batch/read endpoint hard-caps at 100 inputs per call. A long-running
// onboarding can easily accumulate more than 100 logged emails/notes, so the
// association id lists must be capped before batch-reading them or the call
// fails outright (400) — this was surfacing as an intermittent 502 on this
// route for exactly the records with the most activity.
const MAX_BATCH_READ = 100;

async function fetchActivity(dealId: string): Promise<ActivityItem[]> {
  const [noteIds, emailIds, callIds, taskIds] = (
    await Promise.all([
      getAssociatedIds(ONBOARDING_OBJECT_TYPE, dealId, "notes"),
      getAssociatedIds(ONBOARDING_OBJECT_TYPE, dealId, "emails"),
      getAssociatedIds(ONBOARDING_OBJECT_TYPE, dealId, "calls"),
      getAssociatedIds(ONBOARDING_OBJECT_TYPE, dealId, "tasks"),
    ])
  ).map((ids) => ids.slice(0, MAX_BATCH_READ));

    const [notes, emails, calls, tasks] = await Promise.all([
      batchReadObjects<{ hs_note_body: string | null; hs_timestamp: string | null; hubspot_owner_id: string | null }>(
        "notes",
        noteIds,
        ["hs_note_body", "hs_timestamp", "hubspot_owner_id"]
      ),
      batchReadObjects<{ hs_email_subject: string | null; hs_timestamp: string | null; hubspot_owner_id: string | null }>(
        "emails",
        emailIds,
        ["hs_email_subject", "hs_timestamp", "hubspot_owner_id"]
      ),
      batchReadObjects<{ hs_call_title: string | null; hs_timestamp: string | null; hubspot_owner_id: string | null }>(
        "calls",
        callIds,
        ["hs_call_title", "hs_timestamp", "hubspot_owner_id"]
      ),
      batchReadObjects<{ hs_task_subject: string | null; hs_timestamp: string | null; hubspot_owner_id: string | null }>(
        "tasks",
        taskIds,
        ["hs_task_subject", "hs_timestamp", "hubspot_owner_id"]
      ),
    ]);

    const items: ActivityItem[] = [
      ...Object.values(notes).map((n) => ({
        type: "note" as const,
        timestamp: n.properties.hs_timestamp ?? n.createdAt,
        ownerId: n.properties.hubspot_owner_id,
        preview: (n.properties.hs_note_body ?? "").replace(/<[^>]+>/g, "").slice(0, 200),
      })),
      ...Object.values(emails).map((e) => ({
        type: "email" as const,
        timestamp: e.properties.hs_timestamp ?? e.createdAt,
        ownerId: e.properties.hubspot_owner_id,
        preview: e.properties.hs_email_subject ?? "(no subject)",
      })),
      ...Object.values(calls).map((c) => ({
        type: "call" as const,
        timestamp: c.properties.hs_timestamp ?? c.createdAt,
        ownerId: c.properties.hubspot_owner_id,
        preview: c.properties.hs_call_title ?? "Call",
      })),
      ...Object.values(tasks).map((t) => ({
        type: "task" as const,
        timestamp: t.properties.hs_timestamp ?? t.createdAt,
        ownerId: t.properties.hubspot_owner_id,
        preview: t.properties.hs_task_subject ?? "Task",
      })),
    ]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 10);

  return items;
}
