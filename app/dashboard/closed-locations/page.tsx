import { createClient } from "@/lib/supabase/server";
import type { ClosedLocation } from "@/lib/types";
import { ClosedLocationsShell } from "@/components/closed-locations/closed-locations-shell";

export const dynamic = "force-dynamic";

export default async function ClosedLocationsPage() {
  const supabase = createClient();
  const [{ data: closures, error }, { data: userData }] = await Promise.all([
    supabase.from("closed_locations").select("*").order("close_date", { ascending: false }),
    supabase.auth.getUser(),
  ]);

  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        Failed to load closures: {error.message}
      </div>
    );
  }

  return (
    <ClosedLocationsShell
      initialClosures={(closures ?? []) as ClosedLocation[]}
      userEmail={userData.user?.email ?? ""}
    />
  );
}
