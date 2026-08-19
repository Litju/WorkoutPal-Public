import {
  projectSessionMonitoring,
  summarizeMonitoringViews,
} from "@workoutpal/monitoring";
import type {
  AthleteId,
  IanaTimeZone,
  Instant,
  LocalDate,
  UUID,
  WorkspaceId,
} from "@workoutpal/shared-kernel";
import type { SessionPrescription } from "@workoutpal/training-design";
import {
  applyExecutionAmendmentsToFact,
  createExecutionAmendment,
  createPerformedEnduranceSegment,
  createPerformedStrengthSet,
  startExecutedSession,
} from "@workoutpal/training-execution";
import { describe, expect, it } from "vitest";

const workspaceId = "11111111-1111-4111-8111-111111111111" as WorkspaceId;
const athleteId = "22222222-2222-4222-8222-222222222222" as AthleteId;
const movementId = "33333333-3333-4333-8333-333333333333" as UUID;
const exerciseId = "44444444-4444-4444-8444-444444444444" as UUID;
const setId = "55555555-5555-4555-8555-555555555555" as UUID;
const sessionId = "66666666-6666-4666-8666-666666666666" as UUID;
const factId = "77777777-7777-4777-8777-777777777777" as UUID;
const amendmentId = "88888888-8888-4888-8888-888888888888" as UUID;
const instant = "2026-09-01T12:00:00.000Z" as Instant;
const timeZone = "UTC" as IanaTimeZone;

function prescription(loadKg: number, revision = 1): SessionPrescription {
  return {
    id: sessionId,
    workspaceId,
    athleteId,
    planId: "99999999-9999-4999-8999-999999999999" as UUID,
    phaseId: null,
    scheduledLocalDate: "2026-09-01" as LocalDate,
    timeZone,
    title: "Strength facts",
    status: "published",
    revision,
    publishedRevision: revision,
    publishedAt: instant,
    publishedBy: workspaceId,
    blocks: [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as UUID,
        kind: "strength",
        ordinal: 1,
        exercises: [
          {
            id: exerciseId,
            movementId,
            ordinal: 1,
            sets: [
              {
                id: setId,
                ordinal: 1,
                targetRepMin: 5,
                targetRepMax: 5,
                targetLoadKg: loadKg,
              },
            ],
          },
        ],
      },
    ],
    archivedAt: null,
    createdAt: instant,
    createdBy: workspaceId,
    updatedAt: instant,
    updatedBy: workspaceId,
    version: revision,
  };
}

function executionFromSnapshot(snapshot: SessionPrescription) {
  return startExecutedSession({
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as UUID,
    workspaceId,
    athleteId,
    startedAt: instant,
    timeZone,
    prescription: {
      prescriptionId: snapshot.id,
      prescriptionVersion: snapshot.version,
      prescriptionRevision: snapshot.revision,
      snapshotFingerprint: "f".repeat(64),
      snapshot: snapshot as unknown as Record<string, never>,
    },
  });
}

function strengthFact(repetitions = 5, loadKg = 100) {
  return createPerformedStrengthSet({
    id: factId,
    workspaceId,
    sessionId: executionFromSnapshot(prescription(100)).id,
    movementId,
    prescriptionExerciseId: exerciseId,
    prescriptionSetId: setId,
    observedAt: instant,
    repetitions,
    loadKg,
  });
}

