import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
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

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <DashboardSidebar email={data.user.email ?? ""} isAdmin={isAdminUser} />
      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardTopbar />
        <main className="flex-1 overflow-y-auto bg-background p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
