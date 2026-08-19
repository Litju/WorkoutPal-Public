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
  createRepPhaseKinematicMetricsRequest,
  createSegmentationProtocolDefinition,
  type RepPhaseBoundary,
  type RepPhaseKinematicMetricsRequestInput,
  RepPhaseKinematicMetricsSciencePort,
  type RepPhaseMetricRequest,
  type RepPhaseRepetition,
  type RepPhaseSegmentationValue,
  type Sci2IntervalSummaryBinding,
  type SegmentationKinematicEvidence,
  type SegmentationKinematicSample,
  type SegmentationProtocolDefinition,
} from "@workoutpal/science-port";
import { describe, expect, it } from "vitest";

const frame = createReferenceFrameReference({
  frameKind: "GLOBAL_LAB",
  frameId: "sci4-fixture-frame",
  convention: "z-up",
});
const task: MovementTask = representativeSci1Fixtures().task;
const software = createQualifiedSoftwareProvenance(
  "a".repeat(40),
  "test-build",
);
const sci2ClaimId = "sci2-velocity-claim-fixture";
const sci3ClaimId = "sci3-segmentation-claim-fixture";

function phaseDefinitions(reverse = false): SegmentationProtocolDefinition {
  const ascent = task.phases.find((phase) => phase.id === "ascent");
  const descent = task.phases.find((phase) => phase.id === "descent");
  if (ascent === undefined || descent === undefined)
    throw new Error("SCI-1 fixture phases are missing.");
  const ordered = [
    {
      phase: ascent,
      polarity: reverse ? ("NEGATIVE" as const) : ("POSITIVE" as const),
    },
    {
      phase: descent,
      polarity: reverse ? ("POSITIVE" as const) : ("NEGATIVE" as const),
    },
  ];
  return createSegmentationProtocolDefinition({
    kind: "SEGMENTATION_PROTOCOL",
    id: "sci4-fixture-protocol",
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
    rationale: "SCI-4 exact sampled fixture protocol.",
  });
}

function boundary(sampleIndex: number, stepSeconds = 0.1): RepPhaseBoundary {
  return {
    sample_index: sampleIndex,
    time_s: sampleIndex * stepSeconds,
    event_type: "FIXTURE_SAMPLE_BOUNDARY",
    event_method: "SAMPLE_STATE_TRANSITION_NO_INTERPOLATION",
    temporal_resolution_s: stepSeconds,
  };
}

