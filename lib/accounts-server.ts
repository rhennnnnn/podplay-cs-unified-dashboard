import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile, ProfileRole } from "@/lib/types";

// Every row here is a real Supabase Auth login (can sign in today),
// left-joined against `profiles`. `hasProfile: false` means the login
// predates profiles, or was created outside the Team UI — it can still
// sign in via Supabase Auth, but app/dashboard/layout.tsx bounces it back
// to /login until an admin adds it here.
export interface AccountRow {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: ProfileRole | null;
  created_by: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  hasProfile: boolean;
}

export async function listAllAccounts(): Promise<AccountRow[]> {
  const admin = createAdminClient();
  const [{ data: profilesList }, { data: usersData }] = await Promise.all([
    admin.from("profiles").select("*"),
    admin.auth.admin.listUsers(),
  ]);

  const profiles = (profilesList ?? []) as unknown as Profile[];
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  const rows: AccountRow[] = (usersData?.users ?? []).map((u) => {
    const profile = profileById.get(u.id);
    return {
      id: u.id,
      email: u.email ?? profile?.email ?? "(no email)",
      first_name: profile?.first_name ?? null,
      last_name: profile?.last_name ?? null,
      role: profile?.role ?? null,
      created_by: profile?.created_by ?? null,
      created_at: profile?.created_at ?? u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      hasProfile: Boolean(profile),
    };
  });

  return rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}
