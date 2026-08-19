import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ScientificDefinitionRef } from "@workoutpal/movement-science";
import {
  type AssumptionDeclaration,
  type ClaimReference,
  type ConfigurationSnapshot,
  createDerivationGraph,
  createProcessorContract,
  createRecalculationHistory,
  createScientificClaim,
  createScientificFailure,
  isPsc4SourceEvidenceType,
  type JsonValue,
  type MethodIdentity,
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
  type Dimension,
  type Instant,
  parseInstant,
} from "@workoutpal/shared-kernel";

export const SET_VELOCITY_STATE_CAPABILITY_ID =
  "resistance_training.set_velocity_state";
export const SET_VELOCITY_STATE_CAPABILITY_VERSION = "1.0.0";
export const SET_VELOCITY_STATE_PROCESSOR_ID = SET_VELOCITY_STATE_CAPABILITY_ID;
export const SET_VELOCITY_STATE_PROCESSOR_VERSION = "1.0.0";
export const SET_VELOCITY_STATE_METHOD_ID =
  "set_velocity_state.reference_normalized_decline";
export const SET_VELOCITY_STATE_METHOD_VERSION = "1.0.0";
export const SET_VELOCITY_STATE_INPUT_KEY = "set_velocity_sequence";

export const SCI4_PHASE_AVERAGE_VELOCITY_METRIC_ID =
  "PHASE_INTERVAL_AVERAGE_SIGNED_LINEAR_VELOCITY" as const;
export const SCI4_PHASE_PEAK_VELOCITY_METRIC_ID =
  "PHASE_DIRECTION_PEAK_SAMPLED_LINEAR_VELOCITY" as const;
export const SCI4_VELOCITY_METRIC_VERSION = "1.0.0";
export const SCI4_VELOCITY_METRIC_METHOD_ID =
  "rep_phase_metrics.sample_aligned_claim_binding";
export const SCI4_VELOCITY_METRIC_METHOD_VERSION = "1.0.0";

export type SetVelocityMetricId =
  | typeof SCI4_PHASE_AVERAGE_VELOCITY_METRIC_ID
  | typeof SCI4_PHASE_PEAK_VELOCITY_METRIC_ID;
export type SetVelocityMode = "ONLINE_PREFIX" | "POST_HOC_COMPLETE_SET";
export type SetVelocityReferencePolicy =
  | "FIRST_ELIGIBLE"
  | "FASTEST_ELIGIBLE_COMPLETE_SET"
  | "FASTEST_SO_FAR"
  | "EXPLICIT_REPETITION";
export type SetVelocityThresholdUnit = "PERCENT" | "RATIO";
export type SetVelocityQualificationStatus =
  | "QUALIFIED"
  | "QUALIFIED_SOFTWARE"
  | "UNPROVEN";
export type SetVelocityPhasePolarity = "POSITIVE" | "NEGATIVE";

export interface SetVelocityPhaseBinding extends ScientificDefinitionRef {
  readonly phaseId: string;
  readonly polarity: SetVelocityPhasePolarity;
}

export interface SetVelocityMetricDefinition {
  readonly id: SetVelocityMetricId;
  readonly version: string;
  readonly unit: "m/s";
  readonly dimension: "speed";
  readonly method: MethodIdentity;
}

export interface SetVelocityMeasurementBinding {
  readonly objectOfInterest: Readonly<Record<string, unknown>>;
  readonly measurementPoint: Readonly<Record<string, unknown>>;
  readonly referenceFrame: Readonly<Record<string, unknown>>;
  readonly axis: Readonly<Record<string, unknown>>;
  readonly modality: Readonly<Record<string, unknown>>;
}

export interface SetVelocityUpstreamQualification {
  readonly capabilityId: string;
  readonly capabilityVersion: string;
  readonly qualificationStatus: SetVelocityQualificationStatus;
  readonly qualificationArtifact: ScienceProvenanceRef;
  readonly limitations: readonly string[];
}

export interface SetVelocitySetContext {
  readonly setId: string;
  readonly assessmentId: string;
  readonly trialId: string;
  readonly exerciseDefinition: ScientificDefinitionRef;
  readonly exerciseVariation: ScientificDefinitionRef | null;
  readonly movementTask: ScientificDefinitionRef;
  readonly loadConfiguration: ScientificDefinitionRef;
  readonly selectedPhase: SetVelocityPhaseBinding;
  readonly metricDefinition: SetVelocityMetricDefinition;
  readonly measurement: SetVelocityMeasurementBinding;
}

export interface SetVelocityRepetitionMetric {
  readonly metricId: SetVelocityMetricId;
  readonly metricVersion: string;
  readonly method: MethodIdentity;
  readonly signedVelocityMps: number;
  readonly claimId: string;
  readonly qualificationStatus: SetVelocityQualificationStatus;
  readonly validity?: "VALID" | "INVALID" | "UNKNOWN";
}

