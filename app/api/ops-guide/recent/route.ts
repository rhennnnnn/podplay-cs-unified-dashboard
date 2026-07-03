import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCallerProfile } from "@/lib/permissions";
import type { OpsArticleStub } from "@/lib/types";

export const dynamic = "force-dynamic";

const RECENT_LIMIT = 8;

// GET — the caller's last N distinct viewed articles, newest first.
export async function GET() {
  const caller = await getCallerProfile();
  if (!caller) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: views, error } = await admin
    .from("ops_article_views")
    .select("article_id, viewed_at")
    .eq("user_id", caller.id)
    .order("viewed_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const orderedIds: string[] = [];
  const seen = new Set<string>();
  for (const view of (views ?? []) as unknown as { article_id: string }[]) {
    if (!seen.has(view.article_id)) {
      seen.add(view.article_id);
      orderedIds.push(view.article_id);
    }
    if (orderedIds.length >= RECENT_LIMIT) break;
  }

  if (orderedIds.length === 0) {
    return NextResponse.json({ articles: [] });
  }

  const { data: articles, error: articlesError } = await admin
    .from("ops_articles")
    .select("id, title, category, tags, created_by, updated_by, created_at, updated_at, published")
    .in("id", orderedIds);

  if (articlesError) {
    return NextResponse.json({ error: articlesError.message }, { status: 500 });
  }

  const byId = new Map(((articles ?? []) as unknown as OpsArticleStub[]).map((a) => [a.id, a]));
  const ordered = orderedIds.map((id) => byId.get(id)).filter((a): a is OpsArticleStub => Boolean(a));

  return NextResponse.json({ articles: ordered });
}