function sourceValue(
  units: "SI" | "CONVERTED" = "SI",
  reverseAxis = false,
): RepPhaseSegmentationValue {
  const canonicalTimes = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7];
  const canonicalPositions = [0, 0.1, 0.3, 0.6, 0.5, 0.3, 0, 0];
  const canonicalVelocities = [0, 1, 2, 3, -1, -2, -3, 0];
  const directionSign = reverseAxis ? -1 : 1;
  const samples: SegmentationKinematicSample[] = canonicalTimes.map(
    (time, sampleIndex) => ({
      sampleIndex,
      time: units === "SI" ? time : time * 1000,
      position:
        (units === "SI"
          ? canonicalPositions[sampleIndex]
          : (canonicalPositions[sampleIndex] ?? 0) * 100) * directionSign,
      velocity:
        (units === "SI"
          ? canonicalVelocities[sampleIndex]
          : (canonicalVelocities[sampleIndex] ?? 0) * 3.6) * directionSign,
    }),
  );
  const axis = createDirectionDescriptor({
    axis: "Z",
    sense: reverseAxis ? "NEGATIVE" : "POSITIVE",
    frame,
    label: "fixture vertical axis",
  });
  const measurement: SegmentationKinematicEvidence = {
    samples,
    timebase: {
      declaredSamplingInterval: units === "SI" ? 0.1 : 100,
      declaredSamplingIntervalUnit: units === "SI" ? "s" : "ms",
      declaredSampleCount: samples.length,
      provenanceReference: "fixture:sci4-timebase",
      missingSamplePolicy: "REJECT",
      irregularSamplingPolicy: "REJECT",
    },
    positionUnit: units === "SI" ? "m" : "cm",
    velocityUnit: units === "SI" ? "m/s" : "km/h",
    timeUnit: units === "SI" ? "s" : "ms",
    objectOfInterest: createPhysicalObjectReference({
      objectKind: "IMPLEMENT",
      objectId: "fixture-barbell",
      label: "fixture barbell",
    }),
    measurementPoint: createPhysicalObjectReference({
      objectKind: "MEASUREMENT_POINT",
      objectId: "fixture-barbell-point",
      label: "fixture measurement point",
    }),
    referenceFrame: frame,
    axis,
    modality: createMeasurementModalityReference({
      modalityId: "fixture-position-transducer",
      version: "1.0.0",
      kind: "POSITION_TRANSDUCER",
      label: "fixture position transducer",
    }),
    assessmentId: "assessment-sci4-fixture",
    trialId: "trial-sci4-fixture",
    quality: {
      acquisition: "VALID",
      trial: "VALID",
      exclusion: "INCLUDED",
      protocol: "APPLICABLE",
      input: "VALID",
    },
    calibrationStatus: "NOT_REQUIRED",
  };
  const protocol = phaseDefinitions(reverseAxis);
  const expected = protocol.expectedPhaseSequence;
  const phaseOne = expected[0];
  const phaseTwo = expected[1];
  if (phaseOne === undefined || phaseTwo === undefined)
    throw new Error("SCI-4 fixture protocol is incomplete.");
  const makePhase = (
    phaseReference: (typeof expected)[number],
    start: number,
    end: number,
  ): RepPhaseRepetition["phases"][number] => ({
    phase_ref: {
      movement_task: phaseReference.movementTask,
      phase_id: phaseReference.phaseId,
      phase_ordinal: phaseReference.phaseOrdinal,
      phase_action: phaseReference.phaseAction,
    },
    polarity: phaseReference.polarity,
    start: boundary(start),
    end: boundary(end),
    duration_s: (end - start) * 0.1,
    excursion_m: Math.abs(
      (canonicalPositions[end] ?? 0) - (canonicalPositions[start] ?? 0),
    ),
  });
  const repetition: RepPhaseRepetition = {
    ordinal: 1,
    complete: true,
    start: boundary(1),
    end: boundary(6),
    duration_s: 0.5,
    phases: [makePhase(phaseOne, 1, 3), makePhase(phaseTwo, 4, 6)],
    dwell_intervals: [],
  };
  const qualification = {
    status: "QUALIFIED" as const,
    identity: {
      qualificationId: "sci3-fixture-qualified",
      qualificationVersion: "1.0.0",
      processor: {
        id: "resistance_training.segment_repetitions_from_kinematics",
        version: "1.0.0",
      },
      method: {
        id: "state_machine.directional_hysteresis.sample_boundaries",
        version: "1.0.0",
      },
      software,
      oracle: { id: "sci3-fixture-oracle", version: "1.0.0" },
      validationData: { id: "sci3-fixture-data", version: "1.0.0" },
    },
  };
  return {
    claim: {
      claimClass: "MECHANICALLY_DERIVED",
      claimId: sci3ClaimId,
    } as unknown as RepPhaseSegmentationValue["claim"],
    segmentationReference: "science-segmentation:sci4-fixture",
    measurement,
    sci2Lineage: {
      claimId: sci2ClaimId,
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
    },
    movementTask: task,
    protocol,
    qualification,
    repetitions: [repetition],
    uncertainty: { status: "UNKNOWN" },
  };
}

function summaries(reverseAxis = false): readonly Sci2IntervalSummaryBinding[] {
  const sign = reverseAxis ? -1 : 1;
  return [
    {
      id: "sci2-interval-ascent",
      velocityClaimId: sci2ClaimId,
      qualificationReference: "sci2-interval-qualification-ascent",
      startIndex: 1,
      endIndex: 3,
      intervalAverageVelocityMps: 2.5 * sign,
    },
    {
      id: "sci2-interval-descent",
      velocityClaimId: sci2ClaimId,
      qualificationReference: "sci2-interval-qualification-descent",
      startIndex: 4,
      endIndex: 6,
      intervalAverageVelocityMps: -2.5 * sign,
    },
  ];
}

