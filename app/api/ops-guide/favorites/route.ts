import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCallerProfile } from "@/lib/permissions";
import type { OpsArticleStub } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET — the caller's favorited articles, newest favorite first.
export async function GET() {
  const caller = await getCallerProfile();
  if (!caller) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: favorites, error } = await admin
    .from("ops_article_favorites")
    .select("article_id")
    .eq("user_id", caller.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const articleIds = (favorites ?? []).map((f) => (f as unknown as { article_id: string }).article_id);
  if (articleIds.length === 0) {
    return NextResponse.json({ articles: [] });
  }

  const { data: articles, error: articlesError } = await admin
    .from("ops_articles")
    .select("id, title, category, tags, created_by, updated_by, created_at, updated_at, published")
    .in("id", articleIds);

  if (articlesError) {
    return NextResponse.json({ error: articlesError.message }, { status: 500 });
  }

  const byId = new Map(((articles ?? []) as unknown as OpsArticleStub[]).map((a) => [a.id, a]));
  const ordered = articleIds.map((id) => byId.get(id)).filter((a): a is OpsArticleStub => Boolean(a));

  return NextResponse.json({ articles: ordered });
}
