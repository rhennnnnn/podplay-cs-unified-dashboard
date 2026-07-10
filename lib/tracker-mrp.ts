// Pure, client-safe helpers for wiring MRP hardware data into the Client Opening
// Tracker. NO server imports here (this file is imported by the client table) —
// the snapshot read + matching happens server-side in app/dashboard/clients/page.tsx
// via readSnapshot("mrp:records") + matchByCompanyName (see CONTEXT.md Data flow).
//
// The MRP sheet uses the literal string "N/A" (uppercase, confirmed live) for a
// hardware box that doesn't apply to a club, and M/D/YYYY for real dates.

import type { MrpRecord } from "@/lib/mrp";
import { OPENING_TIER_TEXT_CLASS, type OpeningDateTier } from "@/lib/opening-date-status";

export type BoxKind = "shipped" | "delivered";

// A cell is "not applicable" when it's empty or the sheet's literal "N/A".
export function isNa(value: string | null | undefined): boolean {
  if (value === null || value === undefined) return true;
  const t = value.trim();
  return t === "" || t.toLowerCase() === "n/a";
}

// Parse the tracker's date shapes into a local-midnight Date:
//   - MRP sheet dates are "M/D/YYYY"
//   - locations.* dates are ISO "YYYY-MM-DD"
// Returns null for empty / "N/A" / unparseable input.
export function parseFlexDate(value: string | null | undefined): Date | null {
  if (isNa(value)) return null;
  const t = (value as string).trim();

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (us) {
    const d = new Date(Number(us[3]), Number(us[1]) - 1, Number(us[2]));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const fallback = new Date(t);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

export interface BoxCell {
  index: number; // 1-based box number
  shipped: string | null;
  delivered: string | null;
  // A box "exists" for a club unless BOTH its shipped and delivered cells are N/A.
  applicable: boolean;
}

export function getBoxCells(record: MrpRecord | null): BoxCell[] {
  if (!record) return [];
  const raw = [
    { index: 1, shipped: record.ppHardwareBox1Shipped, delivered: record.ppHardwareBox1Delivered },
    { index: 2, shipped: record.ppHardwareBox2Shipped, delivered: record.ppHardwareBox2Delivered },
    { index: 3, shipped: record.ppHardwareBox3Shipped, delivered: record.ppHardwareBox3Delivered },
  ];
  return raw.map((b) => ({
    ...b,
    applicable: !(isNa(b.shipped) && isNa(b.delivered)),
  }));
}

export interface BoxSummary {
  done: number; // boxes with a real date for this kind
  total: number; // applicable boxes (N/A boxes excluded from the denominator)
}

// "N/M" for a box group. total excludes boxes that are entirely N/A; done counts
// applicable boxes that have a real date in the requested column.
export function boxSummary(record: MrpRecord | null, kind: BoxKind): BoxSummary {
  const cells = getBoxCells(record).filter((b) => b.applicable);
  const done = cells.filter((b) => !isNa(kind === "shipped" ? b.shipped : b.delivered)).length;
  return { done, total: cells.length };
}

// Amber/red tier reusing the existing opening-date alert palette.
// A box shipped-cell that is still empty AFTER the Hardware Delivery Date has
// passed is "late": amber 1–3 days past, red >3 days past. Only meaningful for
// applicable boxes with a hardware delivery date in the past.
function lateTierForDaysPast(daysPast: number): Exclude<OpeningDateTier, null> | null {
  if (daysPast <= 0) return null;
  if (daysPast <= 3) return "late";
  return "overdue";
}

// Worst shipped-late tier across all applicable boxes whose shipped cell is empty
// and whose hardware delivery date has already passed. null = nothing late.
export function shippedLateTier(
  record: MrpRecord | null,
  today: Date = startOfDay(new Date())
): Exclude<OpeningDateTier, null> | null {
  if (!record) return null;
  const hwd = parseFlexDate(record.hardwareDeliveryDate);
  if (!hwd) return null;
  const daysPast = Math.round((today.getTime() - startOfDay(hwd).getTime()) / 86_400_000);
  if (daysPast <= 0) return null;

  const anyUnshipped = getBoxCells(record).some((b) => b.applicable && isNa(b.shipped));
  if (!anyUnshipped) return null;
  return lateTierForDaysPast(daysPast);
}

// Per-box shipped-late tier (for the expanded view): a box is late only if its
// own shipped cell is empty and the hardware delivery date has passed.
export function boxShippedLateTier(
  record: MrpRecord | null,
  boxIndex: number,
  today: Date = startOfDay(new Date())
): Exclude<OpeningDateTier, null> | null {
  if (!record) return null;
  const hwd = parseFlexDate(record.hardwareDeliveryDate);
  if (!hwd) return null;
  const box = getBoxCells(record).find((b) => b.index === boxIndex);
  if (!box || !box.applicable || !isNa(box.shipped)) return null;
  const daysPast = Math.round((today.getTime() - startOfDay(hwd).getTime()) / 86_400_000);
  return lateTierForDaysPast(daysPast);
}

// The single Hardware Delivery Date shown in the tracker: MRP's value when a
// match exists, otherwise the manually-entered locations.delivery_date fallback.
export function resolveHardwareDeliveryDate(
  record: MrpRecord | null,
  manualDeliveryDate: string | null
): { value: string | null; source: "mrp" | "manual" | null } {
  if (record && !isNa(record.hardwareDeliveryDate)) {
    return { value: record.hardwareDeliveryDate, source: "mrp" };
  }
  if (manualDeliveryDate && !isNa(manualDeliveryDate)) {
    return { value: manualDeliveryDate, source: "manual" };
  }
  return { value: null, source: null };
}

export function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

export { OPENING_TIER_TEXT_CLASS };
