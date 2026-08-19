import { describe, expect, it } from "vitest";
import {
  createSessionPrescriptionRequestSchema,
  createTrainingPlanRequestSchema,
  dataEnvelopeSchema,
  localDateSchema,
  prescriptionBlockContractSchema,
  problemJsonSchema,
} from "../../apps/studio/lib/contracts";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const athleteId = "22222222-2222-4222-8222-222222222222";

describe("F3 REST boundary contracts", () => {
  it("preserves local date and explicit canonical unit fields", () => {
    expect(localDateSchema.parse("2026-09-01")).toBe("2026-09-01");
    expect(() => localDateSchema.parse("09/01/2026")).toThrow();
    const block = prescriptionBlockContractSchema.parse({
      kind: "strength",
      ordinal: 1,
      exercises: [
        {
          movementId: "33333333-3333-4333-8333-333333333333",
          ordinal: 1,
          sets: [
            {
              ordinal: 1,
              targetRepMin: 5,
              targetRepMax: 5,
              targetLoadKg: 140,
              targetRestSeconds: 180,
              targetVelocityMps: 0.5,
            },
          ],
        },
      ],
    });
    expect(block.kind).toBe("strength");
  });

  it("validates plan/session DTOs and rejects unexpected authority fields", () => {
    const plan = createTrainingPlanRequestSchema.parse({
      workspaceId,
      athleteId,
      title: "Contract plan",
      startsOn: "2026-09-01",
      endsOn: "2026-09-30",
      timeZone: "America/Argentina/Buenos_Aires",
    });
    expect(plan.timeZone).toContain("America/");
    expect(() =>
      createTrainingPlanRequestSchema.parse({
        ...plan,
        actorId: "44444444-4444-4444-8444-444444444444",
      }),
    ).toThrow();
    const session = createSessionPrescriptionRequestSchema.parse({
      workspaceId,
      planId: "55555555-5555-4555-8555-555555555555",
      scheduledLocalDate: "2026-09-02",
      timeZone: "UTC",
      title: "Session",
      blocks: [],
    });
    expect(session.scheduledLocalDate).toBe("2026-09-02");
  });

  it("keeps problem+json and response envelopes explicit", () => {
    expect(
      problemJsonSchema.parse({
        type: "https://workoutpal.dev/problems/concurrency-conflict",
        title: "Conflict",
        status: 409,
        code: "CONCURRENCY_CONFLICT",
        requestId: "req-f3",
      }).code,
    ).toBe("CONCURRENCY_CONFLICT");
    expect(
      dataEnvelopeSchema(localDateSchema).parse({ data: "2026-09-01" }).data,
    ).toBe("2026-09-01");
  });
});
