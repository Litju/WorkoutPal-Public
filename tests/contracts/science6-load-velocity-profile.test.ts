import {
  createLoadConfiguration,
  freeResistanceSquatLoad,
  type LoadConfiguration,
} from "@workoutpal/movement-science";
import {
  createLoadVelocityProfileRequest,
  createQualifiedLoadVelocitySoftwareProvenance,
  type LoadVelocityFitMethod,
  type LoadVelocityMetricDefinition,
  type LoadVelocityProfileContext,
  type LoadVelocityProfileRequestInput,
  LoadVelocityProfileSciencePort,
  type LoadVelocityProfileValue,
  SCI6_PHASE_AVERAGE_VELOCITY_METRIC_ID,
  SCI6_VELOCITY_METRIC_METHOD_ID,
  SCI6_VELOCITY_METRIC_METHOD_VERSION,
  SCI6_VELOCITY_METRIC_VERSION,
} from "@workoutpal/science-port";
import { createQuantity } from "@workoutpal/shared-kernel";
import { describe, expect, it } from "vitest";

const sourceRevision = "a".repeat(40);
const software = createQualifiedLoadVelocitySoftwareProvenance(
  sourceRevision,
  "sci6-test-build",
);

const definition = (id: string) => ({ id, version: "1.0.0", revision: 1 });

const qualifications = [
  {
    capabilityId: "resistance_training.linear_velocity_from_position",
    capabilityVersion: "1.0.0",
    qualificationStatus: "QUALIFIED" as const,
    qualificationArtifact: { type: "SCI2_QUALIFICATION", ref: "sci2-fixture" },
    limitations: ["Synthetic numerical qualification only."],
  },
  {
    capabilityId: "resistance_training.rep_phase_kinematic_metrics",
    capabilityVersion: "1.0.0",
    qualificationStatus: "QUALIFIED_SOFTWARE" as const,
    qualificationArtifact: { type: "SCI4_QUALIFICATION", ref: "sci4-fixture" },
    limitations: ["Empirical measurement validation remains pending."],
  },
];

function metricDefinition(): LoadVelocityMetricDefinition {
  return {
    id: SCI6_PHASE_AVERAGE_VELOCITY_METRIC_ID,
    version: SCI6_VELOCITY_METRIC_VERSION,
    unit: "m/s",
    dimension: "speed",
    method: {
      id: SCI6_VELOCITY_METRIC_METHOD_ID,
      version: SCI6_VELOCITY_METRIC_METHOD_VERSION,
    },
  };
}

function context(
  polarity: "POSITIVE" | "NEGATIVE" = "POSITIVE",
): LoadVelocityProfileContext {
  return {
    profileId: `profile-${polarity.toLowerCase()}`,
    athleteId: "athlete-fixture-1",
    sessionId: "session-fixture-1",
    assessmentId: "assessment-fixture-1",
    trialId: "trial-fixture-1",
    exerciseDefinition: definition("exercise-squat"),
    exerciseVariation: definition("variation-high-bar"),
    movementTask: definition("task-concentric-implement"),
    selectedPhase: {
      ...definition("phase-concentric"),
      phaseId: "concentric",
      polarity,
    },
    metricDefinition: metricDefinition(),
    measurement: {
      objectOfInterest: { objectKind: "IMPLEMENT", objectId: "barbell-1" },
      measurementPoint: {
        objectKind: "MEASUREMENT_POINT",
        objectId: "barbell-point-1",
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
      },
    },
  };
}

function loadConfiguration(
  loadKg: number,
  alternative: boolean,
  unit: "kg" | "lb" = "kg",
): LoadConfiguration {
  const base = freeResistanceSquatLoad;
  const loadValue = unit === "kg" ? loadKg : loadKg / 0.45359237;
  return createLoadConfiguration({
    ...base,
    ...(alternative ? { id: "load-barbell-front-rack" } : {}),
    resistance: {
      ...base.resistance,
      quantity: createQuantity({ value: loadValue, unit, dimension: "mass" }),
    },
    ...(alternative
      ? {
          placement: {
            ...base.placement,
            kind: "FRONT_RACK" as const,
            description: "Alternative placement for mismatch testing.",
          },
        }
      : {}),
  });
}

