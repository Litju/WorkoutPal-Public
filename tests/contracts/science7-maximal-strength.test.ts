import {
  createLoadConfiguration,
  freeResistanceSquatLoad,
  type LoadConfiguration,
} from "@workoutpal/movement-science";
import {
  createEstimatedOneRepMaximumRequest,
  createLoadVelocityProfileRequest,
  createMeasuredOneRepMaximumObservation,
  createQualifiedLoadVelocitySoftwareProvenance,
  createTargetVelocityAuthority,
  createVelocityAtMeasuredOneRepMaximumObservation,
  type LoadVelocityMetricDefinition,
  type LoadVelocityProfileContext,
  type LoadVelocityProfileRequestInput,
  LoadVelocityProfileSciencePort,
  type LoadVelocityProfileValue,
  type MaximalStrengthEngineInvoker,
  type MaximalStrengthModelingRequestInput,
  MaximalStrengthSciencePort,
  SCI6_PHASE_AVERAGE_VELOCITY_METRIC_ID,
  SCI6_VELOCITY_METRIC_METHOD_ID,
  SCI6_VELOCITY_METRIC_METHOD_VERSION,
  SCI6_VELOCITY_METRIC_VERSION,
  type TargetVelocityAuthorityInput,
} from "@workoutpal/science-port";
import {
  canonicalizeQuantity,
  createQuantity,
} from "@workoutpal/shared-kernel";
import { describe, expect, it } from "vitest";

const sourceRevision = "b".repeat(40);
const sci6Software = createQualifiedLoadVelocitySoftwareProvenance(
  sourceRevision,
  "sci7-fixture-sci6-build",
);
const sci7Software = {
  packageName: "@workoutpal/science-port",
  packageVersion: "0.1.0",
  sourceRevision,
  buildId: "sci7-fixture-build",
};

const definition = (id: string) => ({ id, version: "1.0.0", revision: 1 });

const metricDefinition = (): LoadVelocityMetricDefinition => ({
  id: SCI6_PHASE_AVERAGE_VELOCITY_METRIC_ID,
  version: SCI6_VELOCITY_METRIC_VERSION,
  unit: "m/s",
  dimension: "speed",
  method: {
    id: SCI6_VELOCITY_METRIC_METHOD_ID,
    version: SCI6_VELOCITY_METRIC_METHOD_VERSION,
  },
});

const profileContext = (): LoadVelocityProfileContext => ({
  profileId: "sci7-profile",
  athleteId: "athlete-sci7",
  sessionId: "session-sci7",
  assessmentId: "assessment-sci7",
  trialId: "trial-sci7",
  exerciseDefinition: definition("exercise-squat"),
  exerciseVariation: definition("variation-high-bar"),
  movementTask: definition("task-concentric-implement"),
  selectedPhase: {
    ...definition("phase-concentric"),
    phaseId: "concentric",
    polarity: "POSITIVE",
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
    axis: { axis: "Z", sense: "POSITIVE", frameId: "lab-frame-1" },
    modality: {
      modalityId: "fixture-encoder",
      version: "1.0.0",
      kind: "ENCODER",
    },
  },
});

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

function loadConfiguration(loadKg: number): LoadConfiguration {
  return createLoadConfiguration({
    ...freeResistanceSquatLoad,
    resistance: {
      ...freeResistanceSquatLoad.resistance,
      quantity: createQuantity({
        value: loadKg,
        unit: "kg",
        dimension: "mass",
      }),
    },
  });
}

