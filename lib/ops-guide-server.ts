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

  // All viewed article ids, most-viewed first.
  const rankedIds = Array.from(tally.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);

  let mostViewed: MostViewedArticle[] = [];
  if (rankedIds.length > 0) {
    // Only published articles are eligible — an article whose visibility was
    // removed must not surface here. Filter to published, then take the top 5.
    const { data: articles } = await supabase
      .from("ops_articles")
      .select("id, title")
      .eq("published", true)
      .in("id", rankedIds);
    const titleById = new Map(((articles ?? []) as { id: string; title: string }[]).map((a) => [a.id, a.title]));
    mostViewed = rankedIds
      .filter((id) => titleById.has(id))
      .slice(0, 5)
      .map((id) => ({ id, title: titleById.get(id)!, count: tally.get(id) ?? 0 }));
  }

  return { totalArticles: totalArticles ?? 0, mostViewed };
}
