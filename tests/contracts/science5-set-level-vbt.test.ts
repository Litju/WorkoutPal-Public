import {
  createQualifiedSetVelocitySoftwareProvenance,
  createSetVelocityStateRequest,
  SCI4_PHASE_AVERAGE_VELOCITY_METRIC_ID,
  SCI4_PHASE_PEAK_VELOCITY_METRIC_ID,
  SCI4_VELOCITY_METRIC_METHOD_ID,
  SCI4_VELOCITY_METRIC_METHOD_VERSION,
  SCI4_VELOCITY_METRIC_VERSION,
  type SetVelocityMetricDefinition,
  type SetVelocityRepetitionBindings,
  type SetVelocityRepetitionInput,
  type SetVelocitySetContext,
  type SetVelocityStateRequestInput,
  SetVelocityStateSciencePort,
  type SetVelocityThreshold,
} from "@workoutpal/science-port";
import { describe, expect, it } from "vitest";

const sourceRevision = "a".repeat(40);
const software = createQualifiedSetVelocitySoftwareProvenance(
  sourceRevision,
  "test-build",
);

const definition = (id: string) => ({ id, version: "1.0.0", revision: 1 });

interface TestRepetitionState {
  readonly rep_id: string;
  readonly directional_velocity_mps: number;
  readonly absolute_velocity_change_mps: number;
  readonly relative_velocity_change_percent: number;
  readonly velocity_decline_percent: number;
  readonly velocity_ratio: number;
  readonly velocity_maintenance_percent: number;
  readonly [key: string]: unknown;
}

interface TestThresholdEvent {
  readonly threshold_id: string;
  readonly crossed: boolean;
  readonly [key: string]: unknown;
}

type TestThreshold = Omit<
  SetVelocityThreshold,
  "metricId" | "metricVersion" | "referencePolicy" | "mode"
> &
  Partial<
    Pick<
      SetVelocityThreshold,
      "metricId" | "metricVersion" | "referencePolicy" | "mode"
    >
  >;

interface TestSummaries {
  readonly final_rep_id: string;
  readonly final_rep_velocity_decline_percent: number;
  readonly slowest_rep_id: string;
  readonly slowest_rep_velocity_decline_percent: number;
  readonly set_mean_velocity_mps: number;
  readonly set_mean_velocity_maintenance_percent: number;
  readonly [key: string]: unknown;
}

interface TestSnapshot {
  readonly snapshot_id: string;
  readonly reference_rep_id: string;
  readonly reference_velocity_mps: number;
  readonly observed_rep_ids: readonly string[];
  readonly eligible_rep_ids: readonly string[];
  readonly excluded_repetitions: readonly Record<string, unknown>[];
  readonly repetitions: readonly TestRepetitionState[];
  readonly summaries: TestSummaries;
  readonly threshold_events: readonly TestThresholdEvent[];
  readonly first_crossings: readonly Record<string, unknown>[];
  readonly claim: {
    readonly claimId: string;
    readonly claimClass: string;
    readonly lineage: { readonly parents: readonly unknown[] };
  };
  readonly [key: string]: unknown;
}

const qualifications = [
  {
    capabilityId: "resistance_training.linear_velocity_from_position",
    capabilityVersion: "1.0.0",
    qualificationStatus: "QUALIFIED" as const,
    qualificationArtifact: {
      type: "SCI2_QUALIFICATION",
      ref: "public-scientific-contract:SCI-2:qualification",
    },
    limitations: ["SCI-2 uncertainty remains UNKNOWN."],
  },
  {
    capabilityId: "resistance_training.segment_repetitions_from_kinematics",
    capabilityVersion: "1.0.0",
    qualificationStatus: "QUALIFIED_SOFTWARE" as const,
    qualificationArtifact: {
      type: "SCI3_QUALIFICATION",
      ref: "public-scientific-contract:SCI-3:final-qualification",
    },
    limitations: ["REAL_WORLD_SEGMENTATION_VALIDATED=NO."],
  },
  {
    capabilityId: "resistance_training.rep_phase_kinematic_metrics",
    capabilityVersion: "1.0.0",
    qualificationStatus: "QUALIFIED_SOFTWARE" as const,
    qualificationArtifact: {
      type: "SCI4_QUALIFICATION",
      ref: "public-scientific-contract:SCI-4:final-qualification",
    },
    limitations: ["SCI-4 empirical validation remains PENDING."],
  },
];