function profileInput(
  velocities: readonly number[] = [0.9, 0.5],
): LoadVelocityProfileRequestInput {
  if (velocities.length < 2)
    throw new Error("SCI-7 fixture requires at least two velocities.");
  const context = profileContext();
  const loads = velocities.length === 2 ? [60, 100] : [60, 80, 100];
  return {
    requestId: "sci7-sci6-profile-request",
    profileContext: context,
    upstreamQualifications: qualifications,
    observations: loads.map((loadKg, index) => ({
      observationId: `sci7-observation-${index + 1}`,
      repId: `sci7-rep-${index + 1}`,
      ordinal: index + 1,
      complete: true as const,
      externalLoad: createQuantity({
        value: loadKg,
        unit: "kg",
        dimension: "mass",
      }),
      loadConfiguration: loadConfiguration(loadKg),
      metric: {
        metricId: SCI6_PHASE_AVERAGE_VELOCITY_METRIC_ID,
        metricVersion: SCI6_VELOCITY_METRIC_VERSION,
        method: {
          id: SCI6_VELOCITY_METRIC_METHOD_ID,
          version: SCI6_VELOCITY_METRIC_METHOD_VERSION,
        },
        signedVelocityMps: velocities[index],
        directionalVelocityMps: velocities[index],
        claimId: `sci7-sci4-claim-${index + 1}`,
        claimClass: "MECHANICALLY_DERIVED" as const,
        qualificationStatus: "QUALIFIED_SOFTWARE" as const,
        validity: "VALID" as const,
      },
      selection: {
        authority: "EXPLICIT_REP_METRIC" as const,
        limitations: ["The exact SCI-4 metric was supplied by the caller."],
      },
    })),
    fitMethod: velocities.length === 2 ? "TWO_POINT" : "MULTI_POINT_OLS",
    inputProvenance: [
      { type: "PSC4_EVIDENCE", ref: "psc4-sci7-evidence" },
      { type: "PSC4_RESULT", ref: "psc4-sci7-result" },
    ],
  };
}

async function profile(velocities: readonly number[] = [0.9, 0.5]) {
  const port = new LoadVelocityProfileSciencePort({
    software: sci6Software,
    qualification: {
      qualificationId: "sci6-fixture-qualified",
      qualificationVersion: "1.0.0",
      oracle: { id: "sci6-fixture-oracle", version: "1.0.0" },
      validationData: { id: "sci6-fixture-synthetic", version: "1.0.0" },
      sourceRevision,
      buildId: "sci7-fixture-sci6-build",
    },
  });
  const result = await port.compute(
    createLoadVelocityProfileRequest(profileInput(velocities)),
  );
  if (result.status !== "ok")
    throw new Error(result.error?.message ?? "SCI-6 fixture failed.");
  return result.value as LoadVelocityProfileValue;
}

function profileQualification(profileValue: LoadVelocityProfileValue) {
  return {
    capabilityId: "resistance_training.load_velocity_profile",
    capabilityVersion: "1.0.0",
    qualificationStatus: "QUALIFIED_SOFTWARE" as const,
    qualificationArtifact: {
      type: "SCI6_QUALIFICATION",
      ref: "sci6-fixture-receipt",
    },
    limitations: ["Empirical profile validation remains pending."],
    binding: {
      fingerprint: profileValue.model.modelFingerprint,
      claimId: profileValue.model.modelClaimId,
      processor: profileValue.model.processor,
      method: profileValue.model.method,
      sourceRevision,
      buildId: sci6Software.buildId,
    },
  };
}

