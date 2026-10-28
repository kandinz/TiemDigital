import { env } from "cloudflare:test";
import { beforeAll } from "vitest";
import { SCHEMA_STATEMENTS } from "../workers/schema";
beforeAll(async () => {
  for (const statement of SCHEMA_STATEMENTS)
    await env.DB.prepare(statement).run();
});
