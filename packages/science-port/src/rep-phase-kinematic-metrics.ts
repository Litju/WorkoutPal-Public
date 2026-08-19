import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createMeasurementModalityReference,
  createPhysicalObjectReference,
  createReferenceFrameReference,
  type DirectionDescriptor,
  type MeasurementModalityReference,
  type MovementTask,
  type PhysicalObjectReference,
  type ReferenceFrameReference,
  type ScientificDefinitionRef,
} from "@workoutpal/movement-science";
import {
  type AssumptionDeclaration,
  type ClaimReference,
  type ConfigurationSnapshot,
  createDerivationGraph,
  createProcessorContract,
  createRecalculationHistory,
  createScientificClaim,
  createScientificFailure,
  type DerivationInputReference,
  isPsc4SourceEvidenceType,
  type JsonValue,
  type MechanicallyDerivedClaim,
  type MethodIdentity,
  type QualificationBinding,
  type SciencePort,
  type ScienceProvenanceRef,
  type ScienceRequest,
  type ScienceResult,
  type ScientificFailureCode,
  type ScientificProcessorContract,
  type SoftwareProvenance,
  type UncertaintyPolicy,
} from "@workoutpal/science-contract";
import {
  convertQuantity,
  createQuantity,
  type Dimension,
  type Instant,
  parseInstant,
} from "@workoutpal/shared-kernel";
import {
  type Sci2VelocityLineage,
  SEGMENTATION_CAPABILITY_ID,
  SEGMENTATION_CAPABILITY_VERSION,
  SEGMENTATION_METHOD_ID,
  SEGMENTATION_METHOD_VERSION,
  SEGMENTATION_PROCESSOR_ID,
  SEGMENTATION_PROCESSOR_VERSION,
  type SegmentationKinematicEvidence,
  type SegmentationProtocolDefinition,
} from "./segmentation.js";

export const REP_PHASE_KINEMATIC_METRICS_CAPABILITY_ID =
  "resistance_training.rep_phase_kinematic_metrics";
export const REP_PHASE_KINEMATIC_METRICS_CAPABILITY_VERSION = "1.0.0";
export const REP_PHASE_KINEMATIC_METRICS_PROCESSOR_ID =
  REP_PHASE_KINEMATIC_METRICS_CAPABILITY_ID;
export const REP_PHASE_KINEMATIC_METRICS_PROCESSOR_VERSION = "1.0.0";
export const REP_PHASE_KINEMATIC_METRICS_METHOD_ID =
  "rep_phase_metrics.sample_aligned_claim_binding";
export const REP_PHASE_KINEMATIC_METRICS_METHOD_VERSION = "1.0.0";
export const REP_PHASE_KINEMATIC_METRICS_INPUT_KEY =
  "qualified_sci3_rep_phase_intervals";

export const PHASE_DURATION_METRIC_ID = "PHASE_DURATION";
export const PHASE_SIGNED_DISPLACEMENT_METRIC_ID = "PHASE_SIGNED_DISPLACEMENT";
export const PHASE_INTERVAL_AVERAGE_SIGNED_LINEAR_VELOCITY_METRIC_ID =
  "PHASE_INTERVAL_AVERAGE_SIGNED_LINEAR_VELOCITY";
export const PHASE_DIRECTION_PEAK_SAMPLED_LINEAR_VELOCITY_METRIC_ID =
  "PHASE_DIRECTION_PEAK_SAMPLED_LINEAR_VELOCITY";
export const REP_TOTAL_DURATION_METRIC_ID = "REP_TOTAL_DURATION";

export type RepPhaseMetricId =
  | typeof PHASE_DURATION_METRIC_ID
  | typeof PHASE_SIGNED_DISPLACEMENT_METRIC_ID
  | typeof PHASE_INTERVAL_AVERAGE_SIGNED_LINEAR_VELOCITY_METRIC_ID
  | typeof PHASE_DIRECTION_PEAK_SAMPLED_LINEAR_VELOCITY_METRIC_ID
  | typeof REP_TOTAL_DURATION_METRIC_ID;

export type RepPhaseMetricScope = "PHASE" | "REPETITION";

export interface RepPhaseMetricDefinition {
  readonly id: RepPhaseMetricId;
  readonly version: "1.0.0";
  readonly scope: RepPhaseMetricScope;
  readonly definition: string;
  readonly unit: "s" | "m" | "m/s";
  readonly dimension: "time" | "length" | "speed";
  readonly method: MethodIdentity;
}

export const REP_PHASE_METRIC_DEFINITIONS: readonly RepPhaseMetricDefinition[] =
  [
    {
      id: PHASE_DURATION_METRIC_ID,
      version: "1.0.0",
      scope: "PHASE",
      definition: "Sample-aligned phase end time minus start time.",
      unit: "s",
      dimension: "time",
      method: {
        id: "phase_duration.sample_aligned_endpoint_difference",
        version: "1.0.0",
      },
    },
    {
      id: PHASE_SIGNED_DISPLACEMENT_METRIC_ID,
      version: "1.0.0",
      scope: "PHASE",
      definition:
        "Signed phase end position minus start position along the declared axis.",
      unit: "m",
      dimension: "length",
      method: {
        id: "phase_signed_displacement.endpoint_difference",
        version: "1.0.0",
      },
    },
    {
      id: PHASE_INTERVAL_AVERAGE_SIGNED_LINEAR_VELOCITY_METRIC_ID,
      version: "1.0.0",
      scope: "PHASE",
      definition:
        "The existing SCI-2 signed endpoint interval-average summary for the exact SCI-3 phase samples.",
      unit: "m/s",
      dimension: "speed",
      method: {
        id: "phase_interval_average_signed_linear_velocity.sci2_interval_summary_reuse",
        version: "1.0.0",
      },
    },
    {
      id: PHASE_DIRECTION_PEAK_SAMPLED_LINEAR_VELOCITY_METRIC_ID,
      version: "1.0.0",
      scope: "PHASE",
      definition:
        "Maximum signed sampled velocity for positive polarity or minimum signed sampled velocity for negative polarity; earliest tie wins.",
      unit: "m/s",
      dimension: "speed",
      method: {
        id: "phase_direction_peak_sampled_linear_velocity.earliest_directional_extremum",
        version: "1.0.0",
      },
    },
    {
      id: REP_TOTAL_DURATION_METRIC_ID,
      version: "1.0.0",
      scope: "REPETITION",
      definition:
        "Sample-aligned complete repetition end time minus start time.",
      unit: "s",
      dimension: "time",
      method: {
        id: "rep_total_duration.sample_aligned_endpoint_difference",
        version: "1.0.0",
      },
    },
  ] as const;

export type RepPhasePolarity = "POSITIVE" | "NEGATIVE";

export interface RepPhaseBoundary {
  readonly sample_index: number;
  readonly time_s: number;
  readonly event_type: string;
  readonly event_method: "SAMPLE_STATE_TRANSITION_NO_INTERPOLATION";
  readonly temporal_resolution_s: number;
}

export interface RepPhaseInterval {
  readonly phase_ref: Readonly<Record<string, unknown>>;
  readonly polarity: RepPhasePolarity;
  readonly start: RepPhaseBoundary;
  readonly end: RepPhaseBoundary;
  readonly duration_s: number;
  readonly excursion_m: number;
}

export interface RepPhaseRepetition {
  readonly ordinal: number;
  readonly complete: boolean;
  readonly start: RepPhaseBoundary;
  readonly end: RepPhaseBoundary;
  readonly duration_s: number;
  readonly phases: readonly RepPhaseInterval[];
  readonly dwell_intervals: readonly Readonly<Record<string, unknown>>[];
}

export interface RepPhaseSegmentationValue {
  readonly claim: MechanicallyDerivedClaim;
  readonly segmentationReference: string;
  readonly measurement: SegmentationKinematicEvidence;
  readonly sci2Lineage: Sci2VelocityLineage;
  readonly movementTask: MovementTask;
  readonly protocol: SegmentationProtocolDefinition;
  readonly qualification: QualificationBinding;
  readonly repetitions: readonly RepPhaseRepetition[];
  readonly uncertainty: Readonly<Record<string, unknown>>;
  readonly diagnostics?: Readonly<Record<string, unknown>>;
  readonly exerciseDefinition?: ScientificDefinitionRef;
  readonly exerciseVariation?: ScientificDefinitionRef;
}

export interface Sci2IntervalSummaryBinding {
  readonly id: string;
  readonly velocityClaimId: string;
  readonly qualificationReference: string;
  readonly startIndex: number;
  readonly endIndex: number;
  readonly intervalAverageVelocityMps: number;
}

export interface RepPhaseMetricRequest {
  readonly repOrdinal: number;
  readonly phaseId?: string;
  readonly metricIds: readonly RepPhaseMetricId[];
}

