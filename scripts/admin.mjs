import { spawnSync } from "node:child_process";
import { join } from "node:path";
const argument = (name) =>
  process.argv
    .find((value) => value.startsWith(`--${name}=`))
    ?.slice(name.length + 3);
const email = argument("email")?.toLowerCase();
const role = argument("role");
const environment = argument("env");
const remote = process.argv.includes("--remote");
if (
  !email ||
  !/^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email) ||
  !["owner", "finance", "support", "editor", "auditor"].includes(role)
)
  throw new Error(
    "Usage: node scripts/admin.mjs --email=owner@example.com --role=owner [--remote --env=staging]",
  );
if (remote && !["production", "staging"].includes(environment))
  throw new Error("Name the remote environment explicitly");
const sql = `INSERT INTO admin_roles(email,role) VALUES('${email}','${role}') ON CONFLICT(email) DO UPDATE SET role=excluded.role`;
const result = spawnSync(
  process.execPath,
  [
    join(process.cwd(), "node_modules/wrangler/bin/wrangler.js"),
    "d1",
    "execute",
    "DB",
    remote ? "--remote" : "--local",
    ...(environment ? ["--env", environment] : []),
    "--command",
    sql,
  ],
  { stdio: "inherit" },
);
process.exitCode = result.status ?? 1;
