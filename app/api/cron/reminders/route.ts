import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { postSlackMessage, slackMentionForEmail } from "@/lib/slack";
import type { ClosedLocation } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Daily reminder sweep for Closed Locations. Finds closures whose reminder date
// has arrived (and hasn't been dismissed or already Slack-sent), then posts to
// the #cs-team-daily channel, @mentioning the person who set it. Mirrors the
// other cron routes: CRON_SECRET auth + admin (service-role) client, scheduled
// via pg_cron in Supabase — e.g.
//   select cron.schedule('closed-location-reminders','0 14 * * *',
//     $$ select net.http_post(
//          url:='https://<app>/api/cron/reminders',
//          headers:='{"x-cron-secret":"<CRON_SECRET>"}'::jsonb) $$);
// reminder_slack_sent_at makes re-runs idempotent (each reminder posts once).
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed — never run unauthenticated
  const provided = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
  return provided === secret;
}

async function runReminders() {
  const channel = process.env.SLACK_TEAM_DAILY_CHANNEL_ID;
  if (!channel) return { ok: false, error: "SLACK_TEAM_DAILY_CHANNEL_ID not set" };

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data, error } = await admin
    .from("closed_locations")
    .select("*")
    .lte("remind_at", nowIso)
    .eq("reminder_done", false)
    .is("reminder_slack_sent_at", null)
    .not("remind_user_email", "is", null);

  if (error) return { ok: false, error: error.message };

  const due = (data ?? []) as unknown as ClosedLocation[];
  let sent = 0;
  const failures: string[] = [];

  for (const c of due) {
    const email = c.remind_user_email;
    const who = email ? (await slackMentionForEmail(email)) ?? email : "";
    const client = c.client_name ? ` (${c.client_name})` : "";
    const note = c.close_note ? `\n> ${c.close_note}` : "";
    const text = `:bell: ${who} reminder — *${c.location_name}*${client} is scheduled to close on ${c.close_date}.${note}`;

    const res = await postSlackMessage(channel, text);
    if (res.ok) {
      await admin
        .from("closed_locations")
        .update({ reminder_slack_sent_at: new Date().toISOString() } as never)
        .eq("id", c.id);
      sent += 1;
    } else {
      failures.push(`${c.id}: ${res.error ?? "?"}`);
    }
  }

  return { ok: true, due: due.length, sent, failures, at: new Date().toISOString() };
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Forbidden" }, { status: 401 });
  return NextResponse.json(await runReminders());
}

// GET support so a browser check or a GET-issuing scheduler can trigger it too.
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Forbidden" }, { status: 401 });
  return NextResponse.json(await runReminders());
}
