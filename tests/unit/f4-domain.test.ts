import type {
  AthleteId,
  IanaTimeZone,
  Instant,
  UUID,
  WorkspaceId,
} from "@workoutpal/shared-kernel";
import {
  applyExecutionAmendmentsToFact,
  completeExecutedSession,
  createExecutionAmendment,
  createPerformedEnduranceSegment,
  createPerformedStrengthSet,
  startExecutedSession,
} from "@workoutpal/training-execution";
import { describe, expect, it } from "vitest";

const workspaceId = "11111111-1111-4111-8111-111111111111" as WorkspaceId;
const athleteId = "22222222-2222-4222-8222-222222222222" as AthleteId;
const movementId = "33333333-3333-4333-8333-333333333333" as UUID;
const actorId = "44444444-4444-4444-8444-444444444444" as UUID;
const sessionId = "55555555-5555-4555-8555-555555555555" as UUID;
const factId = "66666666-6666-4666-8666-666666666666" as UUID;
const snapshot = {
  id: "77777777-7777-4777-8777-777777777777",
  title: "Published prescription",
  blocks: [],
};
const instant = "2026-08-11T12:00:00.000Z" as Instant;

describe("F4 observed execution domain", () => {
  it("records raw endurance speed without deriving it from distance or duration", () => {
    const fact = createPerformedEnduranceSegment({
      id: factId,
      workspaceId,
      sessionId,
      observedAt: instant,
      durationSeconds: 600,
      distanceMeters: 2000,
      averageSpeedMps: 3.25,
    });

    expect(fact.averageSpeedMps).toBe(3.25);
    expect(fact).not.toHaveProperty("pace");
    expect(() =>
      createPerformedEnduranceSegment({
        id: factId,
        workspaceId,
        sessionId,
        observedAt: instant,
        averageSpeedMps: -1,
      }),
    ).toThrow(/averageSpeedMps/);
  });

  it("starts from an immutable prescription snapshot identity", () => {
    const session = startExecutedSession({
      id: sessionId,
      workspaceId,
      athleteId,
      startedAt: instant,
      timeZone: "UTC" as IanaTimeZone,
      createdBy: actorId,
      prescription: {
        prescriptionId: snapshot.id as UUID,
        prescriptionVersion: 4,
        prescriptionRevision: 2,
        snapshotFingerprint: "a".repeat(64),
        snapshot,
      },
    });

    expect(session.prescription?.prescriptionRevision).toBe(2);
    expect(session.prescription?.prescriptionVersion).toBe(4);
    expect(session.prescription?.snapshot).toEqual(snapshot);
    expect(session.version).toBe(1);
  });

  it("preserves the original performed fact while applying an amendment view", () => {
    const fact = createPerformedStrengthSet({
      id: factId,
      workspaceId,
      sessionId,
      movementId,
      observedAt: instant,
      repetitions: 5,
      loadKg: 100,
    });
    const amendment = createExecutionAmendment({
      id: "88888888-8888-4888-8888-888888888888" as UUID,
      workspaceId,
      sessionId,
      factKind: "strength-set",
      factId,
      actorId,
      reason: "The athlete clarified the completed repetition count.",
      originalValues: { repetitions: 5 },
      correctedFields: { repetitions: 6 },
      occurredAt: instant,
    });
    const effective = applyExecutionAmendmentsToFact(fact, [amendment]);

    expect(fact.repetitions).toBe(5);
    expect(effective.repetitions).toBe(6);
    expect(amendment.originalValues?.repetitions).toBe(5);
  });

  it("requires a reason and a non-empty valid correction", () => {
    expect(() =>
      createExecutionAmendment({
        id: "99999999-9999-4999-8999-999999999999" as UUID,
        workspaceId,
        factId,
        actorId,
        reason: " ",
        correctedFields: { repetitions: 6 },
        occurredAt: instant,
      }),
    ).toThrow(/reason/);
    expect(() =>
      createExecutionAmendment({
        id: "99999999-9999-4999-8999-999999999999" as UUID,
        workspaceId,
        factKind: "strength-set",
        factId,
        actorId,
        reason: "Correction",
        correctedFields: {},
        occurredAt: instant,
      }),
    ).toThrow(/at least one/);
    expect(() =>
      createExecutionAmendment({
        id: "99999999-9999-4999-8999-999999999999" as UUID,
        workspaceId,
        factKind: "strength-set",
        factId,
        actorId,
        reason: "Correction",
        correctedFields: { distanceMeters: 12 },
        occurredAt: instant,
      }),
    ).toThrow(/field/);
  });

  it("does not permit completion to rewrite the starting snapshot", () => {
    const session = startExecutedSession({
      id: sessionId,
      workspaceId,
      athleteId,
      startedAt: instant,
      timeZone: "UTC" as IanaTimeZone,
      prescription: {
        prescriptionId: snapshot.id as UUID,
        prescriptionVersion: 1,
        prescriptionRevision: 1,
        snapshotFingerprint: "b".repeat(64),
        snapshot,
      },
    });
    const completed = completeExecutedSession(
      session,
      "2026-08-11T13:00:00.000Z" as Instant,
    );
    expect(completed.status).toBe("completed");
    expect(completed.prescription).toEqual(session.prescription);
    expect(session.status).toBe("started");
  });
});
