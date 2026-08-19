import {
  createF2Application,
  createF3Application,
  type F3Repositories,
  type PersistenceTransactionContext,
} from "@workoutpal/application";
import { createPostgresF2Persistence } from "@workoutpal/persistence-postgres";
import type { UUID } from "@workoutpal/shared-kernel";
import { describe, expect, it } from "vitest";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://workoutpal:workoutpal_dev@127.0.0.1:55432/workoutpal";

function id(): UUID {
  return crypto.randomUUID() as UUID;
}

describe("F3 Training Design with real PostgreSQL", () => {
  it("persists a multi-modality draft, publishes it idempotently, and preserves revisions", async () => {
    const persistence = createPostgresF2Persistence({
      url: databaseUrl,
      applicationName: "workoutpal-f3-integration",
      ssl: false,
    });
    const foundation = createF2Application(persistence);
    const design = createF3Application({
      transaction: persistence.f3Transaction,
    });
    const principalId = id();
    const workspace = await foundation.createWorkspace({
      principalId,
      requestId: "f3-bootstrap",
      name: `F3 Workspace ${id()}`,
    });
    const athlete = await foundation.createAthlete({
      principalId,
      requestId: "f3-athlete",
      workspaceId: workspace.id,
      displayName: `F3 Athlete ${id()}`,
      idempotencyKey: `f3-athlete-${id()}`,
    });
    const movement = await design.createWorkspaceMovement({
      principalId,
      requestId: "f3-movement",
      workspaceId: workspace.id,
      canonicalName: "F3 Squat",
      modality: "strength",
      equipmentTags: ["barbell"],
    });
    const mobilityMovement = await design.createWorkspaceMovement({
      principalId,
      requestId: "f3-mobility-movement",
      workspaceId: workspace.id,
      canonicalName: "F3 Hip Mobility",
      modality: "mobility",
    });
    const goal = await design.createTrainingGoal({
      principalId,
      requestId: "f3-goal",
      workspaceId: workspace.id,
      athleteId: athlete.id,
      title: "Increase squat strength",
      targetDate: "2026-12-31" as never,
    });
    const plan = await design.createTrainingPlan({
      principalId,
      requestId: "f3-plan",
      workspaceId: workspace.id,
      athleteId: athlete.id,
      title: "F3 Golden Week",
      startsOn: "2026-09-01" as never,
      endsOn: "2026-09-30" as never,
      timeZone: "America/Argentina/Buenos_Aires" as never,
      goalIds: [goal.id],
    });
    const phase = await design.createPlanPhase({
      principalId,
      requestId: "f3-phase",
      workspaceId: workspace.id,
      planId: plan.id,
      ordinal: 1,
      name: "September block",
      classification: "mesocycle",
      startsOn: "2026-09-01" as never,
      endsOn: "2026-09-30" as never,
    });
    await design.createPlanPhase({
      principalId,
      requestId: "f3-child-phase",
      workspaceId: workspace.id,
      planId: plan.id,
      parentPhaseId: phase.id,
      ordinal: 1,
      name: "First week",
      classification: "microcycle",
      startsOn: "2026-09-01" as never,
      endsOn: "2026-09-07" as never,
    });
    const session = await design.createSessionPrescription({
      principalId,
      requestId: "f3-session",
      workspaceId: workspace.id,
      planId: plan.id,
      phaseId: phase.id,
      scheduledLocalDate: "2026-09-01" as never,
      timeZone: "America/Argentina/Buenos_Aires" as never,
      title: "Tuesday mixed session",
      blocks: [
        {
          id: id(),
          kind: "strength",
          ordinal: 1,
          exercises: [
            {
              id: id(),
              movementId: movement.id,
              ordinal: 1,
              sets: [
                {
                  id: id(),
                  ordinal: 1,
                  targetRepMin: 5,
                  targetRepMax: 5,
                  targetLoadKg: 140,
                  targetRir: 2,
                  targetRirScale: "0-10",
                  targetRestSeconds: 180,
                },
              ],
            },
          ],
        },
        {
          id: id(),
          kind: "endurance",
          ordinal: 2,
          segments: [
            {
              id: id(),
              parentSegmentId: null,
              ordinal: 1,
              kind: "warmup",
              repeatCount: 1,
              durationSeconds: 600,
            },
            {
              id: id(),
              parentSegmentId: null,
              ordinal: 2,
              kind: "work",
              repeatCount: 5,
              durationSeconds: 240,
              targetRpe: 7,
            },
            {
              id: id(),
              parentSegmentId: null,
              ordinal: 3,
              kind: "recovery",
              repeatCount: 5,
              durationSeconds: 120,
            },
          ],
        },
        {
          id: id(),
          kind: "mobility",
          ordinal: 3,
          items: [
            {
              id: id(),
              movementId: mobilityMovement.id,
              ordinal: 1,
              sets: 3,
              holdSeconds: 45,
              side: "bilateral",
            },
          ],
        },
        {
          id: id(),
          kind: "generic",
          ordinal: 4,
          description: "Coach cue",
        },
      ],
    });
    const draft = await design.getTrainingPlan({
      principalId,
      requestId: "f3-reload-draft",
      workspaceId: workspace.id,
      planId: plan.id,
    });
    expect(draft.plan.status).toBe("draft");
    expect(draft.goals[0]?.id).toBe(goal.id);
    expect(draft.sessions[0]?.blocks).toHaveLength(4);
    expect(draft.sessions[0]?.id).toBe(session.id);
    expect(draft.phases).toHaveLength(2);

    const published = await design.publishTrainingPlan({
      principalId,
      requestId: "f3-publish",
      workspaceId: workspace.id,
      planId: plan.id,
      expectedVersion: plan.version,
      idempotencyKey: "f3-publish-once",
    });
    const retry = await design.publishTrainingPlan({
      principalId,
      requestId: "f3-publish-retry",
      workspaceId: workspace.id,
      planId: plan.id,
      expectedVersion: plan.version,
      idempotencyKey: "f3-publish-once",
    });
    expect(retry.id).toBe(published.id);
    expect(published.status).toBe("published");

    const revisions = await design.listTrainingPlanRevisions({
      principalId,
      requestId: "f3-revisions",
      workspaceId: workspace.id,
      planId: plan.id,
    });
    expect(revisions).toHaveLength(1);
    expect(revisions[0]?.snapshot.sessions[0]?.blocks).toHaveLength(4);

    const draftRevision = await design.createPlanRevision({
      principalId,
      requestId: "f3-revision-start",
      workspaceId: workspace.id,
      planId: plan.id,
      expectedVersion: published.version,
    });
    expect(draftRevision.status).toBe("draft");
    const changed = await design.updateTrainingPlan({
      principalId,
      requestId: "f3-revision-edit",
      workspaceId: workspace.id,
      planId: plan.id,
      expectedVersion: draftRevision.version,
      title: "F3 Golden Week Revised",
    });
    const publishedAgain = await design.publishTrainingPlan({
      principalId,
      requestId: "f3-publish-revision",
      workspaceId: workspace.id,
      planId: plan.id,
      expectedVersion: changed.version,
      idempotencyKey: "f3-publish-twice",
    });
    expect(publishedAgain.publishedRevision).toBe(2);
    const allRevisions = await design.listTrainingPlanRevisions({
      principalId,
      requestId: "f3-revisions-again",
      workspaceId: workspace.id,
      planId: plan.id,
    });
    expect(allRevisions).toHaveLength(2);
    expect(allRevisions[0]?.snapshot.plan.title).toBe("F3 Golden Week");
    expect(allRevisions[1]?.snapshot.plan.title).toBe("F3 Golden Week Revised");

    const audit = await foundation.listAudit({
      principalId,
      requestId: "f3-audit",
      workspaceId: workspace.id,
      aggregateId: plan.id,
    });
    expect(audit.map((event) => event.action)).toEqual(
      expect.arrayContaining([
        "training_plan.created",
        "training_plan.published",
        "published_revision.created",
      ]),
    );
    await persistence.close();
  });

  it("enforces stale writes, scoped movement references, and atomic audit rollback", async () => {
    const persistence = createPostgresF2Persistence({
      url: databaseUrl,
      applicationName: "workoutpal-f3-invariants",
      ssl: false,
    });
    const foundation = createF2Application(persistence);
    const design = createF3Application({
      transaction: persistence.f3Transaction,
    });
    const principalId = id();
    const workspace = await foundation.createWorkspace({
      principalId,
      requestId: "f3-invariants-workspace",
      name: `F3 Invariants ${id()}`,
    });
    const athlete = await foundation.createAthlete({
      principalId,
      requestId: "f3-invariants-athlete",
      workspaceId: workspace.id,
      displayName: `F3 Invariants Athlete ${id()}`,
      idempotencyKey: `f3-invariants-athlete-${id()}`,
    });
    const movement = await design.createWorkspaceMovement({
      principalId,
      requestId: "f3-invariants-movement",
      workspaceId: workspace.id,
      canonicalName: "Invariant movement",
      modality: "strength",
    });
    const plan = await design.createTrainingPlan({
      principalId,
      requestId: "f3-invariants-plan",
      workspaceId: workspace.id,
      athleteId: athlete.id,
      title: "Invariant plan",
      startsOn: "2026-09-01" as never,
      endsOn: "2026-09-30" as never,
      timeZone: "UTC" as never,
    });
    const session = await design.createSessionPrescription({
      principalId,
      requestId: "f3-invariants-session",
      workspaceId: workspace.id,
      planId: plan.id,
      scheduledLocalDate: "2026-09-01" as never,
      timeZone: "UTC" as never,
      title: "Invariant session",
      blocks: [
        {
          id: id(),
          kind: "strength",
          ordinal: 1,
          exercises: [
            {
              id: id(),
              movementId: movement.id,
              ordinal: 1,
              sets: [{ id: id(), ordinal: 1, targetRepMin: 5 }],
            },
          ],
        },
      ],
    });
    const changed = await design.updateSessionPrescription({
      principalId,
      requestId: "f3-invariants-session-edit",
      workspaceId: workspace.id,
      sessionId: session.id,
      expectedVersion: session.version,
      blocks: [
        ...session.blocks,
        { id: id(), kind: "generic", ordinal: 2, description: "Coach cue" },
      ],
    });
    expect(changed.version).toBe(session.version + 1);
    await expect(
      design.updateSessionPrescription({
        principalId,
        requestId: "f3-invariants-stale",
        workspaceId: workspace.id,
        sessionId: session.id,
        expectedVersion: session.version,
        title: "Stale write",
      }),
    ).rejects.toMatchObject({ code: "CONCURRENCY_CONFLICT" });

    const reloaded = await design.getSessionPrescription({
      principalId,
      requestId: "f3-invariants-reload",
      workspaceId: workspace.id,
      sessionId: session.id,
    });
    expect(reloaded.version).toBe(changed.version);
    const sessionAudit = await foundation.listAudit({
      principalId,
      requestId: "f3-invariants-audit",
      workspaceId: workspace.id,
      aggregateId: session.id,
    });
    expect(sessionAudit.map((event) => event.action)).toEqual(
      expect.arrayContaining([
        "block.composition_changed",
        "strength_prescription.changed",
      ]),
    );

    const otherPrincipal = id();
    const otherWorkspace = await foundation.createWorkspace({
      principalId: otherPrincipal,
      requestId: "f3-invariants-other-workspace",
      name: `F3 Other ${id()}`,
    });
    const otherMovement = await design.createWorkspaceMovement({
      principalId: otherPrincipal,
      requestId: "f3-invariants-other-movement",
      workspaceId: otherWorkspace.id,
      canonicalName: "Other workspace movement",
      modality: "strength",
    });
    await expect(
      design.updateSessionPrescription({
        principalId,
        requestId: "f3-invariants-cross-movement",
        workspaceId: workspace.id,
        sessionId: session.id,
        expectedVersion: reloaded.version,
        blocks: [
          {
            id: id(),
            kind: "strength",
            ordinal: 1,
            exercises: [
              {
                id: id(),
                movementId: otherMovement.id,
                ordinal: 1,
                sets: [{ id: id(), ordinal: 1, targetRepMin: 5 }],
              },
            ],
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });

    const failingDesign = createF3Application({
      transaction: <T>(
        work: (repositories: F3Repositories) => Promise<T>,
        context: PersistenceTransactionContext,
      ) =>
        persistence.f3Transaction(
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
    });
    await expect(
      failingDesign.createWorkspaceMovement({
        principalId,
        requestId: "f3-invariants-audit-failure",
        workspaceId: workspace.id,
        canonicalName: "Must roll back",
        modality: "general",
      }),
    ).rejects.toThrow("forced audit failure");
    const visible = await design.listVisibleMovements({
      principalId,
      requestId: "f3-invariants-visible",
      workspaceId: workspace.id,
    });
    expect(
      visible.some((candidate) => candidate.canonicalName === "Must roll back"),
    ).toBe(false);
    await persistence.close();
  });

  it("denies a guessed cross-workspace plan scope", async () => {
    const persistence = createPostgresF2Persistence({
      url: databaseUrl,
      applicationName: "workoutpal-f3-isolation",
      ssl: false,
    });
    const foundation = createF2Application(persistence);
    const design = createF3Application({
      transaction: persistence.f3Transaction,
    });
    const firstPrincipal = id();
    const secondPrincipal = id();
    const firstWorkspace = await foundation.createWorkspace({
      principalId: firstPrincipal,
      requestId: "f3-a",
      name: `F3 A ${id()}`,
    });
    const secondWorkspace = await foundation.createWorkspace({
      principalId: secondPrincipal,
      requestId: "f3-b",
      name: `F3 B ${id()}`,
    });
    const firstAthlete = await foundation.createAthlete({
      principalId: firstPrincipal,
      requestId: "f3-a-athlete",
      workspaceId: firstWorkspace.id,
      displayName: `A ${id()}`,
      idempotencyKey: `a-${id()}`,
    });
    const plan = await design.createTrainingPlan({
      principalId: firstPrincipal,
      requestId: "f3-a-plan",
      workspaceId: firstWorkspace.id,
      athleteId: firstAthlete.id,
      title: "Private plan",
      startsOn: "2026-09-01" as never,
      endsOn: "2026-09-02" as never,
      timeZone: "UTC" as never,
    });
    await expect(
      design.getTrainingPlan({
        principalId: secondPrincipal,
        requestId: "f3-cross",
        workspaceId: secondWorkspace.id,
        planId: plan.id,
      }),
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
    await persistence.close();
  });
});
