import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";

export interface PostgresConnectionConfig {
  readonly url: string;
  readonly applicationName: string;
  readonly ssl: false | { readonly rejectUnauthorized: boolean };
  readonly target?: PostgresConnectionTarget;
  readonly enableChannelBinding?: boolean;
}

export type PostgresConnectionTarget =
  | "LOCAL_LOOPBACK"
  | "PREVIEW_REMOTE"
  | "PRODUCTION_REMOTE";

export interface PostgresConnection {
  readonly client: Client;
  readonly db: NodePgDatabase & { readonly $client: Client };
}

export function readPostgresConnectionConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): PostgresConnectionConfig {
  const url = env.DATABASE_URL;
  if (url === undefined || url.trim().length === 0) {
    throw new Error(
      "DATABASE_URL is required by the PostgreSQL adapter boundary.",
    );
  }
  const target = classifyPostgresConnectionTarget(url, env);
  return {
    url,
    applicationName: "workoutpal",
    ssl: target === "LOCAL_LOOPBACK" ? false : { rejectUnauthorized: true },
    target,
    enableChannelBinding: target !== "LOCAL_LOOPBACK",
  };
}

export function classifyPostgresConnectionTarget(
  url: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): PostgresConnectionTarget {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use the postgres:// scheme.");
  }

  const hostname = parsed.hostname.toLowerCase();
  const localLoopback =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]";
  if (localLoopback) return "LOCAL_LOOPBACK";

  const sslMode = parsed.searchParams.get("sslmode")?.toLowerCase();
  if (
    sslMode !== "require" &&
    sslMode !== "verify-ca" &&
    sslMode !== "verify-full"
  ) {
    throw new Error(
      "Remote PostgreSQL connections require sslmode=require or a stronger mode.",
    );
  }

  if (env.VERCEL_ENV === "production") return "PRODUCTION_REMOTE";
  if (env.VERCEL_ENV === "preview") return "PREVIEW_REMOTE";
  return env.NODE_ENV === "production" ? "PRODUCTION_REMOTE" : "PREVIEW_REMOTE";
}

export function assertPostgresConnectionConfig(
  config: PostgresConnectionConfig,
): PostgresConnectionTarget {
  const classifiedTarget = classifyPostgresConnectionTarget(
    config.url,
    process.env,
  );
  if (config.target !== undefined && config.target !== classifiedTarget) {
    throw new Error(
      `PostgreSQL connection target ${config.target} does not match the URL classification ${classifiedTarget}.`,
    );
  }
  const target = config.target ?? classifiedTarget;
  if (target !== "LOCAL_LOOPBACK" && config.ssl === false) {
    throw new Error(
      "Remote PostgreSQL connections cannot disable TLS at the adapter boundary.",
    );
  }
  return target;
}

export function connectionStringForNodePg(url: string): string {
  const parsed = new URL(url);
  if (!parsed.searchParams.has("sslmode")) return url;
  parsed.searchParams.delete("sslmode");
  return parsed.toString();
}

export function createPostgresConnection(
  config: PostgresConnectionConfig,
): PostgresConnection {
  const target = assertPostgresConnectionConfig(config);
  const client = new Client({
    connectionString: connectionStringForNodePg(config.url),
    application_name: config.applicationName,
    ssl: config.ssl,
    enableChannelBinding:
      config.enableChannelBinding ?? target !== "LOCAL_LOOPBACK",
  } as ConstructorParameters<typeof Client>[0] & {
    readonly enableChannelBinding: boolean;
  });
  return { client, db: drizzle(client) };
}
