import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCallerProfile } from "@/lib/permissions";
import { countCheckboxes } from "@/lib/ops-guide";
import type { OpsArticle, OpsArticleChecklistState } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET — the caller's own saved checklist progress for this article. Never
// shared across users.
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const caller = await getCallerProfile();
  if (!caller) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("ops_article_checklist_state")
    .select("checked_indexes")
    .eq("user_id", caller.id)
    .eq("article_id", params.id)
    .maybeSingle();

  const row = data as unknown as Pick<OpsArticleChecklistState, "checked_indexes"> | null;
  return NextResponse.json({ checked_indexes: row?.checked_indexes ?? [] });
}

// PUT — save the caller's checklist progress. If every step in the article
// is checked, the row is deleted instead of stored — next visit (by this
// user or anyone else) starts fresh, per the "reset when done" rule.
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const caller = await getCallerProfile();
  if (!caller) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = (await request.json()) as { checked_indexes?: number[] };
  const checkedIndexes = Array.isArray(body.checked_indexes) ? body.checked_indexes : [];

  const admin = createAdminClient();
  const { data: article } = await admin.from("ops_articles").select("content").eq("id", params.id).maybeSingle();
  const totalSteps = countCheckboxes((article as unknown as Pick<OpsArticle, "content"> | null)?.content ?? "");

  const isComplete = totalSteps > 0 && checkedIndexes.length >= totalSteps;

  if (isComplete || checkedIndexes.length === 0) {
    await admin
      .from("ops_article_checklist_state")
      .delete()
      .eq("user_id", caller.id)
      .eq("article_id", params.id);
    return NextResponse.json({ checked_indexes: [] });
  }

  const { error } = await admin
    .from("ops_article_checklist_state")
    .upsert(
      {
        user_id: caller.id,
        article_id: params.id,
        checked_indexes: checkedIndexes,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "user_id,article_id" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ checked_indexes: checkedIndexes });
}
