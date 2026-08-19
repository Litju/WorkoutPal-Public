import {
  createDirectionDescriptor,
  createMeasurementModalityReference,
  createPhysicalObjectReference,
  createReferenceFrameReference,
} from "@workoutpal/movement-science";
import {
  createPositionVelocityRequest,
  createQualifiedSoftwareProvenance,
  type ExplicitVelocityInterval,
  type PositionTimeSample,
  type PositionTimeSeriesEvidence,
  PositionVelocitySciencePort,
} from "@workoutpal/science-port";
import { describe, expect, it } from "vitest";

const frame = createReferenceFrameReference({
  frameKind: "GLOBAL_LAB",
  frameId: "lab-frame",
  convention: "z-up",
});
const axis = createDirectionDescriptor({
  axis: "Z",
  sense: "POSITIVE",
  frame,
  label: "vertical-positive",
});

function evidence(
  samples: readonly PositionTimeSample[],
  overrides: Partial<PositionTimeSeriesEvidence> = {},
): PositionTimeSeriesEvidence {
  const declaredSamplingInterval =
    samples.length > 1 ? (samples[1]?.time ?? 0) - (samples[0]?.time ?? 0) : 0;
  return {
    samples,
    timebase: {
      declaredSamplingInterval,
      declaredSamplingIntervalUnit: "s",
      declaredSampleCount: samples.length,
      provenanceReference: "fixture:timebase-1",
      missingSamplePolicy: "REJECT",
      irregularSamplingPolicy: "REJECT",
    },
    positionUnit: "m",
    timeUnit: "s",
    objectOfInterest: createPhysicalObjectReference({
      objectKind: "IMPLEMENT",
      objectId: "barbell-1",
      label: "declared barbell implement",
    }),
    measurementPoint: createPhysicalObjectReference({
      objectKind: "MEASUREMENT_POINT",
      objectId: "barbell-1-tether-point",
      label: "declared tether attachment point",
    }),
    referenceFrame: frame,
    axis,
    modality: createMeasurementModalityReference({
      modalityId: "fixture-position-transducer",
      version: "1",
      kind: "POSITION_TRANSDUCER",
      label: "fixture linear position transducer",
    }),
    assessmentId: "assessment-1",
    trialId: "trial-1",
    quality: {
      acquisition: "VALID",
      trial: "VALID",
      exclusion: "INCLUDED",
      protocol: "APPLICABLE",
      input: "VALID",
    },
    calibrationStatus: "NOT_REQUIRED",
    ...overrides,
  };
}

function port(): PositionVelocitySciencePort {
  return new PositionVelocitySciencePort({
    software: createQualifiedSoftwareProvenance("a".repeat(40), "test-build"),
    qualification: {
      qualificationId: "test-qualification",
      qualificationVersion: "1",
      oracle: { id: "test-analytical-oracle", version: "1" },
      validationData: { id: "test-synthetic-data", version: "1" },
      sourceRevision: "a".repeat(40),
      buildId: "test-build",
    },
  });
}

async function compute(
  samples: readonly PositionTimeSample[],
  overrides: Partial<PositionTimeSeriesEvidence> = {},
  intervals?: readonly ExplicitVelocityInterval[],
) {
  const request = createPositionVelocityRequest({
    requestId: "request-1",
    evidence: evidence(samples, overrides),
    inputProvenance: [{ type: "PSC4_RAW_OBSERVATION", ref: "raw-series-1" }],
    intervals,
  });
  return port().compute(request);
}

function samplesFor(
  step: number,
  count: number,
  position: (time: number) => number,
): readonly PositionTimeSample[] {
  return Array.from({ length: count }, (_, index) => {
    const time = index * step;
    return { sampleIndex: index, time, position: position(time) };
  });
}

function velocityValues(
  result: Awaited<ReturnType<typeof compute>>,
): readonly number[] {
  if (result.status !== "ok")
    throw new Error(result.error?.message ?? "Expected success");
  const value = result.value as {
    samples: readonly { velocity_mps: number }[];
  };
  return value.samples.map((sample) => sample.velocity_mps);
}

function expectValuesClose(
  actual: readonly number[],
  expected: readonly number[],
): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => {
    expect(value).toBeCloseTo(expected[index] ?? Number.NaN, 12);
  });
}

