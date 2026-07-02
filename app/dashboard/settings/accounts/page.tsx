import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/permissions";
import { listAllAccounts, type AccountRow } from "@/lib/accounts-server";
import type { Profile } from "@/lib/types";
import { AccountsTable } from "@/components/accounts/accounts-table";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();

  const { data: profilesList } = await supabase.from("profiles").select("*");
  const profiles = (profilesList ?? []) as unknown as Profile[];
  const currentProfile = profiles.find((p) => p.email === userData.user?.email) ?? null;
  const callerIsAdmin = isAdmin(currentProfile);

  // Only admins see every Supabase Auth login (including ones without a
  // profiles row yet) — everyone else sees just the Team roster.
  let accounts: AccountRow[];
  if (callerIsAdmin) {
    accounts = await listAllAccounts();
  } else {
    accounts = profiles
      .map((p) => ({
        id: p.id,
        email: p.email,
        first_name: p.first_name,
        last_name: p.last_name,
        role: p.role,
        created_by: p.created_by,
        created_at: p.created_at,
        last_sign_in_at: null,
        hasProfile: true,
      }))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  return (
    <AccountsTable
      initialAccounts={accounts}
      currentProfileId={currentProfile?.id ?? ""}
      isAdmin={callerIsAdmin}
    />
  );
}
