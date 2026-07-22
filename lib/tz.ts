// Timezone helpers for Closed Locations reminders. Reminder times are entered
// as US Eastern (America/New_York) but stored/compared as UTC timestamps.
const EASTERN = "America/New_York";

// Interpret a wall-clock date (yyyy-mm-dd) + time (HH:MM) as US Eastern and
// return the matching UTC instant as an ISO string. Uses the Intl offset for
// that specific date, so it handles EST/EDT (DST) correctly.
export function easternWallClockToUtcIso(dateStr: string, timeStr: string): string {
  const naiveUtc = new Date(`${dateStr}T${timeStr}:00Z`).getTime();
  const nyLocale = new Date(naiveUtc).toLocaleString("en-US", { timeZone: EASTERN });
  const utcLocale = new Date(naiveUtc).toLocaleString("en-US", { timeZone: "UTC" });
  const offset = new Date(utcLocale).getTime() - new Date(nyLocale).getTime();
  return new Date(naiveUtc + offset).toISOString();
}

// Break a UTC ISO timestamp into its US Eastern date (yyyy-mm-dd) and time
// (HH:MM) parts — used to pre-fill the form when editing a reminder.
export function utcIsoToEasternParts(iso: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: EASTERN,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${hour}:${get("minute")}` };
}

// Format a UTC ISO timestamp for display in US Eastern (e.g. "Jul 22, 2026, 9:00 AM ET").
export function formatEastern(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return (
    d.toLocaleString("en-US", {
      timeZone: EASTERN,
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }) + " ET"
  );
}
