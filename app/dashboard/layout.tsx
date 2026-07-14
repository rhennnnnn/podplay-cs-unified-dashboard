import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { DashboardTopbar } from "@/components/dashboard-topbar";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect("/login");
  }

  // Valid Supabase Auth credentials aren't enough — only accounts with a
  // profiles row are allowed in. Anyone whose profile was deleted (or who
  // never got one) is signed out here rather than left in a half-authed
  // dashboard session.
  const { data: profile } = await supabase.from("profiles").select("id, role").eq("id", data.user!.id).maybeSingle();
  if (!profile) {
    await supabase.auth.signOut();
    redirect("/login?error=no_access");
  }
  const isAdminUser = (profile as unknown as { role: string } | null)?.role === "admin";

  // Record real dashboard activity for the Team "Last seen" column. Supabase
  // only bumps auth.last_sign_in_at on an explicit sign-in, so a persisted
  // session that keeps refreshing silently looks stale. We stamp last_active_at
  // on dashboard load, throttled to at most once per 5 min per user so we don't
  // write on every navigation. This is fully isolated from the auth gate above
  // (its own admin-client query, wrapped in try/catch) so a missing column or
  // any failure can never block sign-in. The admin client is required because
  // RLS only lets admins write to profiles.
  const ACTIVITY_THROTTLE_MS = 5 * 60 * 1000;
  try {
    const admin = createAdminClient();
    const { data: activity } = await admin
      .from("profiles")
      .select("last_active_at")
      .eq("id", data.user!.id)
      .maybeSingle();
    const lastActive = (activity as unknown as { last_active_at: string | null } | null)?.last_active_at ?? null;
    if (!lastActive || Date.now() - new Date(lastActive).getTime() > ACTIVITY_THROTTLE_MS) {
      await admin
        .from("profiles")
        .update({ last_active_at: new Date().toISOString() } as never)
        .eq("id", data.user!.id);
    }
  } catch {
    // Best-effort activity tracking — never breaks the dashboard.
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden md:flex-row">
      <DashboardSidebar email={data.user.email ?? ""} isAdmin={isAdminUser} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <DashboardTopbar />
        <main className="min-h-0 flex-1 overflow-y-auto bg-background p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
