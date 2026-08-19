import {
  createF2Application,
  createF3Application,
  createF4Application,
  createF5Application,
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

function strengthBlock(movementId: UUID, targetLoadKg: number) {
  return [
    {
      id: id(),
      kind: "strength" as const,
      ordinal: 1,
      exercises: [
        {
          id: id(),
          movementId,
          ordinal: 1,
          sets: [
            {
              id: id(),
              ordinal: 1,
              targetRepMin: 5,
              targetRepMax: 5,
              targetLoadKg,
            },
          ],
        },
      ],
    },
  ];
}

describe("F5 Monitoring Shell with real PostgreSQL", () => {
  it("projects missed, matched/amended, historical, and unplanned sessions", async () => {
    const persistence = createPostgresF2Persistence({
      url: databaseUrl,
      applicationName: "workoutpal-f5-integration",
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
      const monitoring = createF5Application({
        transaction: persistence.f4Transaction,
      });
      const principalId = id();
      const workspace = await foundation.createWorkspace({
        principalId,
        requestId: "f5-workspace",
        name: `F5 Workspace ${id()}`,
      });
      const athlete = await foundation.createAthlete({
        principalId,
        requestId: "f5-athlete",
        workspaceId: workspace.id,
        displayName: `F5 Athlete ${id()}`,
        idempotencyKey: `f5-athlete-${id()}`,
      });
      const movement = await design.createWorkspaceMovement({
        principalId,
        requestId: "f5-movement",
        workspaceId: workspace.id,
        canonicalName: "F5 squat",
        modality: "strength",
      });
      const plan = await design.createTrainingPlan({
        principalId,
        requestId: "f5-plan",
        workspaceId: workspace.id,
        athleteId: athlete.id,
        title: "F5 monitoring plan",
        startsOn: "2026-09-01" as never,
        endsOn: "2026-09-10" as never,
        timeZone: "UTC" as never,
      });
      const matchedBlocks = strengthBlock(movement.id, 100);
      const matchedPrescription = await design.createSessionPrescription({
        principalId,
        requestId: "f5-matched-prescription",
        workspaceId: workspace.id,
        planId: plan.id,
        scheduledLocalDate: "2026-09-01" as never,
        timeZone: "UTC" as never,
        title: "Matched and amended",
        blocks: matchedBlocks,
      });
      const missedPrescription = await design.createSessionPrescription({
        principalId,
        requestId: "f5-missed-prescription",
        workspaceId: workspace.id,
        planId: plan.id,
        scheduledLocalDate: "2026-09-02" as never,
        timeZone: "UTC" as never,
        title: "Prescribed only",
        blocks: strengthBlock(movement.id, 80),
      });
      const historicalBlocks = strengthBlock(movement.id, 100);
      const historicalPrescription = await design.createSessionPrescription({
        principalId,
        requestId: "f5-historical-prescription",
        workspaceId: workspace.id,
        planId: plan.id,
        scheduledLocalDate: "2026-09-03" as never,
        timeZone: "UTC" as never,
        title: "Historical snapshot",
        blocks: historicalBlocks,
      });
      const published = await design.publishTrainingPlan({
        principalId,
        requestId: "f5-publish",
        workspaceId: workspace.id,
        planId: plan.id,
        expectedVersion: plan.version,
        idempotencyKey: `f5-publish-${id()}`,
      });
      const publishedHistorical = await design.getSessionPrescription({
        principalId,
        requestId: "f5-historical-published",
        workspaceId: workspace.id,
        sessionId: historicalPrescription.id,
      });
      expect(publishedHistorical.publishedRevision).toBe(1);

      const matched = await execution.startExecutedSession({
        principalId,
        requestId: "f5-start-matched",
        workspaceId: workspace.id,
        prescriptionId: matchedPrescription.id,
        idempotencyKey: `f5-start-matched-${id()}`,
        occurredAt: "2026-09-01T10:00:00.000Z" as never,
      });
      const historical = await execution.startExecutedSession({
        principalId,
        requestId: "f5-start-historical",
        workspaceId: workspace.id,
        prescriptionId: historicalPrescription.id,
        idempotencyKey: `f5-start-historical-${id()}`,
        occurredAt: "2026-09-03T10:00:00.000Z" as never,
      });
      const recorded = await execution.recordPerformedStrengthSet({
        principalId,
        requestId: "f5-record-matched",
        workspaceId: workspace.id,
        executionId: matched.id,
        expectedVersion: matched.version,
        movementId: movement.id,
        prescriptionSetId: matchedBlocks[0]?.exercises[0]?.sets[0]?.id,
        repetitions: 5,
        loadKg: 100,
        idempotencyKey: `f5-record-matched-${id()}`,
        occurredAt: "2026-09-01T10:05:00.000Z" as never,
      });
      await execution.recordPerformedStrengthSet({
        principalId,
        requestId: "f5-record-historical",
        workspaceId: workspace.id,
        executionId: historical.id,
        expectedVersion: historical.version,
        movementId: movement.id,
        prescriptionSetId: historicalBlocks[0]?.exercises[0]?.sets[0]?.id,
        repetitions: 5,
        loadKg: 100,
        idempotencyKey: `f5-record-historical-${id()}`,
        occurredAt: "2026-09-03T10:05:00.000Z" as never,
      });
      const completed = await execution.completeExecutedSession({
        principalId,
        requestId: "f5-complete-matched",
        workspaceId: workspace.id,
        executionId: matched.id,
        expectedVersion: recorded.session.version,
        idempotencyKey: `f5-complete-matched-${id()}`,
        occurredAt: "2026-09-01T10:10:00.000Z" as never,
      });
      const amended = await execution.amendPerformedFact({
        principalId,
        requestId: "f5-amend-matched",
        workspaceId: workspace.id,
        executionId: matched.id,
        expectedVersion: completed.session.version,
        factKind: "strength-set",
        factId: recorded.strengthSets[0]?.id as UUID,
        reason: "Corrected after athlete confirmation.",
        correctedFields: { repetitions: 6 },
        idempotencyKey: `f5-amend-matched-${id()}`,
        occurredAt: "2026-09-01T10:15:00.000Z" as never,
      });
      expect(amended.effectiveFacts[0]?.repetitions).toBe(6);

      const draftPlan = await design.createPlanRevision({
        principalId,
        requestId: "f5-create-revision",
        workspaceId: workspace.id,
        planId: plan.id,
        expectedVersion: published.version,
      });
      const draftHistoricalCurrent = await design.getSessionPrescription({
        principalId,
        requestId: "f5-historical-draft",
        workspaceId: workspace.id,
        sessionId: historicalPrescription.id,
      });
      const draftHistorical = await design.updateSessionPrescription({
        principalId,
        requestId: "f5-update-historical",
        workspaceId: workspace.id,
        sessionId: historicalPrescription.id,
        expectedVersion: draftHistoricalCurrent.version,
        blocks: strengthBlock(movement.id, 200),
      });
      await design.publishTrainingPlan({
        principalId,
        requestId: "f5-publish-revision",
        workspaceId: workspace.id,
        planId: plan.id,
        expectedVersion: draftPlan.version,
        idempotencyKey: `f5-publish-revision-${id()}`,
      });
      expect(draftHistorical.revision).toBe(2);

      const unplanned = await execution.startExecutedSession({
        principalId,
        requestId: "f5-start-unplanned",
        workspaceId: workspace.id,
        athleteId: athlete.id,
        idempotencyKey: `f5-start-unplanned-${id()}`,
        occurredAt: "2026-09-04T10:00:00.000Z" as never,
      });
      expect(unplanned.prescription).toBeNull();

      const overview = await monitoring.getAthleteMonitoringOverview({
        principalId,
        requestId: "f5-overview",
        workspaceId: workspace.id,
        athleteId: athlete.id,
        startDate: "2026-09-01" as never,
        endDate: "2026-09-04" as never,
        timeZone: "UTC" as never,
      });
      expect(overview.prescribedSessionCount).toBe(3);
      expect(overview.executedSessionCount).toBe(3);
      expect(overview.linkedExecutedSessionCount).toBe(2);
      expect(overview.completedSessionCount).toBe(1);
      expect(overview.unplannedSessionCount).toBe(1);
      expect(overview.amendedPerformedFactCount).toBe(1);
      expect(
        overview.sessions.find(
          (session) => session.id === missedPrescription.id,
        )?.classification,
      ).toBe("PRESCRIBED_NOT_STARTED");

      const matchedView = await monitoring.getSessionMonitoring({
        principalId,
        requestId: "f5-matched-detail",
        workspaceId: workspace.id,
        executionId: matched.id,
      });
      expect(matchedView.classification).toBe(
        "PRESCRIBED_WITH_EXECUTION_DEVIATION",
      );
      expect(matchedView.counts.amendedPerformedFactCount).toBe(1);
      expect(matchedView.strength[0]?.performedRepetitions).toBe(6);
      expect(matchedView.strength[0]?.status).toBe("DIFFERENT");
      expect(matchedView.strength[0]?.amendments).toHaveLength(1);
      expect(matchedView.strength[0]?.provenance.prescriptionRevision).toBe(1);

      const historicalView = await monitoring.getSessionMonitoring({
        principalId,
        requestId: "f5-historical-detail",
        workspaceId: workspace.id,
        executionId: historical.id,
      });
      expect(historicalView.prescription?.prescriptionRevision).toBe(1);
      expect(historicalView.strength[0]?.prescribedLoadKg).toBe(100);
      expect(historicalView.strength[0]?.performedLoadKg).toBe(100);
      expect(historicalView.strength[0]?.status).toBe("MATCHED");

      const unplannedView = await monitoring.getSessionMonitoring({
        principalId,
        requestId: "f5-unplanned-detail",
        workspaceId: workspace.id,
        executionId: unplanned.id,
      });
      expect(unplannedView.classification).toBe("UNPLANNED_EXECUTION");
      expect(unplannedView.prescription).toBeNull();
      expect(unplannedView.strength).toEqual([]);

      const missedDay = await monitoring.getAthleteDayMonitoring({
        principalId,
        requestId: "f5-missed-day",
        workspaceId: workspace.id,
        athleteId: athlete.id,
        startDate: "2026-09-02" as never,
        endDate: "2026-09-02" as never,
        date: "2026-09-02" as never,
        timeZone: "UTC" as never,
      });
      expect(missedDay.prescribedSessionCount).toBe(1);
      expect(missedDay.executedSessionCount).toBe(0);

      const otherPrincipal = id();
      const otherWorkspace = await foundation.createWorkspace({
        principalId: otherPrincipal,
        requestId: "f5-other-workspace",
        name: `F5 Other ${id()}`,
      });
      await expect(
        monitoring.getAthleteMonitoringOverview({
          principalId: otherPrincipal,
          requestId: "f5-cross-workspace-principal",
          workspaceId: workspace.id,
          athleteId: athlete.id,
          startDate: "2026-09-01" as never,
          endDate: "2026-09-04" as never,
          timeZone: "UTC" as never,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        monitoring.getAthleteMonitoringOverview({
          principalId: otherPrincipal,
          requestId: "f5-cross-workspace-athlete",
          workspaceId: otherWorkspace.id,
          athleteId: athlete.id,
          startDate: "2026-09-01" as never,
          endDate: "2026-09-04" as never,
          timeZone: "UTC" as never,
        }),
      ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
    } finally {
      await persistence.close();
    }
  }, 60_000);
});
