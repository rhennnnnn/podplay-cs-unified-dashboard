import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/types";

// Reads the caller's session from cookies (via lib/supabase/server.ts) and
// looks up their profile row with the service-role client so RLS on
// `profiles` never blocks this lookup.
export async function getCallerProfile(): Promise<Profile | null> {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return null;

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return (profile as unknown as Profile) ?? null;
}

export function isAdmin(profile: Profile | null): boolean {
  return profile?.role === "admin";
}

// Throws a 403 Response if the caller isn't an admin — callers should
// `return` the caught Response directly from their route handler.
export async function requireAdmin(): Promise<Profile> {
  const profile = await getCallerProfile();
  if (!isAdmin(profile)) {
    throw new Response(JSON.stringify({ error: "Admin access required." }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  return profile as Profile;
}
