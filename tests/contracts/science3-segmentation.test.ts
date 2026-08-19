import {
  createDirectionDescriptor,
  createMeasurementModalityReference,
  createPhysicalObjectReference,
  createReferenceFrameReference,
  type MovementTask,
  representativeSci1Fixtures,
} from "@workoutpal/movement-science";
import {
  createQualifiedSoftwareProvenance,
  createSegmentationProtocolDefinition,
  createSegmentationRequest,
  type Sci2VelocityLineage,
  SEGMENTATION_CAPABILITY_ID,
  SEGMENTATION_METHOD_ID,
  SEGMENTATION_METHOD_VERSION,
  SEGMENTATION_PROCESSOR_ID,
  SEGMENTATION_PROCESSOR_VERSION,
  type SegmentationConfiguration,
  type SegmentationKinematicEvidence,
  type SegmentationKinematicSample,
  type SegmentationProtocolDefinition,
  SegmentationSciencePort,
} from "@workoutpal/science-port";
import { describe, expect, it } from "vitest";

const frame = createReferenceFrameReference({
  frameKind: "GLOBAL_LAB",
  frameId: "fixture-lab-frame",
  convention: "z-up",
});
const axis = createDirectionDescriptor({
  axis: "Z",
  sense: "POSITIVE",
  frame,
  label: "fixture vertical axis",
});
const task: MovementTask = representativeSci1Fixtures().task;
const configuration: SegmentationConfiguration = {
  velocityEnterThresholdMps: 0.05,
  velocityExitThresholdMps: 0.025,
  minimumSustainedSamples: 2,
  minimumPrerollSamples: 3,
  minimumPostrollSamples: 3,
  minimumPhaseDurationSeconds: 0.1,
  minimumRepetitionDurationSeconds: 0.5,
  minimumExcursionMeters: 0.01,
  uniformAbsoluteToleranceSeconds: 1e-12,
  uniformRelativeTolerance: 1e-9,
  filtering: "NONE",
  interpolation: "NONE",
  dwellPolicy: "ALLOWED",
  boundaryPolicy: "SAMPLED_ONLY_NO_INTERPOLATION",
};
const software = createQualifiedSoftwareProvenance(
  "a".repeat(40),
  "test-build",
);
const sci2Lineage: Sci2VelocityLineage = {
  claimId: "sci2-velocity-claim-fixture",
  processor: {
    id: "resistance_training.linear_velocity_from_position",
    version: "1.0.0",
  },
  method: {
    id: "finite_difference.second_order_uniform",
    version: "1.0.0",
  },
  software,
  qualification: {
    status: "QUALIFIED",
    sourceRevision: software.sourceRevision,
    buildId: software.buildId,
  },
};

function protocol(reverse = false): SegmentationProtocolDefinition {
  const ascent = task.phases.find((phase) => phase.id === "ascent");
  const descent = task.phases.find((phase) => phase.id === "descent");
  if (ascent === undefined || descent === undefined)
    throw new Error("Fixture phases missing.");
  const ordered = reverse
    ? [
        { phase: descent, polarity: "NEGATIVE" as const },
        { phase: ascent, polarity: "POSITIVE" as const },
      ]
    : [
        { phase: ascent, polarity: "POSITIVE" as const },
        { phase: descent, polarity: "NEGATIVE" as const },
      ];
  return createSegmentationProtocolDefinition({
    kind: "SEGMENTATION_PROTOCOL",
    id: "fixture-segmentation-protocol",
    version: "1.0.0",
    revision: 1,
    supportedTaskClass:
      "ONE_DIMENSIONAL_BIDIRECTIONAL_IMPLEMENT_MOTION_2_PHASE",
    movementTask: {
      id: task.id,
      version: task.version,
      revision: task.revision,
    },
    expectedPhaseSequence: ordered.map(({ phase, polarity }) => ({
      movementTask: {
        id: task.id,
        version: task.version,
        revision: task.revision,
      },
      phaseId: phase.id,
      phaseOrdinal: phase.ordinal,
      phaseAction: phase.action,
      polarity,
    })) as SegmentationProtocolDefinition["expectedPhaseSequence"],
    filteringPolicy: "NONE_ONLY",
    interpolationPolicy: "NONE_ONLY",
    dwellPolicy: "ALLOWED",
    boundaryPolicy: "SAMPLED_ONLY_NO_INTERPOLATION",
    rationale:
      "Fixture protocol binds two explicit dynamic task phases and reports sampled boundaries only.",
  });
}

