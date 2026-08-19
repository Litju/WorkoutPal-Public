import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ScientificDefinitionRef } from "@workoutpal/movement-science";
import type {
  AssumptionDeclaration,
  ClaimReference,
  ConfigurationSnapshot,
  JsonValue,
  MethodIdentity,
  RecalculationHistory,
  SciencePort,
  ScienceProvenanceRef,
  ScienceRequest,
  ScienceResult,
  ScientificClaim,
  ScientificDerivationGraph,
  ScientificFailureCode,
  ScientificProcessorContract,
  SoftwareProvenance,
  Uncertainty,
  UncertaintyPolicy,
} from "@workoutpal/science-contract";
import {
  assertUncertainty,
  createDerivationGraph,
  createProcessorContract,
  createRecalculationHistory,
  createScientificClaim,
  isPsc4SourceEvidenceType,
} from "@workoutpal/science-contract";
import {
  canonicalizeQuantity,
  createQuantity,
  type Instant,
  parseInstant,
  type Quantity,
} from "@workoutpal/shared-kernel";
import {
  assertLoadVelocityProfileArtifact,
  LOAD_VELOCITY_PROFILE_CAPABILITY_ID,
  LOAD_VELOCITY_PROFILE_CAPABILITY_VERSION,
  LOAD_VELOCITY_PROFILE_METHOD_VERSION,
  LOAD_VELOCITY_PROFILE_MULTI_POINT_METHOD_ID,
  LOAD_VELOCITY_PROFILE_PROCESSOR_ID,
  LOAD_VELOCITY_PROFILE_PROCESSOR_VERSION,
  LOAD_VELOCITY_PROFILE_TWO_POINT_METHOD_ID,
  type LoadVelocityMeasurementBinding,
  type LoadVelocityMetricBinding,
  type LoadVelocityMetricDefinition,
  type LoadVelocityPhaseBinding,
  type LoadVelocityProfileValue,
  type LoadVelocityQualificationStatus,
  SCI6_PHASE_AVERAGE_VELOCITY_METRIC_ID,
  SCI6_PHASE_PEAK_VELOCITY_METRIC_ID,
  SCI6_VELOCITY_METRIC_METHOD_ID,
  SCI6_VELOCITY_METRIC_METHOD_VERSION,
  SCI6_VELOCITY_METRIC_VERSION,
} from "./load-velocity-profile.js";

export const TARGET_LOAD_AT_VELOCITY_CAPABILITY_ID =
  "resistance_training.load_at_target_velocity";
export const ESTIMATED_ONE_REP_MAXIMUM_CAPABILITY_ID =
  "resistance_training.estimated_one_rep_maximum";
export const MAXIMAL_STRENGTH_CAPABILITY_VERSION = "1.0.0";
export const MAXIMAL_STRENGTH_PROCESSOR_ID =
  "resistance_training.maximal_strength_modeling";
export const MAXIMAL_STRENGTH_PROCESSOR_VERSION = "1.0.0";
export const TARGET_LOAD_METHOD_ID =
  "load_velocity.inverse_linear_target_velocity";
export const ESTIMATED_ONE_REP_MAXIMUM_METHOD_ID =
  "maximal_strength.estimated_one_rep_maximum";
export const MAXIMAL_STRENGTH_METHOD_VERSION = "1.0.0";
export const MAXIMAL_STRENGTH_INPUT_KEY = "maximal_strength_modeling";
export const TARGET_VELOCITY_AUTHORITY_CAPABILITY_ID =
  "resistance_training.target_velocity_authority";
export const TARGET_VELOCITY_AUTHORITY_CAPABILITY_VERSION = "1.0.0";
export const SCI4_METRIC_QUALIFICATION_CAPABILITY_ID =
  "resistance_training.rep_phase_kinematic_metrics";
export const SCI4_METRIC_QUALIFICATION_CAPABILITY_VERSION = "1.0.0";

export type TargetVelocityAuthoritySourceType =
  | "ATHLETE_SPECIFIC_MEASURED_1RM_VELOCITY"
  | "EXTERNAL_PROTOCOL_TARGET_VELOCITY"
  | "LITERATURE_REFERENCE_VELOCITY_AT_1RM"
  | "ATHLETE_SPECIFIC_EXTERNAL_ESTIMATE";

export type TargetVelocitySemantic =
  | "TARGET_VELOCITY"
  | "VELOCITY_AT_1RM"
  | "MVT";

export type TargetVelocityScope = "ATHLETE_SPECIFIC" | "GENERALIZED";

export type MaximalStrengthOperation = "TARGET_LOAD" | "ESTIMATED_1RM";

export interface QualifiedScienceArtifact {
  readonly capabilityId: string;
  readonly capabilityVersion: string;
  readonly qualificationStatus: LoadVelocityQualificationStatus;
  readonly qualificationArtifact: ScienceProvenanceRef;
  readonly limitations: readonly string[];
  readonly binding?: QualifiedArtifactBinding;
}

export interface QualifiedArtifactBinding {
  readonly fingerprint: string;
  readonly claimId: string;
  readonly processor: MethodIdentity;
  readonly method: MethodIdentity;
  readonly sourceRevision: string;
  readonly buildId: string;
}

export interface TargetVelocityAuthorityInput {
  readonly authorityId: string;
  readonly authorityVersion: string;
  readonly semantic: TargetVelocitySemantic;
  readonly targetVelocity: Quantity;
  readonly velocityMetric: LoadVelocityMetricDefinition;
  readonly phase: LoadVelocityPhaseBinding;
  readonly exerciseDefinition: ScientificDefinitionRef;
  readonly exerciseVariation: ScientificDefinitionRef | null;
  readonly movementTask: ScientificDefinitionRef;
  readonly measurement: LoadVelocityMeasurementBinding;
  readonly sourceType: TargetVelocityAuthoritySourceType;
  readonly sourceReference: ScienceProvenanceRef;
  readonly methodProtocolReference: ScienceProvenanceRef;
  readonly targetScope: TargetVelocityScope;
  readonly athleteId: string | null;
  readonly populationScope: string | null;
  readonly generalizedTarget: boolean;
  readonly uncertainty: Uncertainty | null;
  readonly qualification: QualifiedScienceArtifact;
  readonly provenance: readonly ScienceProvenanceRef[];
  readonly measuredVelocityObservation: VelocityAtMeasuredOneRepMaximumObservation | null;
}

export interface TargetVelocityAuthority
  extends Omit<TargetVelocityAuthorityInput, "targetVelocity"> {
  readonly targetVelocity: Quantity;
}

export interface MeasuredOneRepMaximumInput {
  readonly observationId: string;
  readonly claimId?: string;
  readonly athleteId: string;
  readonly assessmentId: string;
  readonly trialId: string;
  readonly exerciseDefinition: ScientificDefinitionRef;
  readonly exerciseVariation: ScientificDefinitionRef | null;
  readonly movementTask: ScientificDefinitionRef;
  readonly selectedPhase?: LoadVelocityPhaseBinding;
  readonly measurement?: LoadVelocityMeasurementBinding;
  readonly load: Quantity;
  readonly protocolRevision: ScientificDefinitionRef;
  readonly trialValidity: "VALID";
  readonly trialExclusion: "INCLUDED";
  readonly successfulMaximalAttempt: true;
  readonly observedAt: string;
  readonly provenance: readonly ScienceProvenanceRef[];
}

export interface MeasuredOneRepMaximumObservation
  extends Omit<
    MeasuredOneRepMaximumInput,
    "load" | "selectedPhase" | "measurement"
  > {
  readonly selectedPhase: LoadVelocityPhaseBinding | null;
  readonly measurement: LoadVelocityMeasurementBinding | null;
  readonly load: Quantity;
  readonly claimClass: "OBSERVED";
  readonly claim: ScientificClaim;
  readonly epistemicStatus: "DIRECT_ASSESSMENT_FACT";
}

export interface VelocityAtMeasuredOneRepMaximumInput {
  readonly measuredOneRepMaximum: MeasuredOneRepMaximumObservation;
  readonly metricDefinition: LoadVelocityMetricDefinition;
  readonly measurement: LoadVelocityMeasurementBinding;
  readonly metric: LoadVelocityMetricBinding;
  readonly metricQualification: QualifiedScienceArtifact;
  readonly observedAt: string;
  readonly provenance: readonly ScienceProvenanceRef[];
}

export interface VelocityAtMeasuredOneRepMaximumObservation {
  readonly observationType: "VELOCITY_AT_MEASURED_ONE_REP_MAXIMUM";
  readonly measuredOneRepMaximumObservationId: string;
  readonly measuredOneRepMaximumClaimId: string;
  readonly athleteId: string;
  readonly assessmentId: string;
  readonly trialId: string;
  readonly exerciseDefinition: ScientificDefinitionRef;
  readonly exerciseVariation: ScientificDefinitionRef | null;
  readonly movementTask: ScientificDefinitionRef;
  readonly selectedPhase: LoadVelocityPhaseBinding | null;
  readonly protocolRevision: ScientificDefinitionRef;
  readonly metricDefinition: LoadVelocityMetricDefinition;
  readonly measurement: LoadVelocityMeasurementBinding;
  readonly metricQualification: QualifiedScienceArtifact;
  readonly metricClaimId: string;
  readonly velocity: Quantity;
  readonly load: Quantity;
  readonly claimClass: "MECHANICALLY_DERIVED";
  readonly mvtAuthorityStatus: "NOT_ESTABLISHED";
  readonly observedAt: string;
  readonly provenance: readonly ScienceProvenanceRef[];
}

export interface MaximalStrengthModelingRequestInput {
  readonly requestId: string;
  readonly operation: MaximalStrengthOperation;
  readonly profile: LoadVelocityProfileValue;
  readonly profileQualification: QualifiedScienceArtifact;
  readonly targetVelocityAuthority: TargetVelocityAuthority;
  readonly inputProvenance: readonly ScienceProvenanceRef[];
  readonly observedAt?: string;
}

