import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// DELETE — admin only, cannot delete own account. Cascades to profiles via FK.
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  let caller;
  try {
    caller = await requireAdmin();
  } catch (res) {
    return res as Response;
  }

  if (caller.id === params.id) {
    return NextResponse.json({ error: "Cannot delete your own account." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(params.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