describe("F5 factual monitoring projection", () => {
  it("compares a recorded raw endurance speed to a prescribed range", () => {
    const segmentId = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa" as UUID;
    const planned: SessionPrescription = {
      ...prescription(100),
      blocks: [
        {
          id: "bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb" as UUID,
          kind: "endurance",
          ordinal: 1,
          segments: [
            {
              id: segmentId,
              parentSegmentId: null,
              ordinal: 1,
              kind: "work",
              repeatCount: 1,
              targetSpeedMpsMin: 2.5,
              targetSpeedMpsMax: 3.5,
            },
          ],
        },
      ],
    };
    const execution = executionFromSnapshot(planned);
    const fact = createPerformedEnduranceSegment({
      id: factId,
      workspaceId,
      sessionId: execution.id,
      prescriptionSegmentId: segmentId,
      observedAt: instant,
      averageSpeedMps: 3.25,
    });
    const view = projectSessionMonitoring({
      workspaceId,
      athleteId,
      prescription: planned,
      execution,
      strengthSets: [],
      enduranceSegments: [fact],
      mobilityItems: [],
      observations: [],
      amendments: [],
    });

    expect(view.endurance[0]?.observedSpeedMps).toBe(3.25);
    expect(view.endurance[0]?.status).toBe("MATCHED");
  });

  it("uses the execution snapshot instead of the latest prescription", () => {
    const historical = prescription(100, 1);
    const latest = prescription(140, 2);
    const execution = executionFromSnapshot(historical);
    const fact = {
      ...strengthFact(5, 100),
      sessionId: execution.id,
    };
    const view = projectSessionMonitoring({
      workspaceId,
      athleteId,
      prescription: latest,
      execution,
      strengthSets: [fact],
      enduranceSegments: [],
      mobilityItems: [],
      observations: [],
      amendments: [],
    });

    expect(view.prescription?.prescriptionRevision).toBe(1);
    expect(view.strength[0]?.prescribedLoadKg).toBe(100);
    expect(view.strength[0]?.status).toBe("MATCHED");
  });

  it("matches performed facts by stable prescription references", () => {
    const planned = prescription(100);
    const execution = executionFromSnapshot(planned);
    const fact = {
      ...strengthFact(5, 100),
      sessionId: execution.id,
      movementId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" as UUID,
    };
    const view = projectSessionMonitoring({
      workspaceId,
      athleteId,
      prescription: planned,
      execution,
      strengthSets: [fact],
      enduranceSegments: [],
      mobilityItems: [],
      observations: [],
      amendments: [],
    });

    expect(view.strength[0]?.performedFactId).toBe(fact.id);
    expect(view.strength[0]?.performedMovementId).toBe(fact.movementId);
    expect(view.strength[0]?.status).toBe("DIFFERENT");
  });

  it("uses the effective amendment while retaining original provenance", () => {
    const current = prescription(100);
    const execution = executionFromSnapshot(current);
    const fact = { ...strengthFact(5, 100), sessionId: execution.id };
    const amendment = createExecutionAmendment({
      id: amendmentId,
      workspaceId,
      sessionId: execution.id,
      factKind: "strength-set",
      factId: fact.id,
      actorId: workspaceId,
      reason: "The recorded load was corrected after review.",
      originalValues: { loadKg: 100 },
      correctedFields: { loadKg: 105 },
      occurredAt: "2026-09-02T12:00:00.000Z" as Instant,
    });
    const view = projectSessionMonitoring({
      workspaceId,
      athleteId,
      prescription: current,
      execution,
      strengthSets: [fact],
      enduranceSegments: [],
      mobilityItems: [],
      observations: [],
      amendments: [amendment],
    });

    expect(view.strength[0]?.performedLoadKg).toBe(105);
    expect(view.strength[0]?.amendments[0]?.amendmentId).toBe(amendmentId);
    expect(view.strength[0]?.amendments[0]?.originalValues.loadKg).toBe(100);
    expect(fact.loadKg).toBe(100);
    expect(applyExecutionAmendmentsToFact(fact, [amendment]).loadKg).toBe(105);
  });

  it("distinguishes a missing performed fact from a recorded zero", () => {
    const planned = prescription(0);
    const noExecution = projectSessionMonitoring({
      workspaceId,
      athleteId,
      prescription: planned,
      execution: null,
      strengthSets: [],
      enduranceSegments: [],
      mobilityItems: [],
      observations: [],
      amendments: [],
    });
    expect(noExecution.strength[0]?.status).toBe("NOT_PERFORMED");
    expect(noExecution.strength[0]?.performedRepetitions).toBeNull();

    const execution = executionFromSnapshot(planned);
    const zero = {
      ...strengthFact(0, 0),
      sessionId: execution.id,
    };
    const recordedZero = projectSessionMonitoring({
      workspaceId,
      athleteId,
      prescription: planned,
      execution,
      strengthSets: [zero],
      enduranceSegments: [],
      mobilityItems: [],
      observations: [],
      amendments: [],
    });
    expect(recordedZero.strength[0]?.performedRepetitions).toBe(0);
    expect(recordedZero.strength[0]?.status).toBe("DIFFERENT");
    expect(recordedZero.strength[0]?.status).not.toBe("NOT_PERFORMED");
  });

  it("classifies an execution without a prescription as unplanned", () => {
    const execution = startExecutedSession({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" as UUID,
      workspaceId,
      athleteId,
      startedAt: instant,
      timeZone,
    });
    const view = projectSessionMonitoring({
      workspaceId,
      athleteId,
      prescription: null,
      execution,
      strengthSets: [],
      enduranceSegments: [],
      mobilityItems: [],
      observations: [],
      amendments: [],
      sessionDate: "2026-09-01" as LocalDate,
    });
    expect(view.classification).toBe("UNPLANNED_EXECUTION");
    expect(view.prescription).toBeNull();
  });

  it("rejects a performed fact from another workspace", () => {
    const planned = prescription(100);
    const execution = executionFromSnapshot(planned);
    const foreignFact = {
      ...strengthFact(5, 100),
      workspaceId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" as WorkspaceId,
      sessionId: execution.id,
    };

    expect(() =>
      projectSessionMonitoring({
        workspaceId,
        athleteId,
        prescription: planned,
        execution,
        strengthSets: [foreignFact],
        enduranceSegments: [],
        mobilityItems: [],
        observations: [],
        amendments: [],
      }),
    ).toThrow("another workspace");
  });

  it("keeps deterministic counts and ordering", () => {
    const planned = prescription(100);
    const first = projectSessionMonitoring({
      workspaceId,
      athleteId,
      prescription: planned,
      execution: null,
      strengthSets: [],
      enduranceSegments: [],
      mobilityItems: [],
      observations: [],
      amendments: [],
    });
    const overview = summarizeMonitoringViews(
      workspaceId,
      athleteId,
      {
        kind: "day",
        startDate: "2026-09-01" as LocalDate,
        endDate: "2026-09-01" as LocalDate,
        timeZone,
      },
      [first],
    );
    expect(overview.prescribedSessionCount).toBe(1);
    expect(overview.executedSessionCount).toBe(0);
    expect(overview.counts.prescribedStrengthSetCount).toBe(1);
    expect(overview.sessions[0]?.classification).toBe("PRESCRIBED_NOT_STARTED");
  });
});
