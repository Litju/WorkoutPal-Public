import { randomUUID } from "node:crypto";
import {
  ApplicationError,
  createF2Application,
  type F2Application,
  type F2Persistence,
} from "@workoutpal/application";
import {
  createPostgresF2Persistence,
  type PostgresF2Persistence,
} from "@workoutpal/persistence-postgres";
import type { AthleteId, UUID, WorkspaceId } from "@workoutpal/shared-kernel";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://workoutpal:workoutpal_dev@127.0.0.1:55432/workoutpal";
let persistence: PostgresF2Persistence;
let app: F2Application;
let ownerA: UUID;
let ownerB: UUID;
let workspaceA: WorkspaceId;
let workspaceB: WorkspaceId;
let athleteA: AthleteId;
let athleteB: AthleteId;

describe("F2 real PostgreSQL vertical slice", () => {
  beforeAll(async () => {
    persistence = createPostgresF2Persistence({
      url: databaseUrl,
      applicationName: "workoutpal-f2-integration",
      ssl: false,
    });
    app = createF2Application(persistence);
    ownerA = randomUUID() as UUID;
    ownerB = randomUUID() as UUID;
    workspaceA = (
      await app.createWorkspace({
        principalId: ownerA,
        requestId: "f2-ws-a",
        name: `Integration A ${ownerA.slice(0, 8)}`,
      })
    ).id;
    workspaceB = (
      await app.createWorkspace({
        principalId: ownerB,
        requestId: "f2-ws-b",
        name: `Integration B ${ownerB.slice(0, 8)}`,
      })
    ).id;
  });

  afterAll(async () => {
    await persistence.close();
  });

  it("persists an unlinked athlete, retries idempotently, and records audit evidence", async () => {
    const first = await app.createAthlete({
      principalId: ownerA,
      requestId: "f2-athlete-create",
      workspaceId: workspaceA,
      displayName: "Unlinked Athlete",
      idempotencyKey: `athlete-${ownerA}`,
    });
    athleteA = first.id;
    const retry = await app.createAthlete({
      principalId: ownerA,
      requestId: "f2-athlete-retry",
      workspaceId: workspaceA,
      displayName: "Unlinked Athlete",
      idempotencyKey: `athlete-${ownerA}`,
    });
    expect(retry.id).toBe(first.id);
    expect(first.linkedUserId).toBeNull();
    const list = await app.listAthletes({
      principalId: ownerA,
      requestId: "f2-athlete-list",
      workspaceId: workspaceA,
    });
    expect(list.filter((item) => item.id === first.id)).toHaveLength(1);
    const audit = await app.listAudit({
      principalId: ownerA,
      requestId: "f2-audit",
      workspaceId: workspaceA,
      aggregateId: first.id,
    });
    expect(audit.map((event) => event.action)).toEqual(["athlete.created"]);
  });

  it("keeps workspaces isolated even when the caller knows a valid UUID", async () => {
    athleteB = (
      await app.createAthlete({
        principalId: ownerB,
        requestId: "f2-athlete-b",
        workspaceId: workspaceB,
        displayName: "Private Athlete",
        idempotencyKey: `athlete-${ownerB}`,
      })
    ).id;
    await expect(
      app.getAthlete({
        principalId: ownerA,
        requestId: "f2-cross-read",
        workspaceId: workspaceB,
        athleteId: athleteB,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      app.getAthlete({
        principalId: ownerB,
        requestId: "f2-cross-read-2",
        workspaceId: workspaceB,
        athleteId: athleteA,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      app.updateAthlete({
        principalId: ownerA,
        requestId: "f2-cross-update",
        workspaceId: workspaceB,
        athleteId: athleteB,
        expectedVersion: 1,
        displayName: "Spoofed",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      app.archiveAthlete({
        principalId: ownerA,
        requestId: "f2-cross-archive",
        workspaceId: workspaceB,
        athleteId: athleteB,
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      app.assignCoach({
        principalId: ownerA,
        requestId: "f2-cross-assignment",
        workspaceId: workspaceB,
        athleteId: athleteB,
        coachPrincipalId: ownerA,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("persists scoped coach assignments and audits both relationship mutations", async () => {
    const coachId = randomUUID() as UUID;
    await persistence.transaction(
      async (repositories) => {
        await repositories.memberships.insert({
          id: randomUUID() as UUID,
          workspaceId: workspaceA,
          principalId: coachId,
          role: "coach",
          status: "active",
        });
      },
      { principalId: ownerA, workspaceId: workspaceA },
    );
    const assignment = await app.assignCoach({
      principalId: ownerA,
      requestId: "f2-assignment-create",
      workspaceId: workspaceA,
      athleteId: athleteA,
      coachPrincipalId: coachId,
    });
    expect(
      await app.listCoachAssignments({
        principalId: ownerA,
        requestId: "f2-assignment-list",
        workspaceId: workspaceA,
        athleteId: athleteA,
      }),
    ).toContainEqual(assignment);
    await app.removeCoachAssignment({
      principalId: ownerA,
      requestId: "f2-assignment-remove",
      workspaceId: workspaceA,
      athleteId: athleteA,
      coachPrincipalId: coachId,
    });
    expect(
      await app.listCoachAssignments({
        principalId: ownerA,
        requestId: "f2-assignment-list-after",
        workspaceId: workspaceA,
        athleteId: athleteA,
      }),
    ).toEqual([]);
    const evidence = await app.listAudit({
      principalId: ownerA,
      requestId: "f2-assignment-audit",
      workspaceId: workspaceA,
    });
    expect(evidence.map((event) => event.action)).toEqual(
      expect.arrayContaining(["coach.assigned", "coach.removed"]),
    );
  });

  it("allows exactly one concurrent stale writer to win", async () => {
    const current = await app.getAthlete({
      principalId: ownerA,
      requestId: "f2-concurrency-read",
      workspaceId: workspaceA,
      athleteId: athleteA,
    });
    expect(current.version).toBe(1);
    const results = await Promise.allSettled([
      app.updateAthlete({
        principalId: ownerA,
        requestId: "f2-concurrency-1",
        workspaceId: workspaceA,
        athleteId: athleteA,
        expectedVersion: 1,
        displayName: "Writer One",
      }),
      app.updateAthlete({
        principalId: ownerA,
        requestId: "f2-concurrency-2",
        workspaceId: workspaceA,
        athleteId: athleteA,
        expectedVersion: 1,
        displayName: "Writer Two",
      }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason).toBeInstanceOf(
      ApplicationError,
    );
    expect(rejected?.status === "rejected" && rejected.reason.code).toBe(
      "VERSION_CONFLICT",
    );
    const final = await app.getAthlete({
      principalId: ownerA,
      requestId: "f2-concurrency-final",
      workspaceId: workspaceA,
      athleteId: athleteA,
    });
    expect(final.version).toBe(2);
    expect(["Writer One", "Writer Two"]).toContain(final.displayName);
  });

  it("archives instead of hard-deleting and keeps the audit trail", async () => {
    const current = await app.getAthlete({
      principalId: ownerA,
      requestId: "f2-archive-read",
      workspaceId: workspaceA,
      athleteId: athleteA,
    });
    const archived = await app.archiveAthlete({
      principalId: ownerA,
      requestId: "f2-archive",
      workspaceId: workspaceA,
      athleteId: athleteA,
      expectedVersion: current.version,
    });
    expect(archived.archivedAt).not.toBeNull();
    expect(
      await app.listAthletes({
        principalId: ownerA,
        requestId: "f2-active-after-archive",
        workspaceId: workspaceA,
      }),
    ).not.toContainEqual(expect.objectContaining({ id: athleteA }));
    const evidence = await app.listAudit({
      principalId: ownerA,
      requestId: "f2-archive-audit",
      workspaceId: workspaceA,
      aggregateId: athleteA,
    });
    expect(evidence.map((event) => event.action)).toContain("athlete.archived");
  });

  it("enforces append-only audit storage and rolls back audit failures", async () => {
    const client = await persistence.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `SELECT
           set_config('workoutpal.principal_id', $1, true),
           set_config('workoutpal.workspace_id', $2, true)`,
        [ownerA, workspaceA],
      );
      await expect(
        client.query(
          "UPDATE audit.event SET action = 'tampered' WHERE workspace_id = $1",
          [workspaceA],
        ),
      ).rejects.toThrow("audit.event is append-only");
      await client.query("ROLLBACK");

      await client.query("BEGIN");
      await client.query(
        `SELECT
           set_config('workoutpal.principal_id', $1, true),
           set_config('workoutpal.workspace_id', $2, true)`,
        [ownerA, workspaceA],
      );
      await expect(
        client.query("DELETE FROM audit.event WHERE workspace_id = $1", [
          workspaceA,
        ]),
      ).rejects.toThrow("audit.event is append-only");
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }

    const failingAuditPersistence: F2Persistence = {
      transaction: (work, context) =>
        persistence.transaction(
          (repositories) =>
            work({
              ...repositories,
              audit: {
                ...repositories.audit,
                append: async () => {
                  throw new Error("forced audit failure");
                },
              },
            }),
          context,
        ),
    };
    const failingAuditApp = createF2Application(failingAuditPersistence);
    await expect(
      failingAuditApp.createAthlete({
        principalId: ownerA,
        requestId: "f2-forced-audit-failure",
        workspaceId: workspaceA,
        displayName: "Must Roll Back",
        idempotencyKey: `audit-failure-${ownerA}`,
      }),
    ).rejects.toThrow("forced audit failure");
    expect(
      (
        await app.listAthletes({
          principalId: ownerA,
          requestId: "f2-forced-audit-check",
          workspaceId: workspaceA,
        })
      ).some((athlete) => athlete.displayName === "Must Roll Back"),
    ).toBe(false);
  });

  it("does not leave audit evidence when a later domain write fails", async () => {
    const coachId = randomUUID() as UUID;
    await persistence.transaction(
      async (repositories) => {
        await repositories.memberships.insert({
          id: randomUUID() as UUID,
          workspaceId: workspaceA,
          principalId: coachId,
          role: "coach",
          status: "active",
        });
      },
      { principalId: ownerA, workspaceId: workspaceA },
    );
    const failingDomainPersistence: F2Persistence = {
      transaction: (work, context) =>
        persistence.transaction(
          (repositories) =>
            work({
              ...repositories,
              coachAssignments: {
                ...repositories.coachAssignments,
                insert: async () => {
                  throw new Error("forced domain failure");
                },
              },
            }),
          context,
        ),
    };
    const failingDomainApp = createF2Application(failingDomainPersistence);
    await expect(
      failingDomainApp.createAthlete({
        principalId: coachId,
        requestId: "f2-forced-domain-failure",
        workspaceId: workspaceA,
        displayName: "Domain Must Roll Back",
        idempotencyKey: `domain-failure-${coachId}`,
      }),
    ).rejects.toThrow("forced domain failure");
    const evidence = await app.listAudit({
      principalId: ownerA,
      requestId: "f2-forced-domain-check",
      workspaceId: workspaceA,
    });
    expect(
      evidence.some(
        (event) => event.payload.displayName === "Domain Must Roll Back",
      ),
    ).toBe(false);
  });
});