function measuredVelocityObservation(velocityMps: number) {
  const context = profileContext();
  const measured = createMeasuredOneRepMaximumObservation({
    observationId: "measured-max-1",
    athleteId: context.athleteId,
    assessmentId: context.assessmentId,
    trialId: "trial-sci7-max",
    exerciseDefinition: context.exerciseDefinition,
    exerciseVariation: context.exerciseVariation,
    movementTask: context.movementTask,
    selectedPhase: context.selectedPhase,
    measurement: context.measurement,
    load: createQuantity({ value: 125, unit: "kg", dimension: "mass" }),
    protocolRevision: definition("protocol-maximal-strength"),
    trialValidity: "VALID",
    trialExclusion: "INCLUDED",
    successfulMaximalAttempt: true,
    observedAt: "2026-08-18T04:00:00.000Z",
    provenance: [
      { type: "PSC4_TRIAL", ref: "trial-sci7-max" },
      { type: "PSC4_ASSESSMENT", ref: context.assessmentId },
      { type: "SCI4_PROTOCOL", ref: "protocol-maximal-strength" },
    ],
  });
  return createVelocityAtMeasuredOneRepMaximumObservation({
    measuredOneRepMaximum: measured,
    metricDefinition: context.metricDefinition,
    measurement: context.measurement,
    metric: {
      metricId: SCI6_PHASE_AVERAGE_VELOCITY_METRIC_ID,
      metricVersion: SCI6_VELOCITY_METRIC_VERSION,
      method: {
        id: SCI6_VELOCITY_METRIC_METHOD_ID,
        version: SCI6_VELOCITY_METRIC_METHOD_VERSION,
      },
      signedVelocityMps: velocityMps,
      directionalVelocityMps: velocityMps,
      claimId: "sci4-measured-max-velocity",
      claimClass: "MECHANICALLY_DERIVED",
      qualificationStatus: "QUALIFIED_SOFTWARE",
      validity: "VALID",
    },
    metricQualification: qualifications[1],
    observedAt: "2026-08-18T04:00:00.000Z",
    provenance: [{ type: "PSC4_RESULT", ref: "sci4-measured-max-velocity" }],
  });
}

function targetAuthority(
  overrides: Partial<TargetVelocityAuthorityInput> = {},
): ReturnType<typeof createTargetVelocityAuthority> {
  const context = profileContext();
  const defaults: TargetVelocityAuthorityInput = {
    authorityId: "sci7-athlete-target",
    authorityVersion: "1.0.0",
    semantic: "MVT",
    targetVelocity: createQuantity({
      value: 0.2,
      unit: "m/s",
      dimension: "speed",
    }),
    velocityMetric: context.metricDefinition,
    phase: context.selectedPhase,
    exerciseDefinition: context.exerciseDefinition,
    exerciseVariation: context.exerciseVariation,
    movementTask: context.movementTask,
    measurement: context.measurement,
    sourceType: "ATHLETE_SPECIFIC_MEASURED_1RM_VELOCITY",
    sourceReference: {
      type: "SCI4_CLAIM",
      ref: "sci4-measured-max-velocity",
    },
    methodProtocolReference: {
      type: "SCI7_METHOD",
      ref: "measured-max-velocity-binding",
    },
    targetScope: "ATHLETE_SPECIFIC",
    athleteId: context.athleteId,
    populationScope: "athlete-sci7",
    generalizedTarget: false,
    uncertainty: null,
    qualification: {
      capabilityId: "resistance_training.target_velocity_authority",
      capabilityVersion: "1.0.0",
      qualificationStatus: "QUALIFIED_SOFTWARE",
      qualificationArtifact: {
        type: "SCI7_TARGET_VELOCITY_AUTHORITY",
        ref: "sci7-target-fixture",
      },
      limitations: ["Target authority is a synthetic fixture."],
    },
    provenance: [{ type: "PSC4_RESULT", ref: "sci4-measured-max-velocity" }],
    measuredVelocityObservation: measuredVelocityObservation(0.2),
  };
  const merged = { ...defaults, ...overrides };
  const targetVelocity = canonicalizeQuantity(merged.targetVelocity);
  const measuredObservation =
    "measuredVelocityObservation" in overrides
      ? merged.measuredVelocityObservation
      : merged.sourceType === "ATHLETE_SPECIFIC_MEASURED_1RM_VELOCITY"
        ? measuredVelocityObservation(targetVelocity.value)
        : null;
  return createTargetVelocityAuthority({
    ...merged,
    measuredVelocityObservation: measuredObservation,
  });
}

