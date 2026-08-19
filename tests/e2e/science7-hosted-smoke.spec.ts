import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import {
  createLoadConfiguration,
  freeResistanceSquatLoad,
  type LoadConfiguration,
} from "../../packages/movement-science/dist/public.js";
import {
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
  SCI6_PHASE_AVERAGE_VELOCITY_METRIC_ID,
  SCI6_VELOCITY_METRIC_METHOD_ID,
  SCI6_VELOCITY_METRIC_METHOD_VERSION,
  SCI6_VELOCITY_METRIC_VERSION,
  type TargetVelocityAuthorityInput,
} from "../../packages/science-port/dist/public.js";
import {
  canonicalizeQuantity,
  createQuantity,
} from "../../packages/shared-kernel/dist/public.js";

const password = "WorkoutPal-Local-123!";
const sourceRevision = "b".repeat(40);
const definition = (id: string) => ({ id, version: "1.0.0", revision: 1 });

type JsonRecord = Record<string, unknown>;
type HostedResponse = {
  status: number;
  payload: JsonRecord;
  raw: string;
};

async function signUp(page: Page): Promise<void> {
  await page.goto("/sign-in");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .first()
    .click();
  await page.getByLabel("Name").fill("SCI-7 Hosted Smoke");
  await page
    .getByLabel("Email")
    .fill(`sci7-hosted-${Date.now()}-${randomUUID().slice(0, 8)}@example.com`);
  await page.getByLabel("Password").fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .last()
    .click();
  await expect(page.getByText("Choose your workspace")).toBeVisible({
    timeout: 30_000,
  });
  await page.locator("input").fill(`SCI-7 Hosted Smoke ${Date.now()}`);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/workspace\/[0-9a-f-]+\/athletes$/);
}

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

function profileContext(): LoadVelocityProfileContext {
  return {
    profileId: "sci7-hosted-profile",
    athleteId: "athlete-sci7-hosted",
    sessionId: "session-sci7-hosted",
    assessmentId: "assessment-sci7-hosted",
    trialId: "trial-sci7-hosted",
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
  };
}

