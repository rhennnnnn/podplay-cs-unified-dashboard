import { NextRequest, NextResponse } from "next/server";
import { createRequire } from "module";
import mammoth from "mammoth";
import TurndownService from "turndown";

import { requireAdmin } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// pdf-parse is CJS-only and its default-export interop breaks under Next's
// webpack bundling for route handlers — require() sidesteps that entirely.
const pdfParse = createRequire(import.meta.url)("pdf-parse") as (
  buffer: Buffer
) => Promise<{ text: string }>;

const turndown = new TurndownService({ headingStyle: "atx" });

function suggestedTitleFromFilename(filename: string): string {
  return filename.replace(/\.(docx|pdf)$/i, "").replace(/[-_]+/g, " ").trim();
}

// PDF text extraction has no structure info — split on blank lines into
// paragraphs so the import at least isn't one giant unbroken block.
function pdfTextToMarkdown(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => block.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}

// POST — convert an uploaded .docx or .pdf to markdown (admin only). Does
// NOT write to ops_articles — the admin still titles/categorizes/tags it
// in the New Article dialog before saving.
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

  const buffer = Buffer.from(await file.arrayBuffer());
  const suggestedTitle = suggestedTitleFromFilename(file.name);

  try {
    if (file.name.toLowerCase().endsWith(".docx")) {
      const { value: html } = await mammoth.convertToHtml({ buffer });
      const markdown = turndown.turndown(html);
      return NextResponse.json({ suggestedTitle, markdown });
    }

    if (file.name.toLowerCase().endsWith(".pdf")) {
      const { text } = await pdfParse(buffer);
      const markdown = pdfTextToMarkdown(text);
      return NextResponse.json({ suggestedTitle, markdown });
    }

    return NextResponse.json({ error: "Only .docx and .pdf files are supported." }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to convert file." },
      { status: 500 }
    );
  }
}