describe("SCI-2 resistance-training position-to-velocity processor", () => {
  it("derives exact signed linear and quadratic velocities with explicit lineage", async () => {
    const linear = await compute(samplesFor(0.1, 5, (time) => 2 * time + 1));
    expect(linear.status).toBe("ok");
    expectValuesClose(velocityValues(linear), [2, 2, 2, 2, 2]);

    const quadratic = await compute(
      samplesFor(0.1, 5, (time) => 3 * time * time + 2 * time + 1),
    );
    expectValuesClose(velocityValues(quadratic), [2, 2.6, 3.2, 3.8, 4.4]);
    if (quadratic.status !== "ok") throw new Error("Expected a derived claim.");
    const value = quadratic.value as {
      claim: { claimClass: string; value: { kind: string } };
      derivation: { nodes: readonly unknown[] };
      recalculationHistory: { records: readonly unknown[] };
    };
    expect(value.claim.claimClass).toBe("MECHANICALLY_DERIVED");
    expect(value.claim.value.kind).toBe("REFERENCE");
    expect(value.derivation.nodes).toHaveLength(1);
    expect(value.recalculationHistory.records).toHaveLength(1);

    const distinctObject = await compute(
      samplesFor(0.1, 5, (time) => 2 * time + 1),
      {
        objectOfInterest: createPhysicalObjectReference({
          objectKind: "IMPLEMENT",
          objectId: "different-barbell",
          label: "different declared barbell implement",
        }),
      },
    );
    expect(linear.inputFingerprint).not.toBe(distinctObject.inputFingerprint);
  });

  it("qualifies the analytical sinusoid and shows second-order convergence", async () => {
    const angularFrequency = 3;
    const exact = (time: number) =>
      angularFrequency * Math.cos(angularFrequency * time);
    const errors: number[] = [];
    for (const [step, count] of [
      [0.1, 11],
      [0.05, 21],
      [0.025, 41],
    ] as const) {
      const result = await compute(
        samplesFor(step, count, (time) => Math.sin(angularFrequency * time)),
      );
      const values = velocityValues(result);
      errors.push(
        Math.max(
          ...values.map((value, index) =>
            Math.abs(value - exact(index * step)),
          ),
        ),
      );
    }
    expect(errors[1]).toBeLessThan(errors[0] / 3);
    expect(errors[2]).toBeLessThan(errors[1] / 3);
  });

  it("returns explicit interval summaries without inventing repetition boundaries", async () => {
    const result = await compute(
      samplesFor(0.1, 5, (time) => 2 * time),
      {},
      [
        {
          id: "manual-upward-interval",
          startIndex: 1,
          endIndex: 3,
          qualificationReference: "manual-annotation:phase-1",
        },
      ],
    );
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("Expected summary result.");
    const value = result.value as {
      intervalSummaries: readonly {
        interval_average_velocity_mps: number;
        peak_sampled_velocity_mps: number;
      }[];
      intervalQualifications: readonly { ref: string }[];
    };
    expect(value.intervalSummaries).toHaveLength(1);
    expect(
      value.intervalSummaries[0]?.interval_average_velocity_mps,
    ).toBeCloseTo(2, 12);
    expect(value.intervalSummaries[0]?.peak_sampled_velocity_mps).toBeCloseTo(
      2,
      12,
    );
    expect(value.intervalQualifications).toEqual([
      {
        type: "INTERVAL_QUALIFICATION",
        ref: "manual-annotation:phase-1",
      },
    ]);
  });

  it("preserves negative direction and rejects invalid evidence instead of repairing it", async () => {
    expectValuesClose(
      velocityValues(await compute(samplesFor(0.1, 5, (time) => -2 * time))),
      [-2, -2, -2, -2, -2],
    );

    const insufficient = await compute(samplesFor(0.1, 2, (time) => time));
    expect(insufficient).toMatchObject({
      status: "insufficient_input",
      error: { code: "INSUFFICIENT_SAMPLES" },
    });

    const duplicate = await compute([
      { sampleIndex: 0, time: 0, position: 0 },
      { sampleIndex: 1, time: 0.1, position: 0.1 },
      { sampleIndex: 2, time: 0.1, position: 0.2 },
      { sampleIndex: 3, time: 0.2, position: 0.3 },
    ]);
    expect(duplicate).toMatchObject({
      status: "invalid_input",
      error: { code: "DUPLICATE_TIMESTAMP" },
    });

    const nonFinite = await compute([
      { sampleIndex: 0, time: 0, position: 0 },
      { sampleIndex: 1, time: 0.1, position: Number.NaN },
      { sampleIndex: 2, time: 0.2, position: 0.2 },
    ]);
    expect(nonFinite).toMatchObject({
      status: "invalid_input",
      error: { code: "NON_FINITE_SAMPLE" },
    });

    const irregular = await compute([
      { sampleIndex: 0, time: 0, position: 0 },
      { sampleIndex: 1, time: 0.1, position: 0.1 },
      { sampleIndex: 2, time: 0.25, position: 0.25 },
      { sampleIndex: 3, time: 0.35, position: 0.35 },
    ]);
    expect(irregular).toMatchObject({
      status: "invalid_input",
      error: { code: "IRREGULAR_TIMEBASE_UNSUPPORTED" },
    });

    const wrongPoint = await compute(
      samplesFor(0.1, 5, (time) => time),
      {
        measurementPoint: createPhysicalObjectReference({
          objectKind: "IMPLEMENT",
          objectId: "barbell-1",
          label: "not a measurement point",
        }),
      },
    );
    expect(wrongPoint).toMatchObject({
      status: "invalid_input",
      error: { code: "MEASUREMENT_POINT_BINDING_MISSING" },
    });

    const invalidObjectKind = await compute(
      samplesFor(0.1, 5, (time) => time),
      {
        objectOfInterest: {
          objectKind: "NOT_A_REAL_OBJECT_KIND",
          objectId: "object-1",
          label: "invalid object",
        } as never,
      },
    );
    expect(invalidObjectKind).toMatchObject({
      status: "invalid_input",
      error: { code: "OBJECT_BINDING_MISSING" },
    });

    const missingSample = await compute([
      { sampleIndex: 0, time: 0, position: 0 },
      { sampleIndex: 1, time: 0.1, position: 0.1 },
      { sampleIndex: 3, time: 0.3, position: 0.3 },
    ]);
    expect(missingSample).toMatchObject({
      status: "invalid_input",
      error: { code: "MISSING_SAMPLE_UNSUPPORTED" },
    });

    const malformedIntervals = await compute(
      samplesFor(0.1, 5, (time) => time),
      {},
      "not-an-array" as never,
    );
    expect(malformedIntervals).toMatchObject({
      status: "method_unavailable",
      error: { code: "METHOD_NOT_APPLICABLE" },
    });

    const overflow = await compute([
      { sampleIndex: 0, time: 0, position: -1e308 },
      { sampleIndex: 1, time: 0.1, position: 0 },
      { sampleIndex: 2, time: 0.2, position: 1e308 },
    ]);
    expect(overflow).toMatchObject({
      status: "invalid_input",
      error: { code: "NUMERICAL_OVERFLOW" },
    });
  });

  it("does not execute until an exact qualification binding is supplied", async () => {
    const unqualified = new PositionVelocitySciencePort({
      software: createQualifiedSoftwareProvenance("b".repeat(40), "test-build"),
    });
    const request = createPositionVelocityRequest({
      requestId: "request-unqualified",
      evidence: evidence(samplesFor(0.1, 5, (time) => time)),
      inputProvenance: [{ type: "PSC4_RAW_OBSERVATION", ref: "raw-series-1" }],
    });
    const result = await unqualified.compute(request);
    expect(result).toMatchObject({
      status: "method_unavailable",
      error: { code: "PROCESSOR_NOT_QUALIFIED" },
    });
    expect(Object.hasOwn(result, "value")).toBe(false);

    const incompleteQualification = new PositionVelocitySciencePort({
      software: createQualifiedSoftwareProvenance("c".repeat(40), "test-build"),
      qualification: {} as never,
    });
    const incompleteResult = await incompleteQualification.compute(request);
    expect(incompleteResult).toMatchObject({
      status: "method_unavailable",
      error: { code: "PROCESSOR_NOT_QUALIFIED" },
    });

    const malformedRequest = await port().compute({} as never);
    expect(malformedRequest).toMatchObject({
      status: "invalid_input",
      error: { code: "REQUIRED_EVIDENCE_MISSING" },
    });
  });
});
