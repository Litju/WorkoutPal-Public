import pg from "pg";

const adminUrl =
  process.env.DATABASE_MIGRATION_URL ??
  process.env.DATABASE_URL ??
  "postgresql://workoutpal:workoutpal_dev@127.0.0.1:55432/workoutpal";
const runtimeRole =
  process.env.WORKOUTPAL_RUNTIME_LOGIN ?? "workoutpal_runtime_login";
const runtimePassword =
  process.env.WORKOUTPAL_RUNTIME_PASSWORD ?? "workoutpal_runtime_dev";

if (!/^[a-z_][a-z0-9_]{0,62}$/.test(runtimeRole)) {
  throw new Error(
    "WORKOUTPAL_RUNTIME_LOGIN must be a simple PostgreSQL identifier.",
  );
}
if (runtimePassword.length < 16) {
  throw new Error(
    "WORKOUTPAL_RUNTIME_PASSWORD must be at least 16 characters.",
  );
}

const parsed = new URL(adminUrl);
const loopback = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(
  parsed.hostname.toLowerCase(),
);
const sslMode = parsed.searchParams.get("sslmode")?.toLowerCase();
if (!loopback && !["require", "verify-ca", "verify-full"].includes(sslMode)) {
  throw new Error(
    "Remote runtime-role provisioning requires sslmode=require or a stronger mode.",
  );
}

const quoteIdentifier = (value) => `"${value.replaceAll('"', '""')}"`;
const quoteLiteral = (value) => `'${value.replaceAll("'", "''")}'`;
const connectionStringForNodePg = (url) => {
  const normalized = new URL(url);
  if (!normalized.searchParams.has("sslmode")) return url;
  normalized.searchParams.delete("sslmode");
  return normalized.toString();
};
const client = new pg.Client({
  connectionString: connectionStringForNodePg(adminUrl),
  applicationName: "workoutpal-runtime-role-provisioner",
  ssl: loopback ? false : { rejectUnauthorized: true },
  enableChannelBinding: !loopback,
});

try {
  await client.connect();
  const existing = await client.query(
    "SELECT 1 FROM pg_roles WHERE rolname = $1",
    [runtimeRole],
  );
  const identifier = quoteIdentifier(runtimeRole);
  const password = quoteLiteral(runtimePassword);
  if (existing.rowCount === 0) {
    await client.query(
      `CREATE ROLE ${identifier} LOGIN INHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD ${password}`,
    );
  } else {
    await client.query(
      `ALTER ROLE ${identifier} LOGIN INHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD ${password}`,
    );
  }
  await client.query(`GRANT workoutpal_runtime TO ${identifier}`);
  console.log(`RUNTIME_ROLE_READY=${runtimeRole}`);
} finally {
  await client.end().catch(() => undefined);
}
