import { createAdminClient } from "@/lib/supabase/admin";
import { getCallerProfile, isAdmin } from "@/lib/permissions";
import type { OpsArticleStub } from "@/lib/types";
import { OpsGuideShell } from "@/components/ops-guide/ops-guide-shell";

export const dynamic = "force-dynamic";

export default async function OpsGuidePage() {
  const caller = await getCallerProfile();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ops_articles")
    .select("id, title, category, tags, created_by, updated_by, created_at, updated_at, published")
    .eq("published", true)
    .order("category", { ascending: true })
    .order("title", { ascending: true });

  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        Failed to load OPS Guide: {error.message}
      </div>
    );
  }

  return <OpsGuideShell initialArticles={(data ?? []) as unknown as OpsArticleStub[]} isAdmin={isAdmin(caller)} />;
}
