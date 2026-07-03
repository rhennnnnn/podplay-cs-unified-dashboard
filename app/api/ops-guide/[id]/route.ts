import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCallerProfile, requireAdmin } from "@/lib/permissions";
import { OPS_ARTICLE_CATEGORIES } from "@/lib/types";
import type { OpsArticle } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET — full article including content. Any authenticated user.
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const caller = await getCallerProfile();
  if (!caller) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.from("ops_articles").select("*").eq("id", params.id).maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Article not found." }, { status: 404 });
  }

  return NextResponse.json({ article: data });
}

interface PatchArticleBody {
  title?: string;
  category?: string;
  content?: string;
  tags?: string[];
  published?: boolean;
}

// PATCH — update an article (admin only).
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  let caller;
  try {
    caller = await requireAdmin();
  } catch (res) {
    return res as Response;
  }

  const body = (await request.json()) as PatchArticleBody;

  if (body.category !== undefined && !OPS_ARTICLE_CATEGORIES.includes(body.category as (typeof OPS_ARTICLE_CATEGORIES)[number])) {
    return NextResponse.json({ error: "Category must be one of the four OPS Guide categories." }, { status: 400 });
  }
  if (body.title !== undefined && !body.title.trim()) {
    return NextResponse.json({ error: "Title cannot be empty." }, { status: 400 });
  }
  if (body.content !== undefined && !body.content.trim()) {
    return NextResponse.json({ error: "Content cannot be empty." }, { status: 400 });
  }

  const updates: Partial<OpsArticle> = { updated_by: caller.email, updated_at: new Date().toISOString() };
  if (body.title !== undefined) updates.title = body.title.trim();
  if (body.category !== undefined) updates.category = body.category;
  if (body.content !== undefined) updates.content = body.content.trim();
  if (body.tags !== undefined) updates.tags = body.tags;
  if (body.published !== undefined) updates.published = body.published;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ops_articles")
    .update(updates as never)
    .eq("id", params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ article: data });
}

// DELETE — hard delete (admin only).
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
  } catch (res) {
    return res as Response;
  }

  const admin = createAdminClient();
  const { error } = await admin.from("ops_articles").delete().eq("id", params.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
