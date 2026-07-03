import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCallerProfile } from "@/lib/permissions";
import type { OpsArticle } from "@/lib/types";

export const dynamic = "force-dynamic";

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function buildExcerpt(content: string, query: string): string {
  const plain = stripHtml(content);
  const lower = plain.toLowerCase();
  const firstTerm = query.toLowerCase().split(/\s+/)[0];
  const idx = firstTerm ? lower.indexOf(firstTerm) : -1;
  if (idx === -1) return plain.slice(0, 160);
  const start = Math.max(0, idx - 40);
  return `${start > 0 ? "…" : ""}${plain.slice(start, start + 160)}…`;
}

// GET ?q=text&category=optional — Postgres full-text search over published
// articles' search_vector (generated from title + content). Returns stubs
// with a plain-text excerpt, not full content.
export async function GET(request: NextRequest) {
  const caller = await getCallerProfile();
  if (!caller) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim();
  const category = request.nextUrl.searchParams.get("category")?.trim();

  if (!q) {
    return NextResponse.json({ articles: [] });
  }

  const admin = createAdminClient();
  let query = admin
    .from("ops_articles")
    .select("id, title, category, content, tags, created_by, updated_by, created_at, updated_at, published")
    .eq("published", true)
    .textSearch("search_vector", q, { type: "websearch", config: "english" });

  if (category) {
    query = query.eq("category", category);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Upstream Supabase typing defect collapses chained query builders to `never`.
  let rows = (data ?? []) as unknown as OpsArticle[];

  // websearch_to_tsquery is conservative on very short/typo/partial queries —
  // fall back to a plain substring match so those still return something.
  if (rows.length === 0) {
    let fallback = admin
      .from("ops_articles")
      .select("id, title, category, content, tags, created_by, updated_by, created_at, updated_at, published")
      .eq("published", true)
      .or(`title.ilike.%${q}%,content.ilike.%${q}%`);
    if (category) {
      fallback = fallback.eq("category", category);
    }
    const { data: fallbackData } = await fallback;
    rows = (fallbackData ?? []) as unknown as OpsArticle[];
  }

  // supabase-js can't ORDER BY ts_rank against the weighted search_vector, so
  // title matches are promoted here instead — this is what actually makes
  // the "title outranks body" weighting meaningful to the user.
  const lowerQ = q.toLowerCase();
  const sorted = [...rows].sort((a, b) => {
    const aTitle = a.title.toLowerCase().includes(lowerQ) ? 0 : 1;
    const bTitle = b.title.toLowerCase().includes(lowerQ) ? 0 : 1;
    return aTitle - bTitle;
  });

  const articles = sorted.map((article) => ({
    id: article.id,
    title: article.title,
    category: article.category,
    tags: article.tags,
    created_by: article.created_by,
    updated_by: article.updated_by,
    created_at: article.created_at,
    updated_at: article.updated_at,
    published: article.published,
    excerpt: buildExcerpt(article.content, q),
  }));

  return NextResponse.json({ articles });
}
