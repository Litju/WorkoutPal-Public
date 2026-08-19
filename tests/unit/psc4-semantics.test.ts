import {
  canonicalizeQuantity,
  convertQuantity,
  createQuantity,
  missing,
  parseEvidenceValue,
  parseIanaTimeZone,
  parseInstant,
  parseLocalDate,
  parseQuantity,
  present,
  serializeQuantity,
} from "@workoutpal/shared-kernel";
import { describe, expect, it } from "vitest";

describe("PSC4 runtime measurement semantics", () => {
  it("validates dimensions, rejects unknown units, and canonicalizes values", () => {
    const pounds = createQuantity({ value: 220.462262, unit: "lb" });
    expect(pounds.dimension).toBe("mass");
    expect(canonicalizeQuantity(pounds)).toMatchObject({
      unit: "kg",
      dimension: "mass",
    });
    expect(convertQuantity(pounds, "kg").value).toBeCloseTo(100, 5);
    expect(() => createQuantity({ value: 1, unit: "unknown" })).toThrow(
      "Unknown unit",
    );
    expect(() =>
      createQuantity({ value: 1, unit: "N", dimension: "mass" }),
    ).toThrow("not mass");
    expect(() => createQuantity({ value: Number.NaN, unit: "kg" })).toThrow(
      "finite",
    );
    expect(() => convertQuantity(pounds, "m")).toThrow("Cannot convert");
  });

  it("round-trips a serialized quantity without losing semantics", () => {
    const quantity = createQuantity({ value: 3.2, unit: "m/s" });
    expect(parseQuantity(serializeQuantity(quantity))).toEqual(quantity);
    expect(() => parseQuantity("not json")).toThrow("valid JSON");
    expect(() => parseQuantity('{"value":3.2,"unit":"made-up"}')).toThrow(
      "Unknown unit",
    );
  });

  it("keeps Instant, LocalDate, and timezone semantics separate", () => {
    expect(parseInstant("2026-08-15T12:00:00-03:00")).toBe(
      "2026-08-15T15:00:00.000Z",
    );
    expect(() => parseInstant("not an instant")).toThrow("ISO-8601");
    expect(parseLocalDate("2024-02-29")).toBe("2024-02-29");
    expect(() => parseLocalDate("2025-02-29")).toThrow("calendar");
    expect(parseIanaTimeZone("America/Argentina/Buenos_Aires")).toBe(
      "America/Argentina/Buenos_Aires",
    );
    expect(() => parseIanaTimeZone("Not/A_Timezone")).toThrow("Unknown");
  });

  it("preserves each missingness state independently", () => {
    expect(present(42)).toEqual({ kind: "PRESENT", value: 42 });
    for (const reason of [
      "NOT_RECORDED",
      "NOT_APPLICABLE",
      "INVALID",
      "EXCLUDED",
      "UNKNOWN",
    ] as const) {
      expect(missing(reason)).toEqual({ kind: "MISSING", reason });
    }
    expect(
      parseEvidenceValue({ kind: "PRESENT", value: "recorded" }, String),
    ).toEqual({ kind: "PRESENT", value: "recorded" });
    expect(() =>
      parseEvidenceValue(
        { kind: "MISSING", reason: "NOT_RECORDED", value: 1 },
        Number,
      ),
    ).toThrow("present value");
    expect(() =>
      parseEvidenceValue({ kind: "MISSING", reason: "bad" }, Number),
    ).toThrow("missingness");
  });
});
