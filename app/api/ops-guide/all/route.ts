import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCallerProfile, isAdmin } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// GET — every article including hidden (published = false). Admin only.
// Used by the "Manage Article Visibility" dialog; the public grid still
// uses GET /api/ops-guide which returns only published articles.
export async function GET() {
  const caller = await getCallerProfile();
  if (!isAdmin(caller)) {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ops_articles")
    .select("id, title, category, tags, created_by, updated_by, created_at, updated_at, published")
    .order("category", { ascending: true })
    .order("title", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ articles: data ?? [] });
}
