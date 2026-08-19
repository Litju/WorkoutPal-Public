import type {
  IanaTimeZone,
  Instant,
  LocalDate,
  UUID,
  WorkspaceId,
} from "@workoutpal/shared-kernel";
import {
  createPlanPhase,
  createTrainingPlan,
  publishTrainingPlan,
  validateEnduranceSegmentTree,
  validatePlanPhaseHierarchy,
  validatePrescriptionBlocks,
} from "@workoutpal/training-design";
import { describe, expect, it } from "vitest";

const workspaceId = "11111111-1111-4111-8111-111111111111" as WorkspaceId;
const athleteId = "22222222-2222-4222-8222-222222222222" as never;
const instant = "2026-08-11T00:00:00.000Z" as Instant;

function id(): UUID {
  return crypto.randomUUID() as UUID;
}

function plan() {
  return createTrainingPlan({
    id: id(),
    workspaceId,
    athleteId,
    title: "Invariant plan",
    startsOn: "2026-09-01" as LocalDate,
    endsOn: "2026-09-30" as LocalDate,
    timeZone: "UTC" as IanaTimeZone,
    createdAt: instant,
    createdBy: id(),
  });
}

describe("F3 Training Design invariants", () => {
  it("rejects self-parent and indirect phase cycles", () => {
    const rootPlan = plan();
    const root = createPlanPhase({
      id: id(),
      workspaceId,
      planId: rootPlan.id,
      ordinal: 1,
      name: "Root",
      startsOn: "2026-09-01" as LocalDate,
      endsOn: "2026-09-30" as LocalDate,
      createdAt: instant,
      createdBy: id(),
    });
    const child = createPlanPhase({
      id: id(),
      workspaceId,
      planId: rootPlan.id,
      parentPhaseId: root.id,
      ordinal: 1,
      name: "Child",
      startsOn: "2026-09-01" as LocalDate,
      endsOn: "2026-09-15" as LocalDate,
      createdAt: instant,
      createdBy: id(),
    });
    expect(() =>
      validatePlanPhaseHierarchy(
        [{ ...root, parentPhaseId: child.id }, child],
        rootPlan,
      ),
    ).toThrow(/inside the parent|cycle/);
    expect(() =>
      validatePlanPhaseHierarchy(
        [{ ...root, parentPhaseId: root.id }],
        rootPlan,
      ),
    ).toThrow(/own parent/);
  });

  it("rejects child dates outside the parent and duplicate sibling ordinals", () => {
    const rootPlan = plan();
    const root = createPlanPhase({
      id: id(),
      workspaceId,
      planId: rootPlan.id,
      ordinal: 1,
      name: "Root",
      startsOn: "2026-09-05" as LocalDate,
      endsOn: "2026-09-20" as LocalDate,
      createdAt: instant,
      createdBy: id(),
    });
    const child = createPlanPhase({
      id: id(),
      workspaceId,
      planId: rootPlan.id,
      parentPhaseId: root.id,
      ordinal: 1,
      name: "Outside",
      startsOn: "2026-09-01" as LocalDate,
      endsOn: "2026-09-10" as LocalDate,
      createdAt: instant,
      createdBy: id(),
    });
    expect(() => validatePlanPhaseHierarchy([root, child], rootPlan)).toThrow(
      /inside the parent/,
    );
    expect(() =>
      validatePlanPhaseHierarchy([root, { ...root, id: id() }], rootPlan),
    ).toThrow(/ordinals/);
  });

  it("rejects endurance cycles, duplicate siblings, and incoherent ranges", () => {
    const first = id();
    const second = id();
    expect(() =>
      validateEnduranceSegmentTree([
        {
          id: first,
          parentSegmentId: second,
          ordinal: 1,
          kind: "work",
          repeatCount: 1,
        },
        {
          id: second,
          parentSegmentId: first,
          ordinal: 1,
          kind: "recovery",
          repeatCount: 1,
        },
      ]),
    ).toThrow(/cycle/);
    expect(() =>
      validateEnduranceSegmentTree([
        {
          id: first,
          parentSegmentId: null,
          ordinal: 1,
          kind: "work",
          repeatCount: 1,
          targetPowerWattsMin: 300,
          targetPowerWattsMax: 200,
        },
        {
          id: second,
          parentSegmentId: null,
          ordinal: 1,
          kind: "recovery",
          repeatCount: 1,
        },
      ]),
    ).toThrow(/minimum/);
  });

  it("keeps publication revision identity explicit and validates block ordinals", () => {
    const draft = plan();
    const published = publishTrainingPlan(draft, instant, id());
    expect(published.status).toBe("published");
    expect(published.publishedRevision).toBe(1);
    expect(published.version).toBe(draft.version + 1);
    expect(() =>
      validatePrescriptionBlocks([
        { id: id(), kind: "generic", ordinal: 1, description: "one" },
        { id: id(), kind: "generic", ordinal: 1, description: "duplicate" },
      ]),
    ).toThrow(/ordinals/);
  });
});
