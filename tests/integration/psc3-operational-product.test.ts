import {
  createF2Application,
  createF3Application,
  createSearchApplication,
} from "@workoutpal/application";
import {
  createPostgresF2Persistence,
  readPostgresConnectionConfig,
} from "@workoutpal/persistence-postgres";
import type { AthleteId, UUID, WorkspaceId } from "@workoutpal/shared-kernel";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://workoutpal_runtime_login:workoutpal_runtime_dev@127.0.0.1:55432/workoutpal";
const connectionConfig = readPostgresConnectionConfig({
  DATABASE_URL: databaseUrl,
});

let persistence: ReturnType<typeof createPostgresF2Persistence>;
let foundation: ReturnType<typeof createF2Application>;
let design: ReturnType<typeof createF3Application>;
let search: ReturnType<typeof createSearchApplication>;
let ownerA: UUID;
let ownerB: UUID;
let coachA: UUID;
let workspaceA: WorkspaceId;
let workspaceB: WorkspaceId;
let athleteA: AthleteId;
let athleteB: AthleteId;

function id(): UUID {
  return crypto.randomUUID() as UUID;
}

describe("PSC3 operational product with real PostgreSQL", () => {
  beforeAll(async () => {
    persistence = createPostgresF2Persistence({
      ...connectionConfig,
      applicationName: "workoutpal-psc3-operational-product",
    });
    foundation = createF2Application(persistence);
    design = createF3Application({ transaction: persistence.f3Transaction });
    search = createSearchApplication(persistence);
    ownerA = id();
    ownerB = id();
    coachA = id();
    workspaceA = (
      await foundation.createWorkspace({
        principalId: ownerA,
        requestId: "psc3-workspace-a",
        name: `PSC3 workspace A ${ownerA.slice(0, 8)}`,
      })
    ).id;
    workspaceB = (
      await foundation.createWorkspace({
        principalId: ownerB,
        requestId: "psc3-workspace-b",
        name: `PSC3 workspace B ${ownerB.slice(0, 8)}`,
      })
    ).id;
    athleteA = (
      await foundation.createAthlete({
        principalId: ownerA,
        requestId: "psc3-athlete-a",
        workspaceId: workspaceA,
        displayName: `PSC3 local athlete ${ownerA.slice(0, 8)}`,
        idempotencyKey: `psc3-athlete-a-${ownerA}`,
      })
    ).id;
    athleteB = (
      await foundation.createAthlete({
        principalId: ownerB,
        requestId: "psc3-athlete-b",
        workspaceId: workspaceB,
        displayName: `PSC3 foreign athlete ${ownerB.slice(0, 8)}`,
        idempotencyKey: `psc3-athlete-b-${ownerB}`,
      })
    ).id;
    await persistence.transaction(
      async (repositories) => {
        await repositories.memberships.insert({
          id: id(),
          workspaceId: workspaceA,
          principalId: coachA,
          role: "coach",
          status: "active",
        });
      },
      { principalId: ownerA, workspaceId: workspaceA },
    );
  });

  afterAll(async () => {
    await persistence.close();
  });

  it("persists athlete context with CAS, idempotency, and audit evidence", async () => {
    const created = await foundation.updateAthleteTrainingContext({
      principalId: ownerA,
      requestId: "psc3-context-create",
      workspaceId: workspaceA,
      athleteId: athleteA,
      expectedVersion: 0,
      trainingAgeMonths: 36,
      availabilityNotes: "Three weekday sessions",
      operationalConstraints: "No early morning sessions",
      equipmentAccess: ["barbell", "bands", "barbell"],
      trainingPreferences: "Short warm-ups",
      practitionerNotes: "Review the plan at the next check-in.",
      idempotencyKey: `psc3-context-${ownerA}`,
    });
    expect(created).toMatchObject({
      athleteId: athleteA,
      trainingAgeMonths: 36,
      availabilityNotes: "Three weekday sessions",
      equipmentAccess: ["barbell", "bands"],
      version: 1,
    });

    const retry = await foundation.updateAthleteTrainingContext({
      principalId: ownerA,
      requestId: "psc3-context-retry",
      workspaceId: workspaceA,
      athleteId: athleteA,
      expectedVersion: 0,
      trainingAgeMonths: 36,
      availabilityNotes: "Three weekday sessions",
      operationalConstraints: "No early morning sessions",
      equipmentAccess: ["barbell", "bands", "barbell"],
      trainingPreferences: "Short warm-ups",
      practitionerNotes: "Review the plan at the next check-in.",
      idempotencyKey: `psc3-context-${ownerA}`,
    });
    expect(retry).toEqual(created);

    const updated = await foundation.updateAthleteTrainingContext({
      principalId: ownerA,
      requestId: "psc3-context-update",
      workspaceId: workspaceA,
      athleteId: athleteA,
      expectedVersion: 1,
      availabilityNotes: "Two weekday sessions",
      idempotencyKey: `psc3-context-update-${ownerA}`,
    });
    expect(updated).toMatchObject({
      availabilityNotes: "Two weekday sessions",
      trainingAgeMonths: 36,
      version: 2,
    });
    await expect(
      foundation.updateAthleteTrainingContext({
        principalId: ownerA,
        requestId: "psc3-context-stale",
        workspaceId: workspaceA,
        athleteId: athleteA,
        expectedVersion: 1,
        availabilityNotes: "Stale writer",
      }),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });

    const audit = await foundation.listAudit({
      principalId: ownerA,
      requestId: "psc3-context-audit",
      workspaceId: workspaceA,
      aggregateId: created.id,
    });
    expect(audit.map((event) => event.action)).toEqual([
      "athlete_training_context.created",
      "athlete_training_context.updated",
    ]);
  });

  it("keeps settings owner-only and display preferences versioned", async () => {
    const members = await foundation.listWorkspaceMembers({
      principalId: ownerA,
      requestId: "psc3-members-list",
      workspaceId: workspaceA,
    });
    const owner = members.find((member) => member.principalId === ownerA);
    const coach = members.find((member) => member.principalId === coachA);
    if (owner === undefined || coach === undefined)
      throw new Error("PSC3 membership fixture was not created.");
    expect(coach).toMatchObject({ role: "coach", status: "active" });

    const preferences = await foundation.updateWorkspacePreferences({
      principalId: ownerA,
      requestId: "psc3-preferences-create",
      workspaceId: workspaceA,
      expectedVersion: 0,
      massUnit: "lb",
      distanceUnit: "mi",
      paceUnit: "per-mi",
      idempotencyKey: `psc3-preferences-${ownerA}`,
    });
    expect(preferences).toMatchObject({
      massUnit: "lb",
      distanceUnit: "mi",
      paceUnit: "per-mi",
      version: 1,
    });

    await expect(
      foundation.updateWorkspacePreferences({
        principalId: coachA,
        requestId: "psc3-preferences-coach-denied",
        workspaceId: workspaceA,
        expectedVersion: 1,
        massUnit: "kg",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      foundation.updateWorkspaceMemberRole({
        principalId: ownerA,
        requestId: "psc3-owner-demotion-denied",
        workspaceId: workspaceA,
        memberId: owner.id,
        role: "coach",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const suspended = await foundation.suspendWorkspaceMember({
      principalId: ownerA,
      requestId: "psc3-coach-suspend",
      workspaceId: workspaceA,
      memberId: coach.id,
      idempotencyKey: `psc3-coach-suspend-${ownerA}`,
    });
    expect(suspended).toMatchObject({
      principalId: coachA,
      status: "suspended",
    });
  });

  it("searches typed workspace records without foreign-tenant leakage", async () => {
    const localToken = `PSC3_LOCAL_${ownerA.slice(0, 8)}`;
    const foreignToken = `PSC3_FOREIGN_${ownerB.slice(0, 8)}`;
    await design.createWorkspaceMovement({
      principalId: ownerA,
      requestId: "psc3-local-movement",
      workspaceId: workspaceA,
      canonicalName: `${localToken} movement`,
      modality: "endurance",
      equipmentTags: ["treadmill"],
    });
    await design.createTrainingGoal({
      principalId: ownerA,
      requestId: "psc3-local-goal",
      workspaceId: workspaceA,
      athleteId: athleteA,
      title: `${localToken} goal`,
    });
    await design.createWorkspaceMovement({
      principalId: ownerB,
      requestId: "psc3-foreign-movement",
      workspaceId: workspaceB,
      canonicalName: `${foreignToken} movement`,
      modality: "endurance",
    });
    await design.createTrainingGoal({
      principalId: ownerB,
      requestId: "psc3-foreign-goal",
      workspaceId: workspaceB,
      athleteId: athleteB,
      title: `${foreignToken} goal`,
    });

    const localResults = await search.search({
      principalId: ownerA,
      requestId: "psc3-local-search",
      workspaceId: workspaceA,
      query: localToken,
      limit: 10,
    });
    expect(localResults.map((result) => result.kind)).toEqual(
      expect.arrayContaining(["movement", "goal"]),
    );
    expect(
      localResults.every((result) => result.title.includes(localToken)),
    ).toBe(true);
    expect(
      (
        await search.search({
          principalId: ownerA,
          requestId: "psc3-foreign-search",
          workspaceId: workspaceA,
          query: foreignToken,
          limit: 10,
        })
      ).map((result) => result.title),
    ).toEqual([]);
    await expect(
      search.search({
        principalId: ownerB,
        requestId: "psc3-cross-context-search",
        workspaceId: workspaceB,
        query: localToken,
        limit: 10,
      }),
    ).resolves.not.toContainEqual(
      expect.objectContaining({ title: expect.stringContaining(localToken) }),
    );
  });
});
