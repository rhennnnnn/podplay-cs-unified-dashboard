import { NextResponse } from "next/server";

import { PIPELINE_MAP } from "@/lib/hubspot";

export const dynamic = "force-dynamic";

// Pipelines rarely change — the shape is served from the in-code constant
// (see lib/hubspot.ts) rather than re-fetched from HubSpot on every request.
export async function GET() {
  return NextResponse.json({ pipelines: Object.values(PIPELINE_MAP) });
}
