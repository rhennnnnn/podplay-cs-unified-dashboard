import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types";

// Service-role client for server-only admin operations (e.g. listing auth users,
// or writing to tables without an authenticated user session). Never import this
// from a client component.
//
// `global.fetch` is overridden to force `cache: "no-store"` — Next.js's App
// Router patches the global `fetch` to cache GET requests by default even
// inside route handlers, which silently cached this client's REST reads
// (discovered live: an admin toggle to api_integrations wrote correctly but
// shouldAllowPoll() kept reading the pre-toggle value from a stale cached
// response to the identical Supabase REST URL). Every read through this
// client must always be live.
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: (url, init) => fetch(url, { ...init, cache: "no-store" }) },
    }
  );
}
