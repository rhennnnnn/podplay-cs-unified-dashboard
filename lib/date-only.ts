// Timezone-safe parsing for date-only values ("2026-08-01").
//
// JavaScript's `new Date("2026-08-01")` parses the string as UTC midnight. For
// any timezone behind UTC (all US zones) that instant falls on the PREVIOUS
// calendar evening, so `.toLocaleDateString()` / `.getDate()` render the wrong
// (earlier) day. A Philippines browser (UTC+8) never hits this — which is why
// the off-by-one only showed up for US staff. The stored data is correct; only
// the display was wrong.
//
// Mirrors the local-timezone construction pattern already used by
// `lib/tracker-mrp.ts`'s `parseFlexDate` (new Date(year, monthIndex, day)).

// Parse a value into a Date for viewer-facing formatting / day math (where
// "today" is the viewer's day). A PURE date-only string ("2026-08-01") is built
// at LOCAL midnight to dodge the UTC-parse off-by-one; anything with a time
// component (a full timestamptz like an activity `created_at`) is parsed
// normally, so its existing local rendering is preserved. Returns null on
// unparseable/empty input.
export function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const t = value.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const fallback = new Date(t);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

// UTC-midnight epoch millis for a date-only string. Use for SERVER-side day
// boundary math (e.g. Overview stat cards) that must be timezone-independent
// rather than silently tied to the Vercel runtime's TZ. Returns null on
// unparseable/empty input.
export function dateOnlyToUtcMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

// UTC-midnight epoch millis for the current day. Pairs with `dateOnlyToUtcMs`
// so day-diff comparisons are computed entirely in UTC terms and don't depend
// on the server process timezone.
export function todayUtcMs(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}
