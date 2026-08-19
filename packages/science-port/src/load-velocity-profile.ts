import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  LoadConfiguration,
  ScientificDefinitionRef,
} from "@workoutpal/movement-science";
import { createLoadConfiguration } from "@workoutpal/movement-science";
import type {
  AssumptionDeclaration,
  ClaimReference,
  ConfigurationSnapshot,
  JsonValue,
  MethodIdentity,
  SciencePort,
  ScienceProvenanceRef,
  ScienceRequest,
  ScienceResult,
  ScientificFailureCode,
  ScientificProcessorContract,
  SoftwareProvenance,
  Uncertainty,
  UncertaintyPolicy,
} from "@workoutpal/science-contract";
import {
  createDerivationGraph,
  createProcessorContract,
  createRecalculationHistory,
  createScientificClaim,
  createScientificFailure,
  isPsc4SourceEvidenceType,
} from "@workoutpal/science-contract";
import {
  canonicalizeQuantity,
  createQuantity,
  type Dimension,
  type Instant,
  parseInstant,
  type Quantity,
} from "@workoutpal/shared-kernel";

export const LOAD_VELOCITY_PROFILE_CAPABILITY_ID =
  "resistance_training.load_velocity_profile";
export const LOAD_VELOCITY_PROFILE_CAPABILITY_VERSION = "1.0.0";
export const LOAD_VELOCITY_PROFILE_PROCESSOR_ID =
  LOAD_VELOCITY_PROFILE_CAPABILITY_ID;
export const LOAD_VELOCITY_PROFILE_PROCESSOR_VERSION = "1.0.0";
export const LOAD_VELOCITY_PROFILE_BASE_METHOD_ID =
  "load_velocity_profile.linear_model";
export const LOAD_VELOCITY_PROFILE_BASE_METHOD_VERSION = "1.0.0";
export const LOAD_VELOCITY_PROFILE_TWO_POINT_METHOD_ID =
  "load_velocity_profile.two_point_exact_linear";
export const LOAD_VELOCITY_PROFILE_MULTI_POINT_METHOD_ID =
  "load_velocity_profile.multi_point_ols_linear";
export const LOAD_VELOCITY_PROFILE_PREDICTION_METHOD_ID =
  "load_velocity_profile.observed_domain_interpolation";
export const LOAD_VELOCITY_PROFILE_METHOD_VERSION = "1.0.0";
export const LOAD_VELOCITY_PROFILE_INPUT_KEY = "load_velocity_observations";
export const LOAD_VELOCITY_PROFILE_PREDICTION_INPUT_KEY =
  "load_velocity_prediction";

export const SCI6_PHASE_AVERAGE_VELOCITY_METRIC_ID =
  "PHASE_INTERVAL_AVERAGE_SIGNED_LINEAR_VELOCITY" as const;
export const SCI6_PHASE_PEAK_VELOCITY_METRIC_ID =
  "PHASE_DIRECTION_PEAK_SAMPLED_LINEAR_VELOCITY" as const;
export const SCI6_VELOCITY_METRIC_VERSION = "1.0.0";
export const SCI6_VELOCITY_METRIC_METHOD_ID =
  "rep_phase_metrics.sample_aligned_claim_binding";
export const SCI6_VELOCITY_METRIC_METHOD_VERSION = "1.0.0";

export type LoadVelocityMetricId =
  | typeof SCI6_PHASE_AVERAGE_VELOCITY_METRIC_ID
  | typeof SCI6_PHASE_PEAK_VELOCITY_METRIC_ID;
export type LoadVelocityFitMethod = "TWO_POINT" | "MULTI_POINT_OLS";
export type LoadVelocityQualificationStatus =
  | "QUALIFIED"
  | "QUALIFIED_SOFTWARE";
export type LoadVelocityPhasePolarity = "POSITIVE" | "NEGATIVE";
export type LoadVelocitySelectionAuthority =
  | "EXPLICIT_REP_METRIC"
  | "SCI5_FIRST_ELIGIBLE"
  | "SCI5_FASTEST_ELIGIBLE_COMPLETE_SET"
  | "SCI5_EXPLICIT_REPETITION";

export interface LoadVelocityPhaseBinding extends ScientificDefinitionRef {
  readonly phaseId: string;
  readonly polarity: LoadVelocityPhasePolarity;
}

export interface LoadVelocityMetricDefinition {
  readonly id: LoadVelocityMetricId;
  readonly version: string;
  readonly unit: "m/s";
  readonly dimension: "speed";
  readonly method: MethodIdentity;
}

export interface LoadVelocityMeasurementBinding {
  readonly objectOfInterest: Readonly<Record<string, unknown>>;
  readonly measurementPoint: Readonly<Record<string, unknown>>;
  readonly referenceFrame: Readonly<Record<string, unknown>>;
  readonly axis: Readonly<Record<string, unknown>>;
  readonly modality: Readonly<Record<string, unknown>>;
}

export interface LoadVelocityUpstreamQualification {
  readonly capabilityId: string;
  readonly capabilityVersion: string;
  readonly qualificationStatus: LoadVelocityQualificationStatus;
  readonly qualificationArtifact: ScienceProvenanceRef;
  readonly limitations: readonly string[];
}

export interface LoadVelocityProfileContext {
  readonly profileId: string;
  readonly athleteId: string;
  readonly sessionId: string;
  readonly assessmentId: string;
  readonly trialId: string;
  readonly exerciseDefinition: ScientificDefinitionRef;
  readonly exerciseVariation: ScientificDefinitionRef | null;
  readonly movementTask: ScientificDefinitionRef;
  readonly selectedPhase: LoadVelocityPhaseBinding;
  readonly metricDefinition: LoadVelocityMetricDefinition;
  readonly measurement: LoadVelocityMeasurementBinding;
}

export interface LoadVelocityMetricBinding {
  readonly metricId: LoadVelocityMetricId;
  readonly metricVersion: string;
  readonly method: MethodIdentity;
  readonly signedVelocityMps: number;
  readonly directionalVelocityMps: number;
  readonly claimId: string;
  readonly claimClass: "MECHANICALLY_DERIVED";
  readonly qualificationStatus: LoadVelocityQualificationStatus;
  readonly validity: "VALID" | "INVALID" | "UNKNOWN";
}

export interface LoadVelocitySelectionBinding {
  readonly authority: LoadVelocitySelectionAuthority;
  readonly limitations: readonly string[];
  readonly claimId?: string;
  readonly claimClass?: "MECHANICALLY_DERIVED";
}

export interface LoadVelocityObservation {
  readonly observationId: string;
  readonly repId: string;
  readonly ordinal: number;
  readonly complete: boolean;
  readonly externalLoad: Quantity;
  readonly loadConfiguration: LoadConfiguration;
  readonly metric: LoadVelocityMetricBinding;
  readonly selection: LoadVelocitySelectionBinding;
}

export interface LoadVelocityProfileRequestInput {
  readonly requestId: string;
  readonly profileContext: LoadVelocityProfileContext;
  readonly upstreamQualifications: readonly LoadVelocityUpstreamQualification[];
  readonly observations: readonly LoadVelocityObservation[];
  readonly fitMethod: LoadVelocityFitMethod;
  readonly inputProvenance: readonly ScienceProvenanceRef[];
  readonly observedAt?: string;
}

export interface LoadVelocityModelDomain {
  readonly externalLoadMinKg: number;
  readonly externalLoadMaxKg: number;
  readonly directionalVelocityMinMps: number;
  readonly directionalVelocityMaxMps: number;
}

export interface LoadVelocityModel {
  readonly profileId: string;
  readonly profileInputFingerprint: string;
  readonly modelClaimId: string;
  readonly modelFingerprint: string;
  readonly fitMethod: LoadVelocityFitMethod;
  readonly processor: MethodIdentity;
  readonly method: MethodIdentity;
  readonly predictor: {
    readonly name: "external_load";
    readonly unit: "kg";
    readonly dimension: "mass";
  };
  readonly response: {
    readonly name: "directional_velocity";
    readonly unit: "m/s";
    readonly dimension: "speed";
  };
  readonly slopeMpsPerKg: number;
  readonly interceptMps: number;
  readonly observedDomain: LoadVelocityModelDomain;
  readonly directionalityStatus:
    | "EXPECTED_NEGATIVE_SLOPE"
    | "NON_NEGATIVE_SLOPE_REQUIRES_REVIEW";
  readonly applicabilityStatus:
    | "APPLICABLE_WITHIN_OBSERVED_DOMAIN"
    | "DIRECTIONALLY_INCONSISTENT";
  readonly numberOfObservations: number;
}

export interface LoadVelocityProfileObservationResult
  extends LoadVelocityObservation {
  readonly externalLoadKg: number;
  readonly fittedVelocityMps: number;
  readonly residualMps: number;
}

export interface LoadVelocityProfileValue {
  readonly processor: MethodIdentity;
  readonly method: MethodIdentity;
  readonly profileId: string;
  readonly fitMethod: LoadVelocityFitMethod;
  readonly profileContext: LoadVelocityProfileContext;
  readonly observations: readonly LoadVelocityProfileObservationResult[];
  readonly model: LoadVelocityModel;
  readonly diagnostics: Readonly<Record<string, unknown>>;
  readonly upstreamQualifications: readonly LoadVelocityUpstreamQualification[];
  readonly limitations: readonly string[];
  readonly claimClass: "STATISTICALLY_ESTIMATED";
  readonly profileClaim: Readonly<Record<string, unknown>>;
  readonly derivation: Readonly<Record<string, unknown>>;
  readonly recalculationHistory: Readonly<Record<string, unknown>>;
}

export interface LoadVelocityPredictionInput {
  readonly requestId: string;
  readonly profileId: string;
  readonly modelClaimId: string;
  readonly model: LoadVelocityModel;
  readonly externalLoad: Quantity;
  readonly inputProvenance: readonly ScienceProvenanceRef[];
}

export interface LoadVelocityPredictionResult {
  readonly status:
    | "ok"
    | "invalid_input"
    | "method_unavailable"
    | "computation_failed";
  readonly requestId: string;
  readonly profileId: string;
  readonly externalLoad: Quantity;
  readonly predictedDirectionalVelocityMps?: number;
  readonly claim?: Readonly<Record<string, unknown>>;
  readonly derivation?: Readonly<Record<string, unknown>>;
  readonly recalculationHistory?: Readonly<Record<string, unknown>>;
  readonly limitations: readonly string[];
  readonly error?: { readonly code: string; readonly message: string };
}

export interface LoadVelocityProfileAdapterOptions {
  readonly software: SoftwareProvenance;
  readonly qualification?: {
    readonly qualificationId: string;
    readonly qualificationVersion: string;
    readonly oracle: { readonly id: string; readonly version: string };
    readonly validationData: { readonly id: string; readonly version: string };
    readonly sourceRevision: string;
    readonly buildId: string;
  } | null;
  readonly pythonExecutable?: string;
  readonly pythonScriptPath?: string;
  readonly engineInvoker?: LoadVelocityProfileEngineInvoker;
}

export type LoadVelocityProfileEngineInvoker = (
  payload: Readonly<Record<string, unknown>>,
) => Promise<unknown>;

interface EngineObservation extends Record<string, unknown> {
  readonly observation_id: string;
  readonly external_load_kg: number;
  readonly fitted_velocity_mps: number;
  readonly residual_mps: number;
}