export interface SetVelocityRepetitionBindings {
  readonly setId: string;
  readonly assessmentId: string;
  readonly trialId: string;
  readonly exerciseDefinition: ScientificDefinitionRef;
  readonly exerciseVariation: ScientificDefinitionRef | null;
  readonly movementTask: ScientificDefinitionRef;
  readonly loadConfiguration: ScientificDefinitionRef;
  readonly selectedPhase: SetVelocityPhaseBinding;
  readonly metricDefinition: SetVelocityMetricDefinition;
  readonly measurement: SetVelocityMeasurementBinding;
}

export interface SetVelocityRepetitionInput {
  readonly repId: string;
  readonly ordinal: number;
  readonly complete: boolean;
  readonly eligible?: boolean;
  readonly bindings: SetVelocityRepetitionBindings;
  readonly metric?: SetVelocityRepetitionMetric;
  readonly exclusion?: { readonly code: string; readonly reason: string };
}

export interface SetVelocityThreshold {
  readonly id: string;
  readonly version: string;
  readonly value: number;
  readonly unit: SetVelocityThresholdUnit;
  readonly metricId: SetVelocityMetricId;
  readonly metricVersion: string;
  readonly referencePolicy: SetVelocityReferencePolicy;
  readonly mode: SetVelocityMode;
}

export interface SetVelocityStateRequestInput {
  readonly requestId: string;
  readonly setContext: SetVelocitySetContext;
  readonly upstreamQualifications: readonly SetVelocityUpstreamQualification[];
  readonly repetitions: readonly SetVelocityRepetitionInput[];
  readonly mode: SetVelocityMode;
  readonly referencePolicy: SetVelocityReferencePolicy;
  readonly explicitReferenceRepId?: string;
  readonly thresholds: readonly SetVelocityThreshold[];
  readonly inputProvenance: readonly ScienceProvenanceRef[];
  readonly observedAt?: string;
  readonly athleteId?: string;
}

export interface SetVelocityStateAdapterOptions {
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
  readonly engineInvoker?: SetVelocityStateEngineInvoker;
}

export type SetVelocityStateEngineInvoker = (
  payload: Readonly<Record<string, unknown>>,
) => Promise<unknown>;

interface EngineSnapshot {
  readonly snapshot_id: string;
  readonly prefix_index: number;
  readonly prefix_rep_count: number;
  readonly observed_rep_ids: readonly string[];
  readonly eligible_rep_ids: readonly string[];
  readonly excluded_repetitions: readonly Readonly<Record<string, unknown>>[];
  readonly mode: SetVelocityMode;
  readonly reference_policy: SetVelocityReferencePolicy;
  readonly explicit_reference_rep_id: string | null;
  readonly reference_rep_id: string;
  readonly reference_velocity_mps: number;
  readonly metric_definition: Readonly<Record<string, unknown>>;
  readonly selected_phase: Readonly<Record<string, unknown>>;
  readonly repetitions: readonly Readonly<Record<string, unknown>>[];
  readonly summaries: Readonly<Record<string, unknown>>;
  readonly threshold_events: readonly Readonly<Record<string, unknown>>[];
  readonly first_crossings: readonly Readonly<Record<string, unknown>>[];
}

interface EngineSuccess {
  readonly status: "SUCCEEDED";
  readonly processor: MethodIdentity;
  readonly method: MethodIdentity;
  readonly snapshots: readonly EngineSnapshot[];
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

const PYTHON_PROCESSOR_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../engine/set_level_vbt_processor.py",
);

const SHA_PATTERN = /^[0-9a-f]{40,64}$/iu;

const FAILURE_CODES: readonly ScientificFailureCode[] = [
  "REQUIRED_EVIDENCE_MISSING",
  "INPUT_INVALID",
  "INPUT_EXCLUDED",
  "DIMENSION_MISMATCH",
  "METHOD_NOT_APPLICABLE",
  "UNSUPPORTED_CONFIGURATION",
  "SEQUENCE_EMPTY",
  "REPETITION_ORDINAL_INVALID",
  "REPETITION_ORDER_INVALID",
  "DUPLICATE_REPETITION_ID",
  "SET_ID_MISMATCH",
  "EXERCISE_DEFINITION_MISMATCH",
  "EXERCISE_VARIATION_MISMATCH",
  "MOVEMENT_TASK_MISMATCH",
  "LOAD_CONFIGURATION_MISMATCH",
  "MEASUREMENT_OBJECT_MISMATCH",
  "MEASUREMENT_POINT_MISMATCH",
  "REFERENCE_FRAME_MISMATCH",
  "AXIS_MISMATCH",
  "MODALITY_MISMATCH",
  "METRIC_DEFINITION_MISMATCH",
  "METRIC_METHOD_MISMATCH",
  "REP_PHASE_MISMATCH",
  "REP_INCOMPLETE",
  "REP_METRIC_MISSING",
  "REP_METRIC_INVALID",
  "NON_FINITE_VELOCITY",
  "REP_UPSTREAM_INVALID",
  "UPSTREAM_QUALIFICATION_MISSING",
  "UPSTREAM_QUALIFICATION_UNSUPPORTED",
  "REFERENCE_POLICY_INVALID",
  "REFERENCE_POLICY_INCOMPATIBLE_WITH_MODE",
  "REFERENCE_REPETITION_NOT_FOUND",
  "REFERENCE_VELOCITY_INVALID",
  "RELATIVE_CHANGE_UNDEFINED",
  "THRESHOLD_INVALID",
  "THRESHOLD_BINDING_MISMATCH",
  "EXPLICIT_EXCLUSION_REASON_MISSING",
  "SNAPSHOT_ALIGNMENT_INVALID",
];

