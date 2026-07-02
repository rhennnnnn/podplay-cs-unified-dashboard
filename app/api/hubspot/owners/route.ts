import { NextResponse } from "next/server";

import { hubspotFetch, withCache, type HubspotOwner } from "@/lib/hubspot";

export const dynamic = "force-dynamic";

interface OwnersResponse {
  results: { id: string; firstName: string; lastName: string; email: string }[];
}

export async function GET() {
  try {
    // Owner roster changes rarely — cache generously across every concurrent user.
    const owners = await withCache("owners", 10 * 60_000, async () => {
      const data = await hubspotFetch<OwnersResponse>("/crm/v3/owners?limit=100");
      return data.results.map(
        (o): HubspotOwner => ({
          id: o.id,
          firstName: o.firstName ?? "",
          lastName: o.lastName ?? "",
          email: o.email ?? "",
        })
      );
    });
    return NextResponse.json({ owners });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load owners." },
      { status: 502 }
    );
  }
}
