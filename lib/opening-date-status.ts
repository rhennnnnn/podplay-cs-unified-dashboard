// Pure, testable opening-date alert tiering for the Client Opening Tracker.
// Returns null once a location is completed (status === "opened") — completed
// rows get no alert styling regardless of what the date math would say.
//
// Tiers (only for NOT-yet-completed locations, days relative to server "today"):
//   1–7 days in the future  -> "upcoming" (blue)
//   today                    -> "today"    (green)
//   1–3 days in the past     -> "late"     (yellow)
//   more than 3 days past    -> "overdue"  (red — existing base behavior)
//   more than 7 days out     -> null       (no alert styling yet)

export type OpeningDateTier = "upcoming" | "today" | "late" | "overdue" | null;

export function getOpeningDateTier(
  openingDate: string | null,
  completed: boolean
): OpeningDateTier {
  if (completed || !openingDate) return null;

  const opening = new Date(openingDate);
  if (Number.isNaN(opening.getTime())) return null;

  const today = new Date();
  opening.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((opening.getTime() - today.getTime()) / 86_400_000);

  if (diffDays === 0) return "today";
  if (diffDays >= 1 && diffDays <= 7) return "upcoming";
  if (diffDays > 7) return null; // further out than a week — nothing to flag yet
  if (diffDays >= -3) return "late"; // 1–3 days past
  return "overdue"; // more than 3 days past
}

// Tailwind text-color tokens, reusing the app's existing badge/alert palette
// (blue-500, accent olive-green, amber-500, destructive) — no new visual language.
export const OPENING_TIER_TEXT_CLASS: Record<Exclude<OpeningDateTier, null>, string> = {
  upcoming: "text-blue-500",
  today: "text-green-600 dark:text-green-500",
  late: "text-amber-500",
  overdue: "text-destructive",
};