function velocities(first = 0.1, second = -0.1): readonly number[] {
  return [
    0,
    0,
    0,
    first,
    first,
    first,
    first,
    0,
    0,
    second,
    second,
    second,
    second,
    0,
    0,
    first,
    first,
    first,
    first,
    0,
    0,
    second,
    second,
    second,
    second,
    0,
    0,
    0,
  ];
}

function samplesFor(
  values: readonly number[],
  step = 0.1,
): readonly SegmentationKinematicSample[] {
  let position = 0;
  return values.map((velocity, sampleIndex) => {
    const sample = {
      sampleIndex,
      time: sampleIndex * step,
      position,
      velocity,
    };
    position += velocity * step;
    return sample;
  });
}

function evidence(
  samples: readonly SegmentationKinematicSample[],
  overrides: Partial<SegmentationKinematicEvidence> = {},
): SegmentationKinematicEvidence {
  return {
    samples,
    timebase: {
      declaredSamplingInterval: samples[1]?.time ?? 0,
      declaredSamplingIntervalUnit: "s",
      declaredSampleCount: samples.length,
      provenanceReference: "fixture:timebase",
      missingSamplePolicy: "REJECT",
      irregularSamplingPolicy: "REJECT",
    },
    positionUnit: "m",
    velocityUnit: "m/s",
    timeUnit: "s",
    objectOfInterest: createPhysicalObjectReference({
      objectKind: "IMPLEMENT",
      objectId: "fixture-barbell",
      label: "fixture implement",
    }),
    measurementPoint: createPhysicalObjectReference({
      objectKind: "MEASUREMENT_POINT",
      objectId: "fixture-barbell-point",
      label: "fixture measurement point",
    }),
    referenceFrame: frame,
    axis,
    modality: createMeasurementModalityReference({
      modalityId: "fixture-transducer",
      version: "1.0.0",
      kind: "POSITION_TRANSDUCER",
      label: "fixture position transducer",
    }),
    assessmentId: "assessment-fixture",
    trialId: "trial-fixture",
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

function port(
  qualified = true,
  engineInvoker?: ConstructorParameters<
    typeof SegmentationSciencePort
  >[0]["engineInvoker"],
): SegmentationSciencePort {
  const sourceRevision = qualified ? "a".repeat(40) : "b".repeat(40);
  return new SegmentationSciencePort({
    software: createQualifiedSoftwareProvenance(sourceRevision, "test-build"),
    configuration,
    ...(qualified
      ? {
          qualification: {
            qualificationId: "sci3-test-qualification",
            qualificationVersion: "1.0.0",
            oracle: { id: "sci3-test-oracle", version: "1.0.0" },
            validationData: { id: "sci3-test-fixtures", version: "1.0.0" },
            sourceRevision,
            buildId: "test-build",
          },
        }
      : {}),
    ...(engineInvoker === undefined ? {} : { engineInvoker }),
  });
}

async function compute(
  values = velocities(),
  protocolDefinition = protocol(),
  overrides: Partial<SegmentationKinematicEvidence> = {},
  selectedPort = port(),
) {
  const request = createSegmentationRequest({
    requestId: "sci3-request-fixture",
    evidence: evidence(samplesFor(values), overrides),
    sci2Lineage,
    movementTask: task,
    protocol: protocolDefinition,
    configuration,
    inputProvenance: [
      { type: "PSC4_RAW_OBSERVATION", ref: "raw-position-series-fixture" },
    ],
  });
  return selectedPort.compute(request);
}

describe("SCI-3 protocol-driven repetition and phase segmentation", () => {
  it("returns exact synthetic repetition/phase boundaries with SCI-0 lineage", async () => {
    const result = await compute();
    expect(result.status).toBe("ok");
    if (result.status !== "ok")
      throw new Error(result.error?.message ?? "Expected SCI-3 success.");
    const value = result.value as {
      repetitions: readonly {
        start: { sample_index: number };
        end: { sample_index: number };
        phases: readonly {
          start: { sample_index: number };
          end: { sample_index: number };
        }[];
      }[];
      claim: { claimClass: string; value: { kind: string } };
      derivation: { nodes: readonly { inputs: readonly unknown[] }[] };
      recalculationHistory: { records: readonly unknown[] };
    };
    expect(value.repetitions).toHaveLength(2);
    expect(
      value.repetitions.map((rep) => [
        rep.start.sample_index,
        rep.end.sample_index,
      ]),
    ).toEqual([
      [3, 12],
      [15, 24],
    ]);
    expect(
      value.repetitions[0]?.phases.map((phase) => [
        phase.start.sample_index,
        phase.end.sample_index,
      ]),
    ).toEqual([
      [3, 6],
      [9, 12],
    ]);
    expect(value.claim.claimClass).toBe("MECHANICALLY_DERIVED");
    expect(value.claim.value.kind).toBe("REFERENCE");
    expect(value.derivation.nodes[0]?.inputs).toHaveLength(2);
    expect(value.recalculationHistory.records).toHaveLength(1);
    expect(result.unit).toBeNull();
    expect(result.dimension).toBeNull();
  });

  it("binds reversed phase order to the protocol instead of global labels", async () => {
    const result = await compute(velocities(-0.1, 0.1), protocol(true));
    expect(result.status).toBe("ok");
    if (result.status !== "ok")
      throw new Error("Expected reversed protocol success.");
    const value = result.value as {
      repetitions: readonly { phases: readonly { polarity: string }[] }[];
    };
    expect(value.repetitions[0]?.phases.map((phase) => phase.polarity)).toEqual(
      ["NEGATIVE", "POSITIVE"],
    );
  });

  it("rejects unsupported ambiguity and preserves the filtering firewall", async () => {
    const subthreshold = await compute([
      0, 0, 0, 0.04, 0.04, 0.04, 0.04, 0, 0, 0, 0,
    ]);
    expect(subthreshold).toMatchObject({
      status: "invalid_input",
      error: { code: "PROTOCOL_INCOMPATIBLE" },
    });

    const filteredConfiguration = {
      ...configuration,
      filtering: "MOVING_AVERAGE" as never,
    };
    const filteredPort = new SegmentationSciencePort({
      software,
      configuration: filteredConfiguration,
      qualification: {
        qualificationId: "sci3-test-qualification",
        qualificationVersion: "1.0.0",
        oracle: { id: "sci3-test-oracle", version: "1.0.0" },
        validationData: { id: "sci3-test-fixtures", version: "1.0.0" },
        sourceRevision: software.sourceRevision,
        buildId: software.buildId,
      },
    });
    const filtered = await compute(velocities(), protocol(), {}, filteredPort);
    expect(filtered).toMatchObject({
      status: "method_unavailable",
      error: { code: "UNSUPPORTED_CONFIGURATION" },
    });
  });

  it("does not execute without an exact SCI-3 qualification binding", async () => {
    const result = await compute(velocities(), protocol(), {}, port(false));
    expect(result).toMatchObject({
      status: "method_unavailable",
      error: { code: "PROCESSOR_NOT_QUALIFIED" },
    });
    expect(Object.hasOwn(result, "value")).toBe(false);
  });

  it("exposes only the narrow capability and exact processor identity", async () => {
    const capabilities = await port().capabilities();
    expect(capabilities).toEqual([
      expect.objectContaining({
        capabilityId: SEGMENTATION_CAPABILITY_ID,
        status: "ok",
      }),
    ]);
    expect(port().contract.processor).toEqual({
      id: SEGMENTATION_PROCESSOR_ID,
      version: SEGMENTATION_PROCESSOR_VERSION,
    });
    expect(port().contract.method).toEqual({
      id: SEGMENTATION_METHOD_ID,
      version: SEGMENTATION_METHOD_VERSION,
    });
  });
});