function profileObservation(
  loadKg: number,
  signedVelocityMps: number,
  index: number,
  polarity: "POSITIVE" | "NEGATIVE",
  alternativeLoadConfiguration = false,
  unit: "kg" | "lb" = "kg",
) {
  const loadValue = unit === "kg" ? loadKg : loadKg / 0.45359237;
  return {
    observationId: `observation-${index + 1}`,
    repId: `rep-${index + 1}`,
    ordinal: index + 1,
    complete: true as const,
    externalLoad: createQuantity({ value: loadValue, unit, dimension: "mass" }),
    loadConfiguration: loadConfiguration(
      loadKg,
      alternativeLoadConfiguration,
      unit,
    ),
    metric: {
      metricId: SCI6_PHASE_AVERAGE_VELOCITY_METRIC_ID,
      metricVersion: SCI6_VELOCITY_METRIC_VERSION,
      method: {
        id: SCI6_VELOCITY_METRIC_METHOD_ID,
        version: SCI6_VELOCITY_METRIC_METHOD_VERSION,
      },
      signedVelocityMps,
      directionalVelocityMps:
        polarity === "POSITIVE" ? signedVelocityMps : -signedVelocityMps,
      claimId: `sci4-claim-${index + 1}`,
      claimClass: "MECHANICALLY_DERIVED" as const,
      qualificationStatus: "QUALIFIED_SOFTWARE" as const,
      validity: "VALID" as const,
    },
    selection: {
      authority: "EXPLICIT_REP_METRIC" as const,
      limitations: [
        "The caller supplied the exact rep metric; SCI-6 did not select it.",
      ],
    },
  };
}

function input(
  loads: readonly number[],
  signedVelocities: readonly number[],
  fitMethod: LoadVelocityFitMethod,
  options: {
    readonly polarity?: "POSITIVE" | "NEGATIVE";
    readonly alternativeAt?: number;
    readonly loadUnit?: "kg" | "lb";
  } = {},
): LoadVelocityProfileRequestInput {
  const polarity = options.polarity ?? "POSITIVE";
  return {
    requestId: "sci6-fixture-request",
    profileContext: context(polarity),
    upstreamQualifications: qualifications,
    observations: loads.map((loadKg, index) =>
      profileObservation(
        loadKg,
        signedVelocities[index] ?? 0,
        index,
        polarity,
        options.alternativeAt === index,
        options.loadUnit,
      ),
    ),
    fitMethod,
    inputProvenance: [
      { type: "PSC4_EVIDENCE", ref: "psc4-sci6-fixture-evidence" },
      { type: "PSC4_RESULT", ref: "psc4-sci6-fixture-result" },
    ],
  };
}

function port(): LoadVelocityProfileSciencePort {
  return new LoadVelocityProfileSciencePort({
    software,
    qualification: {
      qualificationId: "sci6-fixture-qualified",
      qualificationVersion: "1.0.0",
      oracle: { id: "sci6-fixture-analytical-oracle", version: "1.0.0" },
      validationData: { id: "sci6-fixture-data", version: "1.0.0" },
      sourceRevision,
      buildId: "sci6-test-build",
    },
  });
}

async function compute(value: LoadVelocityProfileRequestInput) {
  return port().compute(createLoadVelocityProfileRequest(value));
}

function successful(
  result: Awaited<ReturnType<typeof compute>>,
): LoadVelocityProfileValue {
  if (result.status !== "ok")
    throw new Error(result.error?.message ?? "Expected SCI-6 success.");
  return result.value as LoadVelocityProfileValue;
}

