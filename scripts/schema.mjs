import { SCHEMA_STATEMENTS } from "../workers/schema.ts";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
// Local only by default. Remote application requires naming the environment.
const args = process.argv.slice(2);
const remote = args.includes("--remote");
const environment = args.find((a) => a.startsWith("--env="))?.slice(6);
if (remote && !environment)
  throw new Error(
    "Remote schema requires --remote --env=staging or --env=production",
  );
const directory = await mkdtemp(join(tmpdir(), "tiemdigital-schema-"));
try {
  const file = join(directory, "schema.sql");
  const refresh = args.includes("--refresh-triggers")
    ? SCHEMA_STATEMENTS.filter((statement) =>
        statement.startsWith("CREATE TRIGGER IF NOT EXISTS "),
      ).map((statement) => `DROP TRIGGER IF EXISTS ${statement.split(" ")[5]}`)
    : [];
  await writeFile(
    file,
    [...refresh, ...SCHEMA_STATEMENTS].map((s) => `${s};`).join("\n"),
  );
  const cli = join(process.cwd(), "node_modules/wrangler/bin/wrangler.js");
  const result = spawnSync(
    process.execPath,
    [
      cli,
      "--config",
      "wrangler.worker.jsonc",
      "d1",
      "execute",
      "DB",
      remote ? "--remote" : "--local",
      ...(environment ? ["--env", environment] : []),
      "--file",
      file,
    ],
    { stdio: "inherit" },
  );
  if (result.status !== 0) process.exitCode = result.status ?? 1;
} finally {
  await rm(directory, { recursive: true, force: true });
}
