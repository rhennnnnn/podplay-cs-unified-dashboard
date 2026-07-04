import { redirect } from "next/navigation";

import { getCallerProfile, isAdmin } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ApiIntegration } from "@/lib/types";
import { ApiHealthShell } from "@/components/api-health/api-health-shell";

export const dynamic = "force-dynamic";

export default async function ApiHealthPage() {
  const profile = await getCallerProfile();
  if (!isAdmin(profile)) {
    redirect("/dashboard");
  }

  const admin = createAdminClient();
  const { data } = await admin.from("api_integrations").select("*").order("id");
  const integrations = (data ?? []) as unknown as ApiIntegration[];

  return <ApiHealthShell initialIntegrations={integrations} />;
}
