import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
const environment = process.argv.find((a) => a.startsWith("--env="))?.slice(6);
if (!["staging", "production"].includes(environment))
  throw new Error("Specify --env=staging or --env=production");
const config = JSON.parse(
  await readFile(new URL("../wrangler.worker.jsonc", import.meta.url), "utf8"),
);
const target = config.env?.[environment];
if (
  !target ||
  !target.vars?.APP_ORIGIN?.startsWith("https://") ||
  target.vars.ENVIRONMENT !== environment ||
  JSON.stringify(target).includes("example.com") ||
  JSON.stringify(target).includes("00000000-0000-0000-0000-000000000000")
)
  throw new Error(
    "Configure real domains, environment and resource IDs before deploy",
  );
if (
  !target.vars.ACCESS_ISSUER ||
  !target.vars.ACCESS_AUD ||
  !target.vars.TURNSTILE_SITE_KEY
)
  throw new Error("Configure Access and Turnstile before deploy");
if (/replace-with|your-team/.test(JSON.stringify(target.vars)))
  throw new Error("Replace Access/Turnstile placeholders before deploy");
const cli = join(process.cwd(), "node_modules/wrangler/bin/wrangler.js");
const secrets = spawnSync(
  process.execPath,
  [cli, "--config", "wrangler.worker.jsonc", "secret", "list", "--env", environment],
  { encoding: "utf8" },
);
if (secrets.status !== 0) throw new Error("Cannot verify configured secrets");
const configured = JSON.parse(secrets.stdout);
for (const name of [
  "BETTER_AUTH_SECRET",
  "TURNSTILE_SECRET",
  "DELIVERY_KEY",
  "SEPAY_WEBHOOK_SECRET",
  "SEPAY_API_TOKEN",
]) {
  if (!configured.some((secret) => secret.name === name))
    throw new Error(`Missing secret: ${name}`);
}
for (const args of [
  ["node_modules/typescript/bin/tsc", "-b"],
  ["node_modules/typescript/bin/tsc", "-p", "tsconfig.worker.json"],
  ["node_modules/vite/bin/vite.js", "build"],
  [cli, "--config", "wrangler.worker.jsonc", "deploy", "--env", environment],
]) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
