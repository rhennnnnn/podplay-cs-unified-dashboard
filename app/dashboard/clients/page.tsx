import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { ClientsTable } from "@/components/clients/clients-table";

export const dynamic = "force-dynamic";

export default async function ClientHubPage() {
  const supabase = createClient();
  const [{ data: locations, error }, { data: userData }, { data: profilesList }] = await Promise.all([
    supabase.from("locations").select("*").order("opening_date"),
    supabase.auth.getUser(),
    supabase.from("profiles").select("*"),
  ]);

  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        Failed to load clients: {error.message}
      </div>
    );
  }

  const profiles = (profilesList ?? []) as unknown as Profile[];
  const loginRoster = Array.from(new Set(profiles.map((p) => p.first_name))).sort();
  const rosterMap = Object.fromEntries(profiles.map((p) => [p.email, p.first_name]));

  return (
    <ClientsTable
      initialLocations={locations ?? []}
      userEmail={userData.user?.email ?? ""}
      loginRoster={loginRoster}
      rosterMap={rosterMap}
    />
  );
}
