import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { nameFromEmail } from "@/lib/client-hub";
import { OnboardingGrid } from "@/components/onboarding/onboarding-grid";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const supabase = createClient();
  const admin = createAdminClient();
  const [{ data: userData }, { data: locations }, { data: usersData }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("locations").select("hubspot_deal_id").not("hubspot_deal_id", "is", null),
    admin.auth.admin.listUsers(),
  ]);

  const userEmail = userData.user?.email ?? "";
  // Same @supabase/ssr generic-collapsing typing defect documented in Session 2 —
  // `.select()` with a column list resolves to `never` regardless of the Database generic.
  const trackedLocations = (locations ?? []) as unknown as { hubspot_deal_id: string | null }[];
  const trackedDealIds = new Set(
    trackedLocations.map((l) => l.hubspot_deal_id).filter((id): id is string => Boolean(id))
  );

  const trackerRoster = Array.from(
    new Set((usersData?.users ?? []).map((u) => u.email).filter((e): e is string => Boolean(e)).map(nameFromEmail))
  ).sort();

  return (
    <OnboardingGrid
      userEmail={userEmail}
      trackerName={userEmail ? nameFromEmail(userEmail) : ""}
      trackerRoster={trackerRoster}
      trackedDealIds={trackedDealIds}
    />
  );
}
