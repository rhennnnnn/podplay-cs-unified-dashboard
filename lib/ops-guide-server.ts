import { createClient } from "@/lib/supabase/server";

export interface OpsGuideOverviewStats {
  totalArticles: number;
  mostViewedTitle: string | null;
  mostViewedCount: number;
}

// Server-only (uses the cookie-scoped Supabase client) — kept out of
// lib/ops-guide.ts so that file can stay importable from client components.
export async function getOpsGuideOverviewStats(): Promise<OpsGuideOverviewStats> {
  const supabase = createClient();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [{ count: totalArticles }, { data: views }] = await Promise.all([
    supabase.from("ops_articles").select("id", { count: "exact", head: true }).eq("published", true),
    supabase.from("ops_article_views").select("article_id").gte("viewed_at", since),
  ]);

  const tally = new Map<string, number>();
  for (const view of (views ?? []) as { article_id: string }[]) {
    tally.set(view.article_id, (tally.get(view.article_id) ?? 0) + 1);
  }

  let topId: string | null = null;
  let topCount = 0;
  for (const [id, count] of Array.from(tally.entries())) {
    if (count > topCount) {
      topId = id;
      topCount = count;
    }
  }

  let mostViewedTitle: string | null = null;
  if (topId) {
    const { data } = await supabase.from("ops_articles").select("title").eq("id", topId).maybeSingle();
    mostViewedTitle = (data as { title: string } | null)?.title ?? null;
  }

  return { totalArticles: totalArticles ?? 0, mostViewedTitle, mostViewedCount: topCount };
}