export interface RepPhaseKinematicMetricsRequestInput {
  readonly requestId: string;
  readonly segmentation: RepPhaseSegmentationValue;
  readonly sci2IntervalSummaries: readonly Sci2IntervalSummaryBinding[];
  readonly metricRequests: readonly RepPhaseMetricRequest[];
  readonly inputProvenance: readonly ScienceProvenanceRef[];
  readonly observedAt?: string;
  readonly athleteId?: string;
}

export interface RepPhaseKinematicMetricsAdapterOptions {
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
  readonly engineInvoker?: RepPhaseKinematicMetricsEngineInvoker;
}

export type RepPhaseKinematicMetricsEngineInvoker = (
  payload: Readonly<Record<string, unknown>>,
) => Promise<unknown>;

export interface ScientificDependencyQualification {
  readonly capabilityId: string;
  readonly capabilityVersion: string;
  readonly qualificationStatus: "QUALIFIED" | "QUALIFIED_SOFTWARE" | "UNPROVEN";
  readonly qualificationArtifact: ScienceProvenanceRef;
  readonly limitations: readonly string[];
}

interface EngineMetric {
  readonly metric_id: string;
  readonly metric_version: string;
  readonly value: number;
  readonly unit: string;
  readonly dimension: string;
  readonly selected_sample_index?: number;
  readonly selected_sample_time_s?: number;
}

interface EnginePhaseResult {
  readonly interval_id: string;
  readonly rep_ordinal: number;
  readonly phase_id: string;
  readonly phase_ordinal: number;
  readonly phase_action: string;
  readonly polarity: RepPhasePolarity;
  readonly start_index: number;
  readonly end_index: number;
  readonly start_time_s: number;
  readonly end_time_s: number;
  readonly interval_authority: string;
  readonly qualification_reference: string;
  readonly sci2_interval_summary_id: string | null;
  readonly metrics: readonly EngineMetric[];
}

interface EngineRepResult {
  readonly rep_ordinal: number;
  readonly start_index: number;
  readonly end_index: number;
  readonly start_time_s: number;
  readonly end_time_s: number;
  readonly metrics: readonly EngineMetric[];
}

interface EngineSuccess {
  readonly status: "SUCCEEDED";
  readonly processor: MethodIdentity;
  readonly method: MethodIdentity;
  readonly timebase: {
    readonly declared_step_s: number;
    readonly declared_sample_count: number;
  };
  readonly phase_results: readonly EnginePhaseResult[];
  readonly rep_results: readonly EngineRepResult[];
  readonly uncertainty: Readonly<Record<string, unknown>>;
  readonly diagnostics: Readonly<Record<string, unknown>>;
}

interface EngineFailureResponse {
  readonly status: "FAILED";
  readonly failure: {
    readonly code: string;
    readonly message: string;
    readonly details: readonly {
      readonly key: string;
      readonly value: string;
    }[];
  };
}

interface EngineInfrastructureFailure {
  readonly status: "INFRASTRUCTURE_FAILED";
  readonly exception: {
    readonly code: "INFRASTRUCTURE_EXCEPTION";
    readonly message: string;
    readonly details: readonly {
      readonly key: string;
      readonly value: string;
    }[];
  };
}

type EngineResponse =
  | EngineSuccess
  | EngineFailureResponse
  | EngineInfrastructureFailure;

interface CanonicalSample {
  readonly sample_index: number;
  readonly time_s: number;
  readonly position_m: number;
  readonly velocity_mps: number;
}

interface ValidatedMetricRequest {
  readonly repOrdinal: number;
  readonly phaseId: string | null;
  readonly metricIds: readonly RepPhaseMetricId[];
}

interface ValidatedInput {
  readonly segmentation: RepPhaseSegmentationValue;
  readonly provenance: readonly ScienceProvenanceRef[];
  readonly samples: readonly CanonicalSample[];
  readonly declaredStepSeconds: number;
  readonly metricRequests: readonly ValidatedMetricRequest[];
  readonly phaseIntervals: readonly Readonly<Record<string, unknown>>[];
  readonly repIntervals: readonly Readonly<Record<string, unknown>>[];
  readonly inputSummaries: readonly Sci2IntervalSummaryBinding[];
}

const SHA_PATTERN = /^[0-9a-f]{40,64}$/iu;
const FAILURE_CODES = new Set<ScientificFailureCode>([
  "REQUIRED_EVIDENCE_MISSING",
  "INPUT_INVALID",
  "DIMENSION_MISMATCH",
  "POSITION_DIMENSION_MISMATCH",
  "TIME_DIMENSION_MISMATCH",
  "INSUFFICIENT_SAMPLES",
  "NON_FINITE_SAMPLE",
  "NON_MONOTONIC_TIME",
  "DUPLICATE_TIMESTAMP",
  "SAMPLING_INTERVAL_INVALID",
  "MISSING_SAMPLE_UNSUPPORTED",
  "IRREGULAR_TIMEBASE_UNSUPPORTED",
  "OBJECT_BINDING_MISSING",
  "MEASUREMENT_POINT_BINDING_MISSING",
  "REFERENCE_FRAME_MISSING",
  "AXIS_BINDING_MISSING",
  "TRIAL_INVALID",
  "TRIAL_EXCLUDED",
  "PROTOCOL_INCOMPATIBLE",
  "CALIBRATION_REQUIREMENT_UNSATISFIED",
  "METHOD_NOT_APPLICABLE",
  "UNSUPPORTED_CONFIGURATION",
]);

function nowInstant(): Instant {
  return parseInstant(new Date().toISOString());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0)
    throw new Error(`${label} is required.`);
  return value.trim();
}

function sameIdentity(
  left: ScientificDefinitionRef,
  right: ScientificDefinitionRef,
): boolean {
  return (
    left.id === right.id &&
    left.version === right.version &&
    left.revision === right.revision
  );
}

function sameFrame(
  left: ReferenceFrameReference,
  right: ReferenceFrameReference,
): boolean {
  return (
    left.frameKind === right.frameKind &&
    left.frameId === right.frameId &&
    left.convention === right.convention
  );
}

function canonicalJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function configurationSnapshot(): ConfigurationSnapshot {
  const parameters = {
    intervalAuthority: "SCI3_AUTOMATIC_SEGMENTATION",
    boundaryPolicy: "SAMPLE_ALIGNED_ONLY",
    filtering: "NONE_ADDED",
    interpolation: "NONE",
    peakPolarityPolicy: "POSITIVE_MAXIMUM_NEGATIVE_MINIMUM",
    peakTiePolicy: "EARLIEST_SAMPLE",
    averageVelocityPolicy: "REUSE_SCI2_INTERVAL_SUMMARY",
    realWorldSegmentationValidated: "NO",
  } as const satisfies Readonly<Record<string, JsonValue>>;
  const serialization = canonicalJson(parameters);
  return {
    id: `${REP_PHASE_KINEMATIC_METRICS_PROCESSOR_ID}.configuration`,
    parameters,
    canonicalSerialization: serialization,
    contentHash: sha256(serialization),
  };
}

function qualificationBinding(
  options: RepPhaseKinematicMetricsAdapterOptions,
  processor: MethodIdentity,
  method: MethodIdentity,
): QualificationBinding {
  const qualification = options.qualification;
  if (qualification === undefined || qualification === null) {
    return {
      status: "NOT_QUALIFIED",
      reason: "SCI-4 qualification evidence is not bound.",
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
        "SCI-4 qualification must match software provenance and an exact source SHA.",
    };
  }
  return {
    status: "QUALIFIED",
    identity: {
      qualificationId: requireText(
        qualification.qualificationId,
        "Qualification id",
      ),
      qualificationVersion: requireText(
        qualification.qualificationVersion,
        "Qualification version",
      ),
      processor,
      method,
      software: options.software,
      oracle: {
        id: requireText(qualification.oracle.id, "Qualification oracle id"),
        version: requireText(
          qualification.oracle.version,
          "Qualification oracle version",
        ),
      },
      validationData: {
        id: requireText(
          qualification.validationData.id,
          "Qualification validation data id",
        ),
        version: requireText(
          qualification.validationData.version,
          "Qualification validation data version",
        ),
      },
    },
  };
}