interface EngineSuccess {
  readonly status: "SUCCEEDED";
  readonly processor: MethodIdentity;
  readonly method: MethodIdentity;
  readonly fit_method: LoadVelocityFitMethod;
  readonly profile_id: string;
  readonly observations: readonly EngineObservation[];
  readonly model: Readonly<Record<string, unknown>>;
  readonly diagnostics: Readonly<Record<string, unknown>>;
  readonly upstream_qualifications: readonly Readonly<
    Record<string, unknown>
  >[];
  readonly uncertainty: Readonly<Record<string, unknown>>;
}

interface EnginePredictionSuccess {
  readonly status: "SUCCEEDED";
  readonly processor: MethodIdentity;
  readonly method: MethodIdentity;
  readonly profile_id: string;
  readonly model: Readonly<Record<string, unknown>>;
  readonly prediction: Readonly<Record<string, unknown>>;
  readonly uncertainty: Readonly<Record<string, unknown>>;
}

interface EngineFailureResponse {
  readonly status: "FAILED";
  readonly failure: {
    readonly code: string;
    readonly message: string;
    readonly details: readonly Readonly<Record<string, unknown>>[];
  };
}

interface EngineInfrastructureFailure {
  readonly status: "INFRASTRUCTURE_FAILED";
  readonly exception: {
    readonly code: "INFRASTRUCTURE_EXCEPTION";
    readonly message: string;
    readonly details: readonly Readonly<Record<string, unknown>>[];
  };
}

type EngineResponse =
  | EngineSuccess
  | EnginePredictionSuccess
  | EngineFailureResponse
  | EngineInfrastructureFailure;

const PYTHON_PROCESSOR_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../engine/load_velocity_profile_processor.py",
);
const SHA_PATTERN = /^[0-9a-f]{40,64}$/iu;
const ACCEPTED_QUALIFICATION_STATUSES: readonly LoadVelocityQualificationStatus[] =
  ["QUALIFIED", "QUALIFIED_SOFTWARE"];
const SCI4_METRIC_CAPABILITY_ID =
  "resistance_training.rep_phase_kinematic_metrics";
const SCI4_METRIC_CAPABILITY_VERSION = "1.0.0";
const SCI4_QUALIFICATION_ARTIFACT_TYPE = "SCI4_QUALIFICATION";
const PROFILE_FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/iu;
const SELECTION_AUTHORITIES: readonly LoadVelocitySelectionAuthority[] = [
  "EXPLICIT_REP_METRIC",
  "SCI5_FIRST_ELIGIBLE",
  "SCI5_FASTEST_ELIGIBLE_COMPLETE_SET",
  "SCI5_EXPLICIT_REPETITION",
];
const FAILURE_CODES: readonly ScientificFailureCode[] = [
  "REQUIRED_EVIDENCE_MISSING",
  "INPUT_INVALID",
  "INPUT_EXCLUDED",
  "DIMENSION_MISMATCH",
  "INSUFFICIENT_SAMPLES",
  "NON_FINITE_SAMPLE",
  "NUMERICAL_OVERFLOW",
  "METHOD_NOT_APPLICABLE",
  "UNSUPPORTED_CONFIGURATION",
  "SEQUENCE_EMPTY",
  "REPETITION_ORDINAL_INVALID",
  "DUPLICATE_REPETITION_ID",
  "EXERCISE_DEFINITION_MISMATCH",
  "EXERCISE_VARIATION_MISMATCH",
  "MOVEMENT_TASK_MISMATCH",
  "LOAD_CONFIGURATION_MISMATCH",
  "MEASUREMENT_OBJECT_MISMATCH",
  "MEASUREMENT_POINT_MISMATCH",
  "REFERENCE_FRAME_MISSING",
  "AXIS_BINDING_MISSING",
  "MODALITY_MISMATCH",
  "METRIC_DEFINITION_MISMATCH",
  "METRIC_METHOD_MISMATCH",
  "REP_PHASE_MISMATCH",
  "REP_INCOMPLETE",
  "REP_METRIC_INVALID",
  "NON_FINITE_VELOCITY",
  "REP_UPSTREAM_INVALID",
  "UPSTREAM_QUALIFICATION_MISSING",
  "UPSTREAM_QUALIFICATION_UNSUPPORTED",
  "REFERENCE_POLICY_INVALID",
  "TRIAL_INVALID",
  "TRIAL_EXCLUDED",
];

function nowInstant(): Instant {
  return parseInstant(new Date().toISOString());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
}

