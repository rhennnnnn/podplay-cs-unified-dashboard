// One-off seed: reads the legacy "Operation Guide V2.html" from the project root
// (gitignored, local-only) and upserts its DOCS array into ops_articles.
// Idempotent — re-running upserts on title, so it's safe to run again after
// editing the source file.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { createClient } = require("@supabase/supabase-js");

const VALID_CATEGORIES = [
  "Camera Coefficients",
  "Credit Card Terminal Setup",
  "IT Troubleshooting Manual",
  "Tech Support",
];

// Minimal .env.local loader — no dotenv dependency in this project.
function loadEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

function extractDocs(html) {
  const match = html.match(/const\s+DOCS\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) {
    throw new Error('Could not find "const DOCS = [...]" array in Operation Guide V2.html');
  }
  const sandbox = {};
  vm.createContext(sandbox);
  return vm.runInContext(match[1], sandbox);
}

async function main() {
  loadEnvLocal();

  const htmlPath = path.join(__dirname, "..", "Operation Guide V2.html");
  if (!fs.existsSync(htmlPath)) {
    throw new Error(`Operation Guide V2.html not found at ${htmlPath}`);
  }

  const html = fs.readFileSync(htmlPath, "utf8");
  const docs = extractDocs(html);
  console.log(`Found ${docs.length} article(s) in source file.`);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Source file has a handful of titles duplicated under two categories
  // (first tagged "IT Troubleshooting Manual", later re-tagged "Tech Support").
  // Keep the first occurrence — its category matches the dedicated IT
  // Troubleshooting Manual section exactly.
  const byTitle = new Map();
  for (const doc of docs) {
    if (byTitle.has(doc.title)) continue;
    const category = VALID_CATEGORIES.includes(doc.cat) ? doc.cat : "Tech Support";
    byTitle.set(doc.title, {
      title: doc.title,
      category,
      content: doc.html,
      tags: Array.isArray(doc.tags) ? doc.tags : [],
      created_by: "seed",
      updated_by: "seed",
    });
  }
  const rows = [...byTitle.values()];
  console.log(`${docs.length - rows.length} duplicate title(s) collapsed, ${rows.length} unique article(s) to upsert.`);

  const { data, error } = await supabase
    .from("ops_articles")
    .upsert(rows, { onConflict: "title" })
    .select("id, title");

  if (error) {
    throw error;
  }

  console.log(`Upserted ${data.length} article(s):`);
  for (const row of data) {
    console.log(`  - ${row.title}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
