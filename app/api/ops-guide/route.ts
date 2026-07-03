import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCallerProfile, requireAdmin } from "@/lib/permissions";
import type { OpsArticle } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET — every published article, list fields only (no content). Any authenticated user.
export async function GET() {
  const caller = await getCallerProfile();
  if (!caller) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ops_articles")
    .select("id, title, category, tags, created_by, updated_by, created_at, updated_at, published")
    .eq("published", true)
    .order("category", { ascending: true })
    .order("title", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ articles: data ?? [] });
}

interface CreateArticleBody {
  title: string;
  category: string;
  content: string;
  tags?: string[];
  published?: boolean;
}

// POST — create an article (admin only).
export async function POST(request: NextRequest) {
  let caller;
  try {
    caller = await requireAdmin();
  } catch (res) {
    return res as Response;
  }

  const body = (await request.json()) as Partial<CreateArticleBody>;
  const title = body.title?.trim();
  const category = body.category?.trim();
  const content = body.content?.trim();
  const tags = Array.isArray(body.tags) ? body.tags : [];
  const published = body.published ?? true;

  if (!title || !content) {
    return NextResponse.json({ error: "Title and content are required." }, { status: 400 });
  }
  if (!category) {
    return NextResponse.json({ error: "Category is required." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: categoryRow } = await admin.from("ops_categories").select("id").eq("name", category).maybeSingle();
  if (!categoryRow) {
    return NextResponse.json({ error: "Category not found." }, { status: 400 });
  }

  const payload: Partial<OpsArticle> = {
    title,
    category,
    content,
    tags,
    published,
    created_by: caller.email,
    updated_by: caller.email,
  };

  const { data, error } = await admin.from("ops_articles").insert(payload as never).select().single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ article: data }, { status: 201 });
}
