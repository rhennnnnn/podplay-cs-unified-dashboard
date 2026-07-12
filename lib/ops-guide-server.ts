import { createClient } from "@/lib/supabase/server";

export interface MostViewedArticle {
  id: string;
  title: string;
  count: number;
}

export interface OpsGuideOverviewStats {
  totalArticles: number;
  mostViewed: MostViewedArticle[];
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

  const topIds = Array.from(tally.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id);

  let mostViewed: MostViewedArticle[] = [];
  if (topIds.length > 0) {
    const { data: articles } = await supabase.from("ops_articles").select("id, title").in("id", topIds);
    const titleById = new Map(((articles ?? []) as { id: string; title: string }[]).map((a) => [a.id, a.title]));
    mostViewed = topIds
      .map((id) => ({ id, title: titleById.get(id), count: tally.get(id) ?? 0 }))
      .filter((a): a is MostViewedArticle => Boolean(a.title));
  }

  return { totalArticles: totalArticles ?? 0, mostViewed };
}