function metricRequests(): readonly RepPhaseMetricRequest[] {
  return [
    {
      repOrdinal: 1,
      phaseId: "ascent",
      metricIds: [
        "PHASE_DURATION",
        "PHASE_SIGNED_DISPLACEMENT",
        "PHASE_INTERVAL_AVERAGE_SIGNED_LINEAR_VELOCITY",
        "PHASE_DIRECTION_PEAK_SAMPLED_LINEAR_VELOCITY",
      ],
    },
    {
      repOrdinal: 1,
      phaseId: "descent",
      metricIds: [
        "PHASE_DURATION",
        "PHASE_SIGNED_DISPLACEMENT",
        "PHASE_INTERVAL_AVERAGE_SIGNED_LINEAR_VELOCITY",
        "PHASE_DIRECTION_PEAK_SAMPLED_LINEAR_VELOCITY",
      ],
    },
    { repOrdinal: 1, metricIds: ["REP_TOTAL_DURATION"] },
  ];
}

function requestInput(
  source = sourceValue(),
  reverseAxis = false,
): RepPhaseKinematicMetricsRequestInput {
  return {
    requestId: "sci4-request-fixture",
    segmentation: source,
    sci2IntervalSummaries: summaries(reverseAxis),
    metricRequests: metricRequests(),
    inputProvenance: [
      { type: "PSC4_RAW_OBSERVATION", ref: "raw-position-series-sci4-fixture" },
    ],
  };
}

function port(): RepPhaseKinematicMetricsSciencePort {
  return new RepPhaseKinematicMetricsSciencePort({
    software,
    qualification: {
      qualificationId: "sci4-fixture-qualified",
      qualificationVersion: "1.0.0",
      oracle: { id: "sci4-fixture-oracle", version: "1.0.0" },
      validationData: { id: "sci4-fixture-data", version: "1.0.0" },
      sourceRevision: software.sourceRevision,
      buildId: software.buildId,
    },
  });
}

async function compute(input = requestInput()) {
  return port().compute(createRepPhaseKinematicMetricsRequest(input));
}

