import {
  createF2Application,
  createF3Application,
  createF4Application,
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

describe("F4 Training Execution with real PostgreSQL", () => {
  it("preserves the published snapshot, observed facts, amendments, and audit atomically", async () => {
    const persistence = createPostgresF2Persistence({
      url: databaseUrl,
      applicationName: "workoutpal-f4-integration",
      ssl: false,
    });
    try {
      const foundation = createF2Application(persistence);
      const design = createF3Application({
        transaction: persistence.f3Transaction,
      });
      const execution = createF4Application({
        transaction: persistence.f4Transaction,
      });
      const principalId = id();
      const workspace = await foundation.createWorkspace({
        principalId,
        requestId: "f4-workspace",
        name: `F4 Workspace ${id()}`,
      });
      const athlete = await foundation.createAthlete({
        principalId,
        requestId: "f4-athlete",
        workspaceId: workspace.id,
        displayName: `F4 Athlete ${id()}`,
        idempotencyKey: `f4-athlete-${id()}`,
      });
      const strengthMovement = await design.createWorkspaceMovement({
        principalId,
        requestId: "f4-strength-movement",
        workspaceId: workspace.id,
        canonicalName: "F4 squat",
        modality: "strength",
      });
      const mobilityMovement = await design.createWorkspaceMovement({
        principalId,
        requestId: "f4-mobility-movement",
        workspaceId: workspace.id,
        canonicalName: "F4 mobility",
        modality: "mobility",
      });
      const plan = await design.createTrainingPlan({
        principalId,
        requestId: "f4-plan",
        workspaceId: workspace.id,
        athleteId: athlete.id,
        title: "F4 execution plan",
        startsOn: "2026-09-01" as never,
        endsOn: "2026-09-30" as never,
        timeZone: "UTC" as never,
      });
      const prescription = await design.createSessionPrescription({
        principalId,
        requestId: "f4-prescription",
        workspaceId: workspace.id,
        planId: plan.id,
        scheduledLocalDate: "2026-09-01" as never,
        timeZone: "UTC" as never,
        title: "F4 observed session",
        blocks: [
          {
            id: id(),
            kind: "strength",
            ordinal: 1,
            exercises: [
              {
                id: id(),
                movementId: strengthMovement.id,
                ordinal: 1,
                sets: [{ id: id(), ordinal: 1, targetRepMin: 5 }],
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
                kind: "work",
                repeatCount: 1,
                durationSeconds: 600,
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
                sets: 2,
                holdSeconds: 30,
              },
            ],
          },
        ],
      });
      const published = await design.publishTrainingPlan({
        principalId,
        requestId: "f4-publish",
        workspaceId: workspace.id,
        planId: plan.id,
        expectedVersion: plan.version,
        idempotencyKey: `f4-publish-${id()}`,
      });
      const publishedSession = await design.getSessionPrescription({
        principalId,
        requestId: "f4-published-session",
        workspaceId: workspace.id,
        sessionId: prescription.id,
      });
      expect(published.status).toBe("published");
      expect(publishedSession.status).toBe("published");

      const started = await execution.startExecutedSession({
        principalId,
        requestId: "f4-start",
        workspaceId: workspace.id,
        prescriptionId: prescription.id,
        idempotencyKey: "f4-start-once",
      });
      const startedRetry = await execution.startExecutedSession({
        principalId,
        requestId: "f4-start-retry",
        workspaceId: workspace.id,
        prescriptionId: prescription.id,
        idempotencyKey: "f4-start-once",
      });
      expect(startedRetry.id).toBe(started.id);
      expect(started.prescription?.snapshotFingerprint).toMatch(
        /^[0-9a-f]{64}$/,
      );
      expect(started.prescription?.prescriptionRevision).toBe(
        publishedSession.publishedRevision,
      );

      const revisedPlan = await design.createPlanRevision({
        principalId,
        requestId: "f4-revision-after-start",
        workspaceId: workspace.id,
        planId: plan.id,
        expectedVersion: published.version,
      });
      const reviewAfterRevision = await execution.getExecutionReview({
        principalId,
        requestId: "f4-review-after-revision",
        workspaceId: workspace.id,
        executionId: started.id,
      });
      expect(revisedPlan.version).toBeGreaterThan(published.version);
      expect(reviewAfterRevision.session.prescription).toEqual(
        started.prescription,
      );

      const strength = await execution.recordPerformedStrengthSet({
        principalId,
        requestId: "f4-strength",
        workspaceId: workspace.id,
        executionId: started.id,
        expectedVersion: started.version,
        movementId: strengthMovement.id,
        repetitions: 5,
        loadKg: 100,
        idempotencyKey: "f4-strength-once",
      });
      const strengthRetry = await execution.recordPerformedStrengthSet({
        principalId,
        requestId: "f4-strength-retry",
        workspaceId: workspace.id,
        executionId: started.id,
        expectedVersion: started.version,
        movementId: strengthMovement.id,
        repetitions: 5,
        loadKg: 100,
        idempotencyKey: "f4-strength-once",
      });
      expect(strengthRetry.session.version).toBe(strength.session.version);
      await expect(
        execution.recordPerformedEnduranceSegment({
          principalId,
          requestId: "f4-stale",
          workspaceId: workspace.id,
          executionId: started.id,
          expectedVersion: started.version,
          durationSeconds: 600,
        }),
      ).rejects.toMatchObject({ code: "CONCURRENCY_CONFLICT" });

      const endurance = await execution.recordPerformedEnduranceSegment({
        principalId,
        requestId: "f4-endurance",
        workspaceId: workspace.id,
        executionId: started.id,
        expectedVersion: strength.session.version,
        durationSeconds: 600,
        distanceMeters: 2000,
        averageSpeedMps: 3.333,
      });
      const mobility = await execution.recordPerformedMobilityItem({
        principalId,
        requestId: "f4-mobility",
        workspaceId: workspace.id,
        executionId: started.id,
        expectedVersion: endurance.session.version,
        movementId: mobilityMovement.id,
        repetitions: 8,
        durationSeconds: 30,
      });
      const observed = await execution.recordSessionObservation({
        principalId,
        requestId: "f4-observation",
        workspaceId: workspace.id,
        executionId: started.id,
        expectedVersion: mobility.session.version,
        kind: "note",
        valueText: "Athlete reported good tolerance.",
        idempotencyKey: "f4-observation-once",
      });
      expect(observed.strengthSets).toHaveLength(1);
      expect(observed.enduranceSegments).toHaveLength(1);
      expect(observed.enduranceSegments[0]?.averageSpeedMps).toBe(3.333);
      expect(observed.mobilityItems).toHaveLength(1);
      expect(observed.observations).toHaveLength(1);

      const completed = await execution.completeExecutedSession({
        principalId,
        requestId: "f4-complete",
        workspaceId: workspace.id,
        executionId: started.id,
        expectedVersion: observed.session.version,
        idempotencyKey: "f4-complete-once",
      });
      const completedRetry = await execution.completeExecutedSession({
        principalId,
        requestId: "f4-complete-retry",
        workspaceId: workspace.id,
        executionId: started.id,
        expectedVersion: observed.session.version,
        idempotencyKey: "f4-complete-once",
      });
      expect(completed.session.status).toBe("completed");
      expect(completedRetry.session.version).toBe(completed.session.version);

      const originalRepetitions = completed.strengthSets[0]?.repetitions;
      const amended = await execution.amendPerformedFact({
        principalId,
        requestId: "f4-amendment",
        workspaceId: workspace.id,
        executionId: started.id,
        expectedVersion: completed.session.version,
        factKind: "strength-set",
        factId: completed.strengthSets[0]?.id as UUID,
        reason: "Athlete confirmed one additional completed repetition.",
        correctedFields: { repetitions: 6 },
        idempotencyKey: "f4-amendment-once",
      });
      expect(amended.strengthSets[0]?.repetitions).toBe(originalRepetitions);
      expect(
        amended.effectiveFacts.find(
          (fact) => fact.id === completed.strengthSets[0]?.id,
        )?.repetitions,
      ).toBe(6);
      expect(amended.amendments).toHaveLength(1);

      const audit = await foundation.listAudit({
        principalId,
        requestId: "f4-audit",
        workspaceId: workspace.id,
        aggregateId: started.id,
      });
      expect(audit.map((event) => event.action)).toEqual(
        expect.arrayContaining([
          "executed_session.started",
          "performed_strength_set.recorded",
          "executed_session.completed",
          "execution_amendment.created",
        ]),
      );

      const otherPrincipal = id();
      const otherWorkspace = await foundation.createWorkspace({
        principalId: otherPrincipal,
        requestId: "f4-other-workspace",
        name: `F4 Other ${id()}`,
      });
      await expect(
        execution.getExecutionReview({
          principalId: otherPrincipal,
          requestId: "f4-cross-tenant",
          workspaceId: otherWorkspace.id,
          executionId: started.id,
        }),
      ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });

      const schema = await persistence.pool.query<{ table_name: string }>(
        `SELECT table_name
           FROM information_schema.tables
          WHERE table_schema = 'execution'
            AND table_name = ANY($1::text[])
          ORDER BY table_name`,
        [
          [
            "amendment",
            "endurance_segment",
            "mobility_item",
            "session",
            "session_observation",
            "strength_set",
          ],
        ],
      );
      expect(schema.rows.map((row) => row.table_name)).toEqual([
        "amendment",
        "endurance_segment",
        "mobility_item",
        "session",
        "session_observation",
        "strength_set",
      ]);
    } finally {
      await persistence.close();
    }
  }, 60_000);
});