export interface LoadAtTargetVelocityEstimate {
  readonly operation: "TARGET_LOAD";
  readonly processor: MethodIdentity;
  readonly method: MethodIdentity;
  readonly profileId: string;
  readonly profileCapabilityId: string;
  readonly profileCapabilityVersion: string;
  readonly profileProcessor: MethodIdentity;
  readonly profileMethod: MethodIdentity;
  readonly profileModelClaimId: string;
  readonly targetVelocity: Quantity;
  readonly targetVelocityAuthority: TargetVelocityAuthority;
  readonly estimatedExternalLoad: Quantity;
  readonly domainClassification:
    | "WITHIN_OBSERVED_LOAD_DOMAIN"
    | "EXTRAPOLATED_ABOVE_OBSERVED_LOAD_DOMAIN"
    | "EXTRAPOLATED_BELOW_OBSERVED_LOAD_DOMAIN";
  readonly velocityDomainClassification:
    | "WITHIN_OBSERVED_VELOCITY_DOMAIN"
    | "EXTRAPOLATED_ABOVE_OBSERVED_VELOCITY_DOMAIN"
    | "EXTRAPOLATED_BELOW_OBSERVED_VELOCITY_DOMAIN";
  readonly extrapolation: Readonly<Record<string, unknown>>;
  readonly sensitivity: Readonly<Record<string, number>>;
  readonly statisticalDiagnostics: Readonly<Record<string, unknown>>;
  readonly upstreamQualifications: readonly QualifiedScienceArtifact[];
  readonly uncertainty: Uncertainty;
  readonly claimClass: "STATISTICALLY_ESTIMATED";
  readonly claim: ScientificClaim;
  readonly derivation: ScientificDerivationGraph;
  readonly recalculationHistory: RecalculationHistory;
  readonly inputFingerprint: string;
  readonly applicabilityDiagnostics: readonly string[];
  readonly limitations: readonly string[];
}

export interface EstimatedOneRepMaximumInference {
  readonly operation: "ESTIMATED_1RM";
  readonly processor: MethodIdentity;
  readonly method: MethodIdentity;
  readonly profileId: string;
  readonly profileCapabilityId: string;
  readonly profileCapabilityVersion: string;
  readonly profileProcessor: MethodIdentity;
  readonly profileMethod: MethodIdentity;
  readonly profileModelClaimId: string;
  readonly targetVelocity: Quantity;
  readonly targetVelocityAuthority: TargetVelocityAuthority;
  readonly estimatedOneRepMaximum: Quantity;
  readonly targetLoadEstimate: LoadAtTargetVelocityEstimate;
  readonly domainClassification: LoadAtTargetVelocityEstimate["domainClassification"];
  readonly velocityDomainClassification: LoadAtTargetVelocityEstimate["velocityDomainClassification"];
  readonly extrapolation: Readonly<Record<string, unknown>>;
  readonly sensitivity: Readonly<Record<string, number>>;
  readonly statisticalDiagnostics: Readonly<Record<string, unknown>>;
  readonly upstreamQualifications: readonly QualifiedScienceArtifact[];
  readonly uncertainty: Uncertainty;
  readonly claimClass: "SCIENTIFIC_INFERENCE";
  readonly claim: ScientificClaim;
  readonly derivation: ScientificDerivationGraph;
  readonly recalculationHistory: RecalculationHistory;
  readonly inputFingerprint: string;
  readonly applicabilityDiagnostics: readonly string[];
  readonly limitations: readonly string[];
}

export interface MaximalStrengthAdapterOptions {
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
  readonly engineInvoker?: MaximalStrengthEngineInvoker;
}

export type MaximalStrengthEngineInvoker = (
  payload: Readonly<Record<string, unknown>>,
) => Promise<unknown>;

export interface MaximalStrengthComputationResult extends ScienceResult {
  readonly value?:
    | LoadAtTargetVelocityEstimate
    | EstimatedOneRepMaximumInference;
}

interface EngineSuccess {
  readonly status: "SUCCEEDED";
  readonly processor: MethodIdentity;
  readonly method: MethodIdentity;
  readonly operation: MaximalStrengthOperation;
  readonly profile_id: string;
  readonly target_velocity_mps: number;
  readonly estimated_load_kg: number;
  readonly domain_classification: LoadAtTargetVelocityEstimate["domainClassification"];
  readonly extrapolation: Readonly<Record<string, unknown>>;
  readonly sensitivity: Readonly<Record<string, number>>;
  readonly diagnostics: Readonly<Record<string, unknown>>;
  readonly uncertainty: Uncertainty;
}

type VelocityDomainClassification =
  LoadAtTargetVelocityEstimate["velocityDomainClassification"];

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
  readonly exception: { readonly code: string; readonly message: string };
}

type EngineResponse =
  | EngineSuccess
  | EngineFailureResponse
  | EngineInfrastructureFailure;

const PYTHON_PROCESSOR_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../engine/maximal_strength_processor.py",
);
const SHA_PATTERN = /^[0-9a-f]{40,64}$/iu;
const AUTHORITY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{1,199}$/u;
const ACCEPTED_QUALIFICATION_STATUSES: readonly LoadVelocityQualificationStatus[] =
  ["QUALIFIED", "QUALIFIED_SOFTWARE"];
const SCI6_QUALIFICATION_ARTIFACT_TYPE = "SCI6_QUALIFICATION";
const SCI7_QUALIFICATION_ARTIFACT_TYPE = "SCI7_TARGET_VELOCITY_AUTHORITY";
const FAILURE_CODES = new Set<ScientificFailureCode>([
  "REQUIRED_EVIDENCE_MISSING",
  "INPUT_INVALID",
  "DIMENSION_MISMATCH",
  "METHOD_NOT_APPLICABLE",
  "UNSUPPORTED_CONFIGURATION",
  "PROFILE_NOT_FOUND",
  "PROFILE_UNQUALIFIED",
  "PROFILE_METHOD_UNSUPPORTED",
  "PROFILE_DIRECTIONALLY_INCONSISTENT",
  "TARGET_VELOCITY_MISSING",
  "TARGET_VELOCITY_INVALID",
  "TARGET_VELOCITY_METRIC_MISMATCH",
  "TARGET_VELOCITY_PHASE_MISMATCH",
  "TARGET_VELOCITY_EXERCISE_MISMATCH",
  "TARGET_VELOCITY_VARIATION_MISMATCH",
  "TARGET_VELOCITY_TASK_MISMATCH",
  "TARGET_AUTHORITY_UNQUALIFIED",
  "MVT_AUTHORITY_MISSING",
  "MVT_AUTHORITY_INCOMPATIBLE",
  "SLOPE_ZERO",
  "SLOPE_NONFINITE",
  "EXPECTED_INVERSE_RELATIONSHIP_NOT_OBSERVED",
  "ESTIMATED_LOAD_NONFINITE",
  "ESTIMATED_LOAD_NON_POSITIVE",
  "MEASUREMENT_BINDING_MISMATCH",
  "ATHLETE_MISMATCH",
  "PROFILE_CONTEXT_MISMATCH",
  "MEASURED_1RM_PROTOCOL_MISSING",
  "NUMERICAL_OVERFLOW",
  "UPSTREAM_QUALIFICATION_UNSUPPORTED",
]);

class Sci7InputError extends Error {
  constructor(
    readonly code: ScientificFailureCode,
    message: string,
  ) {
    super(message);
  }
}

