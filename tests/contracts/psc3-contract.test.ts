import { describe, expect, it } from "vitest";
import {
  updateAthleteTrainingContextRequestSchema,
  workspaceMemberRoleUpdateRequestSchema,
  workspacePreferencesUpdateRequestSchema,
  workspaceSearchQuerySchema,
} from "../../apps/studio/lib/contracts";

const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("PSC3 HTTP contracts", () => {
  it("keeps athlete context operational and versioned", () => {
    expect(
      updateAthleteTrainingContextRequestSchema.parse({
        workspaceId,
        expectedVersion: 0,
        trainingAgeMonths: 18,
        availabilityNotes: "Early mornings",
        equipmentAccess: ["rack", "rack", "bands"],
      }),
    ).toMatchObject({
      workspaceId,
      expectedVersion: 0,
      trainingAgeMonths: 18,
    });
    expect(
      updateAthleteTrainingContextRequestSchema.safeParse({
        workspaceId,
        expectedVersion: 1,
        diagnosis: "not an operational context field",
      }).success,
    ).toBe(false);
  });

  it("bounds workspace search and keeps admin mutations typed", () => {
    expect(
      workspaceSearchQuerySchema.parse({
        workspaceId,
        q: "  squat ",
        limit: "10",
      }),
    ).toEqual({ workspaceId, q: "squat", limit: 10 });
    expect(
      workspaceSearchQuerySchema.safeParse({ workspaceId, limit: 51 }).success,
    ).toBe(false);
    expect(
      workspaceMemberRoleUpdateRequestSchema.safeParse({ role: "owner" })
        .success,
    ).toBe(true);
    expect(
      workspacePreferencesUpdateRequestSchema.safeParse({
        expectedVersion: 0,
        massUnit: "lb",
        distanceUnit: "mi",
        paceUnit: "per-mi",
      }).success,
    ).toBe(true);
  });
});
