import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { runPostgresTransaction } from "../../packages/persistence-postgres/src/transactions";

function fakePool() {
  const queries: unknown[][] = [];
  let released = false;
  const client = {
    async query(...args: unknown[]) {
      queries.push(args);
      return { rows: [] };
    },
    release() {
      released = true;
    },
  };
  return {
    pool: {
      async connect() {
        return client;
      },
    } as unknown as Pool,
    queries,
    wasReleased: () => released,
  };
}

describe("PSC2 transaction seam", () => {
  it("sets transaction-local principal and workspace context before work", async () => {
    const harness = fakePool();
    const result = await runPostgresTransaction({
      pool: harness.pool,
      context: {
        principalId: "principal-1",
        workspaceId: "workspace-1",
      },
      work: async () => "ok",
    });

    expect(result).toBe("ok");
    expect(harness.queries[0]).toEqual(["BEGIN"]);
    expect(harness.queries[1]?.[0]).toEqual(
      expect.stringContaining(
        "set_config('workoutpal.principal_id', $1, true)",
      ),
    );
    expect(harness.queries[1]?.[1]).toEqual(["principal-1", "workspace-1"]);
    expect(harness.queries[2]).toEqual(["COMMIT"]);
    expect(harness.wasReleased()).toBe(true);
  });

  it("rolls back and releases the client when application work fails", async () => {
    const harness = fakePool();
    await expect(
      runPostgresTransaction({
        pool: harness.pool,
        context: { principalId: "principal-1" },
        work: async () => {
          throw new Error("work failed");
        },
      }),
    ).rejects.toThrow("work failed");

    expect(harness.queries[2]).toEqual(["ROLLBACK"]);
    expect(harness.wasReleased()).toBe(true);
  });
});