describe("SCI-4 rep-level resistance-training velocity metrics", () => {
  it("binds SCI-2 and SCI-3 lineage and computes signed phase metrics", async () => {
    const result = await compute();
    expect(result.status).toBe("ok");
    if (result.status !== "ok")
      throw new Error(result.error?.message ?? "Expected SCI-4 success.");
    const value = result.value as {
      metrics: readonly {
        metricId: string;
        quantity: { value: number; unit: string; dimension: string };
        claim: {
          claimClass: string;
          claimId: string;
          lineage: { parents: readonly unknown[] };
        };
        selectedSample: { index: number } | null;
      }[];
      realWorldSegmentationValidated: string;
      upstreamQualifications: readonly {
        qualificationStatus: string;
        limitations: readonly string[];
      }[];
    };
    expect(value.metrics).toHaveLength(9);
    const ascentAverage = value.metrics.find(
      (metric) =>
        metric.metricId === "PHASE_INTERVAL_AVERAGE_SIGNED_LINEAR_VELOCITY" &&
        metric.claim.claimId !== undefined,
    );
    expect(ascentAverage?.quantity).toMatchObject({
      value: 2.5,
      unit: "m/s",
      dimension: "speed",
    });
    const descentPeak = value.metrics.find(
      (metric) =>
        metric.metricId === "PHASE_DIRECTION_PEAK_SAMPLED_LINEAR_VELOCITY" &&
        metric.selectedSample?.index === 6,
    );
    expect(descentPeak?.quantity.value).toBe(-3);
    expect(descentPeak?.claim.claimClass).toBe("MECHANICALLY_DERIVED");
    expect(descentPeak?.claim.lineage.parents.length).toBeGreaterThanOrEqual(3);
    expect(value.realWorldSegmentationValidated).toBe("NO");
    expect(value.upstreamQualifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ qualificationStatus: "UNPROVEN" }),
      ]),
    );
    expect(result.unit).toBeNull();
    expect(result.dimension).toBeNull();
    expect(result.uncertainty).toMatchObject({ status: "UNKNOWN" });
  });

  it("is invariant under canonical unit conversion", async () => {
    const si = await compute(requestInput(sourceValue("SI")));
    const converted = await compute(requestInput(sourceValue("CONVERTED")));
    expect(si.status).toBe("ok");
    expect(converted.status).toBe("ok");
    if (si.status !== "ok" || converted.status !== "ok") return;
    const siMetrics = (
      si.value as {
        metrics: readonly { metricId: string; quantity: { value: number } }[];
      }
    ).metrics;
    const convertedMetrics = (
      converted.value as {
        metrics: readonly { metricId: string; quantity: { value: number } }[];
      }
    ).metrics;
    expect(convertedMetrics.map((metric) => metric.metricId)).toEqual(
      siMetrics.map((metric) => metric.metricId),
    );
    convertedMetrics.forEach((metric, index) => {
      expect(metric.quantity.value).toBeCloseTo(
        siMetrics[index]?.quantity.value ?? Number.NaN,
        12,
      );
    });
  });

  it("negates signed quantities under a declared axis reversal", async () => {
    const original = await compute();
    const reversed = await compute(requestInput(sourceValue("SI", true), true));
    expect(original.status).toBe("ok");
    expect(reversed.status).toBe("ok");
    if (original.status !== "ok" || reversed.status !== "ok") return;
    const originalMetrics = (
      original.value as {
        metrics: readonly { metricId: string; quantity: { value: number } }[];
      }
    ).metrics;
    const reversedMetrics = (
      reversed.value as {
        metrics: readonly { metricId: string; quantity: { value: number } }[];
      }
    ).metrics;
    originalMetrics.forEach((metric, index) => {
      const counterpart = reversedMetrics[index];
      if (
        metric.metricId === "PHASE_DURATION" ||
        metric.metricId === "REP_TOTAL_DURATION"
      ) {
        expect(counterpart?.quantity.value).toBeCloseTo(
          metric.quantity.value,
          12,
        );
      } else {
        expect(counterpart?.quantity.value).toBeCloseTo(
          -metric.quantity.value,
          12,
        );
      }
    });
  });

  it("fails closed when the SCI-2 summary does not bind the SCI-3 phase", async () => {
    const invalidSummaries = summaries().filter(
      (summary) => summary.startIndex !== 1,
    );
    const result = await compute({
      ...requestInput(),
      sci2IntervalSummaries: invalidSummaries,
    });
    expect(result).toMatchObject({
      status: "invalid_input",
      error: { code: "PROTOCOL_INCOMPATIBLE" },
    });
  });

  it("fails closed on partial repetitions and non-PSC4 provenance", async () => {
    const source = requestInput().segmentation;
    const partial = await compute({
      ...requestInput(),
      segmentation: {
        ...source,
        repetitions: source.repetitions.map((repetition) => ({
          ...repetition,
          complete: false,
        })),
      },
    });
    expect(partial).toMatchObject({
      status: "invalid_input",
      error: { code: "PROTOCOL_INCOMPATIBLE" },
    });

    const missingPsc4 = await compute({
      ...requestInput(),
      inputProvenance: [{ type: "SCI3_CLAIM", ref: sci3ClaimId }],
    });
    expect(missingPsc4).toMatchObject({
      status: "insufficient_input",
      error: { code: "REQUIRED_EVIDENCE_MISSING" },
    });
  });

  it("does not execute without an exact SCI-4 qualification", async () => {
    const unqualified = new RepPhaseKinematicMetricsSciencePort({ software });
    const result = await unqualified.compute(
      createRepPhaseKinematicMetricsRequest(requestInput()),
    );
    expect(result).toMatchObject({
      status: "method_unavailable",
      error: { code: "PROCESSOR_NOT_QUALIFIED" },
    });
  });
});
