import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { OnboardingGrid } from "@/components/onboarding/onboarding-grid";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const supabase = createClient();
  const [{ data: userData }, { data: locations }, { data: profilesList }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("locations").select("hubspot_deal_id").not("hubspot_deal_id", "is", null),
    supabase.from("profiles").select("*"),
  ]);

  const userEmail = userData.user?.email ?? "";
  // Same @supabase/ssr generic-collapsing typing defect documented in Session 2 —
  // `.select()` with a column list resolves to `never` regardless of the Database generic.
  const trackedLocations = (locations ?? []) as unknown as { hubspot_deal_id: string | null }[];
  const trackedDealIds = new Set(
    trackedLocations.map((l) => l.hubspot_deal_id).filter((id): id is string => Boolean(id))
  );

  const profiles = (profilesList ?? []) as unknown as Profile[];
  const trackerRoster = Array.from(new Set(profiles.map((p) => p.first_name))).sort();
  const trackerName = profiles.find((p) => p.email === userEmail)?.first_name ?? "";

  return (
    <OnboardingGrid
      userEmail={userEmail}
      trackerName={trackerName}
      trackerRoster={trackerRoster}
      trackedDealIds={trackedDealIds}
    />
  );
}
