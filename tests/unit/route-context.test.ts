import { describe, expect, it } from "vitest";
import {
  parseRouteContext,
  selectRouteEntity,
  validateRouteContext,
} from "../../apps/studio/app/route-context";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const athleteId = "22222222-2222-4222-8222-222222222222";
const planId = "33333333-3333-4333-8333-333333333333";
const phaseId = "44444444-4444-4444-8444-444444444444";
const sessionId = "66666666-6666-4666-8666-666666666666";
const executionId = "77777777-7777-4777-8777-777777777777";
const goalId = "88888888-8888-4888-8888-888888888888";
const assessmentId = "99999999-9999-4999-8999-999999999999";
const movementId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const reportId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("route context", () => {
  it("keeps validated entity identifiers explicit", () => {
    expect(
      parseRouteContext({ workspaceId, athleteId, planId, phaseId }),
    ).toEqual({ workspaceId, athleteId, planId, phaseId });
  });

  it("rejects malformed identifiers and incomplete entity routes", () => {
    expect(parseRouteContext({ workspaceId: "not-an-id" })).toBeNull();
    expect(
      validateRouteContext("TRN-04", { workspaceId, athleteId, planId }),
    ).toBeNull();
  });

  it("validates the route contract for distinct downstream entity surfaces", () => {
    const context = {
      workspaceId,
      athleteId,
      goalId,
      planId,
      phaseId,
      sessionId,
      executionId,
      assessmentId,
      movementId,
      reportId,
    };
    for (const surfaceId of [
      "ATH-06",
      "TRN-04",
      "TRN-07",
      "EXE-06",
      "MON-02",
      "LIB-02",
      "ASM-03",
      "RPT-03",
    ]) {
      expect(validateRouteContext(surfaceId, context)).toEqual(context);
    }
  });

  it("does not fall back when a route-selected entity is absent", () => {
    const result = selectRouteEntity(
      [{ id: planId }, { id: phaseId }],
      "55555555-5555-4555-8555-555555555555",
    );
    expect(result).toEqual({
      kind: "missing",
      requestedId: "55555555-5555-4555-8555-555555555555",
    });
  });

  it("uses the first entity only when the route has no specific identifier", () => {
    expect(
      selectRouteEntity([{ id: planId }, { id: phaseId }], undefined),
    ).toEqual({
      kind: "default",
      value: { id: planId },
    });
  });
});
