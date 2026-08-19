import {
  createAthleteTrainingContext,
  updateAthleteTrainingContext,
} from "@workoutpal/athletes";
import type {
  AthleteId,
  Instant,
  UUID,
  WorkspaceId,
} from "@workoutpal/shared-kernel";
import { describe, expect, it } from "vitest";

const workspaceId = "11111111-1111-4111-8111-111111111111" as WorkspaceId;
const athleteId = "22222222-2222-4222-8222-222222222222" as AthleteId;
const actorId = "33333333-3333-4333-8333-333333333333" as UUID;
const instant = "2026-08-14T12:00:00.000Z" as Instant;

describe("athlete operational context", () => {
  it("keeps optional context distinct from identity and normalizes descriptive fields", () => {
    const context = createAthleteTrainingContext({
      id: "44444444-4444-4444-8444-444444444444" as UUID,
      workspaceId,
      athleteId,
      trainingAgeMonths: 18,
      availabilityNotes: "  Tuesdays and Thursdays  ",
      operationalConstraints: "  Two sessions per week ",
      equipmentAccess: ["barbell", "barbell", " bands "],
      trainingPreferences: "Short sessions",
      practitionerNotes: "Start with a conservative progression.",
      createdAt: instant,
      createdBy: actorId,
    });

    expect(context.version).toBe(1);
    expect(context.availabilityNotes).toBe("Tuesdays and Thursdays");
    expect(context.operationalConstraints).toBe("Two sessions per week");
    expect(context.equipmentAccess).toEqual(["barbell", "bands"]);
    expect(context.practitionerNotes).toBe(
      "Start with a conservative progression.",
    );
  });

  it("rejects scientific-looking training age values and preserves omitted fields", () => {
    const context = createAthleteTrainingContext({
      id: "55555555-5555-4555-8555-555555555555" as UUID,
      workspaceId,
      athleteId,
      createdAt: instant,
      createdBy: actorId,
    });
    const updated = updateAthleteTrainingContext(context, {
      availabilityNotes: "Weekends",
      updatedAt: instant,
      updatedBy: actorId,
    });

    expect(updated.trainingAgeMonths).toBeNull();
    expect(updated.availabilityNotes).toBe("Weekends");
    expect(updated.version).toBe(2);
    expect(() =>
      updateAthleteTrainingContext(context, {
        trainingAgeMonths: 1.5,
        updatedAt: instant,
        updatedBy: actorId,
      }),
    ).toThrow(/whole number/);
  });
});
