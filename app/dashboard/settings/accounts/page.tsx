import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/permissions";
import type { Profile } from "@/lib/types";
import { AccountsTable, type AccountRow } from "@/components/accounts/accounts-table";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const supabase = createClient();
  const admin = createAdminClient();

  const [{ data: userData }, { data: profilesList, error }, { data: usersData }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("profiles").select("*").order("created_at", { ascending: false }),
    admin.auth.admin.listUsers(),
  ]);

  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        Failed to load accounts: {error.message}
      </div>
    );
  }

  const profiles = (profilesList ?? []) as unknown as Profile[];
  const currentProfile = profiles.find((p) => p.email === userData.user?.email) ?? null;

  const lastSignInByEmail = new Map(
    (usersData?.users ?? []).map((u) => [u.email, u.last_sign_in_at ?? null])
  );
  const accounts: AccountRow[] = profiles.map((p) => ({
    ...p,
    last_sign_in_at: lastSignInByEmail.get(p.email) ?? null,
  }));

  return (
    <AccountsTable
      initialAccounts={accounts}
      currentProfileId={currentProfile?.id ?? ""}
      isAdmin={isAdmin(currentProfile)}
    />
  );
}
