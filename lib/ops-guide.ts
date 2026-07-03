// Tailwind classes must be statically analyzable — a fixed preset palette
// (rather than an arbitrary hex/dynamic class) is what makes admin-selected
// category colors actually work with the JIT compiler. `key` is what's
// stored in ops_categories.color.
export interface CategoryColorPreset {
  key: string;
  label: string;
  badge: string;
  dot: string;
}

export const CATEGORY_COLOR_PRESETS: CategoryColorPreset[] = [
  { key: "slate", label: "Slate", badge: "bg-slate-500/15 text-slate-600 dark:text-slate-400", dot: "bg-slate-500" },
  { key: "accent", label: "Olive", badge: "bg-accent/15 text-accent", dot: "bg-accent" },
  { key: "blue", label: "Blue", badge: "bg-blue-500/15 text-blue-600 dark:text-blue-400", dot: "bg-blue-500" },
  { key: "purple", label: "Purple", badge: "bg-purple-500/15 text-purple-600 dark:text-purple-400", dot: "bg-purple-500" },
  { key: "amber", label: "Amber", badge: "bg-amber-500/15 text-amber-600 dark:text-amber-400", dot: "bg-amber-500" },
  { key: "rose", label: "Rose", badge: "bg-rose-500/15 text-rose-600 dark:text-rose-400", dot: "bg-rose-500" },
  { key: "cyan", label: "Cyan", badge: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400", dot: "bg-cyan-500" },
  { key: "emerald", label: "Emerald", badge: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
  { key: "indigo", label: "Indigo", badge: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400", dot: "bg-indigo-500" },
  { key: "orange", label: "Orange", badge: "bg-orange-500/15 text-orange-600 dark:text-orange-400", dot: "bg-orange-500" },
];

const DEFAULT_COLOR_PRESET = CATEGORY_COLOR_PRESETS[0];

export function getCategoryColorPreset(colorKey: string | null | undefined): CategoryColorPreset {
  return CATEGORY_COLOR_PRESETS.find((p) => p.key === colorKey) ?? DEFAULT_COLOR_PRESET;
}

export function categoryBadgeClass(colorKey: string | null | undefined): string {
  return getCategoryColorPreset(colorKey).badge;
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

const DATA_URI_REGEX = /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g;

export type EmbeddedImageMap = Record<string, string>;

// Embedded base64 images are what makes the Markdown editor freeze (a
// single-line data: URI can be hundreds of KB). Replace each with a short
// placeholder token before handing content to the editor, and swap them
// back on save — the editor never sees a long line, so the rich editor can
// stay on for every article instead of falling back to a plain textarea.
export function extractEmbeddedImages(content: string): { content: string; images: EmbeddedImageMap } {
  const images: EmbeddedImageMap = {};
  let counter = 0;
  const shortened = content.replace(DATA_URI_REGEX, (match) => {
    counter += 1;
    // Must look like a relative path, not a custom URI scheme — safeUrlTransform
    // (article-content.tsx) blocks unrecognized schemes, and "foo://" parses as one.
    const placeholder = `/__ops-embedded-image__/${counter}`;
    images[placeholder] = match;
    return placeholder;
  });
  return { content: shortened, images };
}

export function restoreEmbeddedImages(content: string, images: EmbeddedImageMap): string {
  let restored = content;
  for (const [placeholder, dataUri] of Object.entries(images)) {
    restored = restored.split(placeholder).join(dataUri);
  }
  return restored;
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