function nowInstant(): Instant {
  return parseInstant(new Date().toISOString());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0)
    throw new Error(`${label} is required.`);
  return value.trim();
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

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function configurationSnapshot(
  input: SetVelocityStateRequestInput,
): ConfigurationSnapshot {
  const parameters = {
    mode: input.mode,
    referencePolicy: input.referencePolicy,
    explicitReferenceRepId: input.explicitReferenceRepId ?? null,
    metricDefinition: {
      id: input.setContext.metricDefinition.id,
      version: input.setContext.metricDefinition.version,
      unit: input.setContext.metricDefinition.unit,
      dimension: input.setContext.metricDefinition.dimension,
      method: {
        id: input.setContext.metricDefinition.method.id,
        version: input.setContext.metricDefinition.method.version,
      },
    },
    selectedPhase: {
      id: input.setContext.selectedPhase.id,
      version: input.setContext.selectedPhase.version,
      revision: input.setContext.selectedPhase.revision,
      phaseId: input.setContext.selectedPhase.phaseId,
      polarity: input.setContext.selectedPhase.polarity,
    },
    thresholds: input.thresholds.map((threshold) => ({
      id: threshold.id,
      version: threshold.version,
      value: threshold.value,
      unit: threshold.unit,
      metricId: threshold.metricId,
      metricVersion: threshold.metricVersion,
      referencePolicy: threshold.referencePolicy,
      mode: threshold.mode,
    })),
    inputOrderPolicy: "PRESERVE_CHRONOLOGICAL_CANONICAL_ORDER",
    tiePolicy: "EARLIEST_ELIGIBLE_REPETITION",
    directionPolicy: "PHASE_POLARITY_TIMES_SIGNED_VELOCITY_NO_ABS",
    termination: "NONE",
  } as const satisfies Readonly<Record<string, JsonValue>>;
  const canonicalSerialization = canonicalJson(parameters);
  return {
    id: `${SET_VELOCITY_STATE_PROCESSOR_ID}.configuration`,
    parameters,
    canonicalSerialization,
    contentHash: sha256(canonicalSerialization),
  };
}

function qualificationBinding(
  options: SetVelocityStateAdapterOptions,
  processor: MethodIdentity,
  method: MethodIdentity,
) {
  const qualification = options.qualification;
  if (qualification === undefined || qualification === null) {
    return {
      status: "NOT_QUALIFIED" as const,
      reason: "SCI-5 qualification evidence is not bound.",
    };
  }
  if (
    qualification.sourceRevision !== options.software.sourceRevision ||
    qualification.buildId !== options.software.buildId ||
    !SHA_PATTERN.test(qualification.sourceRevision)
  ) {
    return {
      status: "NOT_QUALIFIED" as const,
      reason:
        "SCI-5 qualification must match software provenance and an exact source SHA.",
    };
  }
  return {
    status: "QUALIFIED" as const,
    identity: {
      qualificationId: requireText(
        qualification.qualificationId,
        "SCI-5 qualification id",
      ),
      qualificationVersion: requireText(
        qualification.qualificationVersion,
        "SCI-5 qualification version",
      ),
      processor,
      method,
      software: options.software,
      oracle: {
        id: requireText(qualification.oracle.id, "SCI-5 oracle id"),
        version: requireText(
          qualification.oracle.version,
          "SCI-5 oracle version",
        ),
      },
      validationData: {
        id: requireText(
          qualification.validationData.id,
          "SCI-5 validation data id",
        ),
        version: requireText(
          qualification.validationData.version,
          "SCI-5 validation data version",
        ),
      },
    },
  };
}

