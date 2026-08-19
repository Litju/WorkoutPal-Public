import { randomUUID } from "node:crypto";
import {
  type BetterAuthAdapter,
  createBetterAuthAdapter,
} from "@workoutpal/auth-better-auth";
import { readPostgresConnectionConfig } from "@workoutpal/persistence-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let adapter: BetterAuthAdapter;
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://workoutpal_runtime_login:workoutpal_runtime_dev@127.0.0.1:55432/workoutpal";

describe("real Better Auth F2 session path", () => {
  beforeAll(() => {
    adapter = createBetterAuthAdapter({
      databaseUrl: databaseUrl,
      baseURL: "http://localhost:3000",
      secret: "workoutpal-integration-secret-32-characters",
    });
  });

  afterAll(async () => {
    await adapter.close();
  });

  it("creates a credential and resolves its session through the adapter", async () => {
    const email = `f2-${randomUUID()}@example.com`;
    const signUp = await adapter.handler(
      new Request("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
        },
        body: JSON.stringify({
          name: "Integration Coach",
          email,
          password: "WorkoutPal-Local-123!",
        }),
      }),
    );
    expect(signUp.ok).toBe(true);
    const setCookie = signUp.headers.get("set-cookie");
    expect(setCookie).toContain("better-auth.session_token=");
    const cookie = setCookie?.split(";")[0];
    const session = await adapter.handler(
      new Request("http://localhost:3000/api/auth/get-session", {
        headers: { cookie: cookie ?? "", origin: "http://localhost:3000" },
      }),
    );
    expect(session.ok).toBe(true);
    const payload = (await session.json()) as { user?: { email?: string } };
    expect(payload.user?.email).toBe(email);

    const databaseConfig = readPostgresConnectionConfig({
      DATABASE_URL: databaseUrl,
    });
    const client = new Client({
      connectionString: databaseUrl,
      application_name: "workoutpal-auth-expiry-test",
      ssl: databaseConfig.ssl,
    });
    await client.connect();
    try {
      await client.query(
        `UPDATE auth.session
            SET "expiresAt" = now() - interval '1 minute'
          WHERE "userId" = (SELECT id FROM auth."user" WHERE email = $1)`,
        [email],
      );
    } finally {
      await client.end();
    }

    const expiredSession = await adapter.handler(
      new Request("http://localhost:3000/api/auth/get-session", {
        headers: { cookie: cookie ?? "", origin: "http://localhost:3000" },
      }),
    );
    const expiredPayload = (await expiredSession.json()) as {
      user?: unknown;
    } | null;
    expect(expiredPayload?.user).toBeUndefined();
  });
});