function metricDefinition(
  id: SetVelocityMetricDefinition["id"] = SCI4_PHASE_AVERAGE_VELOCITY_METRIC_ID,
): SetVelocityMetricDefinition {
  return {
    id,
    version: SCI4_VELOCITY_METRIC_VERSION,
    unit: "m/s",
    dimension: "speed",
    method: {
      id: SCI4_VELOCITY_METRIC_METHOD_ID,
      version: SCI4_VELOCITY_METRIC_METHOD_VERSION,
    },
  };
}

function context(
  polarity: "POSITIVE" | "NEGATIVE" = "POSITIVE",
  metricId: SetVelocityMetricDefinition["id"] = SCI4_PHASE_AVERAGE_VELOCITY_METRIC_ID,
): SetVelocitySetContext {
  return {
    setId: "set-fixture-1",
    assessmentId: "assessment-fixture-1",
    trialId: "trial-fixture-1",
    exerciseDefinition: definition("exercise-squat"),
    exerciseVariation: definition("variation-high-bar"),
    movementTask: definition("task-concentric-implement"),
    loadConfiguration: definition("load-fixed-80kg"),
    selectedPhase: {
      ...definition("phase-concentric"),
      phaseId: "concentric",
      polarity,
    },
    metricDefinition: metricDefinition(metricId),
    measurement: {
      objectOfInterest: {
        objectKind: "IMPLEMENT",
        objectId: "barbell-1",
        label: "fixture barbell",
      },
      measurementPoint: {
        objectKind: "MEASUREMENT_POINT",
        objectId: "barbell-point-1",
        label: "fixture barbell point",
      },
      referenceFrame: {
        frameKind: "GLOBAL_LAB",
        frameId: "lab-frame-1",
        convention: "z-up",
      },
      axis: { axis: "Z", sense: polarity, frameId: "lab-frame-1" },
      modality: {
        modalityId: "fixture-encoder",
        version: "1.0.0",
        kind: "ENCODER",
        label: "fixture encoder",
      },
    },
  };
}

function bindingsFromContext(
  value: SetVelocitySetContext,
): SetVelocityRepetitionBindings {
  return {
    setId: value.setId,
    assessmentId: value.assessmentId,
    trialId: value.trialId,
    exerciseDefinition: value.exerciseDefinition,
    exerciseVariation: value.exerciseVariation,
    movementTask: value.movementTask,
    loadConfiguration: value.loadConfiguration,
    selectedPhase: value.selectedPhase,
    metricDefinition: value.metricDefinition,
    measurement: value.measurement,
  };
}

function repetitions(
  values: readonly number[],
  valueContext: SetVelocitySetContext,
  options: {
    readonly missingMetricAt?: number;
    readonly incompleteAt?: number;
    readonly metricId?: SetVelocityMetricDefinition["id"];
    readonly metricClaimPrefix?: string;
  } = {},
): readonly SetVelocityRepetitionInput[] {
  return values.map((signedVelocityMps, index) => {
    const metric =
      options.missingMetricAt === index
        ? undefined
        : {
            metricId: options.metricId ?? valueContext.metricDefinition.id,
            metricVersion: "1.0.0",
            method: {
              id: SCI4_VELOCITY_METRIC_METHOD_ID,
              version: SCI4_VELOCITY_METRIC_METHOD_VERSION,
            },
            signedVelocityMps,
            claimId: `${options.metricClaimPrefix ?? "sci4"}-rep-${index + 1}`,
            qualificationStatus: "QUALIFIED_SOFTWARE" as const,
            validity: "VALID" as const,
          };
    return {
      repId: `rep-${index + 1}`,
      ordinal: index + 1,
      complete: options.incompleteAt !== index,
      eligible: true,
      bindings: bindingsFromContext(valueContext),
      ...(metric === undefined ? {} : { metric }),
      ...(options.incompleteAt === index
        ? {
            exclusion: {
              code: "REP_INCOMPLETE",
              reason: "Fixture partial repetition.",
            },
          }
        : {}),
    };
  });
}

