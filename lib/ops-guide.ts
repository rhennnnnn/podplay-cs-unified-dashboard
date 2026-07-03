import type { OpsArticleCategory } from "@/lib/types";

export const CATEGORY_BADGE_CLASS: Record<OpsArticleCategory, string> = {
  "Camera Coefficients": "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  "Credit Card Terminal Setup": "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  "IT Troubleshooting Manual": "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  "Tech Support": "bg-accent/15 text-accent",
};

export function categoryBadgeClass(category: string): string {
  return CATEGORY_BADGE_CLASS[category as OpsArticleCategory] ?? "bg-muted text-muted-foreground";
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function excerpt(html: string, maxLength = 120): string {
  const plain = stripHtml(html);
  if (plain.length <= maxLength) return plain;
  return `${plain.slice(0, maxLength).trimEnd()}…`;
}

export function formatRelativeDate(dateStr: string): string {
  const target = new Date(dateStr);
  const diffMs = Date.now() - target.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return target.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export interface TocEntry {
  id: string;
  text: string;
  level: 2 | 3;
}

// Parses h2/h3 tags out of article HTML and injects matching ids so the
// reader's Table of Contents can scroll-link to each section.
export function extractTocAndAnnotate(html: string): { html: string; toc: TocEntry[] } {
  const toc: TocEntry[] = [];
  let counter = 0;

  const annotated = html.replace(/<h([23])([^>]*)>(.*?)<\/h\1>/gi, (match, level, attrs, inner) => {
    const text = stripHtml(inner);
    if (!text) return match;
    counter += 1;
    const id = `ops-section-${counter}`;
    toc.push({ id, text, level: Number(level) as 2 | 3 });
    const hasId = /id=/.test(attrs);
    const newAttrs = hasId ? attrs : `${attrs} id="${id}"`;
    return `<h${level}${newAttrs}>${inner}</h${level}>`;
  });

  return { html: annotated, toc };
}

export function countCheckboxes(html: string): { total: number } {
  const matches = html.match(/<input[^>]*type=["']checkbox["'][^>]*>/gi);
  return { total: matches?.length ?? 0 };
}