describe("SCI-6 load--velocity profile modeling", () => {
  it("fits the exact two-point line and labels R² as an automatic identity", async () => {
    const result = await compute(input([50, 100], [1, 0.5], "TWO_POINT"));
    const value = successful(result);
    expect(value.model.slopeMpsPerKg).toBeCloseTo(-0.01, 12);
    expect(value.model.interceptMps).toBeCloseTo(1.5, 12);
    expect(value.model.method.id).toBe(
      "load_velocity_profile.two_point_exact_linear",
    );
    const diagnostics = value.diagnostics as Record<string, unknown>;
    expect(diagnostics.r2).toBe(1);
    expect(diagnostics.r2_interpretation).toBe(
      "AUTOMATIC_TWO_POINT_IDENTITY_NOT_FIT_QUALITY",
    );
    expect(diagnostics.residual_standard_error_mps).toBeNull();
    expect(value.claimClass).toBe("STATISTICALLY_ESTIMATED");
    expect((value.profileClaim as { claimClass: string }).claimClass).toBe(
      "STATISTICALLY_ESTIMATED",
    );
  });

  it("matches an independent four-point OLS oracle and reports diagnostics", async () => {
    const result = await compute(
      input([40, 60, 80, 100], [1.1, 0.9, 0.55, 0.4], "MULTI_POINT_OLS"),
    );
    const value = successful(result);
    expect(value.model.slopeMpsPerKg).toBeCloseTo(-0.01225, 12);
    expect(value.model.interceptMps).toBeCloseTo(1.595, 12);
    const diagnostics = value.diagnostics as Record<string, unknown>;
    expect(diagnostics.r2).toBeCloseTo(0.9780040733197556, 12);
    expect(diagnostics.residual_standard_error_mps).toBeCloseTo(
      0.05809475019311127,
      12,
    );
    expect(diagnostics.degrees_of_freedom_residual).toBe(2);
    expect(value.observations[1]?.residualMps).toBeCloseTo(0.04, 12);
  });

  it("is invariant to load units, observation permutation, and axis polarity inversion", async () => {
    const positive = await compute(
      input([50, 75, 100], [1, 0.75, 0.5], "MULTI_POINT_OLS"),
    );
    const positiveValue = successful(positive);
    const pounds = await compute(
      input([50, 75, 100], [1, 0.75, 0.5], "MULTI_POINT_OLS", {
        loadUnit: "lb",
      }),
    );
    const poundsValue = successful(pounds);
    expect(pounds.inputFingerprint).toBe(positive.inputFingerprint);
    expect(poundsValue.model.slopeMpsPerKg).toBeCloseTo(
      positiveValue.model.slopeMpsPerKg,
      12,
    );
    expect(poundsValue.model.interceptMps).toBeCloseTo(
      positiveValue.model.interceptMps,
      12,
    );
    const permutedInput = input(
      [50, 75, 100],
      [1, 0.75, 0.5],
      "MULTI_POINT_OLS",
    );
    const permuted = await compute({
      ...permutedInput,
      requestId: "sci6-permuted-request",
      observations: [...permutedInput.observations].reverse(),
    });
    const permutedValue = successful(permuted);
    expect(permuted.inputFingerprint).toBe(positive.inputFingerprint);
    expect(permutedValue.model.slopeMpsPerKg).toBeCloseTo(
      positiveValue.model.slopeMpsPerKg,
      12,
    );
    expect(permutedValue.model.interceptMps).toBeCloseTo(
      positiveValue.model.interceptMps,
      12,
    );

    const negative = await compute(
      input([50, 75, 100], [-1, -0.75, -0.5], "MULTI_POINT_OLS", {
        polarity: "NEGATIVE",
      }),
    );
    const negativeValue = successful(negative);
    expect(negativeValue.model.slopeMpsPerKg).toBeCloseTo(
      positiveValue.model.slopeMpsPerKg,
      12,
    );
    expect(
      negativeValue.observations.map(
        (observation) => observation.metric.signedVelocityMps,
      ),
    ).toEqual([-1, -0.75, -0.5]);
    expect(
      negativeValue.observations.map(
        (observation) => observation.metric.directionalVelocityMps,
      ),
    ).toEqual([1, 0.75, 0.5]);
  });

  it("preserves a positive-slope diagnostic without forcing a negative response", async () => {
    const result = await compute(input([50, 100], [0.5, 0.8], "TWO_POINT"));
    const value = successful(result);
    expect(value.model.slopeMpsPerKg).toBeCloseTo(0.006, 12);
    expect(value.model.directionalityStatus).toBe(
      "NON_NEGATIVE_SLOPE_REQUIRES_REVIEW",
    );
    expect(value.model.applicabilityStatus).toBe("DIRECTIONALLY_INCONSISTENT");
  });

  it("requires a qualified SCI-4 artifact and non-vacuous measurement bindings", async () => {
    const unqualifiedInput = input([50, 100], [1, 0.5], "TWO_POINT");
    const unqualified = await compute({
      ...unqualifiedInput,
      upstreamQualifications: unqualifiedInput.upstreamQualifications.map(
        (qualification) =>
          qualification.capabilityId ===
          "resistance_training.rep_phase_kinematic_metrics"
            ? { ...qualification, qualificationStatus: "UNPROVEN" as never }
            : qualification,
      ),
    });
    expect(unqualified).toMatchObject({
      status: "invalid_input",
      error: { code: "UPSTREAM_QUALIFICATION_UNSUPPORTED" },
    });

    const emptyMeasurement = await compute({
      ...input([50, 100], [1, 0.5], "TWO_POINT"),
      profileContext: {
        ...input([50, 100], [1, 0.5], "TWO_POINT").profileContext,
        measurement: {
          objectOfInterest: {},
          measurementPoint: {},
          referenceFrame: {},
          axis: {},
          modality: {},
        },
      },
    });
    expect(emptyMeasurement).toMatchObject({
      status: "invalid_input",
      error: { code: "INPUT_INVALID" },
    });
  });

  it("rejects duplicate load levels and mixed SCI-1 load mechanisms", async () => {
    const duplicate = await compute(input([50, 50], [1, 0.8], "TWO_POINT"));
    expect(duplicate).toMatchObject({
      status: "invalid_input",
      error: { code: "INPUT_INVALID" },
    });
    expect(duplicate.error?.message).toContain("DUPLICATE_LOAD_LEVEL");

    const mixedMechanism = await compute(
      input([50, 100], [1, 0.5], "TWO_POINT", { alternativeAt: 1 }),
    );
    expect(mixedMechanism).toMatchObject({
      status: "invalid_input",
      error: { code: "LOAD_CONFIGURATION_MISMATCH" },
    });
  });

  it("supports only forward interpolation inside the observed domain and emits a statistical prediction claim", async () => {
    const fit = await compute(input([50, 100], [1, 0.5], "TWO_POINT"));
    const value = successful(fit);
    const prediction = await port().predict({
      requestId: "sci6-prediction-request",
      profileId: value.profileId,
      modelClaimId: (value.profileClaim as { claimId: string }).claimId,
      model: value.model,
      externalLoad: createQuantity({
        value: 75,
        unit: "kg",
        dimension: "mass",
      }),
      inputProvenance: input([50, 100], [1, 0.5], "TWO_POINT").inputProvenance,
    });
    expect(prediction.status).toBe("ok");
    expect(prediction.predictedDirectionalVelocityMps).toBeCloseTo(0.75, 12);
    expect((prediction.claim as { claimClass: string }).claimClass).toBe(
      "STATISTICALLY_ESTIMATED",
    );
    expect(prediction.limitations.join(" ")).toContain("Inverse prediction");

    const extrapolation = await port().predict({
      requestId: "sci6-extrapolation-request",
      profileId: value.profileId,
      modelClaimId: (value.profileClaim as { claimId: string }).claimId,
      model: value.model,
      externalLoad: createQuantity({
        value: 125,
        unit: "kg",
        dimension: "mass",
      }),
      inputProvenance: input([50, 100], [1, 0.5], "TWO_POINT").inputProvenance,
    });
    expect(extrapolation).toMatchObject({
      status: "invalid_input",
      error: { code: "EXTRAPOLATION_NOT_AUTHORIZED" },
    });
  });

  it("retains the zero-response-variance diagnostic instead of inventing fit quality", async () => {
    const result = await compute(
      input([50, 75, 100], [1, 1, 1], "MULTI_POINT_OLS"),
    );
    const value = successful(result);
    const diagnostics = value.diagnostics as Record<string, unknown>;
    expect(value.model.slopeMpsPerKg).toBe(0);
    expect(diagnostics.r2).toBeNull();
    expect(diagnostics.r2_interpretation).toBe(
      "UNDEFINED_ZERO_RESPONSE_VARIANCE",
    );
    expect(value.model.applicabilityStatus).toBe("DIRECTIONALLY_INCONSISTENT");
  });

  it("does not report two-point R² when response variance is zero", async () => {
    const result = await compute(input([50, 100], [1, 1], "TWO_POINT"));
    const value = successful(result);
    const diagnostics = value.diagnostics as Record<string, unknown>;
    expect(diagnostics.r2).toBeNull();
    expect(diagnostics.r2_interpretation).toBe(
      "UNDEFINED_ZERO_RESPONSE_VARIANCE",
    );
  });

  it("binds prediction to the returned model artifact and rejects negative interpolation", async () => {
    const fit = await compute(input([50, 100], [1, 0.5], "TWO_POINT"));
    const value = successful(fit);
    const claimId = (value.profileClaim as { claimId: string }).claimId;
    const tampered = await port().predict({
      requestId: "sci6-tampered-model",
      profileId: value.profileId,
      modelClaimId: claimId,
      model: { ...value.model, interceptMps: value.model.interceptMps + 1 },
      externalLoad: createQuantity({
        value: 75,
        unit: "kg",
        dimension: "mass",
      }),
      inputProvenance: input([50, 100], [1, 0.5], "TWO_POINT").inputProvenance,
    });
    expect(tampered).toMatchObject({
      status: "invalid_input",
      error: { code: "INPUT_INVALID" },
    });

    const negativeFit = await compute(
      input([1, 2, 3], [100, 1, 1], "MULTI_POINT_OLS"),
    );
    const negativeValue = successful(negativeFit);
    const negativeClaimId = (negativeValue.profileClaim as { claimId: string })
      .claimId;
    const negativePrediction = await port().predict({
      requestId: "sci6-negative-interpolation",
      profileId: negativeValue.profileId,
      modelClaimId: negativeClaimId,
      model: negativeValue.model,
      externalLoad: createQuantity({ value: 3, unit: "kg", dimension: "mass" }),
      inputProvenance: input([1, 2, 3], [100, 1, 1], "MULTI_POINT_OLS")
        .inputProvenance,
    });
    expect(negativePrediction).toMatchObject({
      status: "invalid_input",
      error: { code: "INPUT_INVALID" },
    });
  });
});