function assumptions(): readonly AssumptionDeclaration[] {
  return [
    {
      id: "sci2-interval-summary-reuse",
      version: "1.0.0",
      description:
        "Phase interval-average velocity is reused from the exact SCI-2 interval summary; SCI-4 does not duplicate the SCI-2 numerical algorithm.",
      reference: {
        type: "REPOSITORY_AUTHORITY",
        ref: "public-scientific-contract:SCI-2:processor-contract",
      },
      status: "DECLARED",
      parameters: { owner: "SCI2", recomputation: "NONE" },
    },
    {
      id: "sci3-sampled-boundary-authority",
      version: "1.0.0",
      description:
        "Repetition and phase boundaries are consumed from SCI-3 sample-aligned output and are never detected or moved by SCI-4.",
      reference: {
        type: "REPOSITORY_AUTHORITY",
        ref: "public-scientific-contract:SCI-3:event-and-phase-authority",
      },
      status: "DECLARED",
      parameters: { intervalAuthority: "SCI3_AUTOMATIC_SEGMENTATION" },
    },
    {
      id: "direction-aware-sampled-extremum",
      version: "1.0.0",
      description:
        "The selected phase extremum retains signed velocity, uses maximum for positive polarity and minimum for negative polarity, and resolves ties by earliest sample.",
      reference: {
        type: "REPOSITORY_AUTHORITY",
        ref: "public-scientific-contract:SCI-4:terminology-adjudication",
      },
      status: "DECLARED",
      parameters: { continuousPeak: "NOT_CLAIMED", filtering: "NONE" },
    },
    {
      id: "real-world-segmentation-limitation",
      version: "1.0.0",
      description:
        "SCI-3 empirical real-world segmentation validation is not upgraded by SCI-4 and remains visible in every result.",
      reference: {
        type: "REPOSITORY_AUTHORITY",
        ref: "public-scientific-contract:SCI-3:final-qualification",
      },
      status: "DECLARED",
      parameters: { REAL_WORLD_SEGMENTATION_VALIDATED: "NO" },
    },
  ];
}

function uncertaintyPolicy(): UncertaintyPolicy {
  const unknown = (reason: string) => ({ kind: "UNKNOWN" as const, reason });
  return {
    measurement: unknown(
      "Input measurement uncertainty is not supplied to SCI-4 v1.",
    ),
    statistical: unknown("SCI-4 v1 computes no population statistic."),
    model: unknown("SCI-4 v1 uses no biomechanical model."),
    propagated: unknown(
      "No defensible uncertainty propagation model is bound.",
    ),
    output: "UNKNOWN_ALLOWED",
  };
}

