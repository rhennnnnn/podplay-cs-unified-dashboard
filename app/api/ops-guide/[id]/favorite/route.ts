import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCallerProfile } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// POST — favorite this article for the caller.
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const caller = await getCallerProfile();
  if (!caller) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("ops_article_favorites")
    .upsert({ user_id: caller.id, article_id: params.id } as never, { onConflict: "user_id,article_id" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ favorited: true });
}

// DELETE — unfavorite this article for the caller.
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const caller = await getCallerProfile();
  if (!caller) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("ops_article_favorites")
    .delete()
    .eq("user_id", caller.id)
    .eq("article_id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ favorited: false });
}
