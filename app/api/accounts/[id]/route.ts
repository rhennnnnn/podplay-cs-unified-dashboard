import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCallerProfile, isAdmin, requireAdmin } from "@/lib/permissions";
import type { Profile, ProfileRole } from "@/lib/types";

export const dynamic = "force-dynamic";

interface PatchBody {
  first_name?: string;
  last_name?: string;
  role?: ProfileRole;
}

// PATCH — edit a profile's name (self or admin) and/or role (admin only).
// If the target auth user has no profiles row yet (a login that predates
// Session 4, or was created directly in Supabase), an admin editing it
// creates the row instead of updating one — this is how an existing login
// gets "added to Team."
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const caller = await getCallerProfile();
  if (!caller) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const isSelf = caller.id === params.id;
  const callerIsAdmin = isAdmin(caller);
  if (!isSelf && !callerIsAdmin) {
    return NextResponse.json({ error: "Not allowed to edit this account." }, { status: 403 });
  }

  const body = (await request.json()) as PatchBody;
  const first_name = body.first_name?.trim();
  const last_name = body.last_name?.trim();
  const roleRequested = body.role;

  if (roleRequested !== undefined && !callerIsAdmin) {
    return NextResponse.json({ error: "Only admins can change roles." }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("profiles")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  const existingProfile = existing as unknown as Profile | null;

  async function firstNameTaken(name: string) {
    const { data } = await admin
      .from("profiles")
      .select("id")
      .ilike("first_name", name)
      .neq("id", params.id)
      .maybeSingle();
    return Boolean(data);
  }

  // No profile yet — admin-only "add to Team" for an existing auth login.
  if (!existingProfile) {
    if (!callerIsAdmin) {
      return NextResponse.json({ error: "This account isn't on the Team yet — ask an admin to add it." }, { status: 403 });
    }
    if (!first_name || !last_name) {
      return NextResponse.json({ error: "First and last name are required." }, { status: 400 });
    }
    if (await firstNameTaken(first_name)) {
      return NextResponse.json({ error: "An account with this first name already exists." }, { status: 400 });
    }

    const { data: targetUser, error: getUserError } = await admin.auth.admin.getUserById(params.id);
    if (getUserError || !targetUser.user?.email) {
      return NextResponse.json({ error: "Login not found." }, { status: 404 });
    }

    const role: ProfileRole = roleRequested === "admin" ? "admin" : "default";
    const { data: created, error } = await admin
      .from("profiles")
      .insert({
        id: params.id,
        email: targetUser.user.email,
        first_name,
        last_name,
        role,
        created_by: caller.email,
      } as never)
      .select()
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await admin.from("activity_log").insert({
      user_email: caller.email,
      action: "created",
      entity: `profile:${params.id}`,
      details: `Added ${first_name} ${last_name} to Team`,
    } as never);

    return NextResponse.json({ account: created });
  }

  // Existing profile — apply only the fields that actually changed.
  const updates: Partial<Profile> = {};

  if (first_name && first_name !== existingProfile.first_name) {
    if (await firstNameTaken(first_name)) {
      return NextResponse.json({ error: "An account with this first name already exists." }, { status: 400 });
    }
    updates.first_name = first_name;
  }
  if (last_name && last_name !== existingProfile.last_name) {
    updates.last_name = last_name;
  }

  if (roleRequested !== undefined) {
    const role: ProfileRole = roleRequested === "admin" ? "admin" : "default";
    if (role !== existingProfile.role) {
      if (existingProfile.role === "admin" && role === "default") {
        const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin");
        if ((admins?.length ?? 0) <= 1) {
          return NextResponse.json({ error: "Cannot remove the last admin." }, { status: 400 });
        }
      }
      updates.role = role;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ account: existingProfile });
  }

  const { data: updated, error } = await admin
    .from("profiles")
    .update(updates as never)
    .eq("id", params.id)
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const changeDesc = Object.entries(updates)
    .map(([key, value]) => `${key} → ${value}`)
    .join(", ");
  await admin.from("activity_log").insert({
    user_email: caller.email,
    action: "updated",
    entity: `profile:${params.id}`,
    details: `Profile updated (${changeDesc})`,
  } as never);

  return NextResponse.json({ account: updated });
}

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