function assumptions(): readonly AssumptionDeclaration[] {
  return [
    {
      id: "sci4-qualified-phase-velocity-input",
      version: "1.0.0",
      description:
        "SCI-5 consumes one already qualified SCI-4 velocity metric per eligible repetition and never detects reps or recomputes SCI-4 metrics.",
      reference: {
        type: "REPOSITORY_AUTHORITY",
        ref: "public-scientific-contract:SCI-4:final-qualification",
      },
      status: "DECLARED",
      parameters: {
        upstream: "SCI4",
        repDetection: "NONE",
        metricRecomputation: "NONE",
      },
    },
    {
      id: "direction-normalization-by-phase-polarity",
      version: "1.0.0",
      description:
        "Directional velocity is phase polarity multiplied by the signed SCI-4 velocity; opposite-direction values fail closed and are never converted with abs().",
      reference: {
        type: "REPOSITORY_AUTHORITY",
        ref: "public-scientific-contract:SCI-5:terminology-and-reference-policy",
      },
      status: "DECLARED",
      parameters: {
        positivePolarity: "+1",
        negativePolarity: "-1",
        absoluteValue: "FORBIDDEN",
      },
    },
    {
      id: "reference-relative-descriptive-state",
      version: "1.0.0",
      description:
        "SCI-5 reports descriptive per-repetition and set aggregates relative to an explicit reference velocity; it does not interpret the state as fatigue, readiness, recovery, or a meaningful change.",
      reference: {
        type: "REPOSITORY_AUTHORITY",
        ref: "public-scientific-contract:SCI-5:set-velocity-state-authority",
      },
      status: "DECLARED",
      parameters: {
        inference: "NONE",
        prescription: "NONE",
        termination: "NONE",
      },
    },
    {
      id: "threshold-event-without-action",
      version: "1.0.0",
      description:
        "Threshold comparisons are caller-bound descriptive events only; a crossing is retained historically and does not trigger termination or any training action.",
      reference: {
        type: "REPOSITORY_AUTHORITY",
        ref: "public-scientific-contract:SCI-5:threshold-event-authority",
      },
      status: "DECLARED",
      parameters: {
        equality: "CROSSES",
        action: "NONE",
        recoveryMutation: "NONE",
      },
    },
  ];
}

function uncertaintyPolicy(): UncertaintyPolicy {
  const unknown = (reason: string) => ({
    kind: "UNKNOWN" as const,
    reason,
    source: {
      kind: "METHOD" as const,
      method: {
        id: SET_VELOCITY_STATE_METHOD_ID,
        version: SET_VELOCITY_STATE_METHOD_VERSION,
      },
    },
  });
  return {
    measurement: {
      kind: "UNKNOWN",
      reason: "Inherited measurement uncertainty is not supplied to SCI-5.",
    },
    statistical: {
      kind: "NOT_PROPAGATED",
      reason:
        "SCI-5 computes descriptive set values only; no population statistic is claimed.",
    },
    model: {
      kind: "NOT_PROPAGATED",
      reason: "SCI-5 uses no biomechanical model.",
    },
    propagated: unknown(
      "No defensible uncertainty propagation model is bound for SCI-5 v1.",
    ),
    output: "UNKNOWN_ALLOWED",
  };
}

