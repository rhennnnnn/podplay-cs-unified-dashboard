import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCallerProfile, requireAdmin } from "@/lib/permissions";
import { CATEGORY_COLOR_PRESETS } from "@/lib/ops-guide";
import type { OpsCategory } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET — every category, ordered for sidebar display. Any authenticated user.
export async function GET() {
  const caller = await getCallerProfile();
  if (!caller) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ops_categories")
    .select("id, name, display_order, color, created_at")
    .order("display_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ categories: data ?? [] });
}

// POST — create a category (admin only).
export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (res) {
    return res as Response;
  }

  const body = (await request.json()) as { name?: string; color?: string };
  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "Category name is required." }, { status: 400 });
  }
  const color = CATEGORY_COLOR_PRESETS.some((p) => p.key === body.color) ? body.color : undefined;

  const admin = createAdminClient();
  const { data: existing } = await admin.from("ops_categories").select("id").ilike("name", name).maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "A category with this name already exists." }, { status: 400 });
  }

  const { data: existingCategories } = await admin.from("ops_categories").select("display_order");
  const rows = (existingCategories ?? []) as unknown as OpsCategory[];
  const nextOrder = rows.reduce((max, c) => Math.max(max, c.display_order), 0) + 1;
  const nextColor = color ?? CATEGORY_COLOR_PRESETS[rows.length % CATEGORY_COLOR_PRESETS.length].key;

  const { data, error } = await admin
    .from("ops_categories")
    .insert({ name, display_order: nextOrder, color: nextColor } as never)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ category: data }, { status: 201 });
}