function existingMetric(
  repetition: SetVelocityRepetitionInput,
): NonNullable<SetVelocityRepetitionInput["metric"]> {
  if (repetition.metric === undefined)
    throw new Error("Fixture metric is missing.");
  return repetition.metric;
}

function input(
  values: readonly number[],
  options: {
    readonly mode?: SetVelocityStateRequestInput["mode"];
    readonly referencePolicy?: SetVelocityStateRequestInput["referencePolicy"];
    readonly explicitReferenceRepId?: string;
    readonly thresholds?: readonly TestThreshold[];
    readonly polarity?: "POSITIVE" | "NEGATIVE";
    readonly metricId?: SetVelocityMetricDefinition["id"];
    readonly missingMetricAt?: number;
    readonly incompleteAt?: number;
  } = {},
): SetVelocityStateRequestInput {
  const polarity = options.polarity ?? "POSITIVE";
  const valueContext = context(polarity, options.metricId);
  return {
    requestId: "sci5-fixture-request",
    setContext: valueContext,
    upstreamQualifications: qualifications,
    repetitions: repetitions(values, valueContext, {
      missingMetricAt: options.missingMetricAt,
      incompleteAt: options.incompleteAt,
      metricId: options.metricId,
    }),
    mode: options.mode ?? "POST_HOC_COMPLETE_SET",
    referencePolicy: options.referencePolicy ?? "FIRST_ELIGIBLE",
    ...(options.explicitReferenceRepId === undefined
      ? {}
      : { explicitReferenceRepId: options.explicitReferenceRepId }),
    thresholds: (options.thresholds ?? []).map((threshold) => ({
      ...threshold,
      metricId: threshold.metricId ?? valueContext.metricDefinition.id,
      metricVersion: threshold.metricVersion ?? SCI4_VELOCITY_METRIC_VERSION,
      referencePolicy:
        threshold.referencePolicy ??
        options.referencePolicy ??
        "FIRST_ELIGIBLE",
      mode: threshold.mode ?? options.mode ?? "POST_HOC_COMPLETE_SET",
    })),
    inputProvenance: [
      { type: "PSC4_EVIDENCE", ref: "psc4-fixture-evidence" },
      { type: "PSC4_RESULT", ref: "psc4-fixture-result" },
    ],
  };
}

function port(): SetVelocityStateSciencePort {
  return new SetVelocityStateSciencePort({
    software,
    qualification: {
      qualificationId: "sci5-fixture-qualified",
      qualificationVersion: "1.0.0",
      oracle: { id: "sci5-fixture-oracle", version: "1.0.0" },
      validationData: { id: "sci5-fixture-data", version: "1.0.0" },
      sourceRevision,
      buildId: "test-build",
    },
  });
}

async function compute(
  value: SetVelocityStateRequestInput,
): Promise<Awaited<ReturnType<SetVelocityStateSciencePort["compute"]>>> {
  return port().compute(createSetVelocityStateRequest(value));
}

function snapshot(result: Awaited<ReturnType<typeof compute>>) {
  if (result.status !== "ok")
    throw new Error("Expected a successful SCI-5 result.");
  return (result.value as { snapshots: readonly TestSnapshot[] }).snapshots;
}

