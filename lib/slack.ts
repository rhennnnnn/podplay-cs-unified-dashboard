// Minimal Slack Web API helpers. Requires SLACK_BOT_TOKEN with scopes
// `chat:write` (post to the channel) and `users:read.email` (resolve a mention
// for the person who set a reminder), and the bot invited to the target
// channel. Best-effort: never throws; returns { ok:false, error } so callers
// can log and move on.
const SLACK_API = "https://slack.com/api";

// Resolve a Slack mention token (e.g. "<@U123>") for an email, or null if the
// token is missing / the user can't be found (caller can fall back to the email).
export async function slackMentionForEmail(email: string): Promise<string | null> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return null;
  try {
    const lookup = await fetch(
      `${SLACK_API}/users.lookupByEmail?email=${encodeURIComponent(email)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    ).then((r) => r.json());
    if (!lookup.ok) return null;
    return `<@${lookup.user.id}>`;
  } catch {
    return null;
  }
}

export async function postSlackMessage(
  channel: string,
  text: string
): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return { ok: false, error: "SLACK_BOT_TOKEN not set" };

  try {
    const post = await fetch(`${SLACK_API}/chat.postMessage`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ channel, text }),
    }).then((r) => r.json());
    if (!post.ok) return { ok: false, error: post.error };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}
