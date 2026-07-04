// MRP Google Sheet integration — read-only, Session 6.
//
// Column mapping below is a FIRST-PASS ASSUMPTION, not yet confirmed: the
// service account's Viewer access to the sheet was still pending (403) as of
// this session, so headers were never actually read. Header names are guessed
// from the tab name ("DeploymentStatus") and the team meeting notes. Once
// access is granted, re-run discovery (read row 1 via spreadsheets.values.get)
// and confirm with the user:
//   - which of the two hardware-delivery-date columns is authoritative
//     (assumed here: "actual"/"confirmed" over "estimated"/"scheduled")
//   - the real company-name matching convention ("same logic as Chad's
//     existing setup" per the meeting) — the normalize() below is a generic
//     lowercase/strip-suffix guess, NOT that confirmed logic.
// Never call any write/update/append Sheets API method from this file.

import { google } from "googleapis";
import { IntegrationPausedError, markRefreshed, recordCall, shouldAllowPoll, type PollTrigger } from "@/lib/api-health";

export interface MrpRecord {
  clubName: string;
  hardwareDeliveryDate: string | null;
  deliveredStatus: string | null;
  installStartedStatus: string | null;
}

const SHEET_TAB = process.env.MRP_SHEET_TAB || "DeploymentStatus";
const RANGE = `${SHEET_TAB}!A1:Z`;

let cachedAuth: InstanceType<typeof google.auth.JWT> | null = null;
function getAuthClient(): InstanceType<typeof google.auth.JWT> | null {
  if (cachedAuth) return cachedAuth;
  const email = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const key = process.env.GOOGLE_SHEETS_PRIVATE_KEY;
  if (!email || !key) return null;
  cachedAuth = new google.auth.JWT({
    email,
    key: key.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  return cachedAuth;
}

interface SheetsApiError {
  code?: number;
  status?: number;
  response?: { status?: number };
  message?: string;
}

async function fetchRows(trigger: PollTrigger): Promise<string[][]> {
  const allowed = await shouldAllowPoll("mrp_sheets", trigger);
  if (!allowed) {
    throw new IntegrationPausedError("MRP sheet polling is currently paused by an admin.");
  }

  const sheetId = process.env.MRP_SHEET_ID;
  const auth = getAuthClient();
  if (!sheetId || !auth) {
    await recordCall("mrp_sheets", {
      success: false,
      errorMessage: "MRP_SHEET_ID or Google Sheets service account credentials are not configured.",
    });
    return [];
  }

  try {
    const sheets = google.sheets({ version: "v4", auth });
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: RANGE });
    await recordCall("mrp_sheets", { success: true });
    await markRefreshed("mrp_sheets");
    return res.data.values ?? [];
  } catch (err) {
    const e = err as SheetsApiError;
    const status = e.code ?? e.status ?? e.response?.status;
    if (status === 403) {
      await recordCall("mrp_sheets", {
        success: false,
        statusCode: 403,
        errorMessage: "Viewer access not yet granted on the MRP sheet",
      });
    } else {
      await recordCall("mrp_sheets", {
        success: false,
        statusCode: typeof status === "number" ? status : undefined,
        errorMessage: e.message ?? "Unknown MRP sheet error",
      });
    }
    // Never throw — the rest of the app (sync chain, detail sheet) keeps
    // working with an empty result set on any Sheets API failure.
    return [];
  }
}

function findColumn(headers: string[], candidates: string[]): number {
  for (const candidate of candidates) {
    const i = headers.findIndex((h) => h?.trim().toLowerCase() === candidate.toLowerCase());
    if (i !== -1) return i;
  }
  return -1;
}

export async function getHardwareRecords(trigger: PollTrigger = "auto"): Promise<MrpRecord[]> {
  const rows = await fetchRows(trigger);
  if (rows.length < 2) return [];

  const headers = rows[0];
  const clubCol = findColumn(headers, ["club", "club name", "company", "company name"]);
  if (clubCol === -1) return [];

  const deliveryCol = findColumn(headers, [
    "hardware delivery date (actual)",
    "actual hardware delivery date",
    "hardware delivery date",
    "delivery date",
  ]);
  const deliveredCol = findColumn(headers, ["delivered", "delivered status", "hardware delivered"]);
  const installCol = findColumn(headers, ["install started", "installation started", "install status"]);

  return rows
    .slice(1)
    .filter((row) => row[clubCol])
    .map((row) => ({
      clubName: row[clubCol],
      hardwareDeliveryDate: deliveryCol !== -1 ? row[deliveryCol] || null : null,
      deliveredStatus: deliveredCol !== -1 ? row[deliveredCol] || null : null,
      installStartedStatus: installCol !== -1 ? row[installCol] || null : null,
    }));
}

// Generic normalize — lowercase, drop common suffixes and non-alphanumerics.
// NOT the confirmed "same logic as Chad's existing setup" matching convention
// mentioned in the team meeting; a lookup/formula column for that wasn't
// findable without sheet access. Revise once access is granted and the real
// convention can be inspected.
function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(llc|inc|club|the)\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

export function matchByCompanyName(hubspotCompanyName: string | null | undefined, records: MrpRecord[]): MrpRecord | null {
  if (!hubspotCompanyName) return null;
  const target = normalize(hubspotCompanyName);
  if (!target) return null;
  return records.find((r) => normalize(r.clubName) === target) ?? null;
}