function processorContract(
  options: RepPhaseKinematicMetricsAdapterOptions,
): ScientificProcessorContract {
  const processor = {
    id: REP_PHASE_KINEMATIC_METRICS_PROCESSOR_ID,
    version: REP_PHASE_KINEMATIC_METRICS_PROCESSOR_VERSION,
  };
  const method = {
    id: REP_PHASE_KINEMATIC_METRICS_METHOD_ID,
    version: REP_PHASE_KINEMATIC_METRICS_METHOD_VERSION,
  };
  return createProcessorContract({
    processor,
    method,
    software: options.software,
    inputs: [
      {
        id: REP_PHASE_KINEMATIC_METRICS_INPUT_KEY,
        source: "SCIENTIFIC_CLAIM",
        required: true,
        acceptedClaimClasses: ["MECHANICALLY_DERIVED"],
        dimensions: [] as readonly Dimension[],
        units: [],
        acceptedValidityStates: ["VALID"],
        acceptedExclusionStates: ["INCLUDED"],
        acceptedMissingness: ["NOT_APPLICABLE"],
        protocol: { kind: "NONE" },
      },
      {
        id: "sci2-interval-summary-bindings",
        source: "SCIENTIFIC_CLAIM",
        required: true,
        acceptedClaimClasses: ["MECHANICALLY_DERIVED"],
        dimensions: [] as readonly Dimension[],
        units: [],
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
    output: { claimClass: "MECHANICALLY_DERIVED", valueKind: "REFERENCE" },
    assumptions: assumptions(),
    calibration: {
      kind: "OPTIONAL",
      acceptedStatuses: ["CALIBRATED", "NOT_REQUIRED"],
    },
    uncertainty: uncertaintyPolicy(),
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

function structuredFailure(
  request: ScienceRequest,
  code: ScientificFailureCode,
  message: string,
): ScienceResult {
  const failure = createScientificFailure({ code, message, details: [] });
  const status =
    code === "REQUIRED_EVIDENCE_MISSING" || code === "INSUFFICIENT_SAMPLES"
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
        : REP_PHASE_KINEMATIC_METRICS_CAPABILITY_ID,
    status: "invalid_input",
    generatedAt: nowInstant(),
    error: {
      code: "REQUIRED_EVIDENCE_MISSING",
      message:
        "A ScienceRequest must include requestId, inputs, and inputProvenance.",
    },
  };
}

function inputRecord(request: ScienceRequest): Record<string, unknown> | null {
  const input = request.inputs[REP_PHASE_KINEMATIC_METRICS_INPUT_KEY];
  if (input?.kind !== "structured" || !isRecord(input.value)) return null;
  return input.value;
}

function metricDefinition(
  metricId: RepPhaseMetricId,
): RepPhaseMetricDefinition {
  const definition = REP_PHASE_METRIC_DEFINITIONS.find(
    (candidate) => candidate.id === metricId,
  );
  if (definition === undefined)
    throw new Error(`Unsupported SCI-4 metric ${metricId}.`);
  return definition;
}

function validateBoundary(
  boundary: RepPhaseBoundary,
  samples: readonly CanonicalSample[],
  declaredStep: number,
): void {
  if (
    !isInteger(boundary.sample_index) ||
    boundary.sample_index < 0 ||
    boundary.sample_index >= samples.length
  )
    throw new Error("INTERVAL_INVALID: boundary sample index is out of range.");
  const sample = samples[boundary.sample_index];
  if (
    sample === undefined ||
    !isFiniteNumber(boundary.time_s) ||
    Math.abs(boundary.time_s - sample.time_s) >
      Math.max(1e-12, declaredStep * 1e-9) ||
    boundary.event_method !== "SAMPLE_STATE_TRANSITION_NO_INTERPOLATION" ||
    !isFiniteNumber(boundary.temporal_resolution_s) ||
    Math.abs(boundary.temporal_resolution_s - declaredStep) >
      Math.max(1e-12, declaredStep * 1e-9)
  )
    throw new Error("INTERVAL_INVALID: SCI-3 boundary is not sample-aligned.");
}

function normalizeSamples(evidence: SegmentationKinematicEvidence): {
  readonly samples: readonly CanonicalSample[];
  readonly step: number;
} {
  if (!Array.isArray(evidence.samples) || evidence.samples.length < 2)
    throw new Error("INSUFFICIENT_SAMPLES: SCI-4 requires aligned samples.");
  if (
    evidence.timebase.missingSamplePolicy !== "REJECT" ||
    evidence.timebase.irregularSamplingPolicy !== "REJECT" ||
    evidence.timebase.declaredSampleCount !== evidence.samples.length
  )
    throw new Error(
      "MISSING_SAMPLE_UNSUPPORTED: SCI-4 requires a complete sample series.",
    );
  const step = convertQuantity(
    createQuantity({
      value: evidence.timebase.declaredSamplingInterval,
      unit: evidence.timebase.declaredSamplingIntervalUnit,
      dimension: "time",
    }),
    "s",
  ).value;
  if (!Number.isFinite(step) || step <= 0)
    throw new Error(
      "SAMPLING_INTERVAL_INVALID: declared sampling interval must be positive.",
    );
  let previousTime: number | undefined;
  const samples = evidence.samples.map((sample, index) => {
    if (
      !isInteger(sample.sampleIndex) ||
      sample.sampleIndex !== index ||
      !isFiniteNumber(sample.time) ||
      !isFiniteNumber(sample.position) ||
      !isFiniteNumber(sample.velocity)
    )
      throw new Error(
        "NON_FINITE_SAMPLE: sample values and indexes must be finite and aligned.",
      );
    const time = convertQuantity(
      createQuantity({
        value: sample.time,
        unit: evidence.timeUnit,
        dimension: "time",
      }),
      "s",
    ).value;
    const position = convertQuantity(
      createQuantity({
        value: sample.position,
        unit: evidence.positionUnit,
        dimension: "length",
      }),
      "m",
    ).value;
    const velocity = convertQuantity(
      createQuantity({
        value: sample.velocity,
        unit: evidence.velocityUnit,
        dimension: "speed",
      }),
      "m/s",
    ).value;
    if (previousTime !== undefined) {
      const difference = time - previousTime;
      if (difference === 0)
        throw new Error("DUPLICATE_TIMESTAMP: timestamps must be unique.");
      if (difference < 0)
        throw new Error("NON_MONOTONIC_TIME: timestamps must increase.");
      const tolerance = Math.max(
        1e-12,
        1e-9 * Math.max(Math.abs(difference), Math.abs(step), 1),
      );
      if (Math.abs(difference - step) > tolerance)
        throw new Error(
          "IRREGULAR_TIMEBASE_UNSUPPORTED: samples must be uniform.",
        );
    }
    previousTime = time;
    return {
      sample_index: index,
      time_s: time,
      position_m: position,
      velocity_mps: velocity,
    };
  });
  return { samples, step };
}

function validateUpstream(
  segmentation: RepPhaseSegmentationValue,
  samples: readonly CanonicalSample[],
  declaredStep: number,
): void {
  if (segmentation.claim.claimClass !== "MECHANICALLY_DERIVED")
    throw new Error(
      "PROTOCOL_INCOMPATIBLE: SCI-3 claim must be mechanically derived.",
    );
  requireText(segmentation.claim.claimId, "SCI-3 claim id");
  requireText(
    segmentation.segmentationReference,
    "SCI-3 segmentation reference",
  );
  if (segmentation.movementTask.kind !== "MOVEMENT_TASK")
    throw new Error(
      "PROTOCOL_INCOMPATIBLE: MovementTask identity is required.",
    );
  if (
    !sameIdentity(segmentation.protocol.movementTask, segmentation.movementTask)
  )
    throw new Error(
      "PROTOCOL_INCOMPATIBLE: SCI-3 protocol MovementTask mismatch.",
    );
  if (
    segmentation.protocol.filteringPolicy !== "NONE_ONLY" ||
    segmentation.protocol.interpolationPolicy !== "NONE_ONLY" ||
    segmentation.protocol.boundaryPolicy !== "SAMPLED_ONLY_NO_INTERPOLATION"
  )
    throw new Error(
      "UNSUPPORTED_CONFIGURATION: SCI-3 filtering/interpolation boundary policy is not accepted.",
    );
  if (
    segmentation.qualification.status !== "QUALIFIED" ||
    segmentation.qualification.identity.processor.id !==
      SEGMENTATION_PROCESSOR_ID ||
    segmentation.qualification.identity.processor.version !==
      SEGMENTATION_PROCESSOR_VERSION ||
    segmentation.qualification.identity.method.id !== SEGMENTATION_METHOD_ID ||
    segmentation.qualification.identity.method.version !==
      SEGMENTATION_METHOD_VERSION
  )
    throw new Error(
      "PROTOCOL_INCOMPATIBLE: SCI-3 qualification binding is incomplete or mismatched.",
    );
  const sci2 = segmentation.sci2Lineage;
  if (
    sci2.qualification.status !== "QUALIFIED" ||
    sci2.processor.id !== "resistance_training.linear_velocity_from_position" ||
    sci2.processor.version !== "1.0.0" ||
    sci2.method.id !== "finite_difference.second_order_uniform" ||
    sci2.method.version !== "1.0.0" ||
    !SHA_PATTERN.test(sci2.software.sourceRevision) ||
    sci2.qualification.sourceRevision !== sci2.software.sourceRevision ||
    sci2.qualification.buildId !== sci2.software.buildId
  )
    throw new Error(
      "PROTOCOL_INCOMPATIBLE: SCI-2 qualification lineage is incomplete or mismatched.",
    );
  requireText(sci2.claimId, "SCI-2 claim id");
  const evidence = segmentation.measurement;
  const objectOfInterest = createPhysicalObjectReference(
    evidence.objectOfInterest,
  );
  const measurementPoint = createPhysicalObjectReference(
    evidence.measurementPoint,
  );
  if (measurementPoint.objectKind !== "MEASUREMENT_POINT")
    throw new Error(
      "MEASUREMENT_POINT_BINDING_MISSING: measurement point kind is required.",
    );
  const frame = createReferenceFrameReference(evidence.referenceFrame);
  const axis = {
    ...evidence.axis,
    frame: createReferenceFrameReference(evidence.axis.frame),
  };
  if (!sameFrame(frame, axis.frame))
    throw new Error(
      "AXIS_BINDING_MISSING: axis and measurement frame must match.",
    );
  createMeasurementModalityReference(evidence.modality);
  if (
    evidence.quality.input !== "VALID" ||
    evidence.quality.acquisition !== "VALID"
  )
    throw new Error(
      "INPUT_INVALID: upstream acquisition/input quality must be VALID.",
    );
  if (evidence.quality.trial !== "VALID")
    throw new Error("TRIAL_INVALID: upstream trial must be VALID.");
  if (evidence.quality.exclusion === "EXCLUDED")
    throw new Error(
      "TRIAL_EXCLUDED: excluded trials cannot produce SCI-4 metrics.",
    );
  if (evidence.quality.protocol !== "APPLICABLE")
    throw new Error(
      "PROTOCOL_INCOMPATIBLE: upstream protocol must be applicable.",
    );
  if (
    evidence.calibrationStatus !== "CALIBRATED" &&
    evidence.calibrationStatus !== "NOT_REQUIRED"
  )
    throw new Error(
      "CALIBRATION_REQUIREMENT_UNSATISFIED: input calibration is not accepted.",
    );
  if (segmentation.repetitions.length === 0)
    throw new Error(
      "REQUIRED_EVIDENCE_MISSING: SCI-3 must provide repetitions.",
    );
  if (segmentation.protocol.expectedPhaseSequence.length !== 2)
    throw new Error(
      "PROTOCOL_INCOMPATIBLE: SCI-4 requires the SCI-3 v1 two-phase protocol.",
    );
  const ordinals = new Set<number>();
  for (const repetition of segmentation.repetitions) {
    if (
      !isInteger(repetition.ordinal) ||
      repetition.ordinal < 1 ||
      ordinals.has(repetition.ordinal)
    )
      throw new Error(
        "PROTOCOL_INCOMPATIBLE: repetition ordinals must be unique positive integers.",
      );
    ordinals.add(repetition.ordinal);
    if (repetition.complete !== true || repetition.phases.length !== 2)
      throw new Error(
        "PROTOCOL_INCOMPATIBLE: SCI-4 requires complete SCI-3 two-phase repetitions.",
      );
    validateBoundary(repetition.start, samples, declaredStep);
    validateBoundary(repetition.end, samples, declaredStep);
    if (repetition.end.sample_index <= repetition.start.sample_index)
      throw new Error(
        "INTERVAL_INVALID: repetition interval must have positive duration.",
      );
    for (const [phaseIndex, phase] of repetition.phases.entries()) {
      validateBoundary(phase.start, samples, declaredStep);
      validateBoundary(phase.end, samples, declaredStep);
      if (phase.end.sample_index <= phase.start.sample_index)
        throw new Error(
          "INTERVAL_INVALID: phase interval must have positive duration.",
        );
      if (phase.polarity !== "POSITIVE" && phase.polarity !== "NEGATIVE")
        throw new Error(
          "PROTOCOL_INCOMPATIBLE: phase polarity is unsupported.",
        );
      const phaseRef = phase.phase_ref;
      requireText(phaseRef.phase_id, "SCI-3 phase id");
      const expectedPhase =
        segmentation.protocol.expectedPhaseSequence[phaseIndex];
      if (
        expectedPhase === undefined ||
        phaseRef.phase_id !== expectedPhase.phaseId ||
        phaseRef.phase_ordinal !== expectedPhase.phaseOrdinal ||
        phaseRef.phase_action !== expectedPhase.phaseAction ||
        phase.polarity !== expectedPhase.polarity
      )
        throw new Error(
          "PROTOCOL_INCOMPATIBLE: SCI-3 phase output does not match the versioned protocol sequence.",
        );
      if (
        !sameIdentity(
          phaseRef.movement_task as ScientificDefinitionRef,
          segmentation.movementTask,
        )
      )
        throw new Error(
          "PROTOCOL_INCOMPATIBLE: phase MovementTask identity mismatch.",
        );
      if (
        phase.start.sample_index < repetition.start.sample_index ||
        phase.end.sample_index > repetition.end.sample_index
      )
        throw new Error(
          "INTERVAL_INVALID: phase interval is outside its repetition.",
        );
    }
    const firstPhase = repetition.phases[0];
    const lastPhase = repetition.phases[repetition.phases.length - 1];
    if (
      firstPhase === undefined ||
      lastPhase === undefined ||
      repetition.start.sample_index !== firstPhase.start.sample_index ||
      repetition.end.sample_index !== lastPhase.end.sample_index
    )
      throw new Error(
        "INTERVAL_INVALID: SCI-3 repetition boundaries must enclose its phase boundaries.",
      );
  }
  if (
    objectOfInterest.objectId.length === 0 ||
    evidence.assessmentId.trim().length === 0 ||
    evidence.trialId.trim().length === 0
  )
    throw new Error(
      "REQUIRED_EVIDENCE_MISSING: assessment, trial, and object bindings are required.",
    );
}

function summaryForPhase(
  summaries: readonly Sci2IntervalSummaryBinding[],
  segmentation: RepPhaseSegmentationValue,
  startIndex: number,
  endIndex: number,
): Sci2IntervalSummaryBinding | undefined {
  const matches = summaries.filter(
    (summary) =>
      summary.startIndex === startIndex &&
      summary.endIndex === endIndex &&
      summary.velocityClaimId === segmentation.sci2Lineage.claimId,
  );
  if (matches.length > 1)
    throw new Error(
      "PROTOCOL_INCOMPATIBLE: multiple SCI-2 summaries bind one phase interval.",
    );
  return matches[0];
}

function validateMetricRequests(
  input: RepPhaseKinematicMetricsRequestInput,
  segmentation: RepPhaseSegmentationValue,
  samples: readonly CanonicalSample[],
  declaredStep: number,
): {
  readonly requests: readonly ValidatedMetricRequest[];
  readonly phases: readonly Readonly<Record<string, unknown>>[];
  readonly repetitions: readonly Readonly<Record<string, unknown>>[];
} {
  if (input.metricRequests.length === 0)
    throw new Error(
      "REQUIRED_EVIDENCE_MISSING: at least one SCI-4 metric request is required.",
    );
  const requests: ValidatedMetricRequest[] = [];
  const keys = new Set<string>();
  const phases: Readonly<Record<string, unknown>>[] = [];
  const repetitions: Readonly<Record<string, unknown>>[] = [];
  for (const request of input.metricRequests) {
    if (!isInteger(request.repOrdinal) || request.repOrdinal < 1)
      throw new Error(
        "PROTOCOL_INCOMPATIBLE: metric request repetition ordinal is invalid.",
      );
    const repetition = segmentation.repetitions.find(
      (candidate) => candidate.ordinal === request.repOrdinal,
    );
    if (repetition === undefined)
      throw new Error(
        "PROTOCOL_INCOMPATIBLE: metric request repetition is absent from SCI-3.",
      );
    if (!Array.isArray(request.metricIds) || request.metricIds.length === 0)
      throw new Error(
        "REQUIRED_EVIDENCE_MISSING: metric request ids are required.",
      );
    const metricIds = [...new Set(request.metricIds)];
    if (metricIds.length !== request.metricIds.length)
      throw new Error(
        "UNSUPPORTED_CONFIGURATION: duplicate metric request ids are not accepted.",
      );
    const phaseId = request.phaseId ?? null;
    const phase =
      phaseId === null
        ? undefined
        : repetition.phases.find(
            (candidate) => candidate.phase_ref.phase_id === phaseId,
          );
    if (phaseId !== null && phase === undefined)
      throw new Error(
        "PROTOCOL_INCOMPATIBLE: metric request phase is absent from SCI-3.",
      );
    for (const metricId of metricIds) {
      const definition = metricDefinition(metricId);
      if (definition.scope === "PHASE" && phase === undefined)
        throw new Error(
          "PROTOCOL_INCOMPATIBLE: phase metric requires a phase id.",
        );
      if (definition.scope === "REPETITION" && phase !== undefined)
        throw new Error(
          "PROTOCOL_INCOMPATIBLE: repetition metric cannot bind a phase.",
        );
      const key = `${request.repOrdinal}:${phaseId ?? "REP"}:${metricId}`;
      if (keys.has(key))
        throw new Error("UNSUPPORTED_CONFIGURATION: duplicate metric binding.");
      keys.add(key);
    }
    requests.push({ repOrdinal: request.repOrdinal, phaseId, metricIds });
    if (phase !== undefined) {
      const phaseIdText = requireText(
        phase.phase_ref.phase_id,
        "SCI-3 phase id",
      );
      const summary = summaryForPhase(
        input.sci2IntervalSummaries,
        segmentation,
        phase.start.sample_index,
        phase.end.sample_index,
      );
      if (
        metricIds.includes(
          PHASE_INTERVAL_AVERAGE_SIGNED_LINEAR_VELOCITY_METRIC_ID,
        ) &&
        summary === undefined
      )
        throw new Error(
          "PROTOCOL_INCOMPATIBLE: SCI-2 interval-average summary does not bind the SCI-3 phase.",
        );
      const intervalId = `${segmentation.claim.claimId}:rep-${request.repOrdinal}:phase-${phaseIdText}`;
      phases.push({
        id: intervalId,
        rep_ordinal: request.repOrdinal,
        phase_id: phaseIdText,
        phase_ordinal: phase.phase_ref.phase_ordinal,
        phase_action: phase.phase_ref.phase_action,
        polarity: phase.polarity,
        start_index: phase.start.sample_index,
        end_index: phase.end.sample_index,
        interval_authority: "SCI3_AUTOMATIC_SEGMENTATION",
        qualification_reference:
          summary?.qualificationReference ??
          `${segmentation.segmentationReference}:rep-${request.repOrdinal}:phase-${phaseIdText}`,
        requested_metric_ids: metricIds,
      });
    } else {
      validateBoundary(repetition.start, samples, declaredStep);
      validateBoundary(repetition.end, samples, declaredStep);
      repetitions.push({
        rep_ordinal: request.repOrdinal,
        start_index: repetition.start.sample_index,
        end_index: repetition.end.sample_index,
        requested_metric_ids: metricIds,
      });
    }
  }
  return { requests, phases, repetitions };
}

function validateInput(
  request: ScienceRequest,
): ValidatedInput | ScienceResult {
  const record = inputRecord(request);
  if (record === null)
    return structuredFailure(
      request,
      "REQUIRED_EVIDENCE_MISSING",
      "A structured SCI-3 segmentation input is required.",
    );
  const provenance = request.inputProvenance.filter(
    (reference): reference is ScienceProvenanceRef =>
      isRecord(reference) &&
      typeof reference.type === "string" &&
      typeof reference.ref === "string" &&
      reference.ref.trim().length > 0 &&
      isPsc4SourceEvidenceType(reference.type),
  );
  if (provenance.length === 0)
    return structuredFailure(
      request,
      "REQUIRED_EVIDENCE_MISSING",
      "SCI-4 requires PSC4 source-evidence provenance.",
    );
  try {
    const input = record as unknown as RepPhaseKinematicMetricsRequestInput;
    const normalized = normalizeSamples(input.segmentation.measurement);
    validateUpstream(input.segmentation, normalized.samples, normalized.step);
    if (input.sci2IntervalSummaries.length === 0)
      throw new Error(
        "REQUIRED_EVIDENCE_MISSING: SCI-2 interval summaries are required.",
      );
    for (const summary of input.sci2IntervalSummaries) {
      requireText(summary.id, "SCI-2 interval summary id");
      requireText(summary.velocityClaimId, "SCI-2 velocity claim id");
      requireText(
        summary.qualificationReference,
        "SCI-2 qualification reference",
      );
      if (
        !isInteger(summary.startIndex) ||
        !isInteger(summary.endIndex) ||
        summary.startIndex < 0 ||
        summary.endIndex >= normalized.samples.length ||
        summary.endIndex <= summary.startIndex
      )
        throw new Error(
          "PROTOCOL_INCOMPATIBLE: SCI-2 interval summary indexes are invalid.",
        );
      if (!isFiniteNumber(summary.intervalAverageVelocityMps))
        throw new Error(
          "NON_FINITE_SAMPLE: SCI-2 interval average must be finite.",
        );
    }
    const metricValidation = validateMetricRequests(
      input,
      input.segmentation,
      normalized.samples,
      normalized.step,
    );
    return {
      segmentation: input.segmentation,
      provenance,
      samples: normalized.samples,
      declaredStepSeconds: normalized.step,
      metricRequests: metricValidation.requests,
      phaseIntervals: metricValidation.phases,
      repIntervals: metricValidation.repetitions,
      inputSummaries: input.sci2IntervalSummaries,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid SCI-4 input.";
    const code: ScientificFailureCode = message.includes("INSUFFICIENT_SAMPLES")
      ? "INSUFFICIENT_SAMPLES"
      : message.includes("NON_FINITE")
        ? "NON_FINITE_SAMPLE"
        : message.includes("DUPLICATE")
          ? "DUPLICATE_TIMESTAMP"
          : message.includes("NON_MONOTONIC")
            ? "NON_MONOTONIC_TIME"
            : message.includes("IRREGULAR")
              ? "IRREGULAR_TIMEBASE_UNSUPPORTED"
              : message.includes("SAMPLING_INTERVAL")
                ? "SAMPLING_INTERVAL_INVALID"
                : message.includes("MISSING_SAMPLE")
                  ? "MISSING_SAMPLE_UNSUPPORTED"
                  : message.includes("MEASUREMENT_POINT")
                    ? "MEASUREMENT_POINT_BINDING_MISSING"
                    : message.includes("AXIS_BINDING")
                      ? "AXIS_BINDING_MISSING"
                      : message.includes("TRIAL_EXCLUDED")
                        ? "TRIAL_EXCLUDED"
                        : message.includes("TRIAL_INVALID")
                          ? "TRIAL_INVALID"
                          : message.includes("CALIBRATION")
                            ? "CALIBRATION_REQUIREMENT_UNSATISFIED"
                            : message.includes("UNSUPPORTED_CONFIGURATION")
                              ? "UNSUPPORTED_CONFIGURATION"
                              : message.includes("REQUIRED_EVIDENCE")
                                ? "REQUIRED_EVIDENCE_MISSING"
                                : message.includes("PROTOCOL") ||
                                    message.includes("INTERVAL")
                                  ? "PROTOCOL_INCOMPATIBLE"
                                  : "INPUT_INVALID";
    return structuredFailure(request, code, message);
  }
}

function canonicalPayload(
  validated: ValidatedInput,
): Readonly<Record<string, unknown>> {
  return {
    samples: validated.samples,
    timebase: {
      declared_step_s: validated.declaredStepSeconds,
      declared_sample_count: validated.samples.length,
    },
    sci2_claim_id: validated.segmentation.sci2Lineage.claimId,
    phase_intervals: validated.phaseIntervals,
    rep_intervals: validated.repIntervals,
    sci2_interval_summaries: validated.inputSummaries.map((summary) => ({
      id: summary.id,
      velocity_claim_id: summary.velocityClaimId,
      qualification_reference: summary.qualificationReference,
      start_index: summary.startIndex,
      end_index: summary.endIndex,
      interval_average_velocity_mps: summary.intervalAverageVelocityMps,
    })),
    configuration: configurationSnapshot().parameters,
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

function parseEngineResponse(value: unknown): EngineResponse {
  if (!isRecord(value) || typeof value.status !== "string")
    throw new Error(
      "SCI-4 Python engine returned an invalid response envelope.",
    );
  if (value.status === "FAILED") {
    if (
      !isRecord(value.failure) ||
      typeof value.failure.code !== "string" ||
      typeof value.failure.message !== "string" ||
      !Array.isArray(value.failure.details)
    )
      throw new Error(
        "SCI-4 Python engine returned an invalid failure payload.",
      );
    return value as unknown as EngineFailureResponse;
  }
  if (value.status === "INFRASTRUCTURE_FAILED") {
    if (
      !isRecord(value.exception) ||
      value.exception.code !== "INFRASTRUCTURE_EXCEPTION" ||
      typeof value.exception.message !== "string" ||
      !Array.isArray(value.exception.details)
    )
      throw new Error(
        "SCI-4 Python engine returned an invalid infrastructure payload.",
      );
    return value as unknown as EngineInfrastructureFailure;
  }
  if (
    value.status !== "SUCCEEDED" ||
    !expectedIdentity(value.processor, {
      id: REP_PHASE_KINEMATIC_METRICS_PROCESSOR_ID,
      version: REP_PHASE_KINEMATIC_METRICS_PROCESSOR_VERSION,
    }) ||
    !expectedIdentity(value.method, {
      id: REP_PHASE_KINEMATIC_METRICS_METHOD_ID,
      version: REP_PHASE_KINEMATIC_METRICS_METHOD_VERSION,
    }) ||
    !isRecord(value.timebase) ||
    !isFiniteNumber(value.timebase.declared_step_s) ||
    !isInteger(value.timebase.declared_sample_count) ||
    !Array.isArray(value.phase_results) ||
    !Array.isArray(value.rep_results) ||
    !isRecord(value.uncertainty) ||
    !isRecord(value.diagnostics)
  )
    throw new Error("SCI-4 Python engine returned an invalid success payload.");
  return value as unknown as EngineSuccess;
}

function assertEngineAlignment(
  engine: EngineSuccess,
  validated: ValidatedInput,
): void {
  if (
    Math.abs(engine.timebase.declared_step_s - validated.declaredStepSeconds) >
      1e-12 ||
    engine.timebase.declared_sample_count !== validated.samples.length
  )
    throw new Error("SCI-4 engine response changed the input timebase.");
  const expectedPhaseIds = new Set(
    validated.phaseIntervals.map((interval) => String(interval.id)),
  );
  const expectedRepOrdinals = new Set(
    validated.repIntervals.map((interval) => Number(interval.rep_ordinal)),
  );
  for (const phase of engine.phase_results) {
    if (
      !expectedPhaseIds.has(phase.interval_id) ||
      phase.interval_authority !== "SCI3_AUTOMATIC_SEGMENTATION" ||
      (phase.polarity !== "POSITIVE" && phase.polarity !== "NEGATIVE")
    )
      throw new Error(
        "SCI-4 engine response changed the phase interval authority.",
      );
    if (
      phase.start_index < 0 ||
      phase.end_index >= validated.samples.length ||
      phase.end_index <= phase.start_index
    )
      throw new Error("SCI-4 engine returned an invalid phase interval.");
    for (const metric of phase.metrics) {
      if (!isFiniteNumber(metric.value) || metric.metric_version !== "1.0.0")
        throw new Error("SCI-4 engine returned an invalid metric value.");
      const definition = metricDefinition(metric.metric_id as RepPhaseMetricId);
      if (
        definition.unit !== metric.unit ||
        definition.dimension !== metric.dimension
      )
        throw new Error(
          "SCI-4 engine returned a metric with the wrong unit or dimension.",
        );
      if (
        metric.selected_sample_index !== undefined &&
        (metric.selected_sample_index < phase.start_index ||
          metric.selected_sample_index > phase.end_index)
      )
        throw new Error(
          "SCI-4 engine selected a peak sample outside its phase interval.",
        );
    }
  }
  for (const repetition of engine.rep_results) {
    if (
      !expectedRepOrdinals.has(repetition.rep_ordinal) ||
      repetition.end_index <= repetition.start_index
    )
      throw new Error("SCI-4 engine returned an invalid repetition interval.");
    for (const metric of repetition.metrics) {
      if (
        metric.metric_id !== REP_TOTAL_DURATION_METRIC_ID ||
        !isFiniteNumber(metric.value)
      )
        throw new Error("SCI-4 engine returned an invalid repetition metric.");
    }
  }
}

function runPython(
  payload: Readonly<Record<string, unknown>>,
  executable: string,
  scriptPath: string,
): Promise<EngineResponse> {
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
            `SCI-4 Python engine exited with code ${code}: ${stderr.trim()}`,
          ),
        );
        return;
      }
      try {
        resolve(parseEngineResponse(JSON.parse(stdout) as unknown));
      } catch (error) {
        reject(
          error instanceof Error
            ? error
            : new Error("SCI-4 engine returned invalid JSON."),
        );
      }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

function dependencyQualifications(): readonly ScientificDependencyQualification[] {
  return [
    {
      capabilityId: "resistance_training.linear_velocity_from_position",
      capabilityVersion: "1.0.0",
      qualificationStatus: "QUALIFIED",
      qualificationArtifact: {
        type: "SCI2_QUALIFICATION",
        ref: "public-scientific-contract:SCI-2:qualification",
      },
      limitations: [
        "SCI-2 sampled position-to-velocity qualification and UNKNOWN uncertainty remain in force.",
      ],
    },
    {
      capabilityId: SEGMENTATION_CAPABILITY_ID,
      capabilityVersion: SEGMENTATION_CAPABILITY_VERSION,
      qualificationStatus: "QUALIFIED_SOFTWARE",
      qualificationArtifact: {
        type: "SCI3_QUALIFICATION",
        ref: "public-scientific-contract:SCI-3:final-qualification",
      },
      limitations: [
        "SCI-3 sampled boundaries, protocol, filtering, and interpolation limits remain in force.",
        "REAL_WORLD_SEGMENTATION_VALIDATED=NO.",
      ],
    },
    {
      capabilityId: `${SEGMENTATION_CAPABILITY_ID}.real_world_validation`,
      capabilityVersion: "1.0.0",
      qualificationStatus: "UNPROVEN",
      qualificationArtifact: {
        type: "SCI3_EMPIRICAL_LIMITATION",
        ref: "public-scientific-contract:SCI-3:empirical-validation",
      },
      limitations: [
        "REAL_WORLD_SEGMENTATION_VALIDATED=NO; SCI-4 does not upgrade this status.",
      ],
    },
  ];
}

function metricBindingReference(
  validated: ValidatedInput,
  request: ValidatedMetricRequest,
  metric: RepPhaseMetricDefinition,
): Readonly<Record<string, unknown>> {
  const evidence = validated.segmentation.measurement;
  const sci3Software =
    validated.segmentation.qualification.status === "QUALIFIED"
      ? validated.segmentation.qualification.identity.software
      : null;
  const repetition = validated.segmentation.repetitions.find(
    (candidate) => candidate.ordinal === request.repOrdinal,
  );
  const phase =
    request.phaseId === null
      ? undefined
      : repetition?.phases.find(
          (candidate) => candidate.phase_ref.phase_id === request.phaseId,
        );
  const start = phase?.start ?? repetition?.start;
  const end = phase?.end ?? repetition?.end;
  if (repetition === undefined || start === undefined || end === undefined)
    throw new Error("SCI-4 metric binding interval is missing.");
  const phaseInterval =
    phase === undefined
      ? undefined
      : validated.phaseIntervals.find(
          (candidate) =>
            candidate.rep_ordinal === request.repOrdinal &&
            candidate.phase_id === request.phaseId,
        );
  const sci2IntervalSummary =
    phase === undefined
      ? undefined
      : validated.inputSummaries.find(
          (summary) =>
            summary.startIndex === phase.start.sample_index &&
            summary.endIndex === phase.end.sample_index &&
            summary.velocityClaimId ===
              validated.segmentation.sci2Lineage.claimId,
        );
  return {
    assessmentId: evidence.assessmentId,
    trialId: evidence.trialId,
    repOrdinal: request.repOrdinal,
    ...(phase === undefined
      ? {
          scope: "REPETITION",
          intervalAuthority: "SCI3_AUTOMATIC_SEGMENTATION",
          qualificationReference: `${validated.segmentation.segmentationReference}:rep-${request.repOrdinal}`,
        }
      : {
          scope: "PHASE",
          phaseId: request.phaseId,
          phaseOrdinal: phase.phase_ref.phase_ordinal,
          phaseAction: phase.phase_ref.phase_action,
          polarity: phase.polarity,
          intervalAuthority: "SCI3_AUTOMATIC_SEGMENTATION",
          qualificationReference:
            phaseInterval?.qualification_reference ??
            `${validated.segmentation.segmentationReference}:rep-${request.repOrdinal}:phase-${request.phaseId}`,
        }),
    ...(validated.segmentation.exerciseDefinition === undefined
      ? {}
      : { exerciseDefinition: validated.segmentation.exerciseDefinition }),
    ...(validated.segmentation.exerciseVariation === undefined
      ? {}
      : { exerciseVariation: validated.segmentation.exerciseVariation }),
    movementTask: {
      id: validated.segmentation.movementTask.id,
      version: validated.segmentation.movementTask.version,
      revision: validated.segmentation.movementTask.revision,
    },
    objectOfInterest: evidence.objectOfInterest,
    measurementPoint: evidence.measurementPoint,
    referenceFrame: evidence.referenceFrame,
    axis: evidence.axis,
    modality: evidence.modality,
    metricId: metric.id,
    metricVersion: metric.version,
    sci2ClaimId: validated.segmentation.sci2Lineage.claimId,
    sci2Processor: validated.segmentation.sci2Lineage.processor,
    sci2Method: validated.segmentation.sci2Lineage.method,
    sci2Software: validated.segmentation.sci2Lineage.software,
    sci2Qualification: validated.segmentation.sci2Lineage.qualification,
    sci2IntervalSummaryId: sci2IntervalSummary?.id ?? null,
    sci2IntervalQualificationReference:
      sci2IntervalSummary?.qualificationReference ?? null,
    sci3ClaimId: validated.segmentation.claim.claimId,
    sci3Processor: {
      id: SEGMENTATION_PROCESSOR_ID,
      version: SEGMENTATION_PROCESSOR_VERSION,
    },
    sci3Method: {
      id: SEGMENTATION_METHOD_ID,
      version: SEGMENTATION_METHOD_VERSION,
    },
    sci3Software,
    sci3Qualification: validated.segmentation.qualification,
    startSampleIndex: start.sample_index,
    endSampleIndex: end.sample_index,
    startTimeSeconds: start.time_s,
    endTimeSeconds: end.time_s,
  };
}

function buildResult(
  request: ScienceRequest,
  validated: ValidatedInput,
  engine: EngineSuccess,
  contract: ScientificProcessorContract,
): ScienceResult {
  const inputPayload = canonicalPayload(validated);
  const lineageProvenance: readonly ScienceProvenanceRef[] = [
    ...validated.provenance,
    { type: "SCI2_CLAIM", ref: validated.segmentation.sci2Lineage.claimId },
    { type: "SCI3_CLAIM", ref: validated.segmentation.claim.claimId },
  ];
  const inputFingerprint = sha256(
    canonicalJson({
      capabilityId: request.capabilityId,
      input: inputPayload,
      inputProvenance: lineageProvenance,
      processor: contract.processor,
      method: contract.method,
      software: contract.software,
      configuration: contract.configuration,
      qualification: contract.qualification,
    }),
  );
  const metricRecords: Array<Record<string, unknown>> = [];
  const graphNodes: Array<{
    readonly nodeId: string;
    readonly outputClaimId: string;
    readonly outputClass: "MECHANICALLY_DERIVED";
    readonly inputs: readonly DerivationInputReference[];
    readonly processor: MethodIdentity;
    readonly method: MethodIdentity;
    readonly software: SoftwareProvenance;
    readonly assumptions: readonly AssumptionDeclaration[];
    readonly configuration: ConfigurationSnapshot;
    readonly createdAt: Instant;
    readonly supersession: { readonly kind: "NONE" };
  }> = [];
  const recalculationRecords: Array<{
    readonly recordId: string;
    readonly outputClaimId: string;
    readonly inputReferences: readonly DerivationInputReference[];
    readonly processor: MethodIdentity;
    readonly method: MethodIdentity;
    readonly software: SoftwareProvenance;
    readonly configuration: ConfigurationSnapshot;
    readonly generatedAt: Instant;
    readonly supersedesRecordId: null;
  }> = [];
  const psc4Parents = validated.provenance.map((reference) => ({
    kind: "PSC4_EVIDENCE" as const,
    ref: reference.ref,
  }));
  const scientificParents: readonly ClaimReference[] = [
    ...psc4Parents,
    {
      kind: "SCIENTIFIC_CLAIM" as const,
      ref: validated.segmentation.sci2Lineage.claimId,
      claimClass: "MECHANICALLY_DERIVED" as const,
    },
    {
      kind: "SCIENTIFIC_CLAIM" as const,
      ref: validated.segmentation.claim.claimId,
      claimClass: "MECHANICALLY_DERIVED" as const,
    },
  ];
  const uniqueParents: readonly ClaimReference[] = scientificParents.filter(
    (reference, index, references) =>
      references.findIndex(
        (candidate) =>
          `${candidate.kind}:${candidate.ref}` ===
          `${reference.kind}:${reference.ref}`,
      ) === index,
  );
  for (const validatedRequest of validated.metricRequests) {
    const definitionIds = validatedRequest.metricIds;
    for (const metricId of definitionIds) {
      const definition = metricDefinition(metricId);
      const phaseResult =
        validatedRequest.phaseId === null
          ? undefined
          : engine.phase_results.find(
              (candidate) =>
                candidate.rep_ordinal === validatedRequest.repOrdinal &&
                candidate.phase_id === validatedRequest.phaseId,
            );
      const repetitionResult =
        validatedRequest.phaseId === null
          ? engine.rep_results.find(
              (candidate) =>
                candidate.rep_ordinal === validatedRequest.repOrdinal,
            )
          : undefined;
      const engineMetric = (
        phaseResult?.metrics ??
        repetitionResult?.metrics ??
        []
      ).find((candidate) => candidate.metric_id === metricId);
      if (engineMetric === undefined)
        throw new Error(`SCI-4 engine omitted requested metric ${metricId}.`);
      const quantity = createQuantity({
        value: engineMetric.value,
        unit: definition.unit,
        dimension: definition.dimension,
      });
      const metricKey = `${validatedRequest.repOrdinal}:${validatedRequest.phaseId ?? "REP"}:${metricId}`;
      const claimId = `rep-phase-metric-${inputFingerprint.slice(0, 20)}-${sha256(metricKey).slice(0, 12)}`;
      const nodeId = `derivation-${sha256(claimId).slice(0, 24)}`;
      const intervalReference = metricBindingReference(
        validated,
        validatedRequest,
        definition,
      );
      const claimProvenance: readonly ScienceProvenanceRef[] = [
        ...lineageProvenance,
        {
          type: "SCI4_INTERVAL",
          ref: `${validated.segmentation.segmentationReference}:${metricKey}`,
        },
      ];
      const claim = createScientificClaim({
        claimClass: "MECHANICALLY_DERIVED",
        claimId,
        value: { kind: "QUANTITY", value: quantity },
        output: {
          kind: "QUANTITY",
          dimension: definition.dimension,
          unit: definition.unit,
        },
        method: definition.method,
        software: contract.software,
        assumptions: contract.assumptions,
        configuration: contract.configuration,
        lineage: {
          parents: uniqueParents,
          provenance: claimProvenance,
        },
      });
      graphNodes.push({
        nodeId,
        outputClaimId: claimId,
        outputClass: "MECHANICALLY_DERIVED",
        inputs: uniqueParents,
        processor: contract.processor,
        method: definition.method,
        software: contract.software,
        assumptions: contract.assumptions,
        configuration: contract.configuration,
        createdAt: nowInstant(),
        supersession: { kind: "NONE" },
      });
      recalculationRecords.push({
        recordId: `recalculation-${nodeId}`,
        outputClaimId: claimId,
        inputReferences: uniqueParents,
        processor: contract.processor,
        method: definition.method,
        software: contract.software,
        configuration: contract.configuration,
        generatedAt: nowInstant(),
        supersedesRecordId: null,
      });
      metricRecords.push({
        metricId: definition.id,
        metricVersion: definition.version,
        scope: definition.scope,
        definition: definition.definition,
        quantity,
        claim,
        method: definition.method,
        interval: intervalReference,
        selectedSample:
          engineMetric.selected_sample_index === undefined
            ? null
            : {
                index: engineMetric.selected_sample_index,
                timeSeconds: engineMetric.selected_sample_time_s,
                semantics: "PHASE_DIRECTION_PEAK_SAMPLED_LINEAR_VELOCITY",
              },
        uncertainty: {
          status: "UNKNOWN",
          temporalResolutionSeconds: validated.declaredStepSeconds,
          statement: "Temporal resolution is separate from metric uncertainty.",
        },
        qualification: contract.qualification,
        upstreamQualifications: dependencyQualifications(),
        derivationNodeId: nodeId,
      });
    }
  }
  const derivation = createDerivationGraph({ nodes: graphNodes, edges: [] });
  const recalculationHistory = createRecalculationHistory({
    records: recalculationRecords,
  });
  const value = {
    processor: contract.processor,
    method: contract.method,
    configuration: contract.configuration,
    assessmentId: validated.segmentation.measurement.assessmentId,
    trialId: validated.segmentation.measurement.trialId,
    movementTask: validated.segmentation.movementTask,
    measurement: validated.segmentation.measurement,
    sci2Lineage: validated.segmentation.sci2Lineage,
    sci3Claim: validated.segmentation.claim,
    qualification: contract.qualification,
    sci3Qualification: validated.segmentation.qualification,
    segmentationReference: validated.segmentation.segmentationReference,
    intervalAuthority: "SCI3_AUTOMATIC_SEGMENTATION",
    realWorldSegmentationValidated: "NO",
    upstreamQualifications: dependencyQualifications(),
    metrics: metricRecords,
    uncertainty: {
      status: "UNKNOWN",
      temporalResolutionSeconds: validated.declaredStepSeconds,
      components: {
        samplingResolution: {
          status: "DECLARED",
          seconds: validated.declaredStepSeconds,
        },
        metricUncertainty: { status: "UNKNOWN" },
        boundaryTiming: { status: "SAMPLED_ONLY_NO_INTERPOLATION" },
        deviceTiming: { status: "NOT_PROVIDED" },
      },
    },
    derivation,
    recalculationHistory,
  };
  return {
    requestId: request.requestId,
    capabilityId: request.capabilityId,
    status: "ok",
    method: contract.method,
    inputFingerprint,
    value,
    unit: null,
    dimension: null,
    uncertainty: value.uncertainty,
    assumptions: contract.assumptions.map(
      (assumption) => assumption.description,
    ),
    limitations: [
      "SCI-4 consumes SCI-3 phase intervals and does not detect or move boundaries.",
      "SCI-2 interval-average velocity is reused from the exact bound interval summary.",
      "The direction-aware extremum is sampled and is not a continuous peak.",
      "No filtering or interpolation is added by SCI-4.",
      "Metric uncertainty is UNKNOWN; temporal resolution is reported separately.",
      "REAL_WORLD_SEGMENTATION_VALIDATED=NO remains visible and is not upgraded.",
    ],
    provenance: [
      ...lineageProvenance,
      ...graphNodes.map((node) => ({
        type: "SCI0_DERIVATION_NODE",
        ref: node.nodeId,
      })),
      ...metricRecords.map((metric) => ({
        type: "SCI0_CLAIM",
        ref: (metric.claim as MechanicallyDerivedClaim).claimId,
      })),
    ],
    generatedAt: nowInstant(),
  };
}

export function createRepPhaseKinematicMetricsRequest(
  input: RepPhaseKinematicMetricsRequestInput,
): ScienceRequest {
  requireText(input.requestId, "SCI-4 request id");
  if (input.inputProvenance.length === 0)
    throw new Error("SCI-4 requests require PSC4 input provenance.");
  if (input.sci2IntervalSummaries.length === 0)
    throw new Error("SCI-4 requests require SCI-2 interval summaries.");
  if (input.metricRequests.length === 0)
    throw new Error("SCI-4 requests require metric requests.");
  const structured: Record<string, unknown> = {
    segmentation: input.segmentation,
    sci2IntervalSummaries: input.sci2IntervalSummaries,
    metricRequests: input.metricRequests,
  };
  return {
    requestId: input.requestId,
    capabilityId: REP_PHASE_KINEMATIC_METRICS_CAPABILITY_ID,
    capabilityVersion: REP_PHASE_KINEMATIC_METRICS_CAPABILITY_VERSION,
    ...(input.athleteId === undefined
      ? {}
      : { subjectRef: { athleteId: input.athleteId as never } }),
    ...(input.observedAt === undefined
      ? {}
      : { observedAt: parseInstant(input.observedAt) }),
    inputs: {
      [REP_PHASE_KINEMATIC_METRICS_INPUT_KEY]: {
        kind: "structured",
        value: structured,
      },
    },
    inputProvenance: input.inputProvenance,
  };
}

export class RepPhaseKinematicMetricsSciencePort implements SciencePort {
  readonly contract: ScientificProcessorContract;
  private readonly pythonExecutable: string;
  private readonly pythonScriptPath: string;
  private readonly engineInvoker:
    | RepPhaseKinematicMetricsEngineInvoker
    | undefined;

  constructor(options: RepPhaseKinematicMetricsAdapterOptions) {
    this.contract = processorContract(options);
    this.pythonExecutable = options.pythonExecutable ?? "python";
    this.pythonScriptPath =
      options.pythonScriptPath ??
      path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "../engine/rep_phase_kinematic_metrics_processor.py",
      );
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
        capabilityId: REP_PHASE_KINEMATIC_METRICS_CAPABILITY_ID,
        status:
          this.contract.qualification.status === "QUALIFIED"
            ? "ok"
            : "method_unavailable",
        description:
          "Compose bounded rep/phase kinematic metric claims from qualified SCI-2 intervals and SCI-3 sampled phase boundaries.",
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
    if (request.capabilityId !== REP_PHASE_KINEMATIC_METRICS_CAPABILITY_ID)
      return {
        requestId: request.requestId,
        capabilityId: request.capabilityId,
        status: "not_applicable",
        generatedAt: nowInstant(),
        error: {
          code: "CAPABILITY_NOT_SUPPORTED",
          message:
            "The SCI-4 port owns one narrow rep/phase metric capability only.",
        },
      };
    if (
      request.capabilityVersion !== undefined &&
      request.capabilityVersion !==
        REP_PHASE_KINEMATIC_METRICS_CAPABILITY_VERSION
    )
      return structuredFailure(
        request,
        "UNSUPPORTED_CONFIGURATION",
        "The requested SCI-4 capability version is unsupported.",
      );
    if (this.contract.qualification.status !== "QUALIFIED")
      return {
        requestId: request.requestId,
        capabilityId: request.capabilityId,
        status: "method_unavailable",
        generatedAt: nowInstant(),
        error: {
          code: "PROCESSOR_NOT_QUALIFIED",
          message: "The SCI-4 processor is not qualified for execution.",
        },
      };
    const validated = validateInput(request);
    if ("status" in validated) return validated;
    try {
      const payload = canonicalPayload(validated);
      const engine =
        this.engineInvoker === undefined
          ? await runPython(
              payload,
              this.pythonExecutable,
              this.pythonScriptPath,
            )
          : parseEngineResponse(await this.engineInvoker(payload));
      if (engine.status === "FAILED") {
        const mappedCode: ScientificFailureCode =
          engine.failure.code === "REQUIRED_EVIDENCE_MISSING"
            ? "REQUIRED_EVIDENCE_MISSING"
            : engine.failure.code === "UNSUPPORTED_CONFIGURATION"
              ? "UNSUPPORTED_CONFIGURATION"
              : engine.failure.code === "INSUFFICIENT_SAMPLES"
                ? "INSUFFICIENT_SAMPLES"
                : FAILURE_CODES.has(
                      engine.failure.code as ScientificFailureCode,
                    )
                  ? (engine.failure.code as ScientificFailureCode)
                  : "PROTOCOL_INCOMPATIBLE";
        return structuredFailure(
          request,
          mappedCode,
          `SCI4_FAILURE_CODE=${engine.failure.code}: ${engine.failure.message}`,
        );
      }
      if (engine.status === "INFRASTRUCTURE_FAILED")
        return infrastructureFailure(request, engine.exception.message);
      assertEngineAlignment(engine, validated);
      return buildResult(request, validated, engine, this.contract);
    } catch (error) {
      return infrastructureFailure(
        request,
        error instanceof Error
          ? error.message
          : "The SCI-4 engine could not be executed.",
      );
    }
  }
}

export type {
  DirectionDescriptor,
  MeasurementModalityReference,
  PhysicalObjectReference,
  ReferenceFrameReference,
};