async function modelingInput(
  overrides: Partial<MaximalStrengthModelingRequestInput> = {},
): Promise<MaximalStrengthModelingRequestInput> {
  const profileValue = await profile();
  return {
    requestId: "sci7-model-request",
    operation: "ESTIMATED_1RM",
    profile: profileValue,
    profileQualification: profileQualification(profileValue),
    targetVelocityAuthority: targetAuthority(),
    inputProvenance: profileInput().inputProvenance,
    ...overrides,
  };
}

function port(engineInvoker?: MaximalStrengthEngineInvoker) {
  return new MaximalStrengthSciencePort({
    software: sci7Software,
    qualification: {
      qualificationId: "sci7-fixture-qualified",
      qualificationVersion: "1.0.0",
      oracle: { id: "sci7-analytical-oracle", version: "1.0.0" },
      validationData: { id: "sci7-synthetic-fixtures", version: "1.0.0" },
      sourceRevision,
      buildId: "sci7-fixture-build",
    },
    ...(engineInvoker === undefined ? {} : { engineInvoker }),
  });
}

describe("SCI-7 maximal-strength / target-velocity modeling", () => {
  it("matches the exact inverse oracle and preserves extrapolation metadata", async () => {
    const result = await port().estimateOneRepMaximum(await modelingInput());
    expect(result.status).toBe("ok");
    const value = result.value as Extract<
      NonNullable<typeof result.value>,
      { operation: "ESTIMATED_1RM" }
    >;
    expect(value.estimatedOneRepMaximum.value).toBeCloseTo(130, 12);
    expect(value.domainClassification).toBe(
      "EXTRAPOLATED_ABOVE_OBSERVED_LOAD_DOMAIN",
    );
    expect(value.extrapolation.load_extrapolation_distance_above_kg).toBe(30);
    expect(value.extrapolation.observed_load_span_kg).toBe(40);
    expect(
      value.extrapolation.extrapolation_distance_to_span_ratio,
    ).toBeCloseTo(0.75, 12);
    expect(value.sensitivity.d_load_d_target_velocity).toBeCloseTo(-100, 12);
    expect(value.sensitivity.d_load_d_intercept).toBeCloseTo(100, 12);
    expect(value.sensitivity.d_load_d_slope).toBeCloseTo(13000, 12);
    expect(value.claimClass).toBe("SCIENTIFIC_INFERENCE");
    expect((value.claim as { claimClass: string }).claimClass).toBe(
      "SCIENTIFIC_INFERENCE",
    );
    expect(value.uncertainty.kind).toBe("UNKNOWN");
  });

  it("classifies a fitted target inside the observed load domain", async () => {
    const input = await modelingInput({
      operation: "TARGET_LOAD",
      targetVelocityAuthority: targetAuthority({
        targetVelocity: createQuantity({
          value: 0.7,
          unit: "m/s",
          dimension: "speed",
        }),
      }),
    });
    const result = await port().estimateLoadAtTargetVelocity(input);
    expect(result.status).toBe("ok");
    const value = result.value as Extract<
      NonNullable<typeof result.value>,
      { operation: "TARGET_LOAD" }
    >;
    expect(value.estimatedExternalLoad.value).toBeCloseTo(80, 12);
    expect(value.domainClassification).toBe("WITHIN_OBSERVED_LOAD_DOMAIN");
    expect(value.claimClass).toBe("STATISTICALLY_ESTIMATED");
  });

  it("preserves two-point versus multi-point profile qualification distinctions", async () => {
    const twoPointInput = await modelingInput();
    const multiPointProfile = await profile([0.9, 0.7, 0.5]);
    const multiPointInput = await modelingInput({
      profile: multiPointProfile,
      profileQualification: profileQualification(multiPointProfile),
    });
    const twoPointResult = await port().estimateOneRepMaximum(twoPointInput);
    const multiPointResult =
      await port().estimateOneRepMaximum(multiPointInput);
    expect(twoPointResult.status).toBe("ok");
    expect(multiPointResult.status).toBe("ok");
    const twoPointValue = twoPointResult.value as Extract<
      NonNullable<typeof twoPointResult.value>,
      { operation: "ESTIMATED_1RM" }
    >;
    const multiPointValue = multiPointResult.value as Extract<
      NonNullable<typeof multiPointResult.value>,
      { operation: "ESTIMATED_1RM" }
    >;
    expect(twoPointValue.estimatedOneRepMaximum.value).toBeCloseTo(130, 12);
    expect(multiPointValue.estimatedOneRepMaximum.value).toBeCloseTo(130, 12);
    expect(twoPointValue.profileMethod.id).not.toBe(
      multiPointValue.profileMethod.id,
    );
    expect(twoPointValue.applicabilityDiagnostics).toContain(
      "PROFILE_QUALIFICATION_LIMITED",
    );
    expect(multiPointValue.applicabilityDiagnostics).not.toContain(
      "PROFILE_QUALIFICATION_LIMITED",
    );
    expect(twoPointValue.inputFingerprint).not.toBe(
      multiPointValue.inputFingerprint,
    );
  });

  it("rejects zero targets and positive slopes on the maximal inference path", async () => {
    expect(() =>
      targetAuthority({
        targetVelocity: createQuantity({
          value: 0,
          unit: "m/s",
          dimension: "speed",
        }),
      }),
    ).toThrow(/positive/iu);
    const positiveProfile = await profile([0.5, 0.9]);
    const input = await modelingInput({
      profile: positiveProfile,
      profileQualification: profileQualification(positiveProfile),
    });
    const result = await port().estimateOneRepMaximum(input);
    expect(result).toMatchObject({
      status: "method_unavailable",
      error: { code: "EXPECTED_INVERSE_RELATIONSHIP_NOT_OBSERVED" },
    });
  });

  it("rejects metric and exercise mismatches before inversion", async () => {
    const metricMismatch = await modelingInput({
      targetVelocityAuthority: targetAuthority({
        sourceType: "EXTERNAL_PROTOCOL_TARGET_VELOCITY",
        measuredVelocityObservation: null,
        velocityMetric: {
          ...metricDefinition(),
          id: "PHASE_DIRECTION_PEAK_SAMPLED_LINEAR_VELOCITY",
        },
      }),
    });
    await expect(
      port().estimateOneRepMaximum(metricMismatch),
    ).resolves.toMatchObject({
      status: "invalid_input",
      error: { code: "TARGET_VELOCITY_METRIC_MISMATCH" },
    });
    const exerciseMismatch = await modelingInput({
      targetVelocityAuthority: targetAuthority({
        sourceType: "EXTERNAL_PROTOCOL_TARGET_VELOCITY",
        measuredVelocityObservation: null,
        exerciseDefinition: definition("exercise-bench"),
      }),
    });
    await expect(
      port().estimateOneRepMaximum(exerciseMismatch),
    ).resolves.toMatchObject({
      status: "invalid_input",
      error: { code: "TARGET_VELOCITY_EXERCISE_MISMATCH" },
    });
  });

  it("keeps measured maximum facts and measured-maximum velocity observations separate", () => {
    const measured = createMeasuredOneRepMaximumObservation({
      observationId: "measured-max-1",
      athleteId: "athlete-sci7",
      assessmentId: "assessment-sci7",
      trialId: "trial-sci7-max",
      exerciseDefinition: definition("exercise-squat"),
      exerciseVariation: definition("variation-high-bar"),
      movementTask: definition("task-concentric-implement"),
      selectedPhase: {
        ...definition("phase-concentric"),
        phaseId: "concentric",
        polarity: "POSITIVE",
      },
      measurement: profileContext().measurement,
      load: createQuantity({ value: 125, unit: "kg", dimension: "mass" }),
      protocolRevision: definition("protocol-maximal-strength"),
      trialValidity: "VALID",
      trialExclusion: "INCLUDED",
      successfulMaximalAttempt: true,
      observedAt: "2026-08-18T04:00:00.000Z",
      provenance: [
        { type: "PSC4_TRIAL", ref: "trial-sci7-max" },
        { type: "PSC4_ASSESSMENT", ref: "assessment-sci7" },
        { type: "SCI4_PROTOCOL", ref: "protocol-maximal-strength" },
      ],
    });
    expect(measured.claimClass).toBe("OBSERVED");
    expect(measured.epistemicStatus).toBe("DIRECT_ASSESSMENT_FACT");
    const velocity = createVelocityAtMeasuredOneRepMaximumObservation({
      measuredOneRepMaximum: measured,
      metricDefinition: metricDefinition(),
      measurement: profileContext().measurement,
      metric: {
        metricId: SCI6_PHASE_AVERAGE_VELOCITY_METRIC_ID,
        metricVersion: SCI6_VELOCITY_METRIC_VERSION,
        method: {
          id: SCI6_VELOCITY_METRIC_METHOD_ID,
          version: SCI6_VELOCITY_METRIC_METHOD_VERSION,
        },
        signedVelocityMps: 0.2,
        directionalVelocityMps: 0.2,
        claimId: "sci4-measured-max-velocity",
        claimClass: "MECHANICALLY_DERIVED",
        qualificationStatus: "QUALIFIED_SOFTWARE",
        validity: "VALID",
      },
      metricQualification: qualifications[1],
      observedAt: "2026-08-18T04:00:00.000Z",
      provenance: [{ type: "PSC4_RESULT", ref: "sci4-measured-max-velocity" }],
    });
    expect(velocity.claimClass).toBe("MECHANICALLY_DERIVED");
    expect(velocity.mvtAuthorityStatus).toBe("NOT_ESTABLISHED");
    expect(velocity.measuredOneRepMaximumClaimId).toBe(
      (measured.claim as { claimId: string }).claimId,
    );
  });

  it("keeps generalized and athlete-specific target provenance visible and identities immutable", async () => {
    const athleteInput = await modelingInput();
    const generalizedAuthority = targetAuthority({
      authorityId: "sci7-generalized-target",
      sourceType: "LITERATURE_REFERENCE_VELOCITY_AT_1RM",
      targetScope: "GENERALIZED",
      athleteId: null,
      populationScope: "published-exercise-specific-reference",
      generalizedTarget: true,
      sourceReference: { type: "DOI", ref: "10.1055/s-0030-1248333" },
      provenance: [{ type: "DOI", ref: "10.1055/s-0030-1248333" }],
    });
    const generalizedInput = await modelingInput({
      targetVelocityAuthority: generalizedAuthority,
    });
    const athleteResult = await port().estimateOneRepMaximum(athleteInput);
    const generalizedResult =
      await port().estimateOneRepMaximum(generalizedInput);
    expect(athleteResult.status).toBe("ok");
    expect(generalizedResult.status).toBe("ok");
    const athleteValue = athleteResult.value as Extract<
      NonNullable<typeof athleteResult.value>,
      { operation: "ESTIMATED_1RM" }
    >;
    const generalizedValue = generalizedResult.value as Extract<
      NonNullable<typeof generalizedResult.value>,
      { operation: "ESTIMATED_1RM" }
    >;
    expect(athleteValue.estimatedOneRepMaximum.value).toBeCloseTo(
      generalizedValue.estimatedOneRepMaximum.value,
      12,
    );
    expect(athleteValue.inputFingerprint).not.toBe(
      generalizedValue.inputFingerprint,
    );
    expect(generalizedValue.targetVelocityAuthority.targetScope).toBe(
      "GENERALIZED",
    );
    expect(generalizedValue.applicabilityDiagnostics).toContain(
      "TARGET_AUTHORITY_GENERALIZED",
    );
  });

  it("is invariant to equivalent target-velocity units and reproducible for the same snapshot", async () => {
    const first = await modelingInput();
    const second = await modelingInput({
      targetVelocityAuthority: targetAuthority({
        targetVelocity: createQuantity({
          value: 0.72,
          unit: "km/h",
          dimension: "speed",
        }),
      }),
    });
    const firstResult = await port().estimateOneRepMaximum(first);
    const secondResult = await port().estimateOneRepMaximum(second);
    expect(firstResult.status).toBe("ok");
    expect(secondResult.status).toBe("ok");
    expect(firstResult.inputFingerprint).toBe(secondResult.inputFingerprint);
    const repeated = await port().estimateOneRepMaximum(first);
    expect(repeated.inputFingerprint).toBe(firstResult.inputFingerprint);
    expect(
      (repeated.value as { claim: { claimId: string } }).claim.claimId,
    ).toBe((firstResult.value as { claim: { claimId: string } }).claim.claimId);
  });

  it("does not create an implicit target or zero-velocity maximal estimator", () => {
    expect(() =>
      createTargetVelocityAuthority({
        ...targetAuthority(),
        targetVelocity: createQuantity({
          value: 0,
          unit: "m/s",
          dimension: "speed",
        }),
      }),
    ).toThrow();
    expect(createEstimatedOneRepMaximumRequest).toBeTypeOf("function");
  });

  it("rejects free-floating measured authorities and tampered SCI-6 profiles", async () => {
    const validAuthority = targetAuthority();
    expect(() =>
      createTargetVelocityAuthority({
        ...validAuthority,
        measuredVelocityObservation: null,
      } as TargetVelocityAuthorityInput),
    ).toThrow(/measured-velocity observation/iu);

    const input = await modelingInput();
    const tamperedProfile = {
      ...input.profile,
      model: {
        ...input.profile.model,
        slopeMpsPerKg: input.profile.model.slopeMpsPerKg * 2,
      },
    };
    await expect(
      port().estimateOneRepMaximum({
        ...input,
        profile: tamperedProfile,
      }),
    ).resolves.toMatchObject({
      status: "invalid_input",
      error: { code: "PROFILE_UNQUALIFIED" },
    });
  });

  it("rejects an engine-provided confidence interval without propagation authority", async () => {
    const fakeEngine: MaximalStrengthEngineInvoker = async (payload) => ({
      status: "SUCCEEDED",
      processor: {
        id: "resistance_training.maximal_strength_modeling",
        version: "1.0.0",
      },
      method: {
        id: "maximal_strength.estimated_one_rep_maximum",
        version: "1.0.0",
      },
      operation: "ESTIMATED_1RM",
      profile_id: payload.profile_id,
      target_velocity_mps: payload.target_velocity_mps,
      estimated_load_kg: 130,
      domain_classification: "EXTRAPOLATED_ABOVE_OBSERVED_LOAD_DOMAIN",
      extrapolation: {
        velocity_domain_classification: "WITHIN_OBSERVED_VELOCITY_DOMAIN",
      },
      sensitivity: {
        d_load_d_target_velocity: -100,
        d_load_d_intercept: 100,
        d_load_d_slope: 13_000,
      },
      diagnostics: {},
      uncertainty: {
        kind: "INTERVAL",
        intervalKind: "BOUNDED",
        lower: createQuantity({ value: 120, unit: "kg", dimension: "mass" }),
        upper: createQuantity({ value: 140, unit: "kg", dimension: "mass" }),
        coverage: { kind: "NOT_APPLICABLE" },
        source: {
          kind: "METHOD",
          method: { id: "fake.propagation", version: "1.0.0" },
        },
      },
    });
    const result = await port(fakeEngine).estimateOneRepMaximum(
      await modelingInput(),
    );
    expect(result).toMatchObject({
      status: "invalid_input",
      error: { code: "INPUT_INVALID" },
    });
  });
});
