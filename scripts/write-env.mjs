import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const result = spawnSync("npx", ["--yes", "supabase@2.119.0", "status", "-o", "env"], {
  encoding: "utf8",
});
if (result.status !== 0) {
  console.error(result.stderr || result.stdout);
  process.exit(1);
}

const env = {};
for (const line of result.stdout.split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)="(.*)"$/);
  if (match) env[match[1]] = match[2];
}

let existing = "";
try {
  existing = readFileSync(".env.local", "utf8");
} catch {
  existing = "";
}

function keep(name) {
  const match = existing.match(new RegExp(`^${name}=(.*)$`, "m"));
  return match?.[1] ?? "";
}

const local = [
  `NEXT_PUBLIC_SUPABASE_URL=${env.API_URL}`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY=${env.ANON_KEY}`,
  `LLM_PROVIDER=${keep("LLM_PROVIDER") || "openai"}`,
  `OPENAI_API_KEY=${keep("OPENAI_API_KEY")}`,
  `ANTHROPIC_API_KEY=${keep("ANTHROPIC_API_KEY")}`,
  `GOOGLE_API_KEY=${keep("GOOGLE_API_KEY")}`,
  `LLM_API_KEY=${keep("LLM_API_KEY")}`,
  `OPENAI_MODEL=${keep("OPENAI_MODEL") || "gpt-4o"}`,
  `ANTHROPIC_MODEL=${keep("ANTHROPIC_MODEL") || "claude-sonnet-4-5"}`,
  `GOOGLE_MODEL=${keep("GOOGLE_MODEL") || "gemini-2.5-flash"}`,
  `EXTRACTION_MODE=${keep("EXTRACTION_MODE") || "local"}`,
  `ALLOW_CLOUD_EXTRACTION=${keep("ALLOW_CLOUD_EXTRACTION") || "false"}`,
  "",
].join("\n");

writeFileSync(".env.local", local);
console.log("Wrote .env.local with the local Supabase URL and anon key.");