function processorContract(
  options: SetVelocityStateAdapterOptions,
): ScientificProcessorContract {
  const processor = {
    id: SET_VELOCITY_STATE_PROCESSOR_ID,
    version: SET_VELOCITY_STATE_PROCESSOR_VERSION,
  };
  const method = {
    id: SET_VELOCITY_STATE_METHOD_ID,
    version: SET_VELOCITY_STATE_METHOD_VERSION,
  };
  return createProcessorContract({
    processor,
    method,
    software: options.software,
    inputs: [
      {
        id: SET_VELOCITY_STATE_INPUT_KEY,
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
    calibration: { kind: "NOT_REQUIRED" },
    uncertainty: uncertaintyPolicy(),
    configuration: configurationSnapshot({
      requestId: "contract",
      setContext: {
        setId: "contract",
        assessmentId: "contract",
        trialId: "contract",
        exerciseDefinition: { id: "contract", version: "1.0.0", revision: 1 },
        exerciseVariation: null,
        movementTask: { id: "contract", version: "1.0.0", revision: 1 },
        loadConfiguration: { id: "contract", version: "1.0.0", revision: 1 },
        selectedPhase: {
          id: "contract",
          version: "1.0.0",
          revision: 1,
          phaseId: "contract",
          polarity: "POSITIVE",
        },
        metricDefinition: {
          id: SCI4_PHASE_AVERAGE_VELOCITY_METRIC_ID,
          version: SCI4_VELOCITY_METRIC_VERSION,
          unit: "m/s",
          dimension: "speed",
          method: {
            id: SCI4_VELOCITY_METRIC_METHOD_ID,
            version: SCI4_VELOCITY_METRIC_METHOD_VERSION,
          },
        },
        measurement: {
          objectOfInterest: {},
          measurementPoint: {},
          referenceFrame: {},
          axis: {},
          modality: {},
        },
      },
      upstreamQualifications: [],
      repetitions: [],
      mode: "POST_HOC_COMPLETE_SET",
      referencePolicy: "FIRST_ELIGIBLE",
      thresholds: [],
      inputProvenance: [{ type: "PSC4_EVIDENCE", ref: "contract" }],
    }),
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
    code === "REQUIRED_EVIDENCE_MISSING" || code === "SEQUENCE_EMPTY"
      ? "insufficient_input"
      : code === "METHOD_NOT_APPLICABLE" ||
          code === "UNSUPPORTED_CONFIGURATION" ||
          code === "REFERENCE_POLICY_INCOMPATIBLE_WITH_MODE"
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
        : SET_VELOCITY_STATE_CAPABILITY_ID,
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
  const input = request.inputs[SET_VELOCITY_STATE_INPUT_KEY];
  if (input?.kind !== "structured" || !isRecord(input.value)) return null;
  return input.value;
}

function validateInput(
  request: ScienceRequest,
): SetVelocityStateRequestInput | ScienceResult {
  const record = inputRecord(request);
  if (record === null)
    return structuredFailure(
      request,
      "REQUIRED_EVIDENCE_MISSING",
      "A structured SCI-5 set velocity sequence is required.",
    );
  const psc4Provenance = request.inputProvenance.filter(
    (reference): reference is ScienceProvenanceRef =>
      isRecord(reference) &&
      typeof reference.type === "string" &&
      typeof reference.ref === "string" &&
      reference.ref.trim().length > 0 &&
      isPsc4SourceEvidenceType(reference.type),
  );
  if (psc4Provenance.length === 0)
    return structuredFailure(
      request,
      "REQUIRED_EVIDENCE_MISSING",
      "SCI-5 requires PSC4 source-evidence provenance.",
    );
  try {
    const input = record as unknown as SetVelocityStateRequestInput;
    requireText(input.requestId, "SCI-5 request id");
    if (!Array.isArray(input.repetitions))
      throw new Error(
        "REQUIRED_EVIDENCE_MISSING: SCI-5 repetitions are required.",
      );
    if (!Array.isArray(input.thresholds))
      throw new Error("THRESHOLD_INVALID: SCI-5 thresholds must be explicit.");
    if (!Array.isArray(input.upstreamQualifications))
      throw new Error(
        "UPSTREAM_QUALIFICATION_MISSING: upstream qualifications are required.",
      );
    return { ...input, inputProvenance: request.inputProvenance };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid SCI-5 input.";
    const code =
      FAILURE_CODES.find((candidate) => message.includes(candidate)) ??
      "INPUT_INVALID";
    return structuredFailure(request, code, message);
  }
}

function canonicalPayload(
  input: SetVelocityStateRequestInput,
): Readonly<Record<string, unknown>> {
  const context = input.setContext;
  const bindingPayload = (binding: SetVelocityRepetitionBindings) => ({
    set_id: binding.setId,
    assessment_id: binding.assessmentId,
    trial_id: binding.trialId,
    exercise_definition: binding.exerciseDefinition,
    exercise_variation: binding.exerciseVariation,
    movement_task: binding.movementTask,
    load_configuration: binding.loadConfiguration,
    selected_phase: {
      id: binding.selectedPhase.id,
      version: binding.selectedPhase.version,
      revision: binding.selectedPhase.revision,
      phase_id: binding.selectedPhase.phaseId,
      polarity: binding.selectedPhase.polarity,
    },
    metric_definition: {
      id: binding.metricDefinition.id,
      version: binding.metricDefinition.version,
      unit: binding.metricDefinition.unit,
      dimension: binding.metricDefinition.dimension,
      method: binding.metricDefinition.method,
    },
    measurement: {
      object_of_interest: binding.measurement.objectOfInterest,
      measurement_point: binding.measurement.measurementPoint,
      reference_frame: binding.measurement.referenceFrame,
      axis: binding.measurement.axis,
      modality: binding.measurement.modality,
    },
  });
  const setBinding = bindingPayload({
    setId: context.setId,
    assessmentId: context.assessmentId,
    trialId: context.trialId,
    exerciseDefinition: context.exerciseDefinition,
    exerciseVariation: context.exerciseVariation,
    movementTask: context.movementTask,
    loadConfiguration: context.loadConfiguration,
    selectedPhase: context.selectedPhase,
    metricDefinition: context.metricDefinition,
    measurement: context.measurement,
  });
  return {
    set_context: {
      ...setBinding,
      upstream_qualifications: input.upstreamQualifications.map(
        (qualification) => ({
          capability_id: qualification.capabilityId,
          capability_version: qualification.capabilityVersion,
          qualification_status: qualification.qualificationStatus,
          qualification_artifact: qualification.qualificationArtifact,
          limitations: qualification.limitations,
        }),
      ),
    },
    mode: input.mode,
    reference_policy: input.referencePolicy,
    explicit_reference_rep_id: input.explicitReferenceRepId ?? null,
    thresholds: input.thresholds.map((threshold) => ({
      id: threshold.id,
      version: threshold.version,
      value: threshold.value,
      unit: threshold.unit,
      metric_id: threshold.metricId,
      metric_version: threshold.metricVersion,
      reference_policy: threshold.referencePolicy,
      mode: threshold.mode,
    })),
    repetitions: input.repetitions.map((repetition) => ({
      rep_id: repetition.repId,
      ordinal: repetition.ordinal,
      complete: repetition.complete,
      eligible: repetition.eligible ?? true,
      bindings: bindingPayload(repetition.bindings),
      metric:
        repetition.metric === undefined
          ? null
          : {
              metric_id: repetition.metric.metricId,
              metric_version: repetition.metric.metricVersion,
              method: repetition.metric.method,
              signed_velocity_mps: repetition.metric.signedVelocityMps,
              claim_id: repetition.metric.claimId,
              qualification_status: repetition.metric.qualificationStatus,
              validity: repetition.metric.validity ?? "VALID",
            },
      ...(repetition.exclusion === undefined
        ? {}
        : { exclusion: repetition.exclusion }),
    })),
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
      "SCI-5 Python engine returned an invalid response envelope.",
    );
  if (value.status === "FAILED") {
    if (
      !isRecord(value.failure) ||
      typeof value.failure.code !== "string" ||
      typeof value.failure.message !== "string" ||
      !Array.isArray(value.failure.details)
    )
      throw new Error(
        "SCI-5 Python engine returned an invalid failure payload.",
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
        "SCI-5 Python engine returned an invalid infrastructure payload.",
      );
    return value as unknown as EngineInfrastructureFailure;
  }
  if (
    value.status !== "SUCCEEDED" ||
    !expectedIdentity(value.processor, {
      id: SET_VELOCITY_STATE_PROCESSOR_ID,
      version: SET_VELOCITY_STATE_PROCESSOR_VERSION,
    }) ||
    !expectedIdentity(value.method, {
      id: SET_VELOCITY_STATE_METHOD_ID,
      version: SET_VELOCITY_STATE_METHOD_VERSION,
    }) ||
    !Array.isArray(value.snapshots) ||
    !isRecord(value.uncertainty) ||
    !isRecord(value.diagnostics)
  )
    throw new Error("SCI-5 Python engine returned an invalid success payload.");
  return value as unknown as EngineSuccess;
}

function assertEngineAlignment(
  engine: EngineSuccess,
  input: SetVelocityStateRequestInput,
): void {
  const explicitReferenceIndex =
    input.mode === "ONLINE_PREFIX" &&
    input.referencePolicy === "EXPLICIT_REPETITION"
      ? input.repetitions.findIndex(
          (repetition) => repetition.repId === input.explicitReferenceRepId,
        )
      : -1;
  const onlineSnapshotStart =
    explicitReferenceIndex >= 0 ? explicitReferenceIndex : 0;
  const expectedSnapshotCount =
    input.mode === "ONLINE_PREFIX"
      ? input.repetitions.length - onlineSnapshotStart
      : 1;
  if (engine.snapshots.length !== expectedSnapshotCount)
    throw new Error(
      "SNAPSHOT_ALIGNMENT_INVALID: SCI-5 returned the wrong snapshot count.",
    );
  const expectedIds = input.repetitions.map((repetition) => repetition.repId);
  const seenSnapshotIds = new Set<string>();
  for (const [index, snapshot] of engine.snapshots.entries()) {
    if (
      typeof snapshot.snapshot_id !== "string" ||
      seenSnapshotIds.has(snapshot.snapshot_id) ||
      snapshot.mode !== input.mode ||
      snapshot.reference_policy !== input.referencePolicy ||
      !Array.isArray(snapshot.observed_rep_ids) ||
      !Array.isArray(snapshot.eligible_rep_ids) ||
      !Array.isArray(snapshot.repetitions) ||
      !Array.isArray(snapshot.threshold_events) ||
      !Array.isArray(snapshot.first_crossings) ||
      !isFiniteNumber(snapshot.reference_velocity_mps) ||
      snapshot.reference_velocity_mps <= 0
    )
      throw new Error(
        "SNAPSHOT_ALIGNMENT_INVALID: SCI-5 returned an invalid immutable snapshot.",
      );
    seenSnapshotIds.add(snapshot.snapshot_id);
    const expectedObserved =
      input.mode === "ONLINE_PREFIX"
        ? expectedIds.slice(0, onlineSnapshotStart + index + 1)
        : expectedIds;
    if (!sameJson(snapshot.observed_rep_ids, expectedObserved))
      throw new Error(
        "SNAPSHOT_ALIGNMENT_INVALID: SCI-5 changed chronological repetition order.",
      );
    for (const rawRepetition of snapshot.repetitions) {
      if (!isRecord(rawRepetition))
        throw new Error(
          "SNAPSHOT_ALIGNMENT_INVALID: SCI-5 returned a malformed repetition state.",
        );
      if (
        typeof rawRepetition.rep_id !== "string" ||
        !isFiniteNumber(rawRepetition.directional_velocity_mps) ||
        !isFiniteNumber(rawRepetition.relative_velocity_change_percent) ||
        !isFiniteNumber(rawRepetition.velocity_decline_percent) ||
        !isFiniteNumber(rawRepetition.velocity_ratio)
      )
        throw new Error(
          "SNAPSHOT_ALIGNMENT_INVALID: SCI-5 returned a non-finite repetition state.",
        );
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
            `SCI-5 Python engine exited with code ${code}: ${stderr.trim()}`,
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
            : new Error("SCI-5 engine returned invalid JSON."),
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
  const code = FAILURE_CODES.includes(
    engine.failure.code as ScientificFailureCode,
  )
    ? (engine.failure.code as ScientificFailureCode)
    : "INPUT_INVALID";
  return structuredFailure(
    request,
    code,
    `SCI5_FAILURE_CODE=${engine.failure.code}: ${engine.failure.message}`,
  );
}

function parentReferences(
  input: SetVelocityStateRequestInput,
): readonly ClaimReference[] {
  const psc4 = input.inputProvenance
    .filter((reference) => isPsc4SourceEvidenceType(reference.type))
    .map((reference) => ({
      kind: "PSC4_EVIDENCE" as const,
      ref: reference.ref,
    }));
  const claims = input.repetitions.flatMap((repetition) =>
    repetition.metric === undefined
      ? []
      : [
          {
            kind: "SCIENTIFIC_CLAIM" as const,
            ref: repetition.metric.claimId,
            claimClass: "MECHANICALLY_DERIVED" as const,
          },
        ],
  );
  const seen = new Set<string>();
  return [...psc4, ...claims].filter((reference) => {
    const key = `${reference.kind}:${reference.ref}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildResult(
  request: ScienceRequest,
  input: SetVelocityStateRequestInput,
  engine: EngineSuccess,
  contract: ScientificProcessorContract,
): ScienceResult {
  const configuration = configurationSnapshot(input);
  const references = parentReferences(input);
  const inputFingerprint = sha256(canonicalJson(canonicalPayload(input)));
  const generatedAt = nowInstant();
  const claims = engine.snapshots.map((snapshot) =>
    createScientificClaim({
      claimClass: "MECHANICALLY_DERIVED",
      claimId: `sci5-claim-${inputFingerprint}-${snapshot.snapshot_id}`,
      value: { kind: "REFERENCE", value: snapshot.snapshot_id },
      output: { kind: "REFERENCE" },
      method: contract.method,
      software: contract.software,
      assumptions: contract.assumptions,
      configuration,
      lineage: {
        parents: references,
        provenance: [
          ...input.inputProvenance,
          { type: "SCI5_SNAPSHOT", ref: snapshot.snapshot_id },
        ],
      },
    }),
  );
  const nodes = claims.map((claim, index) => ({
    nodeId: `sci5-node-${inputFingerprint}-${index + 1}`,
    outputClaimId: claim.claimId,
    outputClass: "MECHANICALLY_DERIVED" as const,
    inputs: references,
    processor: contract.processor,
    method: contract.method,
    software: contract.software,
    assumptions: contract.assumptions,
    configuration,
    createdAt: generatedAt,
    supersession: { kind: "NONE" as const },
  }));
  const derivation = createDerivationGraph({ nodes, edges: [] });
  const recalculationHistory = createRecalculationHistory({
    records: claims.map((claim, index) => ({
      recordId: `sci5-recalculation-${inputFingerprint}-${index + 1}`,
      outputClaimId: claim.claimId,
      inputReferences: references,
      processor: contract.processor,
      method: contract.method,
      software: contract.software,
      configuration,
      generatedAt,
      supersedesRecordId: null,
    })),
  });
  const claimBySnapshotId = new Map(
    engine.snapshots.map((snapshot, index) => [
      snapshot.snapshot_id,
      claims[index],
    ]),
  );
  const snapshots = engine.snapshots.map((snapshot) => ({
    ...snapshot,
    claim: claimBySnapshotId.get(snapshot.snapshot_id),
  }));
  return {
    requestId: request.requestId,
    capabilityId: request.capabilityId,
    status: "ok",
    method: contract.method,
    inputFingerprint,
    value: {
      processor: contract.processor,
      method: contract.method,
      setContext: input.setContext,
      mode: input.mode,
      referencePolicy: input.referencePolicy,
      explicitReferenceRepId: input.explicitReferenceRepId ?? null,
      metricDefinition: input.setContext.metricDefinition,
      selectedPhase: input.setContext.selectedPhase,
      upstreamQualifications: input.upstreamQualifications,
      snapshots,
      uncertainty: engine.uncertainty,
      diagnostics: engine.diagnostics,
      qualification: contract.qualification,
      derivation,
      recalculationHistory,
    },
    unit: null,
    dimension: null,
    uncertainty: engine.uncertainty,
    assumptions: contract.assumptions.map(
      (assumption) => assumption.description,
    ),
    limitations: [
      "SCI-5 consumes qualified SCI-4 per-repetition velocity claims and does not detect repetitions or recompute SCI-4 metrics.",
      "SCI-5 preserves chronological input order and never sorts by velocity.",
      "Reference policy, mode, threshold definitions, metric identity, and version are caller-bound; no hidden default is applied.",
      "Velocity state is descriptive and mechanically derived; no fatigue, readiness, recovery, meaningful-change, inference, prescription, or termination claim is emitted.",
      "Upstream SCI-2/SCI-3/SCI-4 qualification limitations and UNKNOWN/PENDING empirical status remain visible.",
      "Threshold crossings are historical descriptive events only and do not mutate state or trigger an action.",
    ],
    provenance: [
      ...input.inputProvenance,
      ...nodes.map((node) => ({
        type: "SCI0_DERIVATION_NODE",
        ref: node.nodeId,
      })),
      ...claims.map((claim) => ({ type: "SCI0_CLAIM", ref: claim.claimId })),
    ],
    generatedAt,
  };
}

export function createSetVelocityStateRequest(
  input: SetVelocityStateRequestInput,
): ScienceRequest {
  requireText(input.requestId, "SCI-5 request id");
  if (input.inputProvenance.length === 0)
    throw new Error("SCI-5 requests require PSC4 input provenance.");
  const structured: Record<string, unknown> = {
    ...input,
  };
  return {
    requestId: input.requestId,
    capabilityId: SET_VELOCITY_STATE_CAPABILITY_ID,
    capabilityVersion: SET_VELOCITY_STATE_CAPABILITY_VERSION,
    ...(input.athleteId === undefined
      ? {}
      : { subjectRef: { athleteId: input.athleteId as never } }),
    ...(input.observedAt === undefined
      ? {}
      : { observedAt: parseInstant(input.observedAt) }),
    inputs: {
      [SET_VELOCITY_STATE_INPUT_KEY]: { kind: "structured", value: structured },
    },
    inputProvenance: input.inputProvenance,
  };
}

export class SetVelocityStateSciencePort implements SciencePort {
  readonly contract: ScientificProcessorContract;
  private readonly pythonExecutable: string;
  private readonly pythonScriptPath: string;
  private readonly engineInvoker: SetVelocityStateEngineInvoker | undefined;

  constructor(options: SetVelocityStateAdapterOptions) {
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
        capabilityId: SET_VELOCITY_STATE_CAPABILITY_ID,
        status:
          this.contract.qualification.status === "QUALIFIED"
            ? "ok"
            : "method_unavailable",
        description:
          "Compute descriptive set-level velocity state, reference-relative decline, maintenance, and caller-bound threshold events from qualified SCI-4 repetition metrics.",
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
    if (request.capabilityId !== SET_VELOCITY_STATE_CAPABILITY_ID)
      return {
        requestId: request.requestId,
        capabilityId: request.capabilityId,
        status: "not_applicable",
        generatedAt: nowInstant(),
        error: {
          code: "CAPABILITY_NOT_SUPPORTED",
          message:
            "The SCI-5 port owns one narrow set velocity state capability only.",
        },
      };
    if (
      request.capabilityVersion !== undefined &&
      request.capabilityVersion !== SET_VELOCITY_STATE_CAPABILITY_VERSION
    )
      return structuredFailure(
        request,
        "UNSUPPORTED_CONFIGURATION",
        "The requested SCI-5 capability version is unsupported.",
      );
    if (this.contract.qualification.status !== "QUALIFIED")
      return {
        requestId: request.requestId,
        capabilityId: request.capabilityId,
        status: "method_unavailable",
        generatedAt: nowInstant(),
        error: {
          code: "PROCESSOR_NOT_QUALIFIED",
          message: "The SCI-5 processor is not qualified for execution.",
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
      if (engine.status === "FAILED") return mapEngineFailure(request, engine);
      if (engine.status === "INFRASTRUCTURE_FAILED")
        return infrastructureFailure(request, engine.exception.message);
      assertEngineAlignment(engine, validated);
      return buildResult(request, validated, engine, this.contract);
    } catch (error) {
      return infrastructureFailure(
        request,
        error instanceof Error
          ? error.message
          : "The SCI-5 engine could not be executed.",
      );
    }
  }
}

export function createQualifiedSetVelocitySoftwareProvenance(
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
