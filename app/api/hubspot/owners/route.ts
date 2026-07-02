import { NextResponse } from "next/server";

import { hubspotFetch, type HubspotOwner } from "@/lib/hubspot";

export const dynamic = "force-dynamic";

interface OwnersResponse {
  results: { id: string; firstName: string; lastName: string; email: string }[];
}

export async function GET() {
  try {
    const data = await hubspotFetch<OwnersResponse>("/crm/v3/owners?limit=100");
    const owners: HubspotOwner[] = data.results.map((o) => ({
      id: o.id,
      firstName: o.firstName ?? "",
      lastName: o.lastName ?? "",
      email: o.email ?? "",
    }));
    return NextResponse.json({ owners });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load owners." },
      { status: 502 }
    );
  }
}
