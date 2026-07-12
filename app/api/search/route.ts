import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCallerProfile } from "@/lib/permissions";
import { readSnapshot } from "@/lib/snapshot";
import { PIPELINE_SNAPSHOT_KEY, type PipelineDeals } from "@/lib/onboarding-deals";
import type { Location } from "@/lib/types";
import type { OnboardingListItem } from "@/components/onboarding/onboarding-types";

export const dynamic = "force-dynamic";

export interface GlobalSearchResult {
  id: string;
  label: string;
  sublabel: string;
  module: "tracker" | "onboarding" | "ops-guide";
  href: string;
}

const MAX_RESULTS = 8;

// GET ?q= — one flat, ranked list across the three modules. Tracker rows come
// from Postgres; HubSpot onboarding matches read the existing DB snapshot (never
// a live HubSpot call, per the snapshot-cache pattern); OPS Guide matches are a
// published-title ILIKE. Capped at 8, prefix matches ranked first.
export async function GET(request: NextRequest) {
  const caller = await getCallerProfile();
  if (!caller) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ results: [] });
  }
  const needle = q.toLowerCase();

  const supabase = createClient();
  const admin = createAdminClient();

  const [locResp, opsResp, basicSnap, proSnap] = await Promise.all([
    supabase.from("locations").select("id, name, client_name, tracker"),
    admin
      .from("ops_articles")
      .select("id, title")
      .eq("published", true)
      .ilike("title", `%${q}%`)
      .limit(MAX_RESULTS),
    readSnapshot<PipelineDeals>(PIPELINE_SNAPSHOT_KEY.basic),
    readSnapshot<PipelineDeals>(PIPELINE_SNAPSHOT_KEY.pro),
  ]);

  const results: GlobalSearchResult[] = [];

  // Tracker — match client_name / name / tracker substring (same fields
  // clients-table.tsx already searches over).
  const locations = (locResp.data ?? []) as unknown as Pick<
    Location,
    "id" | "name" | "client_name" | "tracker"
  >[];
  for (const loc of locations) {
    const hay = [loc.client_name, loc.name, loc.tracker].filter(Boolean).join(" ").toLowerCase();
    if (!hay.includes(needle)) continue;
    const label = [loc.client_name, loc.name].filter(Boolean).join(" — ") || loc.name || loc.id;
    const nameForHref = loc.client_name || loc.name || "";
    results.push({
      id: `tracker:${loc.id}`,
      label,
      sublabel: "Client Opening Tracker",
      module: "tracker",
      href: `/dashboard/clients?q=${encodeURIComponent(nameForHref)}`,
    });
  }

  // HubSpot onboarding — from the cached snapshot only.
  const deals: OnboardingListItem[] = [
    ...(basicSnap?.data.deals ?? []),
    ...(proSnap?.data.deals ?? []),
  ];
  for (const d of deals) {
    const name = d.properties.hs_name ?? d.company?.name ?? "";
    const hay = [d.properties.hs_name, d.company?.name, d.contact?.name]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!hay.includes(needle)) continue;
    results.push({
      id: `onboarding:${d.id}`,
      label: name || d.id,
      sublabel: "HubSpot Onboarding",
      module: "onboarding",
      href: `/dashboard/onboarding?q=${encodeURIComponent(name)}`,
    });
  }

  // OPS Guide — published title match.
  const articles = (opsResp.data ?? []) as unknown as { id: string; title: string }[];
  for (const a of articles) {
    results.push({
      id: `ops:${a.id}`,
      label: a.title,
      sublabel: "OPS Guide",
      module: "ops-guide",
      href: `/dashboard/ops-guide?article=${a.id}`,
    });
  }

  // Prefix matches first, then tighter (shorter) labels.
  const ranked = results
    .sort((a, b) => {
      const ap = a.label.toLowerCase().startsWith(needle) ? 0 : 1;
      const bp = b.label.toLowerCase().startsWith(needle) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return a.label.length - b.label.length;
    })
    .slice(0, MAX_RESULTS);

  return NextResponse.json({ results: ranked });
}
