import { describe, expect, it } from "vitest";
import {
  monitoringFactStatusSchema,
  monitoringOverviewSchema,
  monitoringSessionStatusSchema,
  monitoringWindowQuerySchema,
} from "../../apps/studio/lib/contracts";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const athleteId = "22222222-2222-4222-8222-222222222222";

describe("F5 monitoring REST contracts", () => {
  it("uses explicit window and status vocabulary", () => {
    expect(
      monitoringWindowQuerySchema.parse({
        workspaceId,
        startDate: "2026-09-01",
        endDate: "2026-09-07",
        timeZone: "America/Argentina/Buenos_Aires",
      }),
    ).toMatchObject({ startDate: "2026-09-01", endDate: "2026-09-07" });
    expect(monitoringFactStatusSchema.parse("NOT_RECORDED")).toBe(
      "NOT_RECORDED",
    );
    expect(monitoringSessionStatusSchema.parse("UNPLANNED_EXECUTION")).toBe(
      "UNPLANNED_EXECUTION",
    );
  });

  it("rejects an opaque or scientific summary field", () => {
    const counts = {
      prescribedStrengthSetCount: 1,
      performedStrengthSetCount: 1,
      prescribedEnduranceSegmentCount: 0,
      performedEnduranceSegmentCount: 0,
      prescribedMobilityItemCount: 0,
      performedMobilityItemCount: 0,
      amendedPerformedFactCount: 0,
    };
    expect(() =>
      monitoringOverviewSchema.parse({
        workspaceId,
        athleteId,
        window: {
          kind: "day",
          startDate: "2026-09-01",
          endDate: "2026-09-01",
          timeZone: "UTC",
        },
        prescribedSessionCount: 1,
        executedSessionCount: 1,
        linkedExecutedSessionCount: 1,
        completedSessionCount: 1,
        unplannedSessionCount: 0,
        amendedPerformedFactCount: 0,
        counts,
        sessions: [],
        trainingLoad: 42,
      }),
    ).toThrow();
  });
});
