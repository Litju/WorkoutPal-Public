import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const packageDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(packageDirectory, "..", "..", "..");
const migrationsDirectory = path.join(repositoryRoot, "db", "migrations");
const databaseUrl =
  process.env.DATABASE_MIGRATION_URL ??
  process.env.DATABASE_URL ??
  "postgresql://workoutpal:workoutpal_dev@127.0.0.1:55432/workoutpal";

function readDatabaseTransport(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error(
      "The migration database URL must use the postgres:// scheme.",
    );
  }
  const loopback = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(
    parsed.hostname.toLowerCase(),
  );
  if (loopback) return { ssl: false, enableChannelBinding: false };
  const sslMode = parsed.searchParams.get("sslmode")?.toLowerCase();
  if (
    sslMode !== "require" &&
    sslMode !== "verify-ca" &&
    sslMode !== "verify-full"
  ) {
    throw new Error(
      "Remote migration PostgreSQL connections require sslmode=require or a stronger mode.",
    );
  }
  return { ssl: { rejectUnauthorized: true }, enableChannelBinding: true };
}

function connectionStringForNodePg(url) {
  const parsed = new URL(url);
  if (!parsed.searchParams.has("sslmode")) return url;
  parsed.searchParams.delete("sslmode");
  return parsed.toString();
}

const transport = readDatabaseTransport(databaseUrl);
const client = new pg.Client({
  connectionString: connectionStringForNodePg(databaseUrl),
  applicationName: "workoutpal-migrator",
  ssl: transport.ssl,
  enableChannelBinding: transport.enableChannelBinding,
});

try {
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.workoutpal_schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith(".sql"))
    .sort((left, right) => left.localeCompare(right));
  let applied = 0;

  for (const file of files) {
    const existing = await client.query(
      "SELECT 1 FROM public.workoutpal_schema_migrations WHERE id = $1",
      [file],
    );
    if (existing.rowCount !== 0) {
      continue;
    }

    const sql = await readFile(path.join(migrationsDirectory, file), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(
        "INSERT INTO public.workoutpal_schema_migrations (id) VALUES ($1)",
        [file],
      );
      await client.query("COMMIT");
      applied += 1;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }

  console.log(`MIGRATIONS_APPLIED=${applied}`);
  console.log(`MIGRATION_FILES=${files.length}`);
} finally {
  await client.end().catch(() => undefined);
}
