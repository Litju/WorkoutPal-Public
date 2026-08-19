import { describe, expect, it } from "vitest";
import {
  amendPerformedFactRequestSchema,
  recordPerformedEnduranceSegmentRequestSchema,
  recordPerformedStrengthSetRequestSchema,
  startExecutedSessionRequestSchema,
} from "../../apps/studio/lib/contracts";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const prescriptionId = "22222222-2222-4222-8222-222222222222";
const movementId = "33333333-3333-4333-8333-333333333333";

describe("F4 REST boundary contracts", () => {
  it("requires the prescription identity used to start an execution", () => {
    const request = startExecutedSessionRequestSchema.parse({
      workspaceId,
      prescriptionId,
      prescriptionRevision: 2,
      timeZone: "America/Argentina/Buenos_Aires",
    });
    expect(request.prescriptionRevision).toBe(2);
    expect(() =>
      startExecutedSessionRequestSchema.parse({ workspaceId }),
    ).toThrow();
  });

  it("keeps performed measurements in explicit canonical fields", () => {
    const request = recordPerformedStrengthSetRequestSchema.parse({
      workspaceId,
      expectedVersion: 1,
      movementId,
      repetitions: 5,
      loadKg: 100,
      rpe: 8,
    });
    expect(request.loadKg).toBe(100);
    expect(() =>
      recordPerformedStrengthSetRequestSchema.parse({
        ...request,
        targetLoadKg: 100,
      }),
    ).toThrow();
  });

  it("accepts raw observed speed in canonical metres per second", () => {
    const request = recordPerformedEnduranceSegmentRequestSchema.parse({
      workspaceId,
      expectedVersion: 1,
      durationSeconds: 600,
      distanceMeters: 2000,
      averageSpeedMps: 3.25,
    });
    expect(request.averageSpeedMps).toBe(3.25);
  });

  it("requires amendment reason and corrected fields", () => {
    const parsed = amendPerformedFactRequestSchema.parse({
      workspaceId,
      expectedVersion: 3,
      factKind: "strength-set",
      factId: movementId,
      reason: "Corrected after athlete review",
      correctedFields: { repetitions: 6 },
    });
    expect(parsed.correctedFields.repetitions).toBe(6);
    expect(() =>
      amendPerformedFactRequestSchema.parse({
        ...parsed,
        correctedFields: {},
      }),
    ).toThrow();
  });
});
