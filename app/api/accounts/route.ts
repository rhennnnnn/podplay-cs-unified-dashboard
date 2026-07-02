import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCallerProfile, isAdmin, requireAdmin } from "@/lib/permissions";
import type { Profile, ProfileRole } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET — list all profiles, admin only, joined with last_sign_in_at from auth.users.
export async function GET() {
  try {
    await requireAdmin();
  } catch (res) {
    return res as Response;
  }

  const admin = createAdminClient();
  const [{ data: profiles, error }, { data: usersData }] = await Promise.all([
    admin.from("profiles").select("*").order("created_at", { ascending: false }),
    admin.auth.admin.listUsers(),
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const lastSignInByEmail = new Map(
    (usersData?.users ?? []).map((u) => [u.email, u.last_sign_in_at ?? null])
  );

  const rows = ((profiles ?? []) as unknown as Profile[]).map((p) => ({
    ...p,
    last_sign_in_at: lastSignInByEmail.get(p.email) ?? null,
  }));

  return NextResponse.json({ accounts: rows });
}

interface CreateAccountBody {
  email: string;
  first_name: string;
  last_name: string;
  password: string;
  role: ProfileRole;
}

// POST — create a new account. Any authenticated user may create a
// @podplay.app default account; admins may create any domain and any role.
export async function POST(request: NextRequest) {
  const caller = await getCallerProfile();
  if (!caller) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = (await request.json()) as Partial<CreateAccountBody>;
  const email = body.email?.trim().toLowerCase();
  const first_name = body.first_name?.trim();
  const last_name = body.last_name?.trim();
  const password = body.password;
  const role: ProfileRole = body.role === "admin" ? "admin" : "default";

  if (!email || !first_name || !last_name || !password) {
    return NextResponse.json(
      { error: "Email, first name, last name, and password are required." },
      { status: 400 }
    );
  }

  const callerIsAdmin = isAdmin(caller);

  if (!callerIsAdmin && !email.endsWith("@podplay.app")) {
    return NextResponse.json(
      { error: "Only @podplay.app addresses are allowed." },
      { status: 400 }
    );
  }

  if (!callerIsAdmin && role === "admin") {
    return NextResponse.json(
      { error: "Only admins can create admin accounts." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: existingEmail } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .maybeSingle();
  if (existingEmail) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 400 });
  }

  const { data: existingName } = await admin
    .from("profiles")
    .select("id")
    .ilike("first_name", first_name)
    .maybeSingle();
  if (existingName) {
    return NextResponse.json(
      { error: "An account with this first name already exists." },
      { status: 400 }
    );
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name, last_name },
  });
  if (createError || !created.user) {
    return NextResponse.json(
      { error: createError?.message ?? "Failed to create account." },
      { status: 400 }
    );
  }

  const profilePayload = {
    id: created.user.id,
    email,
    first_name,
    last_name,
    role,
    created_by: caller.email,
  };
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .insert(profilePayload as never)
    .select()
    .single();

  if (profileError) {
    // Roll back the auth user so we don't leave an orphaned login with no profile.
    await admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  return NextResponse.json({ account: profile }, { status: 201 });
}
