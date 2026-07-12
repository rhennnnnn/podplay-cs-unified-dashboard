import { Suspense } from "react";

import { createClient } from "@/lib/supabase/server";
import type { Location, Profile } from "@/lib/types";
import { readSnapshot } from "@/lib/snapshot";
import { matchByCompanyName, type MrpRecord } from "@/lib/mrp";
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

  // Wire MRP hardware data into the tracker. Snapshot read only (<100ms per
  // CONTEXT.md Data flow) — never a live Sheets fetch on this page. Match each
  // location by name against the sheet's "Club" column via the existing
  // token-based matcher. A location with no match maps to null (rendered as the
  // manual delivery_date fallback or a red "missing" nudge in the table).
  const mrpSnapshot = await readSnapshot<MrpRecord[]>("mrp:records");
  const mrpRecords = mrpSnapshot?.data ?? [];
  const rows = (locations ?? []) as Location[];
  const mrpByLocation: Record<string, MrpRecord | null> = {};
  for (const loc of rows) {
    mrpByLocation[loc.id] = matchByCompanyName(loc.name, mrpRecords);
  }

  return (
    <Suspense>
      <ClientsTable
        initialLocations={rows}
        userEmail={userData.user?.email ?? ""}
        loginRoster={loginRoster}
        rosterMap={rosterMap}
        mrpByLocation={mrpByLocation}
      />
    </Suspense>
  );
}
