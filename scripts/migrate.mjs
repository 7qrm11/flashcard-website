import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import pg from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadEnvFile() {
  if (process.env.DATABASE_URL) {
    return;
  }

  const envPath = path.resolve(__dirname, "../.env");
  let raw;
  try {
    raw = await fs.readFile(envPath, "utf8");
  } catch {
    return;
  }

  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u.exec(trimmed);
    if (!match) {
      continue;
    }
    const key = match[1];
    if (process.env[key] !== undefined) {
      continue;
    }
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

await loadEnvFile();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required (set it or add it to .env)");
  process.exit(1);
}

function shouldUseSsl(urlString) {
  try {
    const url = new URL(urlString);
    const hostname = url.hostname;
    if (!hostname || hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
      return false;
    }
    return true;
  } catch {
    return process.env.NODE_ENV === "production";
  }
}
const migrationsDir = path.resolve(__dirname, "../migrations");

const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: shouldUseSsl(databaseUrl) ? { rejectUnauthorized: true } : undefined,
});
await client.connect();

await client.query(`
  create table if not exists schema_migrations (
    filename text primary key,
    applied_at timestamptz not null default now()
  );
`);

const files = (await fs.readdir(migrationsDir))
  .filter((f) => f.endsWith(".sql"))
  .sort((a, b) => a.localeCompare(b));

for (const file of files) {
  const exists = await client.query(
    "select 1 from schema_migrations where filename = $1",
    [file],
  );
  if (exists.rowCount > 0) {
    continue;
  }

  const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
  process.stdout.write(`applying ${file}... `);

  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("insert into schema_migrations (filename) values ($1)", [
      file,
    ]);
    await client.query("commit");
    process.stdout.write("ok\n");
  } catch (err) {
    await client.query("rollback");
    process.stdout.write("failed\n");
    throw err;
  }
}

await client.end();
console.log("done");
