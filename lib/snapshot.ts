// DB-backed snapshot cache (data_cache table).
//
// The dashboard reads pre-fetched JSON snapshots straight from Postgres so the
// board and detail sheet render instantly, with no live HubSpot/Sheets call on
// load. A pg_cron job hits /api/cron/refresh every 60 minutes to rewrite these
// rows (see docs/migrations/010_data_cache.sql). Reads go through the
// service-role admin client (cache: "no-store") so a snapshot write is visible
// immediately, never served from Next's fetch cache.

import { createAdminClient } from "@/lib/supabase/admin";

export type SnapshotKey = "onboarding:basic" | "onboarding:pro" | "hubspot:owners" | "mrp:records";

export interface Snapshot<T> {
  data: T;
  fetchedAt: string;
}

export async function readSnapshot<T>(key: SnapshotKey): Promise<Snapshot<T> | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("data_cache").select("data, fetched_at").eq("key", key).maybeSingle();
    const row = data as unknown as { data: T; fetched_at: string } | null;
    if (!row) return null;
    return { data: row.data, fetchedAt: row.fetched_at };
  } catch {
    return null;
  }
}

export async function writeSnapshot<T>(key: SnapshotKey, data: T): Promise<void> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { error } = await admin
    .from("data_cache")
    .upsert({ key, data, fetched_at: now, updated_at: now } as never, { onConflict: "key" });
  if (error) throw new Error(error.message);
}
