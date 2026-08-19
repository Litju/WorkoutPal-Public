import {
  NotImplementedScienceAdapter,
  SCIENCE_NOT_IMPLEMENTED,
} from "@workoutpal/science-contract";
import { describe, expect, it } from "vitest";

describe("SciencePort contract", () => {
  it("does not expose a numeric value for an unimplemented capability", async () => {
    const adapter = new NotImplementedScienceAdapter();
    const result = await adapter.compute({
      requestId: "00000000-0000-7000-8000-000000000010",
      capabilityId: "foundation.contract-test",
      inputs: {},
      inputProvenance: [],
    });

    expect(result).toMatchObject({
      requestId: "00000000-0000-7000-8000-000000000010",
      capabilityId: "foundation.contract-test",
      status: SCIENCE_NOT_IMPLEMENTED,
      error: { code: "SCIENCE_NOT_IMPLEMENTED" },
    });
    expect(Object.hasOwn(result, "value")).toBe(false);
  });
});
