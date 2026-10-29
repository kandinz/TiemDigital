import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const environment = process.argv
  .find((arg) => arg.startsWith("--env="))
  ?.slice(6);
if (!environment) throw new Error("Specify --env=staging or --env=production");

const response = await fetch("https://gumtool.pages.dev/api/mmo/catalog");
if (!response.ok) throw new Error(`Catalog request failed: ${response.status}`);
const body = await response.json();
if (!body.success || !Array.isArray(body.products))
  throw new Error("Catalog response is invalid");

const literal = (value) =>
  value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;
const statements = body.products.map(
  (product) => `INSERT INTO products(id,name,description,category,image_url,selling_price,in_stock,updated_at)
VALUES(${product.id},${literal(product.name)},${literal(product.description)},${literal(product.category)},${literal(product.image_url)},${product.selling_price},${product.in_stock ? 1 : 0},${literal(product.updated_at)})
ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,category=excluded.category,image_url=excluded.image_url,selling_price=excluded.selling_price,in_stock=excluded.in_stock,updated_at=excluded.updated_at;`,
);

const directory = await mkdtemp(join(tmpdir(), "tiemdigital-catalog-"));
try {
  const file = join(directory, "catalog.sql");
  await writeFile(file, statements.join("\n"), "utf8");
  const cli = join(process.cwd(), "node_modules/wrangler/bin/wrangler.js");
  const result = spawnSync(
    process.execPath,
    [cli, "d1", "execute", "DB", "--remote", "--env", environment, "--file", file],
    { stdio: "inherit" },
  );
  if (result.status !== 0) process.exitCode = result.status ?? 1;
} finally {
  await rm(directory, { recursive: true, force: true });
}