const upstreamQualifications = [
  {
    capabilityId: "resistance_training.linear_velocity_from_position",
    capabilityVersion: "1.0.0",
    qualificationStatus: "QUALIFIED" as const,
    qualificationArtifact: { type: "SCI2_QUALIFICATION", ref: "sci2-hosted" },
    limitations: ["Synthetic numerical qualification only."],
  },
  {
    capabilityId: "resistance_training.rep_phase_kinematic_metrics",
    capabilityVersion: "1.0.0",
    qualificationStatus: "QUALIFIED_SOFTWARE" as const,
    qualificationArtifact: { type: "SCI4_QUALIFICATION", ref: "sci4-hosted" },
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
  const context = profileContext();
  const loads = velocities.length === 2 ? [60, 100] : [60, 80, 100];
  return {
    requestId: "sci7-hosted-profile-request",
    profileContext: context,
    upstreamQualifications,
    observations: loads.map((loadKg, index) => ({
      observationId: `sci7-hosted-observation-${index + 1}`,
      repId: `sci7-hosted-rep-${index + 1}`,
      ordinal: index + 1,
      complete: true as const,
      externalLoad: createQuantity({
        value: loadKg,
        unit: "kg",
        dimension: "mass",
      }),
      loadConfiguration: loadConfiguration(loadKg),
      metric: {
        metricId: context.metricDefinition.id,
        metricVersion: context.metricDefinition.version,
        method: context.metricDefinition.method,
        signedVelocityMps: velocities[index] ?? 0,
        directionalVelocityMps: velocities[index] ?? 0,
        claimId: `sci7-hosted-sci4-claim-${index + 1}`,
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
      { type: "PSC4_EVIDENCE", ref: "psc4-sci7-hosted-evidence" },
      { type: "PSC4_RESULT", ref: "psc4-sci7-hosted-result" },
    ],
  };
}

async function profile(
  velocities: readonly number[] = [0.9, 0.5],
): Promise<LoadVelocityProfileValue> {
  const software = createQualifiedLoadVelocitySoftwareProvenance(
    sourceRevision,
    "sci7-hosted-sci6-build",
  );
  const port = new LoadVelocityProfileSciencePort({
    software,
    qualification: {
      qualificationId: "sci6-hosted-qualified",
      qualificationVersion: "1.0.0",
      oracle: { id: "sci6-hosted-oracle", version: "1.0.0" },
      validationData: { id: "sci6-hosted-synthetic", version: "1.0.0" },
      sourceRevision,
      buildId: "sci7-hosted-sci6-build",
    },
  });
  const result = await port.compute(
    createLoadVelocityProfileRequest(profileInput(velocities)),
  );
  if (result.status !== "ok") {
    throw new Error(result.error?.message ?? "SCI-6 hosted fixture failed.");
  }
  return result.value as LoadVelocityProfileValue;
}

function profileQualification(
  profileValue: LoadVelocityProfileValue,
): JsonRecord {
  return {
    capabilityId: "resistance_training.load_velocity_profile",
    capabilityVersion: "1.0.0",
    qualificationStatus: "QUALIFIED_SOFTWARE",
    qualificationArtifact: {
      type: "SCI6_QUALIFICATION",
      ref: "sci6-hosted-receipt",
    },
    limitations: ["Empirical profile validation remains pending."],
    binding: {
      fingerprint: profileValue.model.modelFingerprint,
      claimId: profileValue.model.modelClaimId,
      processor: profileValue.model.processor,
      method: profileValue.model.method,
      sourceRevision,
      buildId: "sci7-hosted-sci6-build",
    },
  };
}

function measuredVelocityObservation(velocityMps: number) {
  const context = profileContext();
  const measured = createMeasuredOneRepMaximumObservation({
    observationId: "sci7-hosted-measured-max",
    athleteId: context.athleteId,
    assessmentId: context.assessmentId,
    trialId: "sci7-hosted-max-trial",
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
      { type: "PSC4_TRIAL", ref: "sci7-hosted-max-trial" },
      { type: "PSC4_ASSESSMENT", ref: context.assessmentId },
      { type: "SCI4_PROTOCOL", ref: "protocol-maximal-strength" },
    ],
  });
  return createVelocityAtMeasuredOneRepMaximumObservation({
    measuredOneRepMaximum: measured,
    metricDefinition: context.metricDefinition,
    measurement: context.measurement,
    metric: {
      metricId: context.metricDefinition.id,
      metricVersion: context.metricDefinition.version,
      method: context.metricDefinition.method,
      signedVelocityMps: velocityMps,
      directionalVelocityMps: velocityMps,
      claimId: "sci7-hosted-measured-max-velocity",
      claimClass: "MECHANICALLY_DERIVED",
      qualificationStatus: "QUALIFIED_SOFTWARE",
      validity: "VALID",
    },
    metricQualification: upstreamQualifications[1],
    observedAt: "2026-08-18T04:00:00.000Z",
    provenance: [
      { type: "PSC4_RESULT", ref: "sci7-hosted-measured-max-velocity" },
    ],
  });
}

function targetAuthority(targetVelocityMps: number) {
  const context = profileContext();
  const input: TargetVelocityAuthorityInput = {
    authorityId: `sci7-hosted-target-${targetVelocityMps}`,
    authorityVersion: "1.0.0",
    semantic: "MVT",
    targetVelocity: createQuantity({
      value: targetVelocityMps,
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
      ref: "sci7-hosted-measured-max-velocity",
    },
    methodProtocolReference: {
      type: "SCI7_METHOD",
      ref: "sci7-hosted-measured-max-velocity-binding",
    },
    targetScope: "ATHLETE_SPECIFIC",
    athleteId: context.athleteId,
    populationScope: "sci7-hosted",
    generalizedTarget: false,
    uncertainty: null,
    qualification: {
      capabilityId: "resistance_training.target_velocity_authority",
      capabilityVersion: "1.0.0",
      qualificationStatus: "QUALIFIED_SOFTWARE",
      qualificationArtifact: {
        type: "SCI7_TARGET_VELOCITY_AUTHORITY",
        ref: "sci7-hosted-target",
      },
      limitations: ["Empirical target-authority validation remains pending."],
    },
    provenance: [
      { type: "PSC4_RESULT", ref: "sci7-hosted-measured-max-velocity" },
    ],
    measuredVelocityObservation: measuredVelocityObservation(targetVelocityMps),
  };
  return createTargetVelocityAuthority({
    ...input,
    targetVelocity: canonicalizeQuantity(input.targetVelocity),
  });
}

function requestBody(
  profileValue: LoadVelocityProfileValue,
  targetVelocityMps: number,
  operation: "TARGET_LOAD" | "ESTIMATED_1RM",
): JsonRecord {
  return {
    requestId: `sci7-hosted-${operation}-${randomUUID()}`,
    operation,
    profile: profileValue,
    profileQualification: profileQualification(profileValue),
    targetVelocityAuthority: targetAuthority(targetVelocityMps),
    inputProvenance: profileInput().inputProvenance,
  };
}

async function post(page: Page, data: JsonRecord): Promise<HostedResponse> {
  const response = await page.request.post("/api/v1/science/maximal-strength", {
    data,
  });
  const raw = await response.text();
  return {
    status: response.status(),
    payload: JSON.parse(raw) as JsonRecord,
    raw,
  };
}

function resultData(response: HostedResponse): JsonRecord {
  return response.payload.data as JsonRecord;
}

test("hosted SCI-7 application route preserves auth, lineage, and failure semantics", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await signUp(page);

  const withinDomain = await profile();
  const withinDomainResponse = await post(
    page,
    requestBody(withinDomain, 0.8, "TARGET_LOAD"),
  );
  expect(withinDomainResponse.status, withinDomainResponse.raw).toBe(200);
  const withinDomainData = resultData(withinDomainResponse);
  expect(withinDomainData.status).toBe("ok");
  const withinDomainValue = withinDomainData.value as JsonRecord;
  expect(
    (withinDomainValue.estimatedExternalLoad as JsonRecord).value,
  ).toBeCloseTo(70, 12);
  expect(withinDomainValue.domainClassification).toBe(
    "WITHIN_OBSERVED_LOAD_DOMAIN",
  );

  const extrapolative = await profile();
  const extrapolativeResponse = await post(
    page,
    requestBody(extrapolative, 0.2, "ESTIMATED_1RM"),
  );
  expect(extrapolativeResponse.status, extrapolativeResponse.raw).toBe(200);
  const extrapolativeData = resultData(extrapolativeResponse);
  expect(extrapolativeData.status).toBe("ok");
  const extrapolativeValue = extrapolativeData.value as JsonRecord;
  expect(
    (extrapolativeValue.estimatedOneRepMaximum as JsonRecord).value,
  ).toBeCloseTo(130, 12);
  expect(extrapolativeValue.domainClassification).toBe(
    "EXTRAPOLATED_ABOVE_OBSERVED_LOAD_DOMAIN",
  );
  expect(
    (extrapolativeValue.extrapolation as JsonRecord)
      .extrapolation_distance_to_span_ratio,
  ).toBeCloseTo(0.75, 12);
  expect(extrapolativeValue.claimClass).toBe("SCIENTIFIC_INFERENCE");
  expect(extrapolativeValue.limitations).toEqual(
    expect.arrayContaining([
      "Empirical profile validation remains pending.",
      "Empirical target-authority validation remains pending.",
    ]),
  );

  const metricMismatch = requestBody(withinDomain, 0.8, "TARGET_LOAD");
  const mismatchedAuthority = structuredClone(
    metricMismatch.targetVelocityAuthority,
  ) as JsonRecord & { velocityMetric: JsonRecord };
  mismatchedAuthority.velocityMetric = {
    ...mismatchedAuthority.velocityMetric,
    unit: "kg",
    dimension: "mass",
  };
  metricMismatch.targetVelocityAuthority = mismatchedAuthority;
  const metricMismatchResponse = await post(page, metricMismatch);
  expect(metricMismatchResponse.status).toBe(400);
  expect(metricMismatchResponse.raw).toContain("VALIDATION_FAILED");

  const positiveSlope = await profile([0.1, 0.5]);
  const positiveSlopeResponse = await post(
    page,
    requestBody(positiveSlope, 0.2, "ESTIMATED_1RM"),
  );
  expect(positiveSlopeResponse.status).toBe(422);
  expect(positiveSlopeResponse.raw).toContain(
    "EXPECTED_INVERSE_RELATIONSHIP_NOT_OBSERVED",
  );

  const zeroTarget = structuredClone(targetAuthority(0.2)) as JsonRecord & {
    targetVelocity: JsonRecord;
  };
  zeroTarget.targetVelocity.value = 0;
  const zeroTargetRequest = {
    ...requestBody(withinDomain, 0.8, "TARGET_LOAD"),
    targetVelocityAuthority: zeroTarget,
  };
  const rejectedZeroTarget = await post(page, zeroTargetRequest);
  expect(rejectedZeroTarget.status).toBe(400);
  expect(rejectedZeroTarget.raw).toContain("VALIDATION_FAILED");

  const expectedSha = process.env.HOSTED_EXPECTED_SHA;
  if (expectedSha !== undefined) {
    const software = (extrapolativeValue.claim as JsonRecord)
      .software as JsonRecord;
    expect(software.sourceRevision).toBe(expectedSha);
  }
});
