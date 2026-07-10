// Pure, testable Recommended QC Date logic for the Client Opening Tracker.
// No component logic here.
//
// Rule (per Session 13 spec Part E):
//   - Base: 7 calendar days after the LATEST of the applicable box "Delivered"
//     dates that actually has a value (N/A / missing boxes skipped).
//   - Weekend shift: if that lands on Sat/Sun, move to the following Monday.
//   - No box-delivered dates at all -> null (not computable, render "—").
//
// Conflict vs Opening Date: if the recommended QC date falls within 7 days of
// opening (before or after — both are bad), flag it. 0–3 days = red (overdue),
// 4–7 days = amber (late), reusing the existing opening-date alert palette.

import type { MrpRecord } from "@/lib/mrp";
import { getBoxCells, parseFlexDate, startOfDay } from "@/lib/tracker-mrp";
import type { OpeningDateTier } from "@/lib/opening-date-status";

export function computeRecommendedQcDate(record: MrpRecord | null): Date | null {
  if (!record) return null;

  const deliveredDates = getBoxCells(record)
    .filter((b) => b.applicable)
    .map((b) => parseFlexDate(b.delivered))
    .filter((d): d is Date => d !== null);

  if (deliveredDates.length === 0) return null;

  const latest = deliveredDates.reduce((a, b) => (a.getTime() >= b.getTime() ? a : b));
  const qc = startOfDay(latest);
  qc.setDate(qc.getDate() + 7);

  // Weekend shift: Sat (6) -> +2, Sun (0) -> +1.
  const day = qc.getDay();
  if (day === 6) qc.setDate(qc.getDate() + 2);
  else if (day === 0) qc.setDate(qc.getDate() + 1);

  return qc;
}

export interface QcConflict {
  tier: Exclude<OpeningDateTier, null>; // "late" (amber) | "overdue" (red)
  daysFromOpening: number; // signed: negative = QC before opening, positive = after
  message: string;
}

// Returns null when there's no conflict (QC missing, opening missing, or the two
// are more than 7 days apart).
export function qcConflict(
  qcDate: Date | null,
  openingDate: string | null
): QcConflict | null {
  if (!qcDate) return null;
  const opening = parseFlexDate(openingDate);
  if (!opening) return null;

  const diff = Math.round(
    (startOfDay(qcDate).getTime() - startOfDay(opening).getTime()) / 86_400_000
  );
  const abs = Math.abs(diff);
  if (abs > 7) return null;

  const tier: Exclude<OpeningDateTier, null> = abs <= 3 ? "overdue" : "late";

  let message: string;
  if (diff === 0) {
    message = "QC lands on opening day — recommend rescheduling";
  } else if (diff > 0) {
    message = `QC ${abs} day${abs === 1 ? "" : "s"} after opening — recommend rescheduling`;
  } else {
    message = `QC ${abs} day${abs === 1 ? "" : "s"} before opening — recommend rescheduling`;
  }

  return { tier, daysFromOpening: diff, message };
}
