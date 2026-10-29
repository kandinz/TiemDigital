import { spawnSync } from "node:child_process";
import { join } from "node:path";
const argument = (name) =>
  process.argv
    .find((value) => value.startsWith(`--${name}=`))
    ?.slice(name.length + 3);
const email = argument("email")?.toLowerCase();
const role = argument("role");
const username = argument("username");
const environment = argument("env");
const remote = process.argv.includes("--remote");
if (
  !(username ? /^[a-zA-Z0-9_.]{3,30}$/.test(username) : /^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email ?? "")) ||
  !["owner", "finance", "support", "editor", "auditor"].includes(role)
)
  throw new Error(
    "Usage: node scripts/admin.mjs --username=owner (or --email=owner@example.com for Access) --role=owner [--remote --env=staging]",
  );
if (remote && !["production", "staging"].includes(environment))
  throw new Error("Name the remote environment explicitly");
const sql = username ? `INSERT INTO admin_accounts(user_id,role) SELECT id,'${role}' FROM user WHERE username='${username.toLowerCase()}' COLLATE NOCASE ON CONFLICT(user_id) DO UPDATE SET role=excluded.role RETURNING user_id` : `INSERT INTO admin_roles(email,role) VALUES('${email}','${role}') ON CONFLICT(email) DO UPDATE SET role=excluded.role`;
const result = spawnSync(
  process.execPath,
  [
    join(process.cwd(), "node_modules/wrangler/bin/wrangler.js"),
    "--config",
    "wrangler.worker.jsonc",
    "d1",
    "execute",
    "DB",
    remote ? "--remote" : "--local",
    ...(environment ? ["--env", environment] : []),
    "--json",
    "--command",
    sql,
  ],
  { encoding: "utf8" },
);
if (result.status !== 0) { process.stderr.write(result.stderr || result.stdout); process.exitCode = result.status ?? 1; }
else if (username && !JSON.parse(result.stdout).some(value => value.results?.length)) { console.error('Username not found; create the TiệmDigital account first.'); process.exitCode = 1; }
else console.log('Administrator role saved for the existing identity.');
