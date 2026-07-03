import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"];

// POST — upload an image for use in article markdown (admin only). Returns
// the public URL to insert as ![alt](url).
export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (res) {
    return res as Response;
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Only PNG, JPEG, GIF, WEBP, or SVG images are allowed." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image must be under 5MB." }, { status: 400 });
  }

  const admin = createAdminClient();
  const extension = file.name.split(".").pop() || "png";
  const path = `${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await admin.storage
    .from("ops-guide-images")
    .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: publicUrlData } = admin.storage.from("ops-guide-images").getPublicUrl(path);
  return NextResponse.json({ url: publicUrlData.publicUrl });
}