function fail(code: ScientificFailureCode, message: string): never {
  throw new Sci7InputError(code, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail("INPUT_INVALID", `${label} is required.`);
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

function definitionEqual(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function requireReference(
  reference: ScienceProvenanceRef,
  label: string,
): void {
  requireText(reference.type, `${label} type`);
  requireText(reference.ref, `${label} ref`);
}

function validateQualification(
  qualification: QualifiedScienceArtifact,
  expectedArtifactType: string,
  label: string,
  expectedCapability?: { readonly id: string; readonly version: string },
): QualifiedScienceArtifact {
  if (!isRecord(qualification))
    fail(
      "UPSTREAM_QUALIFICATION_UNSUPPORTED",
      `${label} qualification is required.`,
    );
  requireText(qualification.capabilityId, `${label} capability id`);
  requireText(qualification.capabilityVersion, `${label} capability version`);
  if (
    expectedCapability !== undefined &&
    (qualification.capabilityId !== expectedCapability.id ||
      qualification.capabilityVersion !== expectedCapability.version)
  ) {
    fail(
      "UPSTREAM_QUALIFICATION_UNSUPPORTED",
      `${label} qualification capability identity is unsupported.`,
    );
  }
  if (
    !ACCEPTED_QUALIFICATION_STATUSES.includes(qualification.qualificationStatus)
  ) {
    fail(
      "UPSTREAM_QUALIFICATION_UNSUPPORTED",
      `${label} qualification status is unsupported.`,
    );
  }
  if (
    !isRecord(qualification.qualificationArtifact) ||
    qualification.qualificationArtifact.type !== expectedArtifactType
  ) {
    fail(
      "UPSTREAM_QUALIFICATION_UNSUPPORTED",
      `${label} qualification artifact type is unsupported.`,
    );
  }
  requireReference(
    qualification.qualificationArtifact,
    `${label} qualification artifact`,
  );
  if (
    !Array.isArray(qualification.limitations) ||
    qualification.limitations.length === 0 ||
    qualification.limitations.some(
      (limitation) =>
        typeof limitation !== "string" || limitation.trim().length === 0,
    )
  ) {
    fail(
      "UPSTREAM_QUALIFICATION_UNSUPPORTED",
      `${label} limitations must be explicit.`,
    );
  }
  return qualification;
}

function validateDefinition(
  value: unknown,
  label: string,
): ScientificDefinitionRef {
  if (!isRecord(value)) fail("INPUT_INVALID", `${label} is required.`);
  const revision = value.revision;
  if (
    typeof revision !== "number" ||
    !Number.isInteger(revision) ||
    revision < 1
  ) {
    fail("INPUT_INVALID", `${label} revision must be a positive integer.`);
  }
  return {
    id: requireText(value.id, `${label} id`),
    version: requireText(value.version, `${label} version`),
    revision,
  };
}

function validateMetricDefinition(
  metric: LoadVelocityMetricDefinition,
  label: string,
): LoadVelocityMetricDefinition {
  const supported = [
    SCI6_PHASE_AVERAGE_VELOCITY_METRIC_ID,
    SCI6_PHASE_PEAK_VELOCITY_METRIC_ID,
  ] as readonly string[];
  if (!supported.includes(metric.id)) {
    fail(
      "TARGET_VELOCITY_METRIC_MISMATCH",
      `${label} metric id is unsupported.`,
    );
  }
  if (
    metric.version !== SCI6_VELOCITY_METRIC_VERSION ||
    metric.unit !== "m/s" ||
    metric.dimension !== "speed"
  ) {
    fail(
      "TARGET_VELOCITY_METRIC_MISMATCH",
      `${label} metric definition is incompatible.`,
    );
  }
  if (
    metric.method.id !== SCI6_VELOCITY_METRIC_METHOD_ID ||
    metric.method.version !== SCI6_VELOCITY_METRIC_METHOD_VERSION
  ) {
    fail(
      "TARGET_VELOCITY_METRIC_MISMATCH",
      `${label} metric method is incompatible.`,
    );
  }
  return metric;
}

function validatePhase(
  phase: LoadVelocityPhaseBinding,
  label: string,
): LoadVelocityPhaseBinding {
  validateDefinition(phase, label);
  requireText(phase.phaseId, `${label} phase id`);
  if (phase.polarity !== "POSITIVE" && phase.polarity !== "NEGATIVE") {
    fail("TARGET_VELOCITY_PHASE_MISMATCH", `${label} polarity is invalid.`);
  }
  return phase;
}

function validateMeasurement(
  measurement: LoadVelocityMeasurementBinding,
  label: string,
): LoadVelocityMeasurementBinding {
  if (!isRecord(measurement))
    fail("MEASUREMENT_BINDING_MISMATCH", `${label} is required.`);
  for (const key of [
    "objectOfInterest",
    "measurementPoint",
    "referenceFrame",
    "axis",
    "modality",
  ] as const) {
    if (!isRecord(measurement[key])) {
      fail("MEASUREMENT_BINDING_MISMATCH", `${label}.${key} is required.`);
    }
  }
  return measurement;
}

function targetVelocityQuantity(value: Quantity): Quantity {
  try {
    const quantity = createQuantity(value);
    const canonical = canonicalizeQuantity(quantity);
    if (canonical.dimension !== "speed") {
      fail("DIMENSION_MISMATCH", "Target velocity must have speed dimension.");
    }
    if (canonical.value <= 0) {
      fail(
        "TARGET_VELOCITY_INVALID",
        "Target velocity must be positive; zero is not an MVT target.",
      );
    }
    return createQuantity({
      value: canonical.value,
      unit: "m/s",
      dimension: "speed",
    });
  } catch (error) {
    if (error instanceof Sci7InputError) throw error;
    fail(
      "TARGET_VELOCITY_INVALID",
      error instanceof Error ? error.message : "Target velocity is invalid.",
    );
  }
}

function massQuantity(value: Quantity, label: string): Quantity {
  try {
    const quantity = createQuantity(value);
    const canonical = canonicalizeQuantity(quantity);
    if (canonical.dimension !== "mass")
      fail("DIMENSION_MISMATCH", `${label} must have mass dimension.`);
    if (canonical.value <= 0)
      fail("INPUT_INVALID", `${label} must be positive.`);
    return createQuantity({
      value: canonical.value,
      unit: "kg",
      dimension: "mass",
    });
  } catch (error) {
    if (error instanceof Sci7InputError) throw error;
    fail(
      "DIMENSION_MISMATCH",
      error instanceof Error ? error.message : `${label} is invalid.`,
    );
  }
}

function validateMeasuredVelocityAuthorityObservation(
  observation: VelocityAtMeasuredOneRepMaximumObservation,
  label: string,
): void {
  if (!isRecord(observation))
    fail("TARGET_AUTHORITY_UNQUALIFIED", `${label} is required.`);
  if (observation.observationType !== "VELOCITY_AT_MEASURED_ONE_REP_MAXIMUM") {
    fail(
      "TARGET_AUTHORITY_UNQUALIFIED",
      `${label} observation type is incompatible.`,
    );
  }
  requireText(
    observation.measuredOneRepMaximumObservationId,
    `${label} measured observation id`,
  );
  requireText(
    observation.measuredOneRepMaximumClaimId,
    `${label} measured claim id`,
  );
  requireText(observation.metricClaimId, `${label} metric claim id`);
  requireText(observation.athleteId, `${label} athlete id`);
  requireText(observation.assessmentId, `${label} assessment id`);
  requireText(observation.trialId, `${label} trial id`);
  validateDefinition(observation.exerciseDefinition, `${label} exercise`);
  if (observation.exerciseVariation !== null)
    validateDefinition(observation.exerciseVariation, `${label} variation`);
  validateDefinition(observation.movementTask, `${label} movement task`);
  if (observation.selectedPhase === null)
    fail("TARGET_AUTHORITY_UNQUALIFIED", `${label} phase is missing.`);
  validatePhase(observation.selectedPhase, `${label} phase`);
  validateMetricDefinition(observation.metricDefinition, `${label} metric`);
  validateMeasurement(observation.measurement, `${label} measurement`);
  validateQualification(
    observation.metricQualification,
    "SCI4_QUALIFICATION",
    `${label} metric`,
    {
      id: SCI4_METRIC_QUALIFICATION_CAPABILITY_ID,
      version: SCI4_METRIC_QUALIFICATION_CAPABILITY_VERSION,
    },
  );
  if (
    observation.claimClass !== "MECHANICALLY_DERIVED" ||
    observation.mvtAuthorityStatus !== "NOT_ESTABLISHED"
  ) {
    fail(
      "TARGET_AUTHORITY_UNQUALIFIED",
      `${label} epistemic status is incompatible.`,
    );
  }
  targetVelocityQuantity(observation.velocity);
  massQuantity(observation.load, `${label} measured load`);
  parseInstant(observation.observedAt);
  if (
    !Array.isArray(observation.provenance) ||
    observation.provenance.length === 0 ||
    !observation.provenance.some((reference) =>
      isPsc4SourceEvidenceType(reference.type),
    ) ||
    !observation.provenance.some(
      (reference) => reference.ref === observation.metricClaimId,
    )
  ) {
    fail(
      "TARGET_AUTHORITY_UNQUALIFIED",
      `${label} provenance is not bound to the qualified SCI-4 metric claim.`,
    );
  }
}

export function createTargetVelocityAuthority(
  input: TargetVelocityAuthorityInput,
): TargetVelocityAuthority {
  const authorityId = requireText(
    input.authorityId,
    "Target velocity authority id",
  );
  if (!AUTHORITY_ID_PATTERN.test(authorityId))
    fail("INPUT_INVALID", "Target velocity authority id is invalid.");
  requireText(input.authorityVersion, "Target velocity authority version");
  if (
    input.semantic !== "TARGET_VELOCITY" &&
    input.semantic !== "VELOCITY_AT_1RM" &&
    input.semantic !== "MVT"
  )
    fail(
      "TARGET_AUTHORITY_UNQUALIFIED",
      "Target velocity semantic is invalid.",
    );
  if (
    input.sourceType !== "ATHLETE_SPECIFIC_MEASURED_1RM_VELOCITY" &&
    input.sourceType !== "EXTERNAL_PROTOCOL_TARGET_VELOCITY" &&
    input.sourceType !== "LITERATURE_REFERENCE_VELOCITY_AT_1RM" &&
    input.sourceType !== "ATHLETE_SPECIFIC_EXTERNAL_ESTIMATE"
  )
    fail(
      "TARGET_AUTHORITY_UNQUALIFIED",
      "Target velocity source type is invalid.",
    );
  if (
    input.targetScope !== "ATHLETE_SPECIFIC" &&
    input.targetScope !== "GENERALIZED"
  )
    fail("TARGET_AUTHORITY_UNQUALIFIED", "Target velocity scope is invalid.");
  if (typeof input.generalizedTarget !== "boolean")
    fail("TARGET_AUTHORITY_UNQUALIFIED", "Generalized target flag is invalid.");
  const targetVelocity = targetVelocityQuantity(input.targetVelocity);
  validateMetricDefinition(input.velocityMetric, "Target velocity");
  validatePhase(input.phase, "Target velocity phase");
  validateDefinition(
    input.exerciseDefinition,
    "Target velocity exercise definition",
  );
  if (input.exerciseVariation !== null)
    validateDefinition(
      input.exerciseVariation,
      "Target velocity exercise variation",
    );
  validateDefinition(input.movementTask, "Target velocity movement task");
  validateMeasurement(input.measurement, "Target velocity measurement");
  requireReference(input.sourceReference, "Target velocity source");
  requireReference(
    input.methodProtocolReference,
    "Target velocity method/protocol",
  );
  if (input.athleteId !== null && input.athleteId !== undefined)
    requireText(input.athleteId, "Target velocity athlete id");
  if (input.targetScope === "GENERALIZED") {
    requireText(
      input.populationScope ?? "",
      "Target velocity population scope",
    );
  } else if (input.populationScope !== null) {
    requireText(input.populationScope, "Target velocity population scope");
  }
  if (
    input.targetScope === "ATHLETE_SPECIFIC" &&
    (input.athleteId === null || input.athleteId === undefined)
  ) {
    fail(
      "TARGET_AUTHORITY_UNQUALIFIED",
      "Athlete-specific target velocity requires an athlete binding.",
    );
  }
  if (input.targetScope === "GENERALIZED" && input.athleteId !== null) {
    fail(
      "TARGET_AUTHORITY_UNQUALIFIED",
      "Generalized target velocity must not carry an athlete-specific binding.",
    );
  }
  if (input.generalizedTarget !== (input.targetScope === "GENERALIZED")) {
    fail(
      "TARGET_AUTHORITY_UNQUALIFIED",
      "Generalized versus athlete-specific target scope is inconsistent.",
    );
  }
  if (
    input.sourceType === "LITERATURE_REFERENCE_VELOCITY_AT_1RM" &&
    input.targetScope !== "GENERALIZED"
  ) {
    fail(
      "TARGET_AUTHORITY_UNQUALIFIED",
      "Literature target velocity must remain generalized unless explicitly adjudicated otherwise.",
    );
  }
  if (
    input.sourceType === "LITERATURE_REFERENCE_VELOCITY_AT_1RM" &&
    input.sourceReference.type !== "DOI" &&
    input.sourceReference.type !== "LITERATURE_REFERENCE"
  ) {
    fail(
      "TARGET_AUTHORITY_UNQUALIFIED",
      "Literature target velocity requires a literature source reference.",
    );
  }
  if (
    (input.sourceType === "ATHLETE_SPECIFIC_MEASURED_1RM_VELOCITY" ||
      input.sourceType === "ATHLETE_SPECIFIC_EXTERNAL_ESTIMATE") &&
    input.targetScope !== "ATHLETE_SPECIFIC"
  ) {
    fail(
      "TARGET_AUTHORITY_UNQUALIFIED",
      "Athlete-specific target source requires athlete-specific scope.",
    );
  }
  if (!Array.isArray(input.provenance) || input.provenance.length === 0)
    fail(
      "REQUIRED_EVIDENCE_MISSING",
      "Target velocity authority provenance is required.",
    );
  input.provenance.forEach((reference) => {
    requireReference(reference, "Target velocity provenance");
  });
  if (input.uncertainty === undefined)
    fail(
      "TARGET_AUTHORITY_UNQUALIFIED",
      "Target velocity uncertainty state is required.",
    );
  if (input.uncertainty !== null) assertUncertainty(input.uncertainty);
  validateQualification(
    input.qualification,
    SCI7_QUALIFICATION_ARTIFACT_TYPE,
    "Target velocity",
    {
      id: TARGET_VELOCITY_AUTHORITY_CAPABILITY_ID,
      version: TARGET_VELOCITY_AUTHORITY_CAPABILITY_VERSION,
    },
  );
  const measuredObservation = input.measuredVelocityObservation;
  if (input.sourceType === "ATHLETE_SPECIFIC_MEASURED_1RM_VELOCITY") {
    if (measuredObservation === null || measuredObservation === undefined)
      fail(
        "TARGET_AUTHORITY_UNQUALIFIED",
        "Athlete-specific measured target velocity requires its measured-velocity observation.",
      );
    if (input.targetScope !== "ATHLETE_SPECIFIC")
      fail(
        "TARGET_AUTHORITY_UNQUALIFIED",
        "Measured target velocity must be athlete-specific.",
      );
    validateMeasuredVelocityAuthorityObservation(
      measuredObservation,
      "Target velocity measured observation",
    );
    if (
      measuredObservation.athleteId !== input.athleteId ||
      !definitionEqual(
        measuredObservation.exerciseDefinition,
        input.exerciseDefinition,
      ) ||
      !definitionEqual(
        measuredObservation.exerciseVariation,
        input.exerciseVariation,
      ) ||
      !definitionEqual(measuredObservation.movementTask, input.movementTask) ||
      !definitionEqual(measuredObservation.selectedPhase, input.phase) ||
      !definitionEqual(
        measuredObservation.metricDefinition,
        input.velocityMetric,
      ) ||
      !definitionEqual(measuredObservation.measurement, input.measurement) ||
      measuredObservation.velocity.value !== targetVelocity.value ||
      measuredObservation.metricClaimId !== input.sourceReference.ref
    ) {
      fail(
        "TARGET_AUTHORITY_UNQUALIFIED",
        "Measured target velocity authority is not bound to the exact measured observation context.",
      );
    }
  } else if (
    measuredObservation !== null &&
    measuredObservation !== undefined
  ) {
    fail(
      "TARGET_AUTHORITY_UNQUALIFIED",
      "A measured-velocity observation is only valid for the measured-1RM source type.",
    );
  }
  return immutable({ ...input, authorityId, targetVelocity });
}

export function createMeasuredOneRepMaximumObservation(
  input: MeasuredOneRepMaximumInput,
): MeasuredOneRepMaximumObservation {
  requireText(input.observationId, "Measured maximal observation id");
  requireText(input.athleteId, "Measured maximal athlete id");
  requireText(input.assessmentId, "Measured maximal assessment id");
  requireText(input.trialId, "Measured maximal trial id");
  validateDefinition(
    input.exerciseDefinition,
    "Measured maximal exercise definition",
  );
  if (input.exerciseVariation !== null)
    validateDefinition(
      input.exerciseVariation,
      "Measured maximal exercise variation",
    );
  validateDefinition(input.movementTask, "Measured maximal movement task");
  if (input.selectedPhase !== undefined) {
    validatePhase(input.selectedPhase, "Measured maximal phase");
  }
  if (input.measurement !== undefined) {
    validateMeasurement(input.measurement, "Measured maximal measurement");
  }
  const load = massQuantity(input.load, "Measured maximal load");
  validateDefinition(
    input.protocolRevision,
    "Measured maximal protocol revision",
  );
  if (input.trialValidity !== "VALID" || input.trialExclusion !== "INCLUDED") {
    fail(
      "TRIAL_INVALID",
      "Measured maximal input must bind a valid, included trial.",
    );
  }
  if (input.successfulMaximalAttempt !== true) {
    fail(
      "METHOD_NOT_APPLICABLE",
      "SCI-7 consumes an already-adjudicated successful maximal attempt.",
    );
  }
  parseInstant(input.observedAt);
  if (!Array.isArray(input.provenance))
    fail(
      "REQUIRED_EVIDENCE_MISSING",
      "Measured maximal provenance is required.",
    );
  const evidence = input.provenance.filter((reference) =>
    isPsc4SourceEvidenceType(reference.type),
  );
  if (
    evidence.length === 0 ||
    !evidence.some(
      (reference) =>
        reference.type === "PSC4_TRIAL" && reference.ref === input.trialId,
    ) ||
    !input.provenance.some(
      (reference) =>
        reference.type === "PSC4_ASSESSMENT" &&
        reference.ref === input.assessmentId,
    ) ||
    !input.provenance.some(
      (reference) =>
        reference.type === "SCI4_PROTOCOL" &&
        reference.ref === input.protocolRevision.id,
    )
  )
    fail(
      "MEASURED_1RM_PROTOCOL_MISSING",
      "Measured maximal observation requires exact trial, assessment, and protocol provenance.",
    );
  input.provenance.forEach((reference) => {
    requireReference(reference, "Measured maximal provenance");
  });
  const claimId =
    input.claimId ??
    `measured-maximal-claim-${sha256(canonicalJson({ ...input, load }))}`;
  const claim = createScientificClaim({
    claimClass: "OBSERVED",
    claimId,
    value: { kind: "QUANTITY", value: load },
    evidence,
    observedAt: input.observedAt as Instant,
  });
  return immutable({
    ...input,
    selectedPhase: input.selectedPhase ?? null,
    measurement: input.measurement ?? null,
    load,
    claimClass: "OBSERVED" as const,
    claim,
    epistemicStatus: "DIRECT_ASSESSMENT_FACT" as const,
  });
}

export function createVelocityAtMeasuredOneRepMaximumObservation(
  input: VelocityAtMeasuredOneRepMaximumInput,
): VelocityAtMeasuredOneRepMaximumObservation {
  const measured = input.measuredOneRepMaximum;
  if (measured.measurement === null) {
    fail(
      "MEASUREMENT_BINDING_MISMATCH",
      "Measured maximal velocity requires the measured trial measurement binding.",
    );
  }
  if (!definitionEqual(input.measurement, measured.measurement)) {
    fail(
      "MEASUREMENT_BINDING_MISMATCH",
      "Measured maximal velocity measurement does not match the measured trial.",
    );
  }
  validateMetricDefinition(input.metricDefinition, "Measured maximal velocity");
  validateMeasurement(
    input.measurement,
    "Measured maximal velocity measurement",
  );
  if (measured.selectedPhase === null) {
    fail(
      "TARGET_VELOCITY_PHASE_MISMATCH",
      "Measured maximal velocity requires an explicit phase binding.",
    );
  }
  if (
    input.metric.metricId !== input.metricDefinition.id ||
    input.metric.metricVersion !== input.metricDefinition.version ||
    input.metric.method.id !== input.metricDefinition.method.id ||
    input.metric.method.version !== input.metricDefinition.method.version ||
    input.metric.claimClass !== "MECHANICALLY_DERIVED" ||
    input.metric.validity !== "VALID"
  ) {
    fail(
      "TARGET_VELOCITY_METRIC_MISMATCH",
      "Measured maximal velocity metric binding is incompatible.",
    );
  }
  validateQualification(
    input.metricQualification,
    "SCI4_QUALIFICATION",
    "Measured maximal velocity metric",
  );
  if (
    input.metricQualification.capabilityId !==
      SCI4_METRIC_QUALIFICATION_CAPABILITY_ID ||
    input.metricQualification.capabilityVersion !==
      SCI4_METRIC_QUALIFICATION_CAPABILITY_VERSION ||
    (input.metric.qualificationStatus !== "QUALIFIED" &&
      input.metric.qualificationStatus !== "QUALIFIED_SOFTWARE")
  ) {
    fail(
      "TARGET_AUTHORITY_UNQUALIFIED",
      "Measured maximal velocity requires a qualified SCI-4 metric artifact.",
    );
  }
  const velocity = targetVelocityQuantity(
    createQuantity({
      value: input.metric.directionalVelocityMps,
      unit: "m/s",
      dimension: "speed",
    }),
  );
  requireText(
    input.metric.claimId,
    "Measured maximal velocity metric claim id",
  );
  parseInstant(input.observedAt);
  if (
    !Array.isArray(input.provenance) ||
    input.provenance.length === 0 ||
    !input.provenance.some((reference) =>
      isPsc4SourceEvidenceType(reference.type),
    ) ||
    !input.provenance.some(
      (reference) => reference.ref === input.metric.claimId,
    )
  ) {
    fail(
      "REQUIRED_EVIDENCE_MISSING",
      "Measured maximal velocity requires PSC4 provenance bound to the SCI-4 metric claim.",
    );
  }
  input.provenance.forEach((reference) => {
    requireReference(reference, "Measured maximal velocity provenance");
  });
  return immutable({
    observationType: "VELOCITY_AT_MEASURED_ONE_REP_MAXIMUM" as const,
    measuredOneRepMaximumObservationId: measured.observationId,
    measuredOneRepMaximumClaimId: (measured.claim as { claimId: string })
      .claimId,
    athleteId: measured.athleteId,
    assessmentId: measured.assessmentId,
    trialId: measured.trialId,
    exerciseDefinition: measured.exerciseDefinition,
    exerciseVariation: measured.exerciseVariation,
    movementTask: measured.movementTask,
    selectedPhase: measured.selectedPhase,
    protocolRevision: measured.protocolRevision,
    metricDefinition: input.metricDefinition,
    measurement: input.measurement,
    metricQualification: input.metricQualification,
    metricClaimId: input.metric.claimId,
    velocity,
    load: measured.load,
    claimClass: "MECHANICALLY_DERIVED" as const,
    mvtAuthorityStatus: "NOT_ESTABLISHED" as const,
    observedAt: input.observedAt,
    provenance: input.provenance,
  });
}

function assumptions(): readonly AssumptionDeclaration[] {
  return [
    {
      id: "SCI7-INVERSE-LINEAR-MODEL",
      version: "1.0.0",
      description:
        "The qualified SCI-6 line is inverted as a descriptive linear relationship for the bound context.",
      reference: { type: "SCI7_METHOD", ref: TARGET_LOAD_METHOD_ID },
      status: "DECLARED",
      parameters: { model: "v = intercept + slope * external_mass" },
    },
    {
      id: "SCI7-EXPLICIT-TARGET-AUTHORITY",
      version: "1.0.0",
      description:
        "A target velocity is accepted only when supplied with explicit versioned authority and compatibility bindings.",
      reference: { type: "SCI7_METHOD", ref: "target_velocity.authority" },
      status: "DECLARED",
      parameters: { builtInTarget: false, universalMvt: false },
    },
    {
      id: "SCI7-UNCERTAINTY-NOT-FABRICATED",
      version: "1.0.0",
      description:
        "Sensitivity coefficients are reported separately from uncertainty; total uncertainty remains unknown without valid propagation inputs.",
      reference: { type: "SCI7_METHOD", ref: "uncertainty.policy" },
      status: "DECLARED",
      parameters: { confidenceIntervals: false, covariancePropagation: false },
    },
  ];
}

function configurationSnapshot(): ConfigurationSnapshot {
  const parameters: Readonly<Record<string, JsonValue>> = {
    predictor: "external_mass_kg",
    response: "directional_velocity_mps",
    targetVelocityUnit: "m/s",
    extrapolationThreshold: "none",
    measuredAndEstimatedSeparate: true,
  };
  const canonicalSerialization = canonicalJson(parameters);
  return {
    id: "sci7-maximal-strength-modeling-configuration",
    parameters,
    canonicalSerialization,
    contentHash: sha256(canonicalSerialization),
  };
}

function uncertaintyPolicy(method: MethodIdentity): UncertaintyPolicy {
  return {
    measurement: {
      kind: "NOT_PROPAGATED",
      reason:
        "SCI-7 v1 consumes upstream measurement uncertainty states but does not replace them.",
    },
    statistical: {
      kind: "PRODUCED_BY_ESTIMATOR",
      method,
    },
    model: {
      kind: "NOT_PROPAGATED",
      reason: "No inverse-model covariance propagation is bound in SCI-7 v1.",
    },
    propagated: {
      kind: "NOT_PROPAGATED",
      reason:
        "Sensitivity is not an uncertainty estimate and no complete covariance input exists.",
    },
    output: "UNKNOWN_ALLOWED",
  };
}

function qualificationBinding(
  options: MaximalStrengthAdapterOptions,
  processor: MethodIdentity,
  method: MethodIdentity,
): ScientificProcessorContract["qualification"] {
  if (options.qualification === null || options.qualification === undefined) {
    return {
      status: "NOT_QUALIFIED",
      reason: "No SCI-7 qualification binding was supplied.",
    };
  }
  return {
    status: "QUALIFIED",
    identity: {
      qualificationId: options.qualification.qualificationId,
      qualificationVersion: options.qualification.qualificationVersion,
      processor,
      method,
      software: options.software,
      oracle: options.qualification.oracle,
      validationData: options.qualification.validationData,
    },
  };
}

function processorContract(
  options: MaximalStrengthAdapterOptions,
  operation: MaximalStrengthOperation,
): ScientificProcessorContract {
  const processor = {
    id: MAXIMAL_STRENGTH_PROCESSOR_ID,
    version: MAXIMAL_STRENGTH_PROCESSOR_VERSION,
  };
  const method = {
    id:
      operation === "TARGET_LOAD"
        ? TARGET_LOAD_METHOD_ID
        : ESTIMATED_ONE_REP_MAXIMUM_METHOD_ID,
    version: MAXIMAL_STRENGTH_METHOD_VERSION,
  };
  return createProcessorContract({
    processor,
    method,
    software: options.software,
    inputs: [
      {
        id: "sci6-profile",
        source: "SCIENTIFIC_CLAIM",
        required: true,
        acceptedClaimClasses: ["STATISTICALLY_ESTIMATED"],
        dimensions: [],
        units: [],
        acceptedValidityStates: ["VALID"],
        acceptedExclusionStates: ["INCLUDED"],
        acceptedMissingness: ["NOT_APPLICABLE"],
        protocol: { kind: "NONE" },
      },
      {
        id: "target-velocity-authority",
        source: "PSC4_EVIDENCE",
        required: true,
        acceptedClaimClasses: [],
        dimensions: ["speed"],
        units: ["m/s"],
        acceptedValidityStates: ["VALID"],
        acceptedExclusionStates: ["INCLUDED"],
        acceptedMissingness: ["NOT_APPLICABLE"],
        protocol: { kind: "NONE" },
      },
    ],
    output: {
      claimClass:
        operation === "TARGET_LOAD"
          ? "STATISTICALLY_ESTIMATED"
          : "SCIENTIFIC_INFERENCE",
      valueKind: "QUANTITY",
      dimension: "mass",
      unit: "kg",
    },
    assumptions: assumptions(),
    calibration: {
      kind: "OPTIONAL",
      acceptedStatuses: ["CALIBRATED", "NOT_REQUIRED", "UNKNOWN"],
    },
    uncertainty: uncertaintyPolicy(method),
    configuration: configurationSnapshot(),
    determinism: "DETERMINISTIC",
    failureModes: [...FAILURE_CODES],
    lineage: {
      requiredFields: [
        "INPUTS",
        "PROCESSOR",
        "METHOD",
        "ASSUMPTIONS",
        "CONFIGURATION",
      ],
    },
    qualification: qualificationBinding(options, processor, method),
  });
}

function requireProfileCompatibility(
  input: MaximalStrengthModelingRequestInput,
): void {
  const profile = input.profile;
  if (
    !isRecord(profile) ||
    !isRecord(profile.model) ||
    !isRecord(profile.profileContext)
  ) {
    fail("PROFILE_NOT_FOUND", "A SCI-6 profile artifact is required.");
  }
  try {
    assertLoadVelocityProfileArtifact(profile);
  } catch (error) {
    fail(
      "PROFILE_UNQUALIFIED",
      error instanceof Error
        ? error.message
        : "SCI-6 profile artifact integrity could not be verified.",
    );
  }
  validateQualification(
    input.profileQualification,
    SCI6_QUALIFICATION_ARTIFACT_TYPE,
    "SCI-6 profile",
    {
      id: LOAD_VELOCITY_PROFILE_CAPABILITY_ID,
      version: LOAD_VELOCITY_PROFILE_CAPABILITY_VERSION,
    },
  );
  const profileBinding = input.profileQualification.binding;
  const profileClaim = input.profile.profileClaim as Record<string, unknown>;
  const profileSoftware = isRecord(profileClaim.software)
    ? profileClaim.software
    : null;
  const expectedMethod =
    input.profile.fitMethod === "TWO_POINT"
      ? LOAD_VELOCITY_PROFILE_TWO_POINT_METHOD_ID
      : LOAD_VELOCITY_PROFILE_MULTI_POINT_METHOD_ID;
  if (
    !isRecord(profileBinding) ||
    profileBinding.fingerprint !== input.profile.model.modelFingerprint ||
    profileBinding.claimId !== input.profile.model.modelClaimId ||
    !isRecord(profileBinding.processor) ||
    profileBinding.processor.id !== LOAD_VELOCITY_PROFILE_PROCESSOR_ID ||
    profileBinding.processor.version !==
      LOAD_VELOCITY_PROFILE_PROCESSOR_VERSION ||
    !isRecord(profileBinding.method) ||
    profileBinding.method.id !== expectedMethod ||
    profileBinding.method.version !== LOAD_VELOCITY_PROFILE_METHOD_VERSION ||
    !isRecord(profileSoftware) ||
    profileBinding.sourceRevision !== profileSoftware.sourceRevision ||
    profileBinding.buildId !== profileSoftware.buildId
  ) {
    fail(
      "PROFILE_UNQUALIFIED",
      "SCI-6 qualification is not bound to the immutable profile fingerprint and software identity.",
    );
  }
  if (profile.claimClass !== "STATISTICALLY_ESTIMATED") {
    fail(
      "PROFILE_UNQUALIFIED",
      "SCI-6 profile must remain statistically estimated.",
    );
  }
  if (
    profileClaim.claimClass !== "STATISTICALLY_ESTIMATED" ||
    typeof profileClaim.claimId !== "string" ||
    profile.model.modelClaimId !== profileClaim.claimId ||
    profile.model.profileId !== profile.profileContext.profileId
  ) {
    fail(
      "PROFILE_UNQUALIFIED",
      "SCI-6 profile claim and model identities are not aligned.",
    );
  }
  if (
    profile.fitMethod !== "TWO_POINT" &&
    profile.fitMethod !== "MULTI_POINT_OLS"
  ) {
    fail(
      "PROFILE_METHOD_UNSUPPORTED",
      "SCI-6 profile method is unsupported by SCI-7.",
    );
  }
  if (
    profile.model.processor.id !== LOAD_VELOCITY_PROFILE_PROCESSOR_ID ||
    profile.model.processor.version !==
      LOAD_VELOCITY_PROFILE_PROCESSOR_VERSION ||
    profile.model.method.id !== expectedMethod ||
    profile.model.method.version !== LOAD_VELOCITY_PROFILE_METHOD_VERSION
  ) {
    fail(
      "PROFILE_METHOD_UNSUPPORTED",
      "SCI-6 profile processor or method identity is unsupported.",
    );
  }
  const context = profile.profileContext;
  const authority = input.targetVelocityAuthority;
  if (
    authority.targetScope === "ATHLETE_SPECIFIC" &&
    authority.athleteId !== context.athleteId
  ) {
    fail(
      "ATHLETE_MISMATCH",
      "Athlete-specific target authority does not match the SCI-6 profile athlete.",
    );
  }
  if (
    !definitionEqual(authority.exerciseDefinition, context.exerciseDefinition)
  ) {
    fail(
      "TARGET_VELOCITY_EXERCISE_MISMATCH",
      "Target velocity exercise does not match the SCI-6 profile.",
    );
  }
  if (
    !definitionEqual(authority.exerciseVariation, context.exerciseVariation)
  ) {
    fail(
      "TARGET_VELOCITY_VARIATION_MISMATCH",
      "Target velocity variation does not match the SCI-6 profile.",
    );
  }
  if (!definitionEqual(authority.movementTask, context.movementTask)) {
    fail(
      "TARGET_VELOCITY_TASK_MISMATCH",
      "Target velocity movement task does not match the SCI-6 profile.",
    );
  }
  if (!definitionEqual(authority.phase, context.selectedPhase)) {
    fail(
      "TARGET_VELOCITY_PHASE_MISMATCH",
      "Target velocity phase does not match the SCI-6 profile.",
    );
  }
  if (!definitionEqual(authority.velocityMetric, context.metricDefinition)) {
    fail(
      "TARGET_VELOCITY_METRIC_MISMATCH",
      "Target velocity metric does not match the SCI-6 profile.",
    );
  }
  if (!definitionEqual(authority.measurement, context.measurement)) {
    fail(
      "MEASUREMENT_BINDING_MISMATCH",
      "Target velocity measurement setup does not match the SCI-6 profile.",
    );
  }
  targetVelocityQuantity(authority.targetVelocity);
}

function requireInferenceAuthority(
  input: MaximalStrengthModelingRequestInput,
): void {
  if (input.operation !== "ESTIMATED_1RM") return;
  if (
    input.targetVelocityAuthority.semantic !== "MVT" &&
    input.targetVelocityAuthority.semantic !== "VELOCITY_AT_1RM"
  ) {
    fail(
      "MVT_AUTHORITY_MISSING",
      "Estimated one-repetition maximum inference requires explicit MVT or velocity-at-1RM authority.",
    );
  }
  if (
    input.targetVelocityAuthority.qualification.qualificationArtifact.type !==
    SCI7_QUALIFICATION_ARTIFACT_TYPE
  ) {
    fail(
      "MVT_AUTHORITY_INCOMPATIBLE",
      "Target authority is not qualified as an SCI-7 target-velocity authority.",
    );
  }
}

function modelPayload(
  profile: LoadVelocityProfileValue,
): Readonly<Record<string, unknown>> {
  const model = profile.model;
  return {
    profile_id: model.profileId,
    fit_method: model.fitMethod,
    slope_mps_per_kg: model.slopeMpsPerKg,
    intercept_mps: model.interceptMps,
    number_of_observations: model.numberOfObservations,
    observed_domain: {
      external_load_min_kg: model.observedDomain.externalLoadMinKg,
      external_load_max_kg: model.observedDomain.externalLoadMaxKg,
      directional_velocity_min_mps:
        model.observedDomain.directionalVelocityMinMps,
      directional_velocity_max_mps:
        model.observedDomain.directionalVelocityMaxMps,
    },
  };
}

function canonicalModelingPayload(
  input: MaximalStrengthModelingRequestInput,
  contract: ScientificProcessorContract,
): Readonly<Record<string, unknown>> {
  return {
    processor: contract.processor,
    method:
      input.operation === "TARGET_LOAD"
        ? {
            id: TARGET_LOAD_METHOD_ID,
            version: MAXIMAL_STRENGTH_METHOD_VERSION,
          }
        : {
            id: ESTIMATED_ONE_REP_MAXIMUM_METHOD_ID,
            version: MAXIMAL_STRENGTH_METHOD_VERSION,
          },
    software: contract.software,
    configuration: configurationSnapshot(),
    operation: input.operation,
    profile: {
      profileId: input.profile.model.profileId,
      profileClaimId: input.profile.model.modelClaimId,
      profileInputFingerprint: input.profile.model.profileInputFingerprint,
      modelFingerprint: input.profile.model.modelFingerprint,
      fitMethod: input.profile.fitMethod,
      model: modelPayload(input.profile),
      upstreamQualifications: input.profile.upstreamQualifications,
      limitations: input.profile.limitations,
      qualification: input.profileQualification,
    },
    targetVelocityAuthority: input.targetVelocityAuthority,
    inputProvenance: input.inputProvenance,
  };
}

function enginePayload(
  input: MaximalStrengthModelingRequestInput,
): Readonly<Record<string, unknown>> {
  return {
    processor: {
      id: MAXIMAL_STRENGTH_PROCESSOR_ID,
      version: MAXIMAL_STRENGTH_PROCESSOR_VERSION,
    },
    operation: input.operation,
    profile_id: input.profile.model.profileId,
    model: modelPayload(input.profile),
    target_velocity_mps: input.targetVelocityAuthority.targetVelocity.value,
  };
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
            `SCI-7 Python engine exited with code ${code}: ${stderr.trim()}`,
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
            : new Error("SCI-7 engine returned invalid JSON."),
        );
      }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

function parseEngineResponse(
  value: unknown,
  operation: MaximalStrengthOperation,
): EngineResponse {
  if (!isRecord(value) || typeof value.status !== "string") {
    throw new Error("SCI-7 engine returned an invalid response envelope.");
  }
  if (value.status === "FAILED") {
    if (!isRecord(value.failure))
      throw new Error("SCI-7 engine returned an invalid failure envelope.");
    return value as unknown as EngineFailureResponse;
  }
  if (value.status === "INFRASTRUCTURE_FAILED") {
    if (!isRecord(value.exception))
      throw new Error(
        "SCI-7 engine returned an invalid infrastructure envelope.",
      );
    return value as unknown as EngineInfrastructureFailure;
  }
  const expectedMethod =
    operation === "TARGET_LOAD"
      ? TARGET_LOAD_METHOD_ID
      : ESTIMATED_ONE_REP_MAXIMUM_METHOD_ID;
  if (
    value.status !== "SUCCEEDED" ||
    !isRecord(value.processor) ||
    value.processor.id !== MAXIMAL_STRENGTH_PROCESSOR_ID ||
    value.processor.version !== MAXIMAL_STRENGTH_PROCESSOR_VERSION ||
    !isRecord(value.method) ||
    value.method.id !== expectedMethod ||
    value.method.version !== MAXIMAL_STRENGTH_METHOD_VERSION ||
    value.operation !== operation ||
    typeof value.profile_id !== "string" ||
    typeof value.target_velocity_mps !== "number" ||
    !Number.isFinite(value.target_velocity_mps) ||
    typeof value.estimated_load_kg !== "number" ||
    !Number.isFinite(value.estimated_load_kg) ||
    !isRecord(value.extrapolation) ||
    !isRecord(value.sensitivity) ||
    !isRecord(value.diagnostics) ||
    !isRecord(value.uncertainty)
  ) {
    throw new Error("SCI-7 engine returned an invalid success payload.");
  }
  if (
    value.domain_classification !== "WITHIN_OBSERVED_LOAD_DOMAIN" &&
    value.domain_classification !== "EXTRAPOLATED_ABOVE_OBSERVED_LOAD_DOMAIN" &&
    value.domain_classification !== "EXTRAPOLATED_BELOW_OBSERVED_LOAD_DOMAIN"
  ) {
    throw new Error(
      "SCI-7 engine returned an invalid load-domain classification.",
    );
  }
  for (const key of [
    "d_load_d_target_velocity",
    "d_load_d_intercept",
    "d_load_d_slope",
  ]) {
    if (
      typeof value.sensitivity[key] !== "number" ||
      !Number.isFinite(value.sensitivity[key])
    ) {
      throw new Error(
        "SCI-7 engine returned invalid sensitivity coefficients.",
      );
    }
  }
  if (
    typeof value.extrapolation.velocity_domain_classification !== "string" ||
    (value.extrapolation.velocity_domain_classification !==
      "WITHIN_OBSERVED_VELOCITY_DOMAIN" &&
      value.extrapolation.velocity_domain_classification !==
        "EXTRAPOLATED_ABOVE_OBSERVED_VELOCITY_DOMAIN" &&
      value.extrapolation.velocity_domain_classification !==
        "EXTRAPOLATED_BELOW_OBSERVED_VELOCITY_DOMAIN")
  ) {
    throw new Error(
      "SCI-7 engine returned an invalid velocity-domain classification.",
    );
  }
  return value as unknown as EngineSuccess;
}

function mapEngineFailure(code: string): ScientificFailureCode {
  return FAILURE_CODES.has(code as ScientificFailureCode)
    ? (code as ScientificFailureCode)
    : "INPUT_INVALID";
}

function nowInstant(): Instant {
  return parseInstant(new Date().toISOString());
}

function profileClaimReference(
  profile: LoadVelocityProfileValue,
): ClaimReference {
  return {
    kind: "SCIENTIFIC_CLAIM",
    ref: profile.model.modelClaimId,
    claimClass: "STATISTICALLY_ESTIMATED",
  };
}

function parentReferences(
  input: MaximalStrengthModelingRequestInput,
): readonly ClaimReference[] {
  const references: ClaimReference[] = input.inputProvenance
    .filter((reference) => isPsc4SourceEvidenceType(reference.type))
    .map((reference) => ({
      kind: "PSC4_EVIDENCE" as const,
      ref: reference.ref,
    }));
  references.push(profileClaimReference(input.profile));
  const seen = new Set<string>();
  return references.filter((reference) => {
    const key = `${reference.kind}:${reference.ref}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function authorityProvenance(
  input: MaximalStrengthModelingRequestInput,
): readonly ScienceProvenanceRef[] {
  const authority = input.targetVelocityAuthority;
  return [
    ...input.inputProvenance,
    ...authority.provenance,
    authority.sourceReference,
    authority.methodProtocolReference,
    input.profileQualification.qualificationArtifact,
    ...input.profile.upstreamQualifications.map(
      (qualification) => qualification.qualificationArtifact,
    ),
    authority.qualification.qualificationArtifact,
    { type: "SCI7_TARGET_VELOCITY_AUTHORITY", ref: authority.authorityId },
  ];
}

function baseLimitations(
  input: MaximalStrengthModelingRequestInput,
): readonly string[] {
  const limitations = [
    "SCI-7 consumes an already-qualified, context-bound SCI-6 profile; it does not fit or empirically validate that profile.",
    "The target velocity is caller-supplied and must remain bound to the exact velocity metric, phase, exercise, variation, movement task, and measurement setup.",
    "Sensitivity coefficients are local analytical derivatives, not uncertainty estimates.",
    "Total one-repetition-maximum uncertainty is UNKNOWN without complete validated uncertainty propagation.",
    "No output is a training prescription, recommendation, readiness statement, fatigue interpretation, recovery statement, or longitudinal conclusion.",
  ];
  if (input.profile.fitMethod === "TWO_POINT") {
    limitations.push(
      "The SCI-6 two-point profile retains zero residual degrees of freedom; its automatic fit identity is not empirical fit-quality evidence.",
    );
  } else {
    limitations.push(
      "SCI-6 multi-point OLS diagnostics are retained as model-fit diagnostics and are not empirical maximal-strength validity evidence.",
    );
  }
  limitations.push(...input.profile.limitations);
  limitations.push(...input.profileQualification.limitations);
  for (const qualification of input.profile.upstreamQualifications) {
    limitations.push(...qualification.limitations);
  }
  limitations.push(...input.targetVelocityAuthority.qualification.limitations);
  if (input.targetVelocityAuthority.targetScope === "GENERALIZED") {
    limitations.push(
      "The target authority is generalized; it is not silently relabeled athlete-specific or treated as temporally stable.",
    );
  }
  return limitations;
}

function applicabilityDiagnostics(
  input: MaximalStrengthModelingRequestInput,
  classification: LoadAtTargetVelocityEstimate["domainClassification"],
  velocityDomainClassification: VelocityDomainClassification,
): readonly string[] {
  const withinLoadDomain = classification === "WITHIN_OBSERVED_LOAD_DOMAIN";
  const withinVelocityDomain =
    velocityDomainClassification === "WITHIN_OBSERVED_VELOCITY_DOMAIN";
  const diagnostics: string[] = [
    withinLoadDomain && withinVelocityDomain
      ? "APPLICABLE_WITHIN_OBSERVED_DOMAIN"
      : "EXTRAPOLATIVE_INFERENCE",
    "TOTAL_UNCERTAINTY_UNKNOWN",
  ];
  if (!withinLoadDomain) diagnostics.push("LOAD_DOMAIN_EXTRAPOLATION");
  if (!withinVelocityDomain) diagnostics.push("VELOCITY_DOMAIN_EXTRAPOLATION");
  if (input.targetVelocityAuthority.targetScope === "GENERALIZED")
    diagnostics.push("TARGET_AUTHORITY_GENERALIZED");
  if (input.profile.fitMethod === "TWO_POINT")
    diagnostics.push("PROFILE_QUALIFICATION_LIMITED");
  return diagnostics;
}

function uncertaintyFromEngine(value: Uncertainty): Uncertainty {
  assertUncertainty(value);
  if (value.kind !== "UNKNOWN")
    fail(
      "INPUT_INVALID",
      "SCI-7 v1 requires UNKNOWN total uncertainty without a validated propagation artifact.",
    );
  return value;
}

function buildTargetLoadEstimate(
  input: MaximalStrengthModelingRequestInput,
  engine: EngineSuccess,
  contract: ScientificProcessorContract,
  inputFingerprint: string,
): LoadAtTargetVelocityEstimate {
  const method = {
    id: TARGET_LOAD_METHOD_ID,
    version: MAXIMAL_STRENGTH_METHOD_VERSION,
  };
  const processor = contract.processor;
  const generatedAt = nowInstant();
  const configuration = configurationSnapshot();
  const references = parentReferences(input);
  const claimId = `sci7-target-load-claim-${inputFingerprint}`;
  const uncertainty = uncertaintyFromEngine(engine.uncertainty);
  const velocityDomainClassification =
    engine.extrapolation.velocity_domain_classification;
  if (
    velocityDomainClassification !== "WITHIN_OBSERVED_VELOCITY_DOMAIN" &&
    velocityDomainClassification !==
      "EXTRAPOLATED_ABOVE_OBSERVED_VELOCITY_DOMAIN" &&
    velocityDomainClassification !==
      "EXTRAPOLATED_BELOW_OBSERVED_VELOCITY_DOMAIN"
  ) {
    fail(
      "INPUT_INVALID",
      "SCI-7 engine velocity-domain classification is invalid.",
    );
  }
  const claim = createScientificClaim({
    claimClass: "STATISTICALLY_ESTIMATED",
    claimId,
    value: {
      kind: "QUANTITY",
      value: createQuantity({
        value: engine.estimated_load_kg,
        unit: "kg",
        dimension: "mass",
      }),
    },
    output: { kind: "QUANTITY", dimension: "mass", unit: "kg" },
    method,
    estimator: method,
    sampleScope: {
      kind: "SAMPLE",
      reference: {
        type: "SCI6_PROFILE_OBSERVATIONS",
        ref: input.profile.profileId,
      },
      count: input.profile.model.numberOfObservations,
    },
    uncertainty,
    software: contract.software,
    assumptions: contract.assumptions,
    configuration,
    lineage: { parents: references, provenance: authorityProvenance(input) },
  });
  const node = {
    nodeId: `sci7-target-load-node-${inputFingerprint}`,
    outputClaimId: claimId,
    outputClass: "STATISTICALLY_ESTIMATED" as const,
    inputs: references,
    processor,
    method,
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
        recordId: `sci7-target-load-recalculation-${inputFingerprint}`,
        outputClaimId: claimId,
        inputReferences: references,
        processor,
        method,
        software: contract.software,
        configuration,
        generatedAt,
        supersedesRecordId: null,
      },
    ],
  });
  const targetVelocity = input.targetVelocityAuthority.targetVelocity;
  return immutable({
    operation: "TARGET_LOAD" as const,
    processor,
    method,
    profileId: input.profile.profileId,
    profileCapabilityId: LOAD_VELOCITY_PROFILE_CAPABILITY_ID,
    profileCapabilityVersion: LOAD_VELOCITY_PROFILE_CAPABILITY_VERSION,
    profileProcessor: input.profile.processor,
    profileMethod: input.profile.method,
    profileModelClaimId: input.profile.model.modelClaimId,
    targetVelocity,
    targetVelocityAuthority: input.targetVelocityAuthority,
    estimatedExternalLoad: createQuantity({
      value: engine.estimated_load_kg,
      unit: "kg",
      dimension: "mass",
    }),
    domainClassification: engine.domain_classification,
    velocityDomainClassification,
    extrapolation: engine.extrapolation,
    sensitivity: engine.sensitivity,
    statisticalDiagnostics: {
      ...input.profile.diagnostics,
      ...engine.diagnostics,
    },
    upstreamQualifications: [
      input.profileQualification,
      ...input.profile.upstreamQualifications,
      input.targetVelocityAuthority.qualification,
    ],
    uncertainty,
    claimClass: "STATISTICALLY_ESTIMATED" as const,
    claim,
    derivation,
    recalculationHistory,
    inputFingerprint,
    applicabilityDiagnostics: applicabilityDiagnostics(
      input,
      engine.domain_classification,
      velocityDomainClassification,
    ),
    limitations: baseLimitations(input),
  });
}

function buildEstimatedInference(
  input: MaximalStrengthModelingRequestInput,
  engine: EngineSuccess,
  contract: ScientificProcessorContract,
  inputFingerprint: string,
  targetLoadEstimate: LoadAtTargetVelocityEstimate,
): EstimatedOneRepMaximumInference {
  const method = {
    id: ESTIMATED_ONE_REP_MAXIMUM_METHOD_ID,
    version: MAXIMAL_STRENGTH_METHOD_VERSION,
  };
  const processor = contract.processor;
  const configuration = configurationSnapshot();
  const generatedAt = nowInstant();
  const targetLoadClaimId = (targetLoadEstimate.claim as { claimId: string })
    .claimId;
  const targetLoadReference: ClaimReference = {
    kind: "SCIENTIFIC_CLAIM",
    ref: targetLoadClaimId,
    claimClass: "STATISTICALLY_ESTIMATED",
  };
  const profileReference = profileClaimReference(input.profile);
  const claimId = `sci7-estimated-one-rep-maximum-claim-${inputFingerprint}`;
  const uncertainty = uncertaintyFromEngine(engine.uncertainty);
  const claim = createScientificClaim({
    claimClass: "SCIENTIFIC_INFERENCE",
    claimId,
    proposition: `The positive external mass estimated at the explicitly qualified ${input.targetVelocityAuthority.semantic} target velocity is an estimated one-repetition maximum for the bound athlete, exercise, variation, movement task, phase, metric, and measurement setup; it is not a directly measured assessment fact.`,
    evidenceBasis: [targetLoadReference, profileReference],
    method,
    software: contract.software,
    assumptions: contract.assumptions,
    configuration,
    lineage: {
      parents: [targetLoadReference, profileReference],
      provenance: authorityProvenance(input),
    },
    uncertainty,
  });
  const targetNode = targetLoadEstimate.derivation;
  const targetNodeValue = targetNode.nodes.at(0);
  if (targetNodeValue === undefined)
    fail("INPUT_INVALID", "Target-load derivation node is missing.");
  const inferenceNode = {
    nodeId: `sci7-estimated-one-rep-maximum-node-${inputFingerprint}`,
    outputClaimId: claimId,
    outputClass: "SCIENTIFIC_INFERENCE" as const,
    inputs: [
      { kind: "DERIVATION_NODE" as const, ref: targetNodeValue.nodeId },
      profileReference,
    ],
    processor,
    method,
    software: contract.software,
    assumptions: contract.assumptions,
    configuration,
    createdAt: generatedAt,
    supersession: { kind: "NONE" as const },
  };
  const derivation = createDerivationGraph({
    nodes: [...targetNode.nodes, inferenceNode],
    edges: [
      {
        parentNodeId: targetNodeValue.nodeId,
        childNodeId: inferenceNode.nodeId,
        relation: "INPUT" as const,
      },
    ],
  });
  const recalculationHistory = createRecalculationHistory({
    records: [
      {
        recordId: `sci7-estimated-one-rep-maximum-recalculation-${inputFingerprint}`,
        outputClaimId: claimId,
        inputReferences: [targetLoadReference, profileReference],
        processor,
        method,
        software: contract.software,
        configuration,
        generatedAt,
        supersedesRecordId: null,
      },
    ],
  });
  return immutable({
    operation: "ESTIMATED_1RM" as const,
    processor,
    method,
    profileId: input.profile.profileId,
    profileCapabilityId: LOAD_VELOCITY_PROFILE_CAPABILITY_ID,
    profileCapabilityVersion: LOAD_VELOCITY_PROFILE_CAPABILITY_VERSION,
    profileProcessor: input.profile.processor,
    profileMethod: input.profile.method,
    profileModelClaimId: input.profile.model.modelClaimId,
    targetVelocity: input.targetVelocityAuthority.targetVelocity,
    targetVelocityAuthority: input.targetVelocityAuthority,
    estimatedOneRepMaximum: targetLoadEstimate.estimatedExternalLoad,
    targetLoadEstimate,
    domainClassification: targetLoadEstimate.domainClassification,
    velocityDomainClassification:
      targetLoadEstimate.velocityDomainClassification,
    extrapolation: targetLoadEstimate.extrapolation,
    sensitivity: targetLoadEstimate.sensitivity,
    statisticalDiagnostics: targetLoadEstimate.statisticalDiagnostics,
    upstreamQualifications: targetLoadEstimate.upstreamQualifications,
    uncertainty,
    claimClass: "SCIENTIFIC_INFERENCE" as const,
    claim,
    derivation,
    recalculationHistory,
    inputFingerprint,
    applicabilityDiagnostics: applicabilityDiagnostics(
      input,
      engine.domain_classification,
      targetLoadEstimate.velocityDomainClassification,
    ),
    limitations: [
      ...targetLoadEstimate.limitations,
      "The inferred one-repetition-maximum proposition is distinct from any measured one-repetition-maximum observation and does not adjudicate trial success.",
    ],
  });
}

export function createLoadAtTargetVelocityRequest(
  input: Omit<MaximalStrengthModelingRequestInput, "operation">,
): ScienceRequest {
  return createMaximalStrengthRequest({ ...input, operation: "TARGET_LOAD" });
}

export function createEstimatedOneRepMaximumRequest(
  input: Omit<MaximalStrengthModelingRequestInput, "operation">,
): ScienceRequest {
  return createMaximalStrengthRequest({ ...input, operation: "ESTIMATED_1RM" });
}

export function createMaximalStrengthRequest(
  input: MaximalStrengthModelingRequestInput,
): ScienceRequest {
  requireText(input.requestId, "SCI-7 request id");
  if (
    !Array.isArray(input.inputProvenance) ||
    input.inputProvenance.length === 0 ||
    !input.inputProvenance.some((reference) =>
      isPsc4SourceEvidenceType(reference.type),
    )
  ) {
    fail(
      "REQUIRED_EVIDENCE_MISSING",
      "SCI-7 requests require PSC4 input provenance.",
    );
  }
  input.inputProvenance.forEach((reference) => {
    requireReference(reference, "SCI-7 input provenance");
  });
  const targetVelocityAuthority = createTargetVelocityAuthority(
    input.targetVelocityAuthority,
  );
  const snapshot = immutable({ ...input, targetVelocityAuthority });
  return immutable({
    requestId: snapshot.requestId,
    capabilityId:
      snapshot.operation === "TARGET_LOAD"
        ? TARGET_LOAD_AT_VELOCITY_CAPABILITY_ID
        : ESTIMATED_ONE_REP_MAXIMUM_CAPABILITY_ID,
    capabilityVersion: MAXIMAL_STRENGTH_CAPABILITY_VERSION,
    subjectRef: {
      athleteId: snapshot.profile.profileContext.athleteId as never,
    },
    ...(snapshot.observedAt === undefined
      ? {}
      : { observedAt: parseInstant(snapshot.observedAt) }),
    inputs: {
      [MAXIMAL_STRENGTH_INPUT_KEY]: {
        kind: "structured",
        value: snapshot,
      },
    },
    inputProvenance: snapshot.inputProvenance,
  });
}

export class MaximalStrengthSciencePort implements SciencePort {
  readonly contract: ScientificProcessorContract;
  private readonly estimatedContract: ScientificProcessorContract;
  private readonly pythonExecutable: string;
  private readonly pythonScriptPath: string;
  private readonly engineInvoker: MaximalStrengthEngineInvoker | undefined;

  constructor(options: MaximalStrengthAdapterOptions) {
    this.contract = processorContract(options, "TARGET_LOAD");
    this.estimatedContract = processorContract(options, "ESTIMATED_1RM");
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
    const status =
      this.contract.qualification.status === "QUALIFIED" &&
      this.estimatedContract.qualification.status === "QUALIFIED"
        ? "ok"
        : "method_unavailable";
    return [
      {
        capabilityId: TARGET_LOAD_AT_VELOCITY_CAPABILITY_ID,
        status,
        description:
          "Invert a qualified SCI-6 linear load--velocity profile at an explicit compatible target velocity, with visible domain and sensitivity diagnostics.",
      },
      {
        capabilityId: ESTIMATED_ONE_REP_MAXIMUM_CAPABILITY_ID,
        status,
        description:
          "Construct an estimated one-repetition-maximum inference only from an explicitly qualified MVT or velocity-at-one-repetition-maximum target authority.",
      },
    ];
  }

  async estimateLoadAtTargetVelocity(
    input: Omit<MaximalStrengthModelingRequestInput, "operation">,
  ): Promise<MaximalStrengthComputationResult> {
    return this.compute(createLoadAtTargetVelocityRequest(input));
  }

  async estimateOneRepMaximum(
    input: Omit<MaximalStrengthModelingRequestInput, "operation">,
  ): Promise<MaximalStrengthComputationResult> {
    return this.compute(createEstimatedOneRepMaximumRequest(input));
  }

  async compute(
    request: ScienceRequest,
  ): Promise<MaximalStrengthComputationResult> {
    if (
      !isRecord(request) ||
      typeof request.requestId !== "string" ||
      typeof request.capabilityId !== "string" ||
      !isRecord(request.inputs)
    ) {
      return this.failureResult(
        request,
        "INPUT_INVALID",
        "SCI-7 request envelope is invalid.",
      );
    }
    request = immutable(request);
    if (
      request.capabilityId !== TARGET_LOAD_AT_VELOCITY_CAPABILITY_ID &&
      request.capabilityId !== ESTIMATED_ONE_REP_MAXIMUM_CAPABILITY_ID
    ) {
      return {
        requestId: request.requestId,
        capabilityId: request.capabilityId,
        status: "not_applicable",
        generatedAt: nowInstant(),
        error: {
          code: "CAPABILITY_NOT_SUPPORTED",
          message:
            "SCI-7 owns only target-load and estimated one-repetition-maximum capabilities.",
        },
      };
    }
    if (
      request.capabilityVersion !== undefined &&
      request.capabilityVersion !== MAXIMAL_STRENGTH_CAPABILITY_VERSION
    ) {
      return this.failureResult(
        request,
        "UNSUPPORTED_CONFIGURATION",
        "Unsupported SCI-7 capability version.",
      );
    }
    const operationContract =
      request.capabilityId === TARGET_LOAD_AT_VELOCITY_CAPABILITY_ID
        ? this.contract
        : this.estimatedContract;
    if (operationContract.qualification.status !== "QUALIFIED") {
      return {
        requestId: request.requestId,
        capabilityId: request.capabilityId,
        status: "method_unavailable",
        generatedAt: nowInstant(),
        error: {
          code: "PROCESSOR_NOT_QUALIFIED",
          message: "The SCI-7 processor is not qualified for execution.",
        },
      };
    }
    const structured = request.inputs[MAXIMAL_STRENGTH_INPUT_KEY];
    if (structured?.kind !== "structured" || !isRecord(structured.value)) {
      return this.failureResult(
        request,
        "REQUIRED_EVIDENCE_MISSING",
        "A structured SCI-7 modeling input is required.",
      );
    }
    try {
      const raw = structured.value as Record<string, unknown>;
      const operation = raw.operation;
      if (operation !== "TARGET_LOAD" && operation !== "ESTIMATED_1RM")
        fail("INPUT_INVALID", "SCI-7 operation is invalid.");
      const input = {
        requestId: request.requestId,
        operation,
        profile: raw.profile as LoadVelocityProfileValue,
        profileQualification:
          raw.profileQualification as QualifiedScienceArtifact,
        targetVelocityAuthority: createTargetVelocityAuthority(
          raw.targetVelocityAuthority as TargetVelocityAuthorityInput,
        ),
        inputProvenance: request.inputProvenance,
        ...(request.observedAt === undefined
          ? {}
          : { observedAt: request.observedAt }),
      } satisfies MaximalStrengthModelingRequestInput;
      if (
        input.inputProvenance.length === 0 ||
        !input.inputProvenance.some((reference) =>
          isPsc4SourceEvidenceType(reference.type),
        )
      ) {
        fail(
          "REQUIRED_EVIDENCE_MISSING",
          "SCI-7 computation requires PSC4 input provenance.",
        );
      }
      const expectedCapability =
        operation === "TARGET_LOAD"
          ? TARGET_LOAD_AT_VELOCITY_CAPABILITY_ID
          : ESTIMATED_ONE_REP_MAXIMUM_CAPABILITY_ID;
      if (request.capabilityId !== expectedCapability)
        fail(
          "INPUT_INVALID",
          "SCI-7 operation and capability identity do not agree.",
        );
      requireProfileCompatibility(input);
      requireInferenceAuthority(input);
      const payload = enginePayload(input);
      const inputFingerprint = sha256(
        canonicalJson(canonicalModelingPayload(input, operationContract)),
      );
      const engine = parseEngineResponse(
        await (this.engineInvoker === undefined
          ? runPython(payload, this.pythonExecutable, this.pythonScriptPath)
          : this.engineInvoker(payload)),
        operation,
      );
      if (engine.status === "FAILED")
        return this.failureResult(
          request,
          mapEngineFailure(engine.failure.code),
          `SCI7_FAILURE_CODE=${engine.failure.code}: ${engine.failure.message}`,
        );
      if (engine.status === "INFRASTRUCTURE_FAILED")
        return this.failureResult(
          request,
          "INPUT_INVALID",
          engine.exception.message,
          "computation_failed",
        );
      if (engine.profile_id !== input.profile.profileId)
        throw new Error("SCI-7 engine changed the profile identity.");
      if (
        Math.abs(
          engine.target_velocity_mps -
            input.targetVelocityAuthority.targetVelocity.value,
        ) >
        Math.max(
          1e-12,
          Math.abs(input.targetVelocityAuthority.targetVelocity.value) * 1e-12,
        )
      )
        throw new Error("SCI-7 engine changed the target velocity identity.");
      if (engine.operation !== operation)
        throw new Error("SCI-7 engine changed the operation identity.");
      if (engine.estimated_load_kg <= 0)
        throw new Error("SCI-7 engine returned a non-positive external mass.");
      const targetLoadEstimate = buildTargetLoadEstimate(
        input,
        engine,
        this.contract,
        inputFingerprint,
      );
      const value =
        operation === "TARGET_LOAD"
          ? targetLoadEstimate
          : buildEstimatedInference(
              input,
              engine,
              this.estimatedContract,
              inputFingerprint,
              targetLoadEstimate,
            );
      return {
        requestId: request.requestId,
        capabilityId: request.capabilityId,
        status: "ok",
        method: value.method,
        inputFingerprint,
        value,
        unit: "kg",
        dimension: "mass",
        uncertainty: value.uncertainty,
        assumptions: operationContract.assumptions.map(
          (assumption) => assumption.description,
        ),
        limitations: value.limitations,
        provenance: [
          ...authorityProvenance(input),
          {
            type: "SCI0_CLAIM",
            ref: (value.claim as { claimId: string }).claimId,
          },
        ],
        generatedAt: nowInstant(),
      };
    } catch (error) {
      if (error instanceof Sci7InputError)
        return this.failureResult(request, error.code, error.message);
      return this.failureResult(
        request,
        "INPUT_INVALID",
        error instanceof Error ? error.message : "SCI-7 computation failed.",
        "computation_failed",
      );
    }
  }

  private failureResult(
    request: Pick<ScienceRequest, "requestId" | "capabilityId">,
    code: ScientificFailureCode | string,
    message: string,
    status: "invalid_input" | "computation_failed" = "invalid_input",
  ): MaximalStrengthComputationResult {
    const resolvedStatus =
      status === "invalid_input" &&
      (code === "METHOD_NOT_APPLICABLE" ||
        code === "EXPECTED_INVERSE_RELATIONSHIP_NOT_OBSERVED")
        ? "method_unavailable"
        : status;
    return {
      requestId: request.requestId,
      capabilityId: request.capabilityId,
      status: resolvedStatus,
      generatedAt: nowInstant(),
      error: { code, message },
    };
  }
}

export function createQualifiedMaximalStrengthSoftwareProvenance(
  sourceRevision: string,
  buildId: string,
): SoftwareProvenance {
  if (!SHA_PATTERN.test(sourceRevision))
    fail(
      "INPUT_INVALID",
      "Source revision must be an exact hexadecimal commit SHA.",
    );
  return {
    packageName: "@workoutpal/science-port",
    packageVersion: "0.1.0",
    sourceRevision,
    buildId: requireText(buildId, "Build id"),
  };
}