describe("SCI-5 set-level descriptive VBT velocity state", () => {
  it("computes reference-relative state, maintenance, final decline, and slowest decline", async () => {
    const result = await compute(
      input([1, 0.8, 0.9], {
        thresholds: [
          { id: "threshold-20", version: "1.0.0", value: 20, unit: "PERCENT" },
        ],
      }),
    );
    expect(result.status).toBe("ok");
    const [state] = snapshot(result);
    expect(state.reference_rep_id).toBe("rep-1");
    expect(state.reference_velocity_mps).toBeCloseTo(1, 12);
    expect(state.repetitions[1]?.directional_velocity_mps).toBeCloseTo(0.8, 12);
    expect(state.repetitions[1]?.absolute_velocity_change_mps).toBeCloseTo(
      -0.2,
      12,
    );
    expect(state.repetitions[1]?.relative_velocity_change_percent).toBeCloseTo(
      -20,
      12,
    );
    expect(state.repetitions[1]?.velocity_decline_percent).toBeCloseTo(20, 12);
    expect(state.repetitions[1]?.velocity_ratio).toBeCloseTo(0.8, 12);
    expect(state.repetitions[1]?.velocity_maintenance_percent).toBeCloseTo(
      80,
      12,
    );
    expect(state.summaries.final_rep_id).toBe("rep-3");
    expect(state.summaries.final_rep_velocity_decline_percent).toBeCloseTo(
      10,
      12,
    );
    expect(state.summaries.slowest_rep_id).toBe("rep-2");
    expect(state.summaries.slowest_rep_velocity_decline_percent).toBeCloseTo(
      20,
      12,
    );
    expect(state.summaries.set_mean_velocity_mps).toBeCloseTo(0.9, 12);
    expect(state.summaries.set_mean_velocity_maintenance_percent).toBeCloseTo(
      90,
      12,
    );
    expect(state.claim.claimClass).toBe("MECHANICALLY_DERIVED");
    expect(result.uncertainty).toMatchObject({ status: "UNKNOWN" });

    const peak = await compute(
      input([1, 0.8], { metricId: SCI4_PHASE_PEAK_VELOCITY_METRIC_ID }),
    );
    expect(snapshot(peak)[0].metric_definition).toMatchObject({
      id: SCI4_PHASE_PEAK_VELOCITY_METRIC_ID,
    });
  });

  it("keeps reference policies explicit and preserves earliest ties", async () => {
    const first = await compute(
      input([0.8, 1.0], { referencePolicy: "FIRST_ELIGIBLE" }),
    );
    const fastest = await compute(
      input([0.8, 1.0, 1.0], {
        referencePolicy: "FASTEST_ELIGIBLE_COMPLETE_SET",
      }),
    );
    const online = await compute(
      input([0.8, 1.0], {
        mode: "ONLINE_PREFIX",
        referencePolicy: "FASTEST_SO_FAR",
      }),
    );
    const fastestLast = await compute(
      input([0.8, 0.9, 1.1], {
        referencePolicy: "FASTEST_ELIGIBLE_COMPLETE_SET",
      }),
    );
    expect(snapshot(first)[0].reference_rep_id).toBe("rep-1");
    expect(snapshot(fastest)[0].reference_rep_id).toBe("rep-2");
    expect(snapshot(online).map((state) => state.reference_rep_id)).toEqual([
      "rep-1",
      "rep-2",
    ]);
    expect(snapshot(fastestLast)[0].reference_rep_id).toBe("rep-3");
    expect(snapshot(fastest)[0].reference_rep_id).toBe("rep-2");
    expect(snapshot(fastest)[0].observed_rep_ids).toEqual([
      "rep-1",
      "rep-2",
      "rep-3",
    ]);
  });

  it("supports explicit observed references and rejects noncausal policy/mode pairs", async () => {
    const explicit = await compute(
      input([0.8, 1.0], {
        referencePolicy: "EXPLICIT_REPETITION",
        explicitReferenceRepId: "rep-2",
      }),
    );
    expect(snapshot(explicit)[0].reference_rep_id).toBe("rep-2");
    expect(snapshot(explicit)).toHaveLength(1);
    expect(snapshot(explicit)[0].observed_rep_ids).toEqual(["rep-1", "rep-2"]);
    const explicitOnline = await compute(
      input([0.8, 1.0, 0.9], {
        mode: "ONLINE_PREFIX",
        referencePolicy: "EXPLICIT_REPETITION",
        explicitReferenceRepId: "rep-2",
      }),
    );
    expect(snapshot(explicitOnline)).toHaveLength(2);
    expect(
      snapshot(explicitOnline).map((state) => state.reference_rep_id),
    ).toEqual(["rep-2", "rep-2"]);
    const incompatible = await compute(
      input([1, 0.8], {
        mode: "ONLINE_PREFIX",
        referencePolicy: "FASTEST_ELIGIBLE_COMPLETE_SET",
      }),
    );
    expect(incompatible).toMatchObject({
      status: "method_unavailable",
      error: { code: "REFERENCE_POLICY_INCOMPATIBLE_WITH_MODE" },
    });
  });

  it("records exact, below, above, multiple, and recovered threshold states without termination", async () => {
    const result = await compute(
      input([1, 0.8, 0.9], {
        thresholds: [
          { id: "exact-20", version: "1.0.0", value: 20, unit: "PERCENT" },
          { id: "ratio-20", version: "1.0.0", value: 0.2, unit: "RATIO" },
          { id: "below-25", version: "1.0.0", value: 25, unit: "PERCENT" },
          { id: "above-11", version: "1.0.0", value: 11, unit: "PERCENT" },
          { id: "multiple-5", version: "1.0.0", value: 5, unit: "PERCENT" },
        ],
      }),
    );
    const [state] = snapshot(result);
    const exact = state.threshold_events.filter(
      (event) => event.threshold_id === "exact-20",
    );
    const ratio = state.threshold_events.filter(
      (event) => event.threshold_id === "ratio-20",
    );
    const below = state.threshold_events.filter(
      (event) => event.threshold_id === "below-25",
    );
    const above = state.threshold_events.filter(
      (event) => event.threshold_id === "above-11",
    );
    const multiple = state.threshold_events.filter(
      (event) => event.threshold_id === "multiple-5",
    );
    expect(exact.map((event) => event.crossed)).toEqual([false, true, false]);
    expect(ratio.map((event) => event.crossed)).toEqual([false, true, false]);
    expect(below.map((event) => event.crossed)).toEqual([false, false, false]);
    expect(above.map((event) => event.crossed)).toEqual([false, true, false]);
    expect(multiple.map((event) => event.crossed)).toEqual([false, true, true]);
    expect(exact[1]).toMatchObject({
      reference_rep_id: "rep-1",
      reference_velocity_mps: 1,
      rep_id: "rep-2",
      current_velocity_mps: 0.8,
      evaluation_snapshot_prefix_index: 3,
    });
    expect(exact[1]?.velocity_decline_mps).toBeCloseTo(0.2, 12);
    expect(exact[1]?.velocity_decline_percent).toBeCloseTo(20, 12);
    expect(state.first_crossings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          threshold_id: "exact-20",
          first_crossing_rep_id: "rep-2",
        }),
        expect.objectContaining({
          threshold_id: "above-11",
          first_crossing_rep_id: "rep-2",
        }),
        expect.objectContaining({
          threshold_id: "below-25",
          first_crossing_rep_id: null,
        }),
      ]),
    );
    expect("termination" in state).toBe(false);
  });

  it("normalizes negative phase polarity and is invariant under axis inversion", async () => {
    const positive = await compute(input([1, 0.8, 0.9]));
    const negative = await compute(
      input([-1, -0.8, -0.9], { polarity: "NEGATIVE" }),
    );
    const positiveStates = snapshot(positive)[0].repetitions;
    const negativeStates = snapshot(negative)[0].repetitions;
    expect(negativeStates.map((rep) => rep.directional_velocity_mps)).toEqual(
      positiveStates.map((rep) => rep.directional_velocity_mps),
    );
    expect(negativeStates.map((rep) => rep.velocity_decline_percent)).toEqual(
      positiveStates.map((rep) => rep.velocity_decline_percent),
    );
  });

  it("preserves normalized state under positive scaling and does not let thresholds alter raw state", async () => {
    const baseline = await compute(
      input([1, 0.8, 0.9], {
        thresholds: [
          { id: "threshold-20", version: "1.0.0", value: 20, unit: "PERCENT" },
        ],
      }),
    );
    const scaled = await compute(
      input([2, 1.6, 1.8], {
        thresholds: [],
      }),
    );
    const baselineRepetitions = snapshot(baseline)[0].repetitions;
    const scaledRepetitions = snapshot(scaled)[0].repetitions;
    expect(
      scaledRepetitions.map((rep) => rep.velocity_decline_percent),
    ).toEqual(baselineRepetitions.map((rep) => rep.velocity_decline_percent));
    expect(scaledRepetitions.map((rep) => rep.velocity_ratio)).toEqual(
      baselineRepetitions.map((rep) => rep.velocity_ratio),
    );
    expect(
      scaledRepetitions.map((rep) => rep.absolute_velocity_change_mps),
    ).toEqual(
      expect.arrayContaining([
        0,
        expect.closeTo(-0.4, 12),
        expect.closeTo(-0.2, 12),
      ]),
    );
    expect(snapshot(scaled)[0].threshold_events).toEqual([]);
  });

  it("explicitly excludes partial and missing-metric repetitions", async () => {
    const result = await compute(
      input([1, 0.8, 0.9], { incompleteAt: 1, missingMetricAt: 2 }),
    );
    expect(result.status).toBe("ok");
    const [state] = snapshot(result);
    expect(state.eligible_rep_ids).toEqual(["rep-1"]);
    expect(state.excluded_repetitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rep_id: "rep-2",
          exclusion_code: "REP_INCOMPLETE",
        }),
        expect.objectContaining({
          rep_id: "rep-3",
          exclusion_code: "REP_METRIC_MISSING",
        }),
      ]),
    );
  });

  it("fails closed on load, metric, qualification, order, and direction mismatches", async () => {
    const loadMismatchBase = input([1, 0.8]);
    const loadMismatch = {
      ...loadMismatchBase,
      repetitions: loadMismatchBase.repetitions.map((rep, index) =>
        index === 1
          ? {
              ...rep,
              bindings: {
                ...rep.bindings,
                loadConfiguration: definition("load-changed"),
              },
            }
          : rep,
      ),
    };
    const metricMismatchBase = input([1, 0.8]);
    const metricMismatch = {
      ...metricMismatchBase,
      repetitions: metricMismatchBase.repetitions.map((rep, index) =>
        index === 1
          ? {
              ...rep,
              metric: {
                ...existingMetric(rep),
                metricId: SCI4_PHASE_PEAK_VELOCITY_METRIC_ID,
              },
            }
          : rep,
      ),
    };
    const qualificationMismatchBase = input([1, 0.8]);
    const qualificationMismatch = {
      ...qualificationMismatchBase,
      upstreamQualifications:
        qualificationMismatchBase.upstreamQualifications.map(
          (qualification, index) =>
            index === 2
              ? {
                  ...qualification,
                  qualificationStatus: "UNSUPPORTED" as never,
                }
              : qualification,
        ),
    };
    const orderMismatchBase = input([1, 0.8]);
    const orderMismatch = {
      ...orderMismatchBase,
      repetitions: orderMismatchBase.repetitions.map((rep, index) =>
        index === 1 ? { ...rep, ordinal: 1 } : rep,
      ),
    };
    const directionMismatchBase = input([-1, -0.8]);
    const directionMismatch = {
      ...directionMismatchBase,
      repetitions: directionMismatchBase.repetitions.map((rep, index) =>
        index === 1
          ? {
              ...rep,
              metric: { ...existingMetric(rep), signedVelocityMps: 0.8 },
            }
          : rep,
      ),
    };
    const measurementMismatchBase = input([1, 0.8]);
    const measurementMismatch = {
      ...measurementMismatchBase,
      repetitions: measurementMismatchBase.repetitions.map((rep, index) =>
        index === 1
          ? {
              ...rep,
              bindings: {
                ...rep.bindings,
                measurement: {
                  ...rep.bindings.measurement,
                  referenceFrame: {
                    ...rep.bindings.measurement.referenceFrame,
                    frameId: "other-frame",
                  },
                },
              },
            }
          : rep,
      ),
    };
    const nonFinite = input([1, 0.8]);
    const nonFiniteInput = {
      ...nonFinite,
      repetitions: nonFinite.repetitions.map((rep, index) =>
        index === 1
          ? {
              ...rep,
              metric: { ...existingMetric(rep), signedVelocityMps: Number.NaN },
            }
          : rep,
      ),
    };
    const thresholdMismatch = input([1, 0.8], {
      thresholds: [
        {
          id: "threshold-metric-mismatch",
          version: "1.0.0",
          value: 20,
          unit: "PERCENT",
          metricId: SCI4_PHASE_PEAK_VELOCITY_METRIC_ID,
        },
      ],
    });
    await expect(compute(loadMismatch)).resolves.toMatchObject({
      status: "invalid_input",
      error: { code: "LOAD_CONFIGURATION_MISMATCH" },
    });
    await expect(compute(metricMismatch)).resolves.toMatchObject({
      status: "invalid_input",
      error: { code: "METRIC_DEFINITION_MISMATCH" },
    });
    await expect(compute(qualificationMismatch)).resolves.toMatchObject({
      status: "invalid_input",
      error: { code: "UPSTREAM_QUALIFICATION_UNSUPPORTED" },
    });
    await expect(compute(orderMismatch)).resolves.toMatchObject({
      status: "invalid_input",
      error: { code: "REPETITION_ORDER_INVALID" },
    });
    await expect(compute(directionMismatch)).resolves.toMatchObject({
      status: "invalid_input",
      error: { code: "AXIS_MISMATCH" },
    });
    await expect(compute(measurementMismatch)).resolves.toMatchObject({
      status: "invalid_input",
      error: { code: "REFERENCE_FRAME_MISMATCH" },
    });
    await expect(compute(nonFiniteInput)).resolves.toMatchObject({
      status: "invalid_input",
      error: { code: "NON_FINITE_VELOCITY" },
    });
    await expect(compute(thresholdMismatch)).resolves.toMatchObject({
      status: "invalid_input",
      error: { code: "THRESHOLD_BINDING_MISMATCH" },
    });
  });

  it("creates immutable online snapshots and changes claim history when the sequence changes", async () => {
    const online = await compute(
      input([1, 0.8, 0.9], {
        mode: "ONLINE_PREFIX",
        referencePolicy: "FASTEST_SO_FAR",
      }),
    );
    expect(online.status).toBe("ok");
    const states = snapshot(online);
    expect(states).toHaveLength(3);
    expect(new Set(states.map((state) => state.snapshot_id)).size).toBe(3);
    expect(states[0].observed_rep_ids).toEqual(["rep-1"]);
    expect(states[1].observed_rep_ids).toEqual(["rep-1", "rep-2"]);
    expect(states[0].repetitions).toHaveLength(1);
    const longer = await compute(
      input([1, 0.8, 0.9, 0.7], {
        mode: "ONLINE_PREFIX",
        referencePolicy: "FASTEST_SO_FAR",
      }),
    );
    expect(snapshot(longer)).toHaveLength(4);
    expect(snapshot(longer)[0].snapshot_id).toBe(states[0].snapshot_id);
    expect(
      (longer.value as { snapshots: readonly { claim: { claimId: string } }[] })
        .snapshots[0]?.claim.claimId,
    ).not.toBe(
      (online.value as { snapshots: readonly { claim: { claimId: string } }[] })
        .snapshots[0]?.claim.claimId,
    );
    if (online.status === "ok") {
      const history = (
        online.value as {
          recalculationHistory: { records: readonly unknown[] };
        }
      ).recalculationHistory;
      expect(history.records).toHaveLength(3);
    }
  });

  it("retains mechanically derived claim lineage and refuses execution without qualification", async () => {
    const result = await compute(input([1, 0.8]));
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      const value = result.value as {
        snapshots: readonly {
          claim: {
            claimClass: string;
            lineage: { parents: readonly unknown[] };
          };
        }[];
        derivation: { nodes: readonly unknown[] };
      };
      expect(value.snapshots[0]?.claim.claimClass).toBe("MECHANICALLY_DERIVED");
      expect(
        value.snapshots[0]?.claim.lineage.parents.length,
      ).toBeGreaterThanOrEqual(2);
      expect(value.derivation.nodes).toHaveLength(1);
    }
    const unqualified = new SetVelocityStateSciencePort({ software });
    const unavailable = await unqualified.compute(
      createSetVelocityStateRequest(input([1, 0.8])),
    );
    expect(unavailable).toMatchObject({
      status: "method_unavailable",
      error: { code: "PROCESSOR_NOT_QUALIFIED" },
    });
  });
});
