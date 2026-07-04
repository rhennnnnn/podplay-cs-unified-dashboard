import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/permissions";
import { CATEGORY_COLOR_PRESETS } from "@/lib/ops-guide";
import type { OpsCategory } from "@/lib/types";

export const dynamic = "force-dynamic";

interface PatchCategoryBody {
  name?: string;
  display_order?: number;
  color?: string;
}

// PATCH — rename and/or reorder a category (admin only). Renaming cascades
// to every ops_articles row using the old name so category filtering/search
// keeps working without a join.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
  } catch (res) {
    return res as Response;
  }

  const body = (await request.json()) as PatchCategoryBody;
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("ops_categories")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  const existingCategory = existing as unknown as OpsCategory | null;
  if (!existingCategory) {
    return NextResponse.json({ error: "Category not found." }, { status: 404 });
  }

  const updates: Partial<OpsCategory> = {};
  const newName = body.name?.trim();

  if (newName && newName !== existingCategory.name) {
    const { data: nameTaken } = await admin
      .from("ops_categories")
      .select("id")
      .ilike("name", newName)
      .neq("id", params.id)
      .maybeSingle();
    if (nameTaken) {
      return NextResponse.json({ error: "A category with this name already exists." }, { status: 400 });
    }
    updates.name = newName;
  }

  if (body.display_order !== undefined) {
    updates.display_order = body.display_order;
  }

  if (body.color !== undefined) {
    if (!CATEGORY_COLOR_PRESETS.some((p) => p.key === body.color)) {
      return NextResponse.json({ error: "Invalid color." }, { status: 400 });
    }
    updates.color = body.color;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ category: existingCategory });
  }

  const { data: updated, error } = await admin
    .from("ops_categories")
    .update(updates as never)
    .eq("id", params.id)
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (updates.name) {
    await admin.from("ops_articles").update({ category: updates.name } as never).eq("category", existingCategory.name);
  }

  return NextResponse.json({ category: updated });
}

// DELETE — admin only, blocked while any article still uses this category.
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
  } catch (res) {
    return res as Response;
  }

  const admin = createAdminClient();
  const { data: category } = await admin.from("ops_categories").select("name").eq("id", params.id).maybeSingle();
  const categoryName = (category as unknown as { name: string } | null)?.name;
  if (!categoryName) {
    return NextResponse.json({ error: "Category not found." }, { status: 404 });
  }

  const { count } = await admin
    .from("ops_articles")
    .select("id", { count: "exact", head: true })
    .eq("category", categoryName);
  if (count && count > 0) {
    return NextResponse.json(
      { error: `${count} article${count === 1 ? "" : "s"} still use this category — move them first.` },
      { status: 400 }
    );
  }

  const { error } = await admin.from("ops_categories").delete().eq("id", params.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
