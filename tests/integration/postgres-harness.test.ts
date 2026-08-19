import { Client } from "pg";
import { describe, expect, it } from "vitest";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://workoutpal:workoutpal_dev@127.0.0.1:55432/workoutpal";

describe("real PostgreSQL F1 harness", () => {
  it("accepts a connection with the governed database and user", async () => {
    const client = new Client({
      connectionString: databaseUrl,
      application_name: "workoutpal-f1-test",
    });
    await client.connect();
    try {
      const identity = await client.query<{
        current_database: string;
        current_user: string;
      }>("SELECT current_database(), current_user");
      expect(identity.rows[0]).toEqual({
        current_database: "workoutpal",
        current_user: new URL(databaseUrl).username,
      });

      const namespaces = await client.query<{ schema_name: string }>(
        "SELECT schema_name FROM information_schema.schemata WHERE schema_name = ANY($1::text[]) ORDER BY schema_name",
        [
          [
            "auth",
            "iam",
            "athlete",
            "design",
            "execution",
            "assessment",
            "monitoring",
            "agent",
            "audit",
          ],
        ],
      );
      expect(namespaces.rows.map((row) => row.schema_name)).toEqual([
        "agent",
        "assessment",
        "athlete",
        "audit",
        "auth",
        "design",
        "execution",
        "iam",
        "monitoring",
      ]);
    } finally {
      await client.end();
    }
  });
});
