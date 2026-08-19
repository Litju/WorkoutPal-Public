import type { UUID } from "@workoutpal/shared-kernel";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { boolean, pgSchema, text, timestamp } from "drizzle-orm/pg-core";
import { Pool } from "pg";

const authSchema = pgSchema("auth");

const user = authSchema.table("user", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
  name: text("name").notNull(),
  email: text("email").notNull(),
  emailVerified: boolean("emailVerified").notNull(),
  image: text("image"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull(),
});

const session = authSchema.table("session", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  token: text("token").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId").notNull(),
});

const account = authSchema.table("account", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId").notNull(),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt", {
    withTimezone: true,
  }),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt", {
    withTimezone: true,
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull(),
});

const verification = authSchema.table("verification", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }),
  updatedAt: timestamp("updatedAt", { withTimezone: true }),
});

const authTables = { user, session, account, verification };

export interface AuthenticatedActor {
  readonly principalId: UUID;
  readonly email: string;
  readonly name: string;
}

export interface IdentityPort {
  requireActor(request: unknown): Promise<AuthenticatedActor>;
}

export class AuthenticationRequiredError extends Error {
  readonly code = "AUTHENTICATION_REQUIRED" as const;

  constructor() {
    super("Authentication is required.");
    this.name = "AuthenticationRequiredError";
  }
}

export interface BetterAuthAdapter {
  readonly provider: "better-auth";
  readonly version: "1.6.26";
  readonly status: "CONFIGURED";
  readonly identity: IdentityPort;
  readonly handler: (request: Request) => Promise<Response>;
  close(): Promise<void>;
}

export interface BetterAuthConfig {
  readonly databaseUrl?: string;
  readonly secret?: string;
  readonly baseURL?: string;
}

function readConfig(config: BetterAuthConfig): Required<BetterAuthConfig> {
  const databaseUrl = config.databaseUrl ?? process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
    throw new Error("DATABASE_URL is required by the Better Auth adapter.");
  }
  const secret = config.secret ?? process.env.BETTER_AUTH_SECRET;
  if (secret === undefined || secret.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "BETTER_AUTH_SECRET must be at least 32 characters in production.",
      );
    }
    return {
      databaseUrl,
      secret: "workoutpal-development-secret-change-me-32",
      baseURL:
        config.baseURL ??
        process.env.BETTER_AUTH_URL ??
        "http://localhost:3000",
    };
  }
  return {
    databaseUrl,
    secret,
    baseURL:
      config.baseURL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  };
}

function requestHeaders(request: unknown): Headers {
  if (request instanceof Request) return new Headers(request.headers);
  if (typeof request === "object" && request !== null && "headers" in request) {
    return new Headers((request as { readonly headers: HeadersInit }).headers);
  }
  return new Headers();
}

function asOrigin(value: string | undefined): string | undefined {
  if (value === undefined || value.trim().length === 0) return undefined;
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).origin;
  } catch {
    return undefined;
  }
}

function asUuid(value: string): UUID {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new Error(
      "Better Auth returned a principal identifier outside the UUID policy.",
    );
  }
  return value as UUID;
}

function readDatabaseTransport(url: string): {
  readonly ssl: false | { readonly rejectUnauthorized: boolean };
  readonly enableChannelBinding: boolean;
} {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Better Auth requires a valid PostgreSQL connection URL.");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("Better Auth requires a postgres:// database URL.");
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
      "Remote Better Auth PostgreSQL connections require sslmode=require or a stronger mode.",
    );
  }
  return {
    ssl: { rejectUnauthorized: true },
    enableChannelBinding: true,
  };
}

function connectionStringForNodePg(url: string): string {
  const parsed = new URL(url);
  if (!parsed.searchParams.has("sslmode")) return url;
  parsed.searchParams.delete("sslmode");
  return parsed.toString();
}

export function createBetterAuthAdapter(
  config: BetterAuthConfig = {},
): BetterAuthAdapter {
  const resolved = readConfig(config);
  const transport = readDatabaseTransport(resolved.databaseUrl);
  const pool = new Pool({
    connectionString: connectionStringForNodePg(resolved.databaseUrl),
    application_name: "workoutpal-auth",
    ssl: transport.ssl,
    enableChannelBinding: transport.enableChannelBinding,
  } as ConstructorParameters<typeof Pool>[0] & {
    readonly enableChannelBinding: boolean;
  });
  const db = drizzle(pool);
  const trustedOrigins = [
    resolved.baseURL,
    asOrigin(process.env.VERCEL_URL),
    asOrigin(process.env.VERCEL_BRANCH_URL),
    ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",") ?? []),
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ].filter((origin): origin is string => origin !== undefined);
  const auth = betterAuth({
    database: drizzleAdapter(db, { provider: "pg", schema: authTables }),
    baseURL: resolved.baseURL,
    trustedOrigins,
    secret: resolved.secret,
    emailAndPassword: { enabled: true },
    rateLimit: { enabled: process.env.WORKOUTPAL_E2E !== "1" },
    advanced: { database: { generateId: "uuid" } },
  });

  const identity: IdentityPort = {
    async requireActor(request: unknown) {
      const sessionResult = await auth.api.getSession({
        headers: requestHeaders(request),
      });
      if (sessionResult === null || sessionResult === undefined) {
        throw new AuthenticationRequiredError();
      }
      return {
        principalId: asUuid(sessionResult.user.id),
        email: sessionResult.user.email,
        name: sessionResult.user.name,
      };
    },
  };

  return {
    provider: "better-auth",
    version: "1.6.26",
    status: "CONFIGURED",
    identity,
    handler: auth.handler,
    async close() {
      await pool.end();
    },
  };
}