function canonicalJson(value: unknown): string {
  if (value === undefined || value === null) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function immutable<T>(value: T): T {
  const clone = JSON.parse(JSON.stringify(value)) as T;
  const freeze = (candidate: unknown): void => {
    if (candidate === null || typeof candidate !== "object") return;
    for (const nested of Object.values(candidate)) freeze(nested);
    Object.freeze(candidate);
  };
  freeze(clone);
  return clone;
}

function identity(value: unknown, label: string): ScientificDefinitionRef {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  const revision = value.revision;
  if (
    typeof revision !== "number" ||
    !Number.isInteger(revision) ||
    revision < 1
  ) {
    throw new Error(`${label} revision must be a positive integer.`);
  }
  const result = {
    id: requireText(value.id, `${label} id`),
    version: requireText(value.version, `${label} version`),
    revision,
  };
  return result;
}

function methodIdentity(value: unknown, label: string): MethodIdentity {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  return {
    id: requireText(value.id, `${label} id`),
    version: requireText(value.version, `${label} version`),
  };
}

function validateMeasurement(value: unknown): LoadVelocityMeasurementBinding {
  if (!isRecord(value)) throw new Error("Measurement binding is required.");
  const keys = [
    "objectOfInterest",
    "measurementPoint",
    "referenceFrame",
    "axis",
    "modality",
  ] as const;
  for (const key of keys) {
    if (!isRecord(value[key]))
      throw new Error(`${key} measurement binding is required.`);
  }
  const objectOfInterest = value.objectOfInterest as Record<string, unknown>;
  const measurementPoint = value.measurementPoint as Record<string, unknown>;
  const referenceFrame = value.referenceFrame as Record<string, unknown>;
  const axis = value.axis as Record<string, unknown>;
  const modality = value.modality as Record<string, unknown>;
  const validateObject = (
    candidate: Record<string, unknown>,
    label: string,
    expectedKind?: string,
  ): void => {
    const objectKind = requireText(candidate.objectKind, `${label}.objectKind`);
    requireText(candidate.objectId, `${label}.objectId`);
    if (expectedKind !== undefined && objectKind !== expectedKind) {
      throw new Error(
        `MEASUREMENT_POINT_MISMATCH: ${label}.objectKind must be ${expectedKind}.`,
      );
    }
  };
  validateObject(objectOfInterest, "objectOfInterest");
  validateObject(measurementPoint, "measurementPoint", "MEASUREMENT_POINT");
  requireText(referenceFrame.frameKind, "referenceFrame.frameKind");
  const frameId = requireText(referenceFrame.frameId, "referenceFrame.frameId");
  requireText(axis.axis, "axis.axis");
  requireText(axis.sense, "axis.sense");
  if (requireText(axis.frameId, "axis.frameId") !== frameId) {
    throw new Error(
      "AXIS_BINDING_MISSING: axis.frameId must match referenceFrame.frameId.",
    );
  }
  requireText(modality.modalityId, "modality.modalityId");
  requireText(modality.version, "modality.version");
  requireText(modality.kind, "modality.kind");
  return {
    objectOfInterest: objectOfInterest as Readonly<Record<string, unknown>>,
    measurementPoint: measurementPoint as Readonly<Record<string, unknown>>,
    referenceFrame: referenceFrame as Readonly<Record<string, unknown>>,
    axis: axis as Readonly<Record<string, unknown>>,
    modality: modality as Readonly<Record<string, unknown>>,
  };
}

function validateMetricDefinition(
  value: unknown,
): LoadVelocityMetricDefinition {
  if (!isRecord(value)) throw new Error("SCI-4 metric definition is required.");
  const id = value.id;
  if (
    id !== SCI6_PHASE_AVERAGE_VELOCITY_METRIC_ID &&
    id !== SCI6_PHASE_PEAK_VELOCITY_METRIC_ID
  ) {
    throw new Error("METRIC_DEFINITION_MISMATCH: unsupported SCI-4 metric.");
  }
  const version = requireText(value.version, "SCI-4 metric version");
  if (version !== SCI6_VELOCITY_METRIC_VERSION) {
    throw new Error(
      "METRIC_DEFINITION_MISMATCH: unsupported SCI-4 metric version.",
    );
  }
  if (value.unit !== "m/s" || value.dimension !== "speed") {
    throw new Error("DIMENSION_MISMATCH: SCI-4 metric must be speed in m/s.");
  }
  const metricMethod = methodIdentity(value.method, "SCI-4 metric method");
  if (
    metricMethod.id !== SCI6_VELOCITY_METRIC_METHOD_ID ||
    metricMethod.version !== SCI6_VELOCITY_METRIC_METHOD_VERSION
  ) {
    throw new Error("METRIC_METHOD_MISMATCH: unsupported SCI-4 metric method.");
  }
  return {
    id,
    version,
    unit: "m/s",
    dimension: "speed",
    method: metricMethod,
  };
}

function validatePhase(value: unknown): LoadVelocityPhaseBinding {
  if (!isRecord(value)) throw new Error("SCI-4 phase binding is required.");
  const phaseIdentity = identity(value, "Selected phase");
  const phaseId = requireText(value.phaseId, "Selected phase id");
  if (value.polarity !== "POSITIVE" && value.polarity !== "NEGATIVE") {
    throw new Error("REP_PHASE_MISMATCH: selected phase polarity is invalid.");
  }
  return { ...phaseIdentity, phaseId, polarity: value.polarity };
}

function validateQualification(
  value: unknown,
  label: string,
): LoadVelocityUpstreamQualification {
  if (!isRecord(value)) throw new Error(`${label} is required.`);
  const status = value.qualificationStatus;
  if (
    !ACCEPTED_QUALIFICATION_STATUSES.includes(
      status as LoadVelocityQualificationStatus,
    )
  ) {
    throw new Error(
      `UPSTREAM_QUALIFICATION_UNSUPPORTED: ${label} status is unsupported.`,
    );
  }
  if (!isRecord(value.qualificationArtifact)) {
    throw new Error(
      `UPSTREAM_QUALIFICATION_MISSING: ${label} artifact is required.`,
    );
  }
  const limitations = value.limitations;
  if (
    !Array.isArray(limitations) ||
    limitations.length === 0 ||
    limitations.some(
      (item) => typeof item !== "string" || item.trim().length === 0,
    )
  ) {
    throw new Error(
      `UPSTREAM_QUALIFICATION_MISSING: ${label} limitations must be explicit.`,
    );
  }
  return {
    capabilityId: requireText(value.capabilityId, `${label} capability id`),
    capabilityVersion: requireText(
      value.capabilityVersion,
      `${label} capability version`,
    ),
    qualificationStatus: status as LoadVelocityQualificationStatus,
    qualificationArtifact: {
      type: requireText(
        value.qualificationArtifact.type,
        `${label} artifact type`,
      ),
      ref: requireText(
        value.qualificationArtifact.ref,
        `${label} artifact ref`,
      ),
    },
    limitations,
  };
}

function externalLoadKg(quantity: Quantity, label: string): number {
  const validated = createQuantity(quantity);
  if (validated.dimension !== "mass") {
    throw new Error(`DIMENSION_MISMATCH: ${label} must have mass dimension.`);
  }
  const canonical = canonicalizeQuantity(validated);
  if (canonical.value <= 0)
    throw new Error(`${label} must be greater than zero.`);
  return canonical.value;
}

function normalizedLoadConfiguration(
  value: unknown,
  label: string,
): LoadConfiguration {
  if (!isRecord(value)) throw new Error(`${label} is required.`);
  const configuration = createLoadConfiguration(
    value as unknown as Parameters<typeof createLoadConfiguration>[0],
  );
  if (configuration.resistance.kind !== "MASS") {
    throw new Error(
      "DIMENSION_MISMATCH: SCI-6 requires an SCI-1 MASS descriptor.",
    );
  }
  if (configuration.resistance.quantity === null) {
    throw new Error(
      "LOAD_CONFIGURATION_MISMATCH: SCI-6 requires an explicit SCI-1 external mass quantity.",
    );
  }
  const declaredKg = externalLoadKg(
    configuration.resistance.quantity,
    `${label}.resistance.quantity`,
  );
  return {
    ...configuration,
    resistance: {
      ...configuration.resistance,
      quantity: createQuantity({
        value: declaredKg,
        unit: "kg",
        dimension: "mass",
      }),
    },
  };
}

function loadMechanismFingerprint(configuration: LoadConfiguration): string {
  return canonicalJson({
    ...configuration,
    resistance: { ...configuration.resistance, quantity: null },
  });
}

function validateInput(
  request: ScienceRequest,
): LoadVelocityProfileRequestInput | ScienceResult {
  const input = request.inputs[LOAD_VELOCITY_PROFILE_INPUT_KEY];
  if (input?.kind !== "structured" || !isRecord(input.value)) {
    return structuredFailure(
      request,
      "REQUIRED_EVIDENCE_MISSING",
      "A structured SCI-6 load--velocity profile input is required.",
    );
  }
  try {
    const raw = input.value;
    if (raw.fitMethod !== "TWO_POINT" && raw.fitMethod !== "MULTI_POINT_OLS") {
      throw new Error(
        "METHOD_NOT_APPLICABLE: fitMethod must be TWO_POINT or MULTI_POINT_OLS.",
      );
    }
    const contextRaw = raw.profileContext;
    if (!isRecord(contextRaw))
      throw new Error("REQUIRED_EVIDENCE_MISSING: profileContext is required.");
    const profileContext: LoadVelocityProfileContext = {
      profileId: requireText(contextRaw.profileId, "Profile id"),
      athleteId: requireText(contextRaw.athleteId, "Athlete id"),
      sessionId: requireText(contextRaw.sessionId, "Session id"),
      assessmentId: requireText(contextRaw.assessmentId, "Assessment id"),
      trialId: requireText(contextRaw.trialId, "Trial id"),
      exerciseDefinition: identity(
        contextRaw.exerciseDefinition,
        "Exercise definition",
      ),
      exerciseVariation:
        contextRaw.exerciseVariation === null
          ? null
          : identity(contextRaw.exerciseVariation, "Exercise variation"),
      movementTask: identity(contextRaw.movementTask, "Movement task"),
      selectedPhase: validatePhase(contextRaw.selectedPhase),
      metricDefinition: validateMetricDefinition(contextRaw.metricDefinition),
      measurement: validateMeasurement(contextRaw.measurement),
    };
    if (
      !Array.isArray(raw.upstreamQualifications) ||
      raw.upstreamQualifications.length === 0
    ) {
      throw new Error(
        "UPSTREAM_QUALIFICATION_MISSING: upstreamQualifications are required.",
      );
    }
    const upstreamQualifications = raw.upstreamQualifications.map(
      (item, index) =>
        validateQualification(item, `upstreamQualifications[${index}]`),
    );
    if (
      !upstreamQualifications.some(
        (qualification) =>
          qualification.capabilityId === SCI4_METRIC_CAPABILITY_ID &&
          qualification.capabilityVersion === SCI4_METRIC_CAPABILITY_VERSION &&
          ACCEPTED_QUALIFICATION_STATUSES.includes(
            qualification.qualificationStatus,
          ) &&
          qualification.qualificationArtifact.type ===
            SCI4_QUALIFICATION_ARTIFACT_TYPE,
      )
    ) {
      throw new Error(
        "UPSTREAM_QUALIFICATION_MISSING: a qualified SCI-4 rep-phase metric artifact is required.",
      );
    }
    if (!Array.isArray(raw.observations) || raw.observations.length === 0) {
      throw new Error("SEQUENCE_EMPTY: observations are required.");
    }
    const observations: LoadVelocityObservation[] = [];
    const observationIds = new Set<string>();
    const repIds = new Set<string>();
    let mechanism: string | null = null;
    for (const [index, rawObservation] of raw.observations.entries()) {
      if (!isRecord(rawObservation))
        throw new Error(
          `INPUT_INVALID: observations[${index}] must be an object.`,
        );
      const observationId = requireText(
        rawObservation.observationId,
        `Observation ${index} id`,
      );
      const repId = requireText(
        rawObservation.repId,
        `Observation ${index} rep id`,
      );
      if (observationIds.has(observationId) || repIds.has(repId)) {
        throw new Error(
          "DUPLICATE_REPETITION_ID: observation and rep identities must be unique.",
        );
      }
      observationIds.add(observationId);
      repIds.add(repId);
      const ordinal = rawObservation.ordinal;
      if (
        typeof ordinal !== "number" ||
        !Number.isInteger(ordinal) ||
        ordinal < 1
      ) {
        throw new Error(
          "REPETITION_ORDINAL_INVALID: observation ordinal must be positive.",
        );
      }
      if (rawObservation.complete !== true)
        throw new Error(
          "REP_INCOMPLETE: SCI-6 accepts complete observations only.",
        );
      const rawExternalLoad = createQuantity(
        rawObservation.externalLoad as Quantity,
      );
      const loadKg = externalLoadKg(
        rawExternalLoad,
        `Observation ${index} external load`,
      );
      const externalLoad = createQuantity({
        value: loadKg,
        unit: "kg",
        dimension: "mass",
      });
      const loadConfiguration = normalizedLoadConfiguration(
        rawObservation.loadConfiguration,
        `Observation ${index} load configuration`,
      );
      const configurationQuantity = loadConfiguration.resistance.quantity;
      if (configurationQuantity === null) {
        throw new Error(
          "LOAD_CONFIGURATION_MISMATCH: external load quantity is required.",
        );
      }
      const configurationKg = externalLoadKg(
        configurationQuantity,
        `Observation ${index} load configuration mass`,
      );
      if (
        Math.abs(configurationKg - loadKg) >
        Math.max(1e-12, Math.abs(loadKg) * 1e-10)
      ) {
        throw new Error(
          "LOAD_CONFIGURATION_MISMATCH: external load must match the SCI-1 mass descriptor.",
        );
      }
      const fingerprint = loadMechanismFingerprint(loadConfiguration);
      if (mechanism === null) mechanism = fingerprint;
      else if (mechanism !== fingerprint)
        throw new Error(
          "LOAD_CONFIGURATION_MISMATCH: load mechanism changed across profile observations.",
        );
      if (!isRecord(rawObservation.metric))
        throw new Error("REP_METRIC_MISSING: metric binding is required.");
      const rawMetric = rawObservation.metric;
      if (
        rawMetric.metricId !== profileContext.metricDefinition.id ||
        rawMetric.metricVersion !== profileContext.metricDefinition.version ||
        !sameJson(rawMetric.method, profileContext.metricDefinition.method)
      ) {
        throw new Error(
          "METRIC_DEFINITION_MISMATCH: observation metric binding differs from profile context.",
        );
      }
      if (
        !ACCEPTED_QUALIFICATION_STATUSES.includes(
          rawMetric.qualificationStatus as LoadVelocityQualificationStatus,
        )
      ) {
        throw new Error(
          "REP_UPSTREAM_INVALID: observation metric qualification status is unsupported.",
        );
      }
      if (rawMetric.validity !== "VALID")
        throw new Error(
          "REP_METRIC_INVALID: only valid SCI-4 metrics are accepted.",
        );
      if (rawMetric.claimClass !== "MECHANICALLY_DERIVED")
        throw new Error(
          "REP_UPSTREAM_INVALID: SCI-4 metric claim class must be MECHANICALLY_DERIVED.",
        );
      const signedVelocityMps = rawMetric.signedVelocityMps;
      const directionalVelocityMps = rawMetric.directionalVelocityMps;
      if (
        !isFiniteNumber(signedVelocityMps) ||
        !isFiniteNumber(directionalVelocityMps)
      ) {
        throw new Error("NON_FINITE_VELOCITY: velocity values must be finite.");
      }
      if (directionalVelocityMps <= 0)
        throw new Error(
          "NON_FINITE_VELOCITY: directional velocity must be positive.",
        );
      const expectedDirectional =
        profileContext.selectedPhase.polarity === "POSITIVE"
          ? signedVelocityMps
          : -signedVelocityMps;
      if (
        expectedDirectional <= 0 ||
        Math.abs(expectedDirectional - directionalVelocityMps) >
          Math.max(1e-12, Math.abs(directionalVelocityMps) * 1e-10)
      ) {
        throw new Error(
          "REP_PHASE_MISMATCH: directional velocity must preserve the signed SCI-4 metric and phase polarity.",
        );
      }
      if (!isRecord(rawObservation.selection))
        throw new Error(
          "REFERENCE_POLICY_INVALID: explicit selection authority is required.",
        );
      const rawSelection = rawObservation.selection;
      if (
        !SELECTION_AUTHORITIES.includes(
          rawSelection.authority as LoadVelocitySelectionAuthority,
        )
      ) {
        throw new Error(
          "REFERENCE_POLICY_INVALID: unsupported selection authority.",
        );
      }
      if (
        !Array.isArray(rawSelection.limitations) ||
        rawSelection.limitations.length === 0 ||
        rawSelection.limitations.some(
          (item) => typeof item !== "string" || item.trim().length === 0,
        )
      ) {
        throw new Error(
          "REQUIRED_EVIDENCE_MISSING: selection limitations must remain visible.",
        );
      }
      const authority =
        rawSelection.authority as LoadVelocitySelectionAuthority;
      const selectionClaimId = rawSelection.claimId;
      if (
        authority.startsWith("SCI5_") &&
        typeof selectionClaimId !== "string"
      ) {
        throw new Error(
          "REFERENCE_POLICY_INVALID: SCI-5 selection authority requires its claim id.",
        );
      }
      if (selectionClaimId !== undefined) {
        requireText(selectionClaimId, "Selection claim id");
        if (rawSelection.claimClass !== "MECHANICALLY_DERIVED") {
          throw new Error(
            "REFERENCE_POLICY_INVALID: selection claim class must be MECHANICALLY_DERIVED.",
          );
        }
      }
      observations.push({
        observationId,
        repId,
        ordinal,
        complete: true,
        externalLoad,
        loadConfiguration,
        metric: {
          metricId: profileContext.metricDefinition.id,
          metricVersion: profileContext.metricDefinition.version,
          method: profileContext.metricDefinition.method,
          signedVelocityMps,
          directionalVelocityMps,
          claimId: requireText(
            rawMetric.claimId,
            `Observation ${index} metric claim id`,
          ),
          claimClass: "MECHANICALLY_DERIVED",
          qualificationStatus:
            rawMetric.qualificationStatus as LoadVelocityQualificationStatus,
          validity: "VALID",
        },
        selection: {
          authority,
          limitations: rawSelection.limitations,
          ...(selectionClaimId === undefined
            ? {}
            : {
                claimId: requireText(selectionClaimId, "Selection claim id"),
                claimClass: "MECHANICALLY_DERIVED" as const,
              }),
        },
      });
    }
    const inputProvenance = raw.inputProvenance;
    if (
      !Array.isArray(inputProvenance) ||
      inputProvenance.length === 0 ||
      !inputProvenance.some(
        (reference) =>
          isRecord(reference) &&
          typeof reference.type === "string" &&
          isPsc4SourceEvidenceType(reference.type) &&
          typeof reference.ref === "string" &&
          reference.ref.trim().length > 0,
      )
    ) {
      throw new Error(
        "REQUIRED_EVIDENCE_MISSING: SCI-6 requires PSC4 source-evidence provenance.",
      );
    }
    const observedAt = raw.observedAt;
    if (observedAt !== undefined)
      parseInstant(requireText(observedAt, "Observed at"));
    return {
      requestId: requireText(raw.requestId, "SCI-6 request id"),
      profileContext,
      upstreamQualifications,
      observations,
      fitMethod: raw.fitMethod,
      inputProvenance: inputProvenance as readonly ScienceProvenanceRef[],
      ...(observedAt === undefined
        ? {}
        : { observedAt: requireText(observedAt, "Observed at") }),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid SCI-6 input.";
    const code =
      FAILURE_CODES.find((candidate) => message.includes(candidate)) ??
      "INPUT_INVALID";
    return structuredFailure(request, code, message);
  }
}

function configurationSnapshot(): ConfigurationSnapshot {
  const parameters = {
    predictor: { name: "external_load", unit: "kg", dimension: "mass" },
    response: { name: "directional_velocity", unit: "m/s", dimension: "speed" },
    methods: {
      twoPoint: {
        id: LOAD_VELOCITY_PROFILE_TWO_POINT_METHOD_ID,
        version: LOAD_VELOCITY_PROFILE_METHOD_VERSION,
      },
      multiPointOls: {
        id: LOAD_VELOCITY_PROFILE_MULTI_POINT_METHOD_ID,
        version: LOAD_VELOCITY_PROFILE_METHOD_VERSION,
      },
    },
    fitDomain: "OBSERVED_EXTERNAL_LOAD_DOMAIN_ONLY",
    inversePrediction: "NOT_SUPPORTED",
    maximumLoadOrMvtEstimation: "NOT_SUPPORTED",
    persistence: "NONE",
  } as const satisfies Readonly<Record<string, JsonValue>>;
  const canonicalSerialization = canonicalJson(parameters);
  return {
    id: `${LOAD_VELOCITY_PROFILE_PROCESSOR_ID}.configuration`,
    parameters,
    canonicalSerialization,
    contentHash: sha256(canonicalSerialization),
  };
}

function uncertaintyPolicy(): UncertaintyPolicy {
  const method = {
    id: LOAD_VELOCITY_PROFILE_BASE_METHOD_ID,
    version: LOAD_VELOCITY_PROFILE_BASE_METHOD_VERSION,
  };
  return {
    measurement: {
      kind: "NOT_PROPAGATED",
      reason:
        "SCI-6 v1 consumes upstream measurement claims but has no bound measurement-error model.",
    },
    statistical: { kind: "PRODUCED_BY_ESTIMATOR", method },
    model: {
      kind: "NOT_PROPAGATED",
      reason:
        "Model error is reported descriptively and is not converted into a validated prediction interval.",
    },
    propagated: {
      kind: "NOT_PROPAGATED",
      reason:
        "No uncertainty propagation beyond the fitted diagnostic quantities is authorized in SCI-6 v1.",
    },
    output: "UNKNOWN_ALLOWED",
  };
}

function assumptions(): readonly AssumptionDeclaration[] {
  return [
    {
      id: "sci1-load-configuration-and-external-mass-bound",
      version: "1.0.0",
      description:
        "SCI-6 consumes SCI-1 load configurations and an explicit positive external mass; athlete-plus-system mass is not substituted.",
      reference: {
        type: "REPOSITORY_AUTHORITY",
        ref: "packages/movement-science/src/model.ts",
      },
      status: "DECLARED",
      parameters: {
        loadMagnitude: "EXPLICIT_EXTERNAL_MASS",
        loadOwner: "SCI1",
      },
    },
    {
      id: "sci4-directional-rep-velocity-bound",
      version: "1.0.0",
      description:
        "SCI-6 consumes already qualified SCI-4 rep velocity claims, preserves signed velocity, and derives direction only from the bound phase polarity.",
      reference: {
        type: "REPOSITORY_AUTHORITY",
        ref: "public-scientific-contract:SCI-4:final-qualification",
      },
      status: "DECLARED",
      parameters: {
        repDetection: "NONE",
        metricRecomputation: "NONE",
        absoluteValueNormalization: "FORBIDDEN",
      },
    },
    {
      id: "sci5-selection-authority-is-explicit",
      version: "1.0.0",
      description:
        "SCI-6 accepts an explicit repetition metric or an explicit SCI-5 selection reference; it never silently selects, averages, or reorders observations.",
      reference: {
        type: "REPOSITORY_AUTHORITY",
        ref: "public-scientific-contract:SCI-5:final-qualification",
      },
      status: "DECLARED",
      parameters: { hiddenSelection: "FORBIDDEN", averaging: "FORBIDDEN" },
    },
    {
      id: "linear-fit-method-is-descriptive",
      version: "1.0.0",
      description:
        "SCI-6 fits a linear response in the observed domain using either a two-point exact line or multi-point ordinary least squares; it does not claim biological law or invert the relationship.",
      reference: {
        type: "REPOSITORY_AUTHORITY",
        ref: "public-scientific-contract:SCI-6:method-adjudication",
      },
      status: "DECLARED",
      parameters: {
        modelFamily: "LINEAR",
        inversePrediction: "NOT_SUPPORTED",
        extrapolation: "FORBIDDEN",
      },
    },
  ];
}

function qualificationBinding(
  options: LoadVelocityProfileAdapterOptions,
): ScientificProcessorContract["qualification"] {
  const qualification = options.qualification;
  if (qualification === undefined || qualification === null) {
    return {
      status: "NOT_QUALIFIED",
      reason: "SCI-6 qualification evidence is not bound.",
    };
  }
  if (
    qualification.sourceRevision !== options.software.sourceRevision ||
    qualification.buildId !== options.software.buildId ||
    !SHA_PATTERN.test(qualification.sourceRevision)
  ) {
    return {
      status: "NOT_QUALIFIED",
      reason:
        "SCI-6 qualification must match software provenance and an exact source SHA.",
    };
  }
  return {
    status: "QUALIFIED",
    identity: {
      qualificationId: requireText(
        qualification.qualificationId,
        "SCI-6 qualification id",
      ),
      qualificationVersion: requireText(
        qualification.qualificationVersion,
        "SCI-6 qualification version",
      ),
      processor: {
        id: LOAD_VELOCITY_PROFILE_PROCESSOR_ID,
        version: LOAD_VELOCITY_PROFILE_PROCESSOR_VERSION,
      },
      method: {
        id: LOAD_VELOCITY_PROFILE_BASE_METHOD_ID,
        version: LOAD_VELOCITY_PROFILE_BASE_METHOD_VERSION,
      },
      software: options.software,
      oracle: {
        id: requireText(qualification.oracle.id, "SCI-6 oracle id"),
        version: requireText(
          qualification.oracle.version,
          "SCI-6 oracle version",
        ),
      },
      validationData: {
        id: requireText(
          qualification.validationData.id,
          "SCI-6 validation data id",
        ),
        version: requireText(
          qualification.validationData.version,
          "SCI-6 validation data version",
        ),
      },
    },
  };
}

function processorContract(
  options: LoadVelocityProfileAdapterOptions,
): ScientificProcessorContract {
  const processor = {
    id: LOAD_VELOCITY_PROFILE_PROCESSOR_ID,
    version: LOAD_VELOCITY_PROFILE_PROCESSOR_VERSION,
  };
  const method = {
    id: LOAD_VELOCITY_PROFILE_BASE_METHOD_ID,
    version: LOAD_VELOCITY_PROFILE_BASE_METHOD_VERSION,
  };
  return createProcessorContract({
    processor,
    method,
    software: options.software,
    inputs: [
      {
        id: LOAD_VELOCITY_PROFILE_INPUT_KEY,
        source: "SCIENTIFIC_CLAIM",
        required: true,
        acceptedClaimClasses: ["MECHANICALLY_DERIVED"],
        dimensions: ["speed"] as readonly Dimension[],
        units: ["m/s"],
        acceptedValidityStates: ["VALID"],
        acceptedExclusionStates: ["INCLUDED"],
        acceptedMissingness: ["NOT_APPLICABLE"],
        protocol: { kind: "NONE" },
      },
      {
        id: "psc4-source-evidence",
        source: "PSC4_EVIDENCE",
        required: true,
        acceptedClaimClasses: [],
        dimensions: [] as readonly Dimension[],
        units: [],
        acceptedValidityStates: ["VALID"],
        acceptedExclusionStates: ["INCLUDED"],
        acceptedMissingness: ["NOT_APPLICABLE"],
        protocol: { kind: "NONE" },
      },
    ],
    output: { claimClass: "STATISTICALLY_ESTIMATED", valueKind: "REFERENCE" },
    assumptions: assumptions(),
    calibration: { kind: "NOT_REQUIRED" },
    uncertainty: uncertaintyPolicy(),
    configuration: configurationSnapshot(),
    determinism: "DETERMINISTIC",
    failureModes: FAILURE_CODES,
    lineage: {
      requiredFields: [
        "INPUTS",
        "PROCESSOR",
        "METHOD",
        "ASSUMPTIONS",
        "CONFIGURATION",
      ],
    },
    qualification: qualificationBinding(options),
  });
}

function structuredFailure(
  request: ScienceRequest,
  code: ScientificFailureCode,
  message: string,
): ScienceResult {
  const failure = createScientificFailure({ code, message, details: [] });
  const status =
    code === "REQUIRED_EVIDENCE_MISSING" ||
    code === "SEQUENCE_EMPTY" ||
    code === "INSUFFICIENT_SAMPLES"
      ? "insufficient_input"
      : code === "METHOD_NOT_APPLICABLE" || code === "UNSUPPORTED_CONFIGURATION"
        ? "method_unavailable"
        : "invalid_input";
  return {
    requestId: request.requestId,
    capabilityId: request.capabilityId,
    status,
    generatedAt: nowInstant(),
    error: { code: failure.code, message: failure.message },
  };
}

function infrastructureFailure(
  request: ScienceRequest,
  message: string,
): ScienceResult {
  return {
    requestId: request.requestId,
    capabilityId: request.capabilityId,
    status: "computation_failed",
    generatedAt: nowInstant(),
    error: { code: "INFRASTRUCTURE_EXCEPTION", message },
  };
}

function malformedRequestFailure(request: unknown): ScienceResult {
  const record = isRecord(request) ? request : {};
  return {
    requestId:
      typeof record.requestId === "string" ? record.requestId : "unknown",
    capabilityId:
      typeof record.capabilityId === "string"
        ? record.capabilityId
        : LOAD_VELOCITY_PROFILE_CAPABILITY_ID,
    status: "invalid_input",
    generatedAt: nowInstant(),
    error: {
      code: "REQUIRED_EVIDENCE_MISSING",
      message:
        "A ScienceRequest must include requestId, inputs, and inputProvenance.",
    },
  };
}

function canonicalLoadConfiguration(
  configuration: LoadConfiguration,
): Readonly<Record<string, unknown>> {
  return {
    id: configuration.id,
    version: configuration.version,
    revision: configuration.revision,
    kind: configuration.kind,
    interaction: configuration.interaction,
    resistance: configuration.resistance,
    load_object: configuration.loadObject,
    placement: configuration.placement,
    distribution: configuration.distribution,
    direction: configuration.direction,
    profile: configuration.profile,
    mechanical_feedback: configuration.mechanicalFeedback,
    rationale: configuration.rationale,
  };
}

function canonicalMeasurementBinding(
  measurement: LoadVelocityMeasurementBinding,
): Readonly<Record<string, unknown>> {
  const objectReference = (
    value: Readonly<Record<string, unknown>>,
  ): Readonly<Record<string, unknown>> => ({
    object_kind: value.objectKind ?? value.object_kind,
    object_id: value.objectId ?? value.object_id,
    ...(value.label === undefined ? {} : { label: value.label }),
  });
  const referenceFrame = measurement.referenceFrame;
  const axis = measurement.axis;
  const modality = measurement.modality;
  return {
    object_of_interest: objectReference(measurement.objectOfInterest),
    measurement_point: objectReference(measurement.measurementPoint),
    reference_frame: {
      frame_kind: referenceFrame.frameKind ?? referenceFrame.frame_kind,
      frame_id: referenceFrame.frameId ?? referenceFrame.frame_id,
      convention: referenceFrame.convention ?? null,
    },
    axis: {
      axis: axis.axis,
      sense: axis.sense,
      frame_id: axis.frameId ?? axis.frame_id,
    },
    modality: {
      modality_id: modality.modalityId ?? modality.modality_id,
      version: modality.version,
      kind: modality.kind,
    },
  };
}

function canonicalPayload(
  input: LoadVelocityProfileRequestInput,
): Readonly<Record<string, unknown>> {
  const observations = [...input.observations].sort((left, right) =>
    left.observationId.localeCompare(right.observationId),
  );
  return {
    processor: {
      id: LOAD_VELOCITY_PROFILE_PROCESSOR_ID,
      version: LOAD_VELOCITY_PROFILE_PROCESSOR_VERSION,
    },
    operation: "FIT",
    fit_method: input.fitMethod,
    profile_context: {
      profile_id: input.profileContext.profileId,
      athlete_id: input.profileContext.athleteId,
      session_id: input.profileContext.sessionId,
      assessment_id: input.profileContext.assessmentId,
      trial_id: input.profileContext.trialId,
      exercise_definition: input.profileContext.exerciseDefinition,
      exercise_variation: input.profileContext.exerciseVariation,
      movement_task: input.profileContext.movementTask,
      selected_phase: {
        ...input.profileContext.selectedPhase,
        phase_id: input.profileContext.selectedPhase.phaseId,
      },
      metric_definition: input.profileContext.metricDefinition,
      measurement: canonicalMeasurementBinding(
        input.profileContext.measurement,
      ),
    },
    upstream_qualifications: input.upstreamQualifications.map(
      (qualification) => ({
        capability_id: qualification.capabilityId,
        capability_version: qualification.capabilityVersion,
        qualification_status: qualification.qualificationStatus,
        qualification_artifact: qualification.qualificationArtifact,
        limitations: qualification.limitations,
      }),
    ),
    observations: observations.map((observation) => ({
      observation_id: observation.observationId,
      rep_id: observation.repId,
      ordinal: observation.ordinal,
      complete: observation.complete,
      external_load: observation.externalLoad,
      load_configuration: canonicalLoadConfiguration(
        observation.loadConfiguration,
      ),
      metric: {
        metric_id: observation.metric.metricId,
        metric_version: observation.metric.metricVersion,
        method: observation.metric.method,
        signed_velocity_mps: observation.metric.signedVelocityMps,
        directional_velocity_mps: observation.metric.directionalVelocityMps,
        claim_id: observation.metric.claimId,
        claim_class: observation.metric.claimClass,
        qualification_status: observation.metric.qualificationStatus,
        validity: observation.metric.validity,
      },
      selection: {
        authority: observation.selection.authority,
        limitations: observation.selection.limitations,
        ...(observation.selection.claimId === undefined
          ? {}
          : {
              claim_id: observation.selection.claimId,
              claim_class: observation.selection.claimClass,
            }),
      },
    })),
  };
}

function expectedMethod(fitMethod: LoadVelocityFitMethod): MethodIdentity {
  return {
    id:
      fitMethod === "TWO_POINT"
        ? LOAD_VELOCITY_PROFILE_TWO_POINT_METHOD_ID
        : LOAD_VELOCITY_PROFILE_MULTI_POINT_METHOD_ID,
    version: LOAD_VELOCITY_PROFILE_METHOD_VERSION,
  };
}

function expectedIdentity(
  value: unknown,
  expected: MethodIdentity,
): value is MethodIdentity {
  return (
    isRecord(value) &&
    value.id === expected.id &&
    value.version === expected.version
  );
}

function parseEngineResponse(
  value: unknown,
  operation: "FIT" | "PREDICT",
  fitMethod?: LoadVelocityFitMethod,
): EngineResponse {
  if (!isRecord(value) || typeof value.status !== "string") {
    throw new Error(
      "SCI-6 Python engine returned an invalid response envelope.",
    );
  }
  if (value.status === "FAILED") {
    if (
      !isRecord(value.failure) ||
      typeof value.failure.code !== "string" ||
      typeof value.failure.message !== "string" ||
      !Array.isArray(value.failure.details)
    ) {
      throw new Error(
        "SCI-6 Python engine returned an invalid failure payload.",
      );
    }
    return value as unknown as EngineFailureResponse;
  }
  if (value.status === "INFRASTRUCTURE_FAILED") {
    if (
      !isRecord(value.exception) ||
      value.exception.code !== "INFRASTRUCTURE_EXCEPTION" ||
      typeof value.exception.message !== "string" ||
      !Array.isArray(value.exception.details)
    ) {
      throw new Error(
        "SCI-6 Python engine returned an invalid infrastructure payload.",
      );
    }
    return value as unknown as EngineInfrastructureFailure;
  }
  const expected =
    operation === "PREDICT"
      ? {
          id: LOAD_VELOCITY_PROFILE_PREDICTION_METHOD_ID,
          version: LOAD_VELOCITY_PROFILE_METHOD_VERSION,
        }
      : expectedMethod(fitMethod ?? "TWO_POINT");
  if (
    value.status !== "SUCCEEDED" ||
    !expectedIdentity(value.processor, {
      id: LOAD_VELOCITY_PROFILE_PROCESSOR_ID,
      version: LOAD_VELOCITY_PROFILE_PROCESSOR_VERSION,
    }) ||
    !expectedIdentity(value.method, expected) ||
    typeof value.profile_id !== "string" ||
    !isRecord(value.uncertainty)
  ) {
    throw new Error("SCI-6 Python engine returned an invalid success payload.");
  }
  if (operation === "FIT") {
    if (
      value.fit_method !== fitMethod ||
      !Array.isArray(value.observations) ||
      !isRecord(value.model) ||
      !isRecord(value.diagnostics) ||
      !Array.isArray(value.upstream_qualifications)
    ) {
      throw new Error("SCI-6 Python engine returned an invalid fit payload.");
    }
    return value as unknown as EngineSuccess;
  }
  if (!isRecord(value.model) || !isRecord(value.prediction)) {
    throw new Error(
      "SCI-6 Python engine returned an invalid prediction payload.",
    );
  }
  return value as unknown as EnginePredictionSuccess;
}

function runPython(
  payload: Readonly<Record<string, unknown>>,
  executable: string,
  scriptPath: string,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", (error: Error) => reject(error));
    child.once("close", (code: number | null) => {
      if (code !== 0) {
        reject(
          new Error(
            `SCI-6 Python engine exited with code ${code}: ${stderr.trim()}`,
          ),
        );
        return;
      }
      try {
        resolve(JSON.parse(stdout) as unknown);
      } catch (error) {
        reject(
          error instanceof Error
            ? error
            : new Error("SCI-6 engine returned invalid JSON."),
        );
      }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

function mapEngineFailure(
  request: ScienceRequest,
  engine: EngineFailureResponse,
): ScienceResult {
  const codeMap: Readonly<Record<string, ScientificFailureCode>> = {
    SEQUENCE_EMPTY: "SEQUENCE_EMPTY",
    INSUFFICIENT_SAMPLES: "INSUFFICIENT_SAMPLES",
    METHOD_NOT_APPLICABLE: "METHOD_NOT_APPLICABLE",
    EXTRAPOLATION_NOT_AUTHORIZED: "METHOD_NOT_APPLICABLE",
    DEGENERATE_LOAD_VARIANCE: "INPUT_INVALID",
    DUPLICATE_LOAD_LEVEL: "INPUT_INVALID",
    NON_FINITE_SAMPLE: "NON_FINITE_SAMPLE",
    NON_FINITE_VELOCITY: "NON_FINITE_SAMPLE",
  };
  return structuredFailure(
    request,
    codeMap[engine.failure.code] ?? "INPUT_INVALID",
    `SCI6_FAILURE_CODE=${engine.failure.code}: ${engine.failure.message}`,
  );
}

function parentReferences(
  input: LoadVelocityProfileRequestInput,
): readonly ClaimReference[] {
  const references: ClaimReference[] = input.inputProvenance
    .filter((reference) => isPsc4SourceEvidenceType(reference.type))
    .map((reference) => ({
      kind: "PSC4_EVIDENCE" as const,
      ref: reference.ref,
    }));
  for (const observation of input.observations) {
    references.push({
      kind: "SCIENTIFIC_CLAIM",
      ref: observation.metric.claimId,
      claimClass: observation.metric.claimClass,
    });
    if (observation.selection.claimId !== undefined) {
      references.push({
        kind: "SCIENTIFIC_CLAIM",
        ref: observation.selection.claimId,
        claimClass: observation.selection.claimClass ?? "MECHANICALLY_DERIVED",
      });
    }
  }
  const seen = new Set<string>();
  return references.filter((reference) => {
    const key = `${reference.kind}:${reference.ref}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function modelFromEngine(
  engineModel: Readonly<Record<string, unknown>>,
  observationCount: number,
  profileId: string,
  profileInputFingerprint: string,
  modelClaimId: string,
): LoadVelocityModel {
  const domain = engineModel.observed_domain;
  if (!isRecord(domain))
    throw new Error("SCI-6 engine model domain is missing.");
  const fitMethod = engineModel.fit_method;
  if (fitMethod !== "TWO_POINT" && fitMethod !== "MULTI_POINT_OLS")
    throw new Error("SCI-6 engine returned an invalid fit method.");
  const directionalityStatus = engineModel.directionality_status;
  const applicabilityStatus = engineModel.applicability_status;
  if (
    directionalityStatus !== "EXPECTED_NEGATIVE_SLOPE" &&
    directionalityStatus !== "NON_NEGATIVE_SLOPE_REQUIRES_REVIEW"
  )
    throw new Error("SCI-6 engine returned an invalid directionality status.");
  if (
    applicabilityStatus !== "APPLICABLE_WITHIN_OBSERVED_DOMAIN" &&
    applicabilityStatus !== "DIRECTIONALLY_INCONSISTENT"
  )
    throw new Error("SCI-6 engine returned an invalid applicability status.");
  const processor = engineModel.processor;
  const method = engineModel.method;
  if (
    !expectedIdentity(processor, {
      id: LOAD_VELOCITY_PROFILE_PROCESSOR_ID,
      version: LOAD_VELOCITY_PROFILE_PROCESSOR_VERSION,
    }) ||
    !expectedIdentity(method, expectedMethod(fitMethod))
  )
    throw new Error("SCI-6 engine returned an invalid model identity.");
  const slope = engineModel.slope_mps_per_kg;
  const intercept = engineModel.intercept_mps;
  const minimumLoad = domain.external_load_min_kg;
  const maximumLoad = domain.external_load_max_kg;
  const minimumVelocity = domain.directional_velocity_min_mps;
  const maximumVelocity = domain.directional_velocity_max_mps;
  if (
    !isFiniteNumber(slope) ||
    !isFiniteNumber(intercept) ||
    !isFiniteNumber(minimumLoad) ||
    !isFiniteNumber(maximumLoad) ||
    !isFiniteNumber(minimumVelocity) ||
    !isFiniteNumber(maximumVelocity)
  )
    throw new Error("SCI-6 engine returned non-finite model values.");
  if (
    minimumLoad >= maximumLoad ||
    minimumVelocity <= 0 ||
    maximumVelocity <= 0 ||
    observationCount < 2
  ) {
    throw new Error("SCI-6 engine returned an invalid observed model domain.");
  }
  const model: LoadVelocityModel = {
    profileId,
    profileInputFingerprint,
    modelClaimId,
    modelFingerprint: "",
    fitMethod: fitMethod as LoadVelocityFitMethod,
    processor: {
      id: processor.id as string,
      version: processor.version as string,
    },
    method: { id: method.id as string, version: method.version as string },
    predictor: { name: "external_load", unit: "kg", dimension: "mass" },
    response: { name: "directional_velocity", unit: "m/s", dimension: "speed" },
    slopeMpsPerKg: slope,
    interceptMps: intercept,
    observedDomain: {
      externalLoadMinKg: minimumLoad,
      externalLoadMaxKg: maximumLoad,
      directionalVelocityMinMps: minimumVelocity,
      directionalVelocityMaxMps: maximumVelocity,
    },
    directionalityStatus,
    applicabilityStatus,
    numberOfObservations: observationCount,
  };
  return {
    ...model,
    modelFingerprint: sha256(canonicalJson(modelPayload(model))),
  };
}

function profileObservationFromEngine(
  engineObservation: EngineObservation,
  input: LoadVelocityProfileRequestInput,
): LoadVelocityProfileObservationResult {
  const inputObservation = input.observations.find(
    (candidate) => candidate.observationId === engineObservation.observation_id,
  );
  if (inputObservation === undefined)
    throw new Error("SCI-6 engine changed observation identity.");
  if (
    !isFiniteNumber(engineObservation.external_load_kg) ||
    !isFiniteNumber(engineObservation.fitted_velocity_mps) ||
    !isFiniteNumber(engineObservation.residual_mps)
  )
    throw new Error("SCI-6 engine returned non-finite observation output.");
  const expectedLoadKg = externalLoadKg(
    inputObservation.externalLoad,
    "Profile observation external load",
  );
  if (
    Math.abs(engineObservation.external_load_kg - expectedLoadKg) >
    Math.max(1e-12, Math.abs(expectedLoadKg) * 1e-10)
  )
    throw new Error("SCI-6 engine changed an observation load identity.");
  return {
    ...inputObservation,
    externalLoadKg: engineObservation.external_load_kg,
    fittedVelocityMps: engineObservation.fitted_velocity_mps,
    residualMps: engineObservation.residual_mps,
  };
}

function buildProfileResult(
  request: ScienceRequest,
  input: LoadVelocityProfileRequestInput,
  engine: EngineSuccess,
  contract: ScientificProcessorContract,
): ScienceResult {
  if (engine.profile_id !== input.profileContext.profileId) {
    throw new Error("SCI-6 engine changed the profile identity.");
  }
  if (engine.observations.length !== input.observations.length) {
    throw new Error(
      "SCI-6 engine returned an observation count different from the request.",
    );
  }
  const engineObservationIds = new Set<string>();
  for (const observation of engine.observations) {
    if (engineObservationIds.has(observation.observation_id)) {
      throw new Error(
        "SCI-6 engine returned duplicate observation identities.",
      );
    }
    engineObservationIds.add(observation.observation_id);
  }
  if (
    input.observations.some(
      (observation) => !engineObservationIds.has(observation.observationId),
    )
  ) {
    throw new Error("SCI-6 engine omitted a requested observation identity.");
  }
  const configuration = configurationSnapshot();
  const references = parentReferences(input);
  const inputFingerprint = sha256(canonicalJson(canonicalPayload(input)));
  const generatedAt = nowInstant();
  const modelClaimId = `sci6-profile-claim-${inputFingerprint}`;
  const claim = createScientificClaim({
    claimClass: "STATISTICALLY_ESTIMATED",
    claimId: modelClaimId,
    value: { kind: "REFERENCE", value: input.profileContext.profileId },
    output: { kind: "REFERENCE" },
    method: engine.method,
    software: contract.software,
    assumptions: contract.assumptions,
    configuration,
    lineage: {
      parents: references,
      provenance: [
        ...input.inputProvenance,
        { type: "SCI6_PROFILE", ref: input.profileContext.profileId },
      ],
    },
    estimator: engine.method,
    sampleScope: {
      kind: "SAMPLE",
      reference: {
        type: "SCI6_PROFILE_OBSERVATIONS",
        ref: input.profileContext.profileId,
      },
      count: input.observations.length,
    },
    uncertainty: {
      kind: "UNKNOWN",
      reason:
        "SCI-6 v1 has no bound measurement uncertainty or validated empirical prediction interval.",
      source: { kind: "METHOD", method: engine.method },
    },
  });
  const node = {
    nodeId: `sci6-profile-node-${inputFingerprint}`,
    outputClaimId: claim.claimId,
    outputClass: "STATISTICALLY_ESTIMATED" as const,
    inputs: references,
    processor: contract.processor,
    method: engine.method,
    software: contract.software,
    assumptions: contract.assumptions,
    configuration,
    createdAt: generatedAt,
    supersession: { kind: "NONE" as const },
  };
  const derivation = createDerivationGraph({ nodes: [node], edges: [] });
  const recalculationHistory = createRecalculationHistory({
    records: [
      {
        recordId: `sci6-recalculation-${inputFingerprint}`,
        outputClaimId: claim.claimId,
        inputReferences: references,
        processor: contract.processor,
        method: engine.method,
        software: contract.software,
        configuration,
        generatedAt,
        supersedesRecordId: null,
      },
    ],
  });
  const model = modelFromEngine(
    engine.model,
    engine.observations.length,
    input.profileContext.profileId,
    inputFingerprint,
    modelClaimId,
  );
  const observations = engine.observations.map((observation) =>
    profileObservationFromEngine(observation, input),
  );
  const limitations = [
    "SCI-6 consumes already-qualified SCI-4 rep velocity claims; it does not detect repetitions or recompute the SCI-4 metric.",
    "SCI-6 preserves the original signed velocity and requires an explicit phase-polarity direction binding; it never uses abs() to normalize direction.",
    "External load is an explicit absolute mass quantity bound to the SCI-1 load configuration; body mass, composite system mass, force, torque, and machine setting are not silently substituted.",
    "SCI-5 selection is caller-bound when used; SCI-6 performs no hidden rep selection, averaging, fastest-rep choice, or chronology rewrite.",
    "The fitted line is descriptive and statistically estimated for this athlete, session, exercise, variation, task, phase, metric, measurement setup, and compatible load mechanism only.",
    "Two-point R² is reported only as an automatic two-point identity and is not fit-quality evidence; multi-point diagnostics report OLS residual quantities without implying biological law.",
    "Prediction is forward interpolation only within the observed external-load domain; inverse prediction, maximum-load estimation, MVT estimation, and extrapolation are not supported.",
    "Upstream qualification limitations and empirical uncertainty remain visible; no persistence or database migration is performed by SCI-6.",
  ];
  const value = immutable({
    processor: contract.processor,
    method: engine.method,
    profileId: input.profileContext.profileId,
    fitMethod: input.fitMethod,
    profileContext: input.profileContext,
    observations,
    model,
    diagnostics: engine.diagnostics,
    upstreamQualifications: input.upstreamQualifications,
    limitations,
    claimClass: "STATISTICALLY_ESTIMATED" as const,
    profileClaim: claim,
    derivation,
    recalculationHistory,
  });
  return {
    requestId: request.requestId,
    capabilityId: request.capabilityId,
    status: "ok",
    method: engine.method,
    inputFingerprint,
    value,
    unit: null,
    dimension: null,
    uncertainty: engine.uncertainty,
    assumptions: contract.assumptions.map(
      (assumption) => assumption.description,
    ),
    limitations,
    provenance: [
      ...input.inputProvenance,
      { type: "SCI0_DERIVATION_NODE", ref: node.nodeId },
      { type: "SCI0_CLAIM", ref: claim.claimId },
    ],
    generatedAt,
  };
}

function modelPayload(
  model: LoadVelocityModel,
): Readonly<Record<string, unknown>> {
  return {
    fit_method: model.fitMethod,
    processor: model.processor,
    method: model.method,
    predictor: model.predictor,
    response: model.response,
    slope_mps_per_kg: model.slopeMpsPerKg,
    intercept_mps: model.interceptMps,
    observed_domain: {
      external_load_min_kg: model.observedDomain.externalLoadMinKg,
      external_load_max_kg: model.observedDomain.externalLoadMaxKg,
      directional_velocity_min_mps:
        model.observedDomain.directionalVelocityMinMps,
      directional_velocity_max_mps:
        model.observedDomain.directionalVelocityMaxMps,
    },
    directionality_status: model.directionalityStatus,
    applicability_status: model.applicabilityStatus,
  };
}

function profileInputPayload(
  profile: LoadVelocityProfileValue,
): Readonly<Record<string, unknown>> {
  return canonicalPayload({
    requestId: "profile-artifact",
    profileContext: profile.profileContext,
    upstreamQualifications: profile.upstreamQualifications,
    observations: profile.observations.map((observation) => ({
      observationId: observation.observationId,
      repId: observation.repId,
      ordinal: observation.ordinal,
      complete: observation.complete,
      externalLoad: observation.externalLoad,
      loadConfiguration: observation.loadConfiguration,
      metric: observation.metric,
      selection: observation.selection,
    })),
    fitMethod: profile.fitMethod,
    inputProvenance: [],
  });
}

function closeEnough(left: number, right: number): boolean {
  return Math.abs(left - right) <= Math.max(1e-12, Math.abs(right) * 1e-10);
}

/**
 * Validates the immutable SCI-6 artifact before a downstream inverse model may
 * consume it. The downstream capability must not trust a caller-mutated slope,
 * domain, observation output, or context merely because the object has SCI-6
 * field names.
 */
export function assertLoadVelocityProfileArtifact(
  profile: LoadVelocityProfileValue,
): void {
  if (!isRecord(profile) || !isRecord(profile.model))
    throw new Error("INPUT_INVALID: SCI-6 profile artifact is missing.");
  if (profile.profileId !== profile.profileContext.profileId)
    throw new Error("INPUT_INVALID: SCI-6 profile context identity changed.");
  if (profile.fitMethod !== profile.model.fitMethod)
    throw new Error("INPUT_INVALID: SCI-6 fit method identity changed.");
  if (
    profile.model.profileId !== profile.profileId ||
    profile.model.predictor.name !== "external_load" ||
    profile.model.predictor.unit !== "kg" ||
    profile.model.predictor.dimension !== "mass" ||
    profile.model.response.name !== "directional_velocity" ||
    profile.model.response.unit !== "m/s" ||
    profile.model.response.dimension !== "speed" ||
    !Number.isInteger(profile.model.numberOfObservations) ||
    profile.model.numberOfObservations < 2 ||
    !isFiniteNumber(profile.model.slopeMpsPerKg) ||
    !isFiniteNumber(profile.model.interceptMps)
  ) {
    throw new Error(
      "INPUT_INVALID: SCI-6 model dimensions or values are invalid.",
    );
  }
  if (
    !expectedIdentity(profile.processor, {
      id: LOAD_VELOCITY_PROFILE_PROCESSOR_ID,
      version: LOAD_VELOCITY_PROFILE_PROCESSOR_VERSION,
    }) ||
    !expectedIdentity(profile.model.processor, {
      id: LOAD_VELOCITY_PROFILE_PROCESSOR_ID,
      version: LOAD_VELOCITY_PROFILE_PROCESSOR_VERSION,
    }) ||
    !expectedIdentity(profile.method, expectedMethod(profile.fitMethod)) ||
    !expectedIdentity(profile.model.method, expectedMethod(profile.fitMethod))
  ) {
    throw new Error("INPUT_INVALID: SCI-6 profile method identity is invalid.");
  }
  if (
    !PROFILE_FINGERPRINT_PATTERN.test(profile.model.profileInputFingerprint) ||
    profile.model.modelClaimId !==
      `sci6-profile-claim-${profile.model.profileInputFingerprint}`
  ) {
    throw new Error("INPUT_INVALID: SCI-6 profile claim binding is invalid.");
  }
  if (
    sha256(canonicalJson(profileInputPayload(profile))) !==
    profile.model.profileInputFingerprint
  ) {
    throw new Error(
      "INPUT_INVALID: SCI-6 profile input fingerprint does not match the artifact.",
    );
  }
  if (
    profile.model.modelFingerprint !==
    sha256(canonicalJson(modelPayload(profile.model)))
  ) {
    throw new Error(
      "INPUT_INVALID: SCI-6 model fingerprint does not match model parameters.",
    );
  }
  if (
    !isRecord(profile.profileClaim) ||
    profile.profileClaim.claimClass !== "STATISTICALLY_ESTIMATED" ||
    profile.profileClaim.claimId !== profile.model.modelClaimId
  ) {
    throw new Error("INPUT_INVALID: SCI-6 profile claim identity is invalid.");
  }
  if (
    !Array.isArray(profile.limitations) ||
    profile.limitations.length === 0 ||
    profile.limitations.some(
      (limitation) =>
        typeof limitation !== "string" || limitation.trim() === "",
    )
  ) {
    throw new Error("INPUT_INVALID: SCI-6 profile limitations are missing.");
  }
  if (profile.observations.length !== profile.model.numberOfObservations) {
    throw new Error("INPUT_INVALID: SCI-6 observation count changed.");
  }
  const modelDomain = profile.model.observedDomain;
  if (
    !isFiniteNumber(modelDomain.externalLoadMinKg) ||
    !isFiniteNumber(modelDomain.externalLoadMaxKg) ||
    !isFiniteNumber(modelDomain.directionalVelocityMinMps) ||
    !isFiniteNumber(modelDomain.directionalVelocityMaxMps) ||
    modelDomain.externalLoadMinKg <= 0 ||
    modelDomain.externalLoadMinKg >= modelDomain.externalLoadMaxKg ||
    modelDomain.directionalVelocityMinMps <= 0 ||
    modelDomain.directionalVelocityMinMps >
      modelDomain.directionalVelocityMaxMps
  ) {
    throw new Error("INPUT_INVALID: SCI-6 observed domain is invalid.");
  }
  const observationIds = new Set<string>();
  const loads: number[] = [];
  const velocities: number[] = [];
  for (const observation of profile.observations) {
    if (observationIds.has(observation.observationId))
      throw new Error(
        "INPUT_INVALID: SCI-6 observation identity is duplicated.",
      );
    observationIds.add(observation.observationId);
    const loadKg = externalLoadKg(
      observation.externalLoad,
      "SCI-6 profile observation external load",
    );
    if (
      observation.metric.metricId !==
        profile.profileContext.metricDefinition.id ||
      observation.metric.metricVersion !==
        profile.profileContext.metricDefinition.version ||
      observation.metric.method.id !==
        profile.profileContext.metricDefinition.method.id ||
      observation.metric.method.version !==
        profile.profileContext.metricDefinition.method.version ||
      observation.metric.claimClass !== "MECHANICALLY_DERIVED" ||
      observation.metric.validity !== "VALID" ||
      (observation.metric.qualificationStatus !== "QUALIFIED" &&
        observation.metric.qualificationStatus !== "QUALIFIED_SOFTWARE") ||
      !isFiniteNumber(observation.metric.directionalVelocityMps) ||
      observation.metric.directionalVelocityMps <= 0
    ) {
      throw new Error("INPUT_INVALID: SCI-6 metric binding changed.");
    }
    if (
      !isFiniteNumber(observation.externalLoadKg) ||
      !isFiniteNumber(observation.fittedVelocityMps) ||
      !isFiniteNumber(observation.residualMps) ||
      !closeEnough(observation.externalLoadKg, loadKg)
    ) {
      throw new Error("INPUT_INVALID: SCI-6 observation output changed.");
    }
    const fittedVelocity =
      profile.model.interceptMps + profile.model.slopeMpsPerKg * loadKg;
    const residual = observation.metric.directionalVelocityMps - fittedVelocity;
    if (
      !closeEnough(observation.fittedVelocityMps, fittedVelocity) ||
      !closeEnough(observation.residualMps, residual)
    ) {
      throw new Error("INPUT_INVALID: SCI-6 observation fit output changed.");
    }
    loads.push(loadKg);
    velocities.push(observation.metric.directionalVelocityMps);
  }
  const minimumLoad = Math.min(...loads);
  const maximumLoad = Math.max(...loads);
  const minimumVelocity = Math.min(...velocities);
  const maximumVelocity = Math.max(...velocities);
  if (
    !closeEnough(profile.model.observedDomain.externalLoadMinKg, minimumLoad) ||
    !closeEnough(profile.model.observedDomain.externalLoadMaxKg, maximumLoad) ||
    !closeEnough(
      profile.model.observedDomain.directionalVelocityMinMps,
      minimumVelocity,
    ) ||
    !closeEnough(
      profile.model.observedDomain.directionalVelocityMaxMps,
      maximumVelocity,
    )
  ) {
    throw new Error("INPUT_INVALID: SCI-6 observed domain changed.");
  }
  const expectedDirectionality =
    profile.model.slopeMpsPerKg < 0
      ? "EXPECTED_NEGATIVE_SLOPE"
      : "NON_NEGATIVE_SLOPE_REQUIRES_REVIEW";
  const expectedApplicability =
    profile.model.slopeMpsPerKg < 0
      ? "APPLICABLE_WITHIN_OBSERVED_DOMAIN"
      : "DIRECTIONALLY_INCONSISTENT";
  if (
    profile.model.directionalityStatus !== expectedDirectionality ||
    profile.model.applicabilityStatus !== expectedApplicability
  ) {
    throw new Error("INPUT_INVALID: SCI-6 directionality status changed.");
  }
}

function validatePredictionModel(input: LoadVelocityPredictionInput): void {
  if (input.model.profileId !== input.profileId) {
    throw new Error(
      "INPUT_INVALID: prediction profile id does not match the model artifact.",
    );
  }
  if (input.model.modelClaimId !== input.modelClaimId) {
    throw new Error(
      "INPUT_INVALID: prediction model claim id does not match the model artifact.",
    );
  }
  if (!PROFILE_FINGERPRINT_PATTERN.test(input.model.profileInputFingerprint)) {
    throw new Error(
      "INPUT_INVALID: prediction model input fingerprint is invalid.",
    );
  }
  if (
    input.model.modelClaimId !==
    `sci6-profile-claim-${input.model.profileInputFingerprint}`
  ) {
    throw new Error(
      "INPUT_INVALID: prediction model claim is not bound to its profile input fingerprint.",
    );
  }
  if (
    input.model.modelFingerprint !==
    sha256(canonicalJson(modelPayload(input.model)))
  ) {
    throw new Error(
      "INPUT_INVALID: prediction model fingerprint does not match its model parameters.",
    );
  }
  if (
    !expectedIdentity(input.model.processor, {
      id: LOAD_VELOCITY_PROFILE_PROCESSOR_ID,
      version: LOAD_VELOCITY_PROFILE_PROCESSOR_VERSION,
    }) ||
    !expectedIdentity(
      input.model.method,
      expectedMethod(input.model.fitMethod),
    ) ||
    input.model.predictor.name !== "external_load" ||
    input.model.predictor.unit !== "kg" ||
    input.model.predictor.dimension !== "mass" ||
    input.model.response.name !== "directional_velocity" ||
    input.model.response.unit !== "m/s" ||
    input.model.response.dimension !== "speed" ||
    !Number.isInteger(input.model.numberOfObservations) ||
    input.model.numberOfObservations < 2
  ) {
    throw new Error("INPUT_INVALID: prediction model identity is invalid.");
  }
  const domain = input.model.observedDomain;
  if (
    !isFiniteNumber(domain.externalLoadMinKg) ||
    !isFiniteNumber(domain.externalLoadMaxKg) ||
    !isFiniteNumber(domain.directionalVelocityMinMps) ||
    !isFiniteNumber(domain.directionalVelocityMaxMps) ||
    domain.externalLoadMinKg >= domain.externalLoadMaxKg ||
    domain.directionalVelocityMinMps <= 0 ||
    domain.directionalVelocityMaxMps <= 0
  ) {
    throw new Error("INPUT_INVALID: prediction model domain is invalid.");
  }
}

function predictionParentReferences(
  input: LoadVelocityPredictionInput,
): readonly ClaimReference[] {
  const psc4 = input.inputProvenance
    .filter((reference) => isPsc4SourceEvidenceType(reference.type))
    .map((reference) => ({
      kind: "PSC4_EVIDENCE" as const,
      ref: reference.ref,
    }));
  return [
    ...psc4,
    {
      kind: "SCIENTIFIC_CLAIM" as const,
      ref: input.modelClaimId,
      claimClass: "STATISTICALLY_ESTIMATED" as const,
    },
  ];
}

export function createLoadVelocityProfileRequest(
  input: LoadVelocityProfileRequestInput,
): ScienceRequest {
  requireText(input.requestId, "SCI-6 request id");
  if (input.inputProvenance.length === 0)
    throw new Error("SCI-6 requests require PSC4 input provenance.");
  return {
    requestId: input.requestId,
    capabilityId: LOAD_VELOCITY_PROFILE_CAPABILITY_ID,
    capabilityVersion: LOAD_VELOCITY_PROFILE_CAPABILITY_VERSION,
    subjectRef: { athleteId: input.profileContext.athleteId as never },
    ...(input.observedAt === undefined
      ? {}
      : { observedAt: parseInstant(input.observedAt) }),
    inputs: {
      [LOAD_VELOCITY_PROFILE_INPUT_KEY]: {
        kind: "structured",
        value: { ...input },
      },
    },
    inputProvenance: input.inputProvenance,
  };
}

export class LoadVelocityProfileSciencePort implements SciencePort {
  readonly contract: ScientificProcessorContract;
  private readonly pythonExecutable: string;
  private readonly pythonScriptPath: string;
  private readonly engineInvoker: LoadVelocityProfileEngineInvoker | undefined;

  constructor(options: LoadVelocityProfileAdapterOptions) {
    this.contract = processorContract(options);
    this.pythonExecutable = options.pythonExecutable ?? "python";
    this.pythonScriptPath = options.pythonScriptPath ?? PYTHON_PROCESSOR_PATH;
    this.engineInvoker = options.engineInvoker;
  }

  async capabilities(): Promise<
    readonly {
      capabilityId: string;
      status: ScienceResult["status"];
      description: string;
    }[]
  > {
    return [
      {
        capabilityId: LOAD_VELOCITY_PROFILE_CAPABILITY_ID,
        status:
          this.contract.qualification.status === "QUALIFIED"
            ? "ok"
            : "method_unavailable",
        description:
          "Fit an individual, session-bound descriptive external-load versus SCI-4 directional rep-velocity relationship and interpolate only inside the observed load domain.",
      },
    ];
  }

  async compute(request: ScienceRequest): Promise<ScienceResult> {
    if (
      !isRecord(request) ||
      typeof request.requestId !== "string" ||
      typeof request.capabilityId !== "string" ||
      !isRecord(request.inputs) ||
      !Array.isArray(request.inputProvenance)
    )
      return malformedRequestFailure(request);
    if (request.capabilityId !== LOAD_VELOCITY_PROFILE_CAPABILITY_ID) {
      return {
        requestId: request.requestId,
        capabilityId: request.capabilityId,
        status: "not_applicable",
        generatedAt: nowInstant(),
        error: {
          code: "CAPABILITY_NOT_SUPPORTED",
          message:
            "The SCI-6 port owns only the load--velocity profile capability.",
        },
      };
    }
    if (
      request.capabilityVersion !== undefined &&
      request.capabilityVersion !== LOAD_VELOCITY_PROFILE_CAPABILITY_VERSION
    )
      return structuredFailure(
        request,
        "UNSUPPORTED_CONFIGURATION",
        "The requested SCI-6 capability version is unsupported.",
      );
    if (this.contract.qualification.status !== "QUALIFIED") {
      return {
        requestId: request.requestId,
        capabilityId: request.capabilityId,
        status: "method_unavailable",
        generatedAt: nowInstant(),
        error: {
          code: "PROCESSOR_NOT_QUALIFIED",
          message: "The SCI-6 processor is not qualified for execution.",
        },
      };
    }
    const validated = validateInput(request);
    if ("status" in validated) return validated;
    try {
      const payload = canonicalPayload(validated);
      const engine = parseEngineResponse(
        await (this.engineInvoker === undefined
          ? runPython(payload, this.pythonExecutable, this.pythonScriptPath)
          : this.engineInvoker(payload)),
        "FIT",
        validated.fitMethod,
      );
      if (engine.status === "FAILED") return mapEngineFailure(request, engine);
      if (engine.status === "INFRASTRUCTURE_FAILED")
        return infrastructureFailure(request, engine.exception.message);
      return buildProfileResult(
        request,
        validated,
        engine as EngineSuccess,
        this.contract,
      );
    } catch (error) {
      return infrastructureFailure(
        request,
        error instanceof Error
          ? error.message
          : "The SCI-6 engine could not be executed.",
      );
    }
  }

  async predict(
    input: LoadVelocityPredictionInput,
  ): Promise<LoadVelocityPredictionResult> {
    const limitations = [
      "Prediction is forward interpolation only within the observed external-load domain.",
      "Inverse prediction, extrapolation, maximum-load estimation, and MVT estimation are not supported.",
      "Measurement uncertainty and a validated empirical prediction interval are not available in SCI-6 v1.",
    ];
    if (this.contract.qualification.status !== "QUALIFIED")
      return {
        status: "method_unavailable",
        requestId: input.requestId,
        profileId: input.profileId,
        externalLoad: input.externalLoad,
        limitations,
        error: {
          code: "PROCESSOR_NOT_QUALIFIED",
          message: "The SCI-6 processor is not qualified for execution.",
        },
      };
    try {
      requireText(input.requestId, "Prediction request id");
      requireText(input.profileId, "Prediction profile id");
      requireText(input.modelClaimId, "Prediction model claim id");
      validatePredictionModel(input);
      const loadKg = externalLoadKg(
        createQuantity(input.externalLoad),
        "Prediction external load",
      );
      if (
        input.inputProvenance.length === 0 ||
        !input.inputProvenance.some((reference) =>
          isPsc4SourceEvidenceType(reference.type),
        )
      )
        throw new Error(
          "REQUIRED_EVIDENCE_MISSING: prediction requires PSC4 provenance.",
        );
      const payload = {
        processor: {
          id: LOAD_VELOCITY_PROFILE_PROCESSOR_ID,
          version: LOAD_VELOCITY_PROFILE_PROCESSOR_VERSION,
        },
        operation: "PREDICT",
        profile_id: input.profileId,
        model: modelPayload(input.model),
        prediction_load_kg: loadKg,
      } as const;
      const engine = parseEngineResponse(
        await (this.engineInvoker === undefined
          ? runPython(payload, this.pythonExecutable, this.pythonScriptPath)
          : this.engineInvoker(payload)),
        "PREDICT",
      );
      if (engine.status === "FAILED")
        return {
          status: "invalid_input",
          requestId: input.requestId,
          profileId: input.profileId,
          externalLoad: input.externalLoad,
          limitations,
          error: { code: engine.failure.code, message: engine.failure.message },
        };
      if (engine.status === "INFRASTRUCTURE_FAILED")
        return {
          status: "computation_failed",
          requestId: input.requestId,
          profileId: input.profileId,
          externalLoad: input.externalLoad,
          limitations,
          error: {
            code: engine.exception.code,
            message: engine.exception.message,
          },
        };
      const predictionEngine = engine as EnginePredictionSuccess;
      if (predictionEngine.profile_id !== input.profileId)
        throw new Error(
          "SCI-6 engine changed the prediction profile identity.",
        );
      if (!isFiniteNumber(predictionEngine.prediction.directional_velocity_mps))
        throw new Error("SCI-6 prediction response is non-finite.");
      if (predictionEngine.prediction.directional_velocity_mps <= 0)
        throw new Error(
          "INPUT_INVALID: SCI-6 prediction cannot return a non-positive directional velocity.",
        );
      const configuration = configurationSnapshot();
      const references = predictionParentReferences(input);
      const fingerprint = sha256(canonicalJson(payload));
      const generatedAt = nowInstant();
      const method = {
        id: LOAD_VELOCITY_PROFILE_PREDICTION_METHOD_ID,
        version: LOAD_VELOCITY_PROFILE_METHOD_VERSION,
      };
      const uncertainty: Uncertainty = {
        kind: "UNKNOWN",
        reason:
          "SCI-6 v1 has no bound measurement uncertainty or validated empirical prediction interval.",
        source: { kind: "METHOD", method },
      };
      const claim = createScientificClaim({
        claimClass: "STATISTICALLY_ESTIMATED",
        claimId: `sci6-prediction-claim-${fingerprint}`,
        value: {
          kind: "QUANTITY",
          value: createQuantity({
            value: predictionEngine.prediction.directional_velocity_mps,
            unit: "m/s",
            dimension: "speed",
          }),
        },
        output: { kind: "QUANTITY", dimension: "speed", unit: "m/s" },
        method,
        estimator: method,
        sampleScope: {
          kind: "SAMPLE",
          reference: { type: "SCI6_PROFILE", ref: input.profileId },
          count: input.model.numberOfObservations,
        },
        uncertainty,
        software: this.contract.software,
        assumptions: this.contract.assumptions,
        configuration,
        lineage: {
          parents: references,
          provenance: [
            ...input.inputProvenance,
            { type: "SCI6_PROFILE", ref: input.profileId },
          ],
        },
      });
      const node = {
        nodeId: `sci6-prediction-node-${fingerprint}`,
        outputClaimId: claim.claimId,
        outputClass: "STATISTICALLY_ESTIMATED" as const,
        inputs: references,
        processor: this.contract.processor,
        method,
        software: this.contract.software,
        assumptions: this.contract.assumptions,
        configuration,
        createdAt: generatedAt,
        supersession: { kind: "NONE" as const },
      };
      const derivation = createDerivationGraph({ nodes: [node], edges: [] });
      const recalculationHistory = createRecalculationHistory({
        records: [
          {
            recordId: `sci6-prediction-recalculation-${fingerprint}`,
            outputClaimId: claim.claimId,
            inputReferences: references,
            processor: this.contract.processor,
            method,
            software: this.contract.software,
            configuration,
            generatedAt,
            supersedesRecordId: null,
          },
        ],
      });
      return {
        status: "ok",
        requestId: input.requestId,
        profileId: input.profileId,
        externalLoad: createQuantity({
          value: loadKg,
          unit: "kg",
          dimension: "mass",
        }),
        predictedDirectionalVelocityMps:
          predictionEngine.prediction.directional_velocity_mps,
        claim: immutable(claim) as unknown as Readonly<Record<string, unknown>>,
        derivation: immutable(derivation) as unknown as Readonly<
          Record<string, unknown>
        >,
        recalculationHistory: immutable(
          recalculationHistory,
        ) as unknown as Readonly<Record<string, unknown>>,
        limitations,
      };
    } catch (error) {
      return {
        status: "invalid_input",
        requestId: input.requestId,
        profileId: input.profileId,
        externalLoad: input.externalLoad,
        limitations,
        error: {
          code: "INPUT_INVALID",
          message:
            error instanceof Error
              ? error.message
              : "Invalid SCI-6 prediction input.",
        },
      };
    }
  }
}

export function createQualifiedLoadVelocitySoftwareProvenance(
  sourceRevision: string,
  buildId: string,
): SoftwareProvenance {
  if (!SHA_PATTERN.test(sourceRevision))
    throw new Error("Source revision must be an exact hexadecimal commit SHA.");
  return {
    packageName: "@workoutpal/science-port",
    packageVersion: "0.1.0",
    sourceRevision: requireText(sourceRevision, "Source revision"),
    buildId: requireText(buildId, "Build id"),
  };
}
