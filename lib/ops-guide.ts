const KNOWN_CATEGORY_COLORS: Record<string, string> = {
  "Camera Coefficients": "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  "Credit Card Terminal Setup": "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  "IT Troubleshooting Manual": "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  "Tech Support": "bg-accent/15 text-accent",
};

const FALLBACK_CATEGORY_COLORS = [
  "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
  "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
  "bg-orange-500/15 text-orange-600 dark:text-orange-400",
];

// Categories are admin-managed (ops_categories table), so the palette can't
// be a fixed lookup keyed by a closed set of names. Known legacy categories
// keep their original colors; any new category gets a stable color derived
// from a hash of its name so it doesn't change between renders.
export function categoryBadgeClass(category: string): string {
  if (KNOWN_CATEGORY_COLORS[category]) return KNOWN_CATEGORY_COLORS[category];
  let hash = 0;
  for (let i = 0; i < category.length; i++) {
    hash = (hash * 31 + category.charCodeAt(i)) >>> 0;
  }
  return FALLBACK_CATEGORY_COLORS[hash % FALLBACK_CATEGORY_COLORS.length];
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function excerpt(html: string, maxLength = 120): string {
  const plain = stripHtml(html);
  if (plain.length <= maxLength) return plain;
  return `${plain.slice(0, maxLength).trimEnd()}…`;
}

// Counts steps in both legacy raw-HTML checkboxes and GFM markdown task
// lists ("- [ ] Step" / "- [x] Step"). Shared by the checklist API route
// (reset-when-complete check) and the reader's progress bar so both agree
// on what "done" means.
export function countCheckboxes(content: string): number {
  const matches = content.match(/(<input[^>]*type=["']checkbox["'][^>]*>)|(^\s*[-*]\s+\[[ xX]\])/gm);
  return matches?.length ?? 0;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Reads the current width="N" on an <img> tag with this exact src, if any.
export function getImageWidth(content: string, src: string): number | null {
  const escaped = escapeRegex(src);
  const match = content.match(new RegExp(`<img[^>]*src="${escaped}"[^>]*width="(\\d+)"`, "i"));
  return match ? Number(match[1]) : null;
}

// Sets width="N" on an <img> tag matching this src — converts a plain
// Markdown ![alt](src) image to an HTML <img> tag the first time it's
// resized (Markdown image syntax has no size attribute).
export function setImageWidth(content: string, src: string, width: number): string {
  const escaped = escapeRegex(src);
  const roundedWidth = Math.round(width);

  const htmlImgRegex = new RegExp(`<img([^>]*)src="${escaped}"([^>]*)>`, "i");
  if (htmlImgRegex.test(content)) {
    return content.replace(htmlImgRegex, (_match, before: string, after: string) => {
      const rest = `${before} ${after}`.replace(/\s*width="\d+"/i, "").trim();
      return `<img ${rest ? `${rest} ` : ""}src="${src}" width="${roundedWidth}">`;
    });
  }

  const mdImgRegex = new RegExp(`!\\[([^\\]]*)\\]\\(${escaped}\\)`);
  if (mdImgRegex.test(content)) {
    return content.replace(mdImgRegex, (_match, alt: string) => `<img src="${src}" alt="${alt}" width="${roundedWidth}">`);
  }

  return content;
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
