import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createDirectionDescriptor,
  createMeasurementModalityReference,
  createPhysicalObjectReference,
  createReferenceFrameReference,
  type DirectionDescriptor,
  type MeasurementModalityReference,
  type MovementTask,
  type PhysicalObjectReference,
  type ReferenceFrameReference,
  type ScientificDefinitionRef,
  type TaskPhaseAction,
} from "@workoutpal/movement-science";
import {
  type AssumptionDeclaration,
  type CalibrationStatus,
  type ConfigurationSnapshot,
  createDerivationGraph,
  createProcessorContract,
  createRecalculationHistory,
  createScientificClaim,
  createScientificFailure,
  type DerivationInputReference,
  isPsc4SourceEvidenceType,
  type JsonValue,
  type MethodIdentity,
  type ProcessorInputQuality,
  type QualificationBinding,
  type ScienceInputValue,
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

export const SEGMENTATION_CAPABILITY_ID =
  "resistance_training.segment_repetitions_from_kinematics";
export const SEGMENTATION_CAPABILITY_VERSION = "1.0.0";
export const SEGMENTATION_PROCESSOR_ID = SEGMENTATION_CAPABILITY_ID;
export const SEGMENTATION_PROCESSOR_VERSION = "1.0.0";
export const SEGMENTATION_METHOD_ID =
  "state_machine.directional_hysteresis.sample_boundaries";
export const SEGMENTATION_METHOD_VERSION = "1.0.0";

const PYTHON_PROCESSOR_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../engine/segmentation_processor.py",
);
const KINEMATIC_INPUT_KEY = "qualified_sci2_kinematic_series";
const FAILURE_CODES = new Set<ScientificFailureCode>([
  "REQUIRED_EVIDENCE_MISSING",
  "INPUT_INVALID",
  "INPUT_EXCLUDED",
  "DIMENSION_MISMATCH",
  "POSITION_DIMENSION_MISMATCH",
  "TIME_DIMENSION_MISMATCH",
  "INSUFFICIENT_SAMPLES",
  "NON_FINITE_SAMPLE",
  "NUMERICAL_OVERFLOW",
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

const SHA_PATTERN = /^[0-9a-f]{40,64}$/iu;

export type SegmentationPolarity = "POSITIVE" | "NEGATIVE";

export interface SegmentationPhaseReference {
  readonly movementTask: ScientificDefinitionRef;
  readonly phaseId: string;
  readonly phaseOrdinal: number;
  readonly phaseAction: TaskPhaseAction;
  readonly polarity: SegmentationPolarity;
}

export interface SegmentationProtocolDefinition
  extends ScientificDefinitionRef {
  readonly kind: "SEGMENTATION_PROTOCOL";
  readonly supportedTaskClass: "ONE_DIMENSIONAL_BIDIRECTIONAL_IMPLEMENT_MOTION_2_PHASE";
  readonly movementTask: ScientificDefinitionRef;
  readonly expectedPhaseSequence: readonly [
    SegmentationPhaseReference,
    SegmentationPhaseReference,
  ];
  readonly filteringPolicy: "NONE_ONLY";
  readonly interpolationPolicy: "NONE_ONLY";
  readonly dwellPolicy: "ALLOWED";
  readonly boundaryPolicy: "SAMPLED_ONLY_NO_INTERPOLATION";
  readonly rationale: string;
}

export interface SegmentationConfiguration {
  readonly velocityEnterThresholdMps: number;
  readonly velocityExitThresholdMps: number;
  readonly minimumSustainedSamples: number;
  readonly minimumPrerollSamples: number;
  readonly minimumPostrollSamples: number;
  readonly minimumPhaseDurationSeconds: number;
  readonly minimumRepetitionDurationSeconds: number;
  readonly minimumExcursionMeters: number;
  readonly uniformAbsoluteToleranceSeconds: number;
  readonly uniformRelativeTolerance: number;
  readonly filtering: "NONE";
  readonly interpolation: "NONE";
  readonly dwellPolicy: "ALLOWED";
  readonly boundaryPolicy: "SAMPLED_ONLY_NO_INTERPOLATION";
}

export interface SegmentationKinematicSample {
  readonly sampleIndex: number;
  readonly time: number;
  readonly position: number;
  readonly velocity: number;
}

export interface SegmentationTimebaseEvidence {
  readonly declaredSamplingInterval: number;
  readonly declaredSamplingIntervalUnit: string;
  readonly declaredSampleCount: number;
  readonly provenanceReference: string;
  readonly missingSamplePolicy: "REJECT";
  readonly irregularSamplingPolicy: "REJECT";
}

export interface SegmentationKinematicEvidence {
  readonly samples: readonly SegmentationKinematicSample[];
  readonly timebase: SegmentationTimebaseEvidence;
  readonly positionUnit: string;
  readonly velocityUnit: string;
  readonly timeUnit: string;
  readonly objectOfInterest: PhysicalObjectReference;
  readonly measurementPoint: PhysicalObjectReference;
  readonly referenceFrame: ReferenceFrameReference;
  readonly axis: DirectionDescriptor;
  readonly modality: MeasurementModalityReference;
  readonly assessmentId: string;
  readonly trialId: string;
  readonly quality: ProcessorInputQuality;
  readonly calibrationStatus: CalibrationStatus;
}

export interface Sci2VelocityLineage {
  readonly claimId: string;
  readonly processor: MethodIdentity;
  readonly method: MethodIdentity;
  readonly software: SoftwareProvenance;
  readonly qualification: {
    readonly status: "QUALIFIED";
    readonly sourceRevision: string;
    readonly buildId: string;
  };
}

export interface SegmentationRequestInput {
  readonly requestId: string;
  readonly evidence: SegmentationKinematicEvidence;
  readonly sci2Lineage: Sci2VelocityLineage;
  readonly movementTask: MovementTask;
  readonly exerciseDefinition?: ScientificDefinitionRef;
  readonly exerciseVariation?: ScientificDefinitionRef;
  readonly protocol: SegmentationProtocolDefinition;
  readonly configuration: SegmentationConfiguration;
  readonly inputProvenance: readonly ScienceProvenanceRef[];
  readonly observedAt?: string;
  readonly athleteId?: string;
}

export interface SegmentationAdapterOptions {
  readonly software: SoftwareProvenance;
  readonly configuration: SegmentationConfiguration;
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
  readonly engineInvoker?: SegmentationEngineInvoker;
}

export type SegmentationEngineInvoker = (
  payload: Readonly<Record<string, unknown>>,
) => Promise<unknown>;

interface EngineBoundary {
  readonly sample_index: number;
  readonly time_s: number;
  readonly event_type: string;
  readonly event_method: string;
  readonly temporal_resolution_s: number;
}

interface EnginePhase {
  readonly phase_ref: Readonly<Record<string, unknown>>;
  readonly polarity: SegmentationPolarity;
  readonly start: EngineBoundary;
  readonly end: EngineBoundary;
  readonly duration_s: number;
  readonly excursion_m: number;
}

interface EngineRepetition {
  readonly ordinal: number;
  readonly complete: boolean;
  readonly start: EngineBoundary;
  readonly end: EngineBoundary;
  readonly duration_s: number;
  readonly phases: readonly EnginePhase[];
  readonly dwell_intervals: readonly Readonly<Record<string, unknown>>[];
}

interface EngineSuccess {
  readonly status: "SUCCEEDED";
  readonly processor: MethodIdentity;
  readonly method: MethodIdentity;
  readonly timebase: {
    readonly declared_step_s: number;
    readonly declared_sample_count: number;
  };
  readonly state_runs: readonly Readonly<Record<string, unknown>>[];
  readonly repetitions: readonly EngineRepetition[];
  readonly measurement: Readonly<Record<string, unknown>>;
  readonly sci2_lineage: Readonly<Record<string, unknown>>;
  readonly movement_task: Readonly<Record<string, unknown>>;
  readonly protocol: Readonly<Record<string, unknown>>;
  readonly configuration: Readonly<Record<string, unknown>>;
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

function requireText(value: string, label: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) throw new Error(`${label} is required.`);
  return normalized;
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

function configurationPayload(
  configuration: SegmentationConfiguration,
): Readonly<Record<string, unknown>> {
  return {
    velocity_enter_threshold_mps: configuration.velocityEnterThresholdMps,
    velocity_exit_threshold_mps: configuration.velocityExitThresholdMps,
    minimum_sustained_samples: configuration.minimumSustainedSamples,
    minimum_preroll_samples: configuration.minimumPrerollSamples,
    minimum_postroll_samples: configuration.minimumPostrollSamples,
    minimum_phase_duration_s: configuration.minimumPhaseDurationSeconds,
    minimum_repetition_duration_s:
      configuration.minimumRepetitionDurationSeconds,
    minimum_excursion_m: configuration.minimumExcursionMeters,
    uniform_absolute_tolerance_s: configuration.uniformAbsoluteToleranceSeconds,
    uniform_relative_tolerance: configuration.uniformRelativeTolerance,
    filtering: configuration.filtering,
    interpolation: configuration.interpolation,
    dwell_policy: configuration.dwellPolicy,
    boundary_policy: configuration.boundaryPolicy,
  };
}

function configurationSnapshot(
  configuration: SegmentationConfiguration,
): ConfigurationSnapshot {
  const parameters = configurationPayload(configuration) as Readonly<
    Record<string, JsonValue>
  >;
  const canonicalSerialization = canonicalJson(parameters);
  return {
    id: "resistance_training.segment_repetitions_from_kinematics.configuration",
    parameters,
    canonicalSerialization,
    contentHash: sha256(canonicalSerialization),
  };
}

function qualificationBinding(
  options: SegmentationAdapterOptions,
  processor: MethodIdentity,
  method: MethodIdentity,
): QualificationBinding {
  const qualification = options.qualification;
  if (qualification === undefined || qualification === null) {
    return {
      status: "NOT_QUALIFIED",
      reason: "Qualification evidence is not bound.",
    };
  }
  try {
    const fields = [
      [qualification.qualificationId, "Qualification id"],
      [qualification.qualificationVersion, "Qualification version"],
      [qualification.oracle.id, "Oracle id"],
      [qualification.oracle.version, "Oracle version"],
      [qualification.validationData.id, "Validation data id"],
      [qualification.validationData.version, "Validation data version"],
      [qualification.sourceRevision, "Qualified source revision"],
      [qualification.buildId, "Qualified build id"],
    ] as const;
    for (const [value, label] of fields) {
      requireText(value, label);
    }
    if (
      qualification.sourceRevision !== options.software.sourceRevision ||
      qualification.buildId !== options.software.buildId
    ) {
      return {
        status: "NOT_QUALIFIED",
        reason:
          "Qualification software identity must match software provenance.",
      };
    }
    if (!SHA_PATTERN.test(options.software.sourceRevision)) {
      return {
        status: "NOT_QUALIFIED",
        reason: "Qualification requires an exact source SHA.",
      };
    }
    return {
      status: "QUALIFIED",
      identity: {
        qualificationId: qualification.qualificationId,
        qualificationVersion: qualification.qualificationVersion,
        processor,
        method,
        software: options.software,
        oracle: qualification.oracle,
        validationData: qualification.validationData,
      },
    };
  } catch (error) {
    return {
      status: "NOT_QUALIFIED",
      reason:
        error instanceof Error ? error.message : "Qualification is incomplete.",
    };
  }
}

function assumptions(): readonly AssumptionDeclaration[] {
  return [
    {
      id: "qualified-sci2-input",
      version: "1.0.0",
      description:
        "SCI-3 consumes a qualified SCI-2 signed velocity series with exact sample alignment and retained object, measurement point, frame, axis, task, protocol, and trial identity.",
      reference: {
        type: "REPOSITORY_AUTHORITY",
        ref: "public-scientific-contract:SCI-2:scope-and-boundary",
      },
      status: "DECLARED",
      parameters: {
        sourceCapability: "resistance_training.linear_velocity_from_position",
        inputRepair: "NONE",
      },
    },
    {
      id: "sampled-boundary-only",
      version: "1.0.0",
      description:
        "Boundary times are observed sample times; no interpolation, smoothing, or sub-sample event localization is performed.",
      reference: {
        type: "DOI",
        ref: "10.1123/jab.2022-0111",
      },
      status: "DECLARED",
      parameters: {
        filtering: "NONE",
        interpolation: "NONE",
        boundaryResolution: "declared sample step",
      },
    },
    {
      id: "task-defined-phases",
      version: "1.0.0",
      description:
        "Phase labels and order are taken from the versioned MovementTask and SegmentationProtocolDefinition; global concentric/eccentric semantics are not inferred.",
      reference: {
        type: "REPOSITORY_AUTHORITY",
        ref: "public-scientific-contract:SCI-3:event-and-phase-authority",
      },
      status: "DECLARED",
      parameters: { phaseAuthority: "SCI1_MOVEMENT_TASK" },
    },
  ];
}

function uncertaintyPolicy(): UncertaintyPolicy {
  const unknown = (reason: string) => ({ kind: "UNKNOWN" as const, reason });
  return {
    measurement: unknown(
      "Input measurement uncertainty is retained but not supplied to SCI-3 v1.",
    ),
    statistical: unknown("SCI-3 v1 computes no population statistic."),
    model: unknown("SCI-3 v1 uses no biomechanical model."),
    propagated: unknown(
      "No validated propagation model is bound to sampled event timing.",
    ),
    output: "UNKNOWN_ALLOWED",
  };
}

function processorContract(
  options: SegmentationAdapterOptions,
): ScientificProcessorContract {
  const processor = {
    id: SEGMENTATION_PROCESSOR_ID,
    version: SEGMENTATION_PROCESSOR_VERSION,
  };
  const method = {
    id: SEGMENTATION_METHOD_ID,
    version: SEGMENTATION_METHOD_VERSION,
  };
  const qualification = qualificationBinding(options, processor, method);
  return createProcessorContract({
    processor,
    method,
    software: options.software,
    inputs: [
      {
        id: KINEMATIC_INPUT_KEY,
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
        id: "source-evidence",
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
    configuration: configurationSnapshot(options.configuration),
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
    qualification,
  });
}

function structuredFailure(
  request: ScienceRequest,
  code: ScientificFailureCode,
  message: string,
  details: readonly { readonly key: string; readonly value: string }[] = [],
): ScienceResult {
  const failure = createScientificFailure({ code, message, details });
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
        : SEGMENTATION_CAPABILITY_ID,
    status: "invalid_input",
    generatedAt: nowInstant(),
    error: {
      code: "REQUIRED_EVIDENCE_MISSING",
      message:
        "A ScienceRequest must include requestId, inputs, and inputProvenance.",
    },
  };
}

function inputRecord(
  request: ScienceRequest,
): Readonly<Record<string, unknown>> | null {
  const input: ScienceInputValue | undefined =
    request.inputs[KINEMATIC_INPUT_KEY];
  return input?.kind === "structured" ? input.value : null;
}

function validateConfiguration(
  configuration: unknown,
  expected: SegmentationConfiguration,
): configuration is SegmentationConfiguration {
  if (!isRecord(configuration)) return false;
  return canonicalJson(configuration) === canonicalJson(expected);
}

function validatePhaseProtocol(
  task: MovementTask,
  protocol: SegmentationProtocolDefinition,
): void {
  if (protocol.kind !== "SEGMENTATION_PROTOCOL")
    throw new Error("Protocol kind is invalid.");
  if (
    protocol.supportedTaskClass !==
    "ONE_DIMENSIONAL_BIDIRECTIONAL_IMPLEMENT_MOTION_2_PHASE"
  ) {
    throw new Error("Protocol task class is not supported by SCI-3 v1.");
  }
  if (!sameIdentity(protocol.movementTask, task)) {
    throw new Error(
      "Protocol MovementTask identity does not match the input MovementTask.",
    );
  }
  if (
    protocol.filteringPolicy !== "NONE_ONLY" ||
    protocol.interpolationPolicy !== "NONE_ONLY" ||
    protocol.dwellPolicy !== "ALLOWED" ||
    protocol.boundaryPolicy !== "SAMPLED_ONLY_NO_INTERPOLATION"
  ) {
    throw new Error(
      "Protocol filtering, interpolation, dwell, and boundary policies are unsupported.",
    );
  }
  if (protocol.expectedPhaseSequence.length !== 2) {
    throw new Error("SCI-3 v1 requires exactly two ordered phase references.");
  }
  const phases = new Map(task.phases.map((phase) => [phase.id, phase]));
  const polarities = new Set<SegmentationPolarity>();
  for (const reference of protocol.expectedPhaseSequence) {
    if (!sameIdentity(reference.movementTask, task)) {
      throw new Error(
        "A protocol phase reference has the wrong MovementTask identity.",
      );
    }
    const phase = phases.get(reference.phaseId);
    if (
      phase === undefined ||
      phase.ordinal !== reference.phaseOrdinal ||
      phase.action !== reference.phaseAction
    ) {
      throw new Error(
        "A protocol phase reference does not resolve to the SCI-1 phase definition.",
      );
    }
    if (polarities.has(reference.polarity)) {
      throw new Error(
        "SCI-3 v1 requires opposite polarities for its two phase references.",
      );
    }
    polarities.add(reference.polarity);
  }
}

function validateEvidence(
  request: ScienceRequest,
  expectedConfiguration: SegmentationConfiguration,
):
  | {
      readonly evidence: SegmentationKinematicEvidence;
      readonly sci2Lineage: Sci2VelocityLineage;
      readonly movementTask: MovementTask;
      readonly protocol: SegmentationProtocolDefinition;
      readonly configuration: SegmentationConfiguration;
      readonly provenance: readonly ScienceProvenanceRef[];
      readonly exerciseDefinition?: ScientificDefinitionRef;
      readonly exerciseVariation?: ScientificDefinitionRef;
    }
  | ScienceResult {
  const record = inputRecord(request);
  if (record === null) {
    return structuredFailure(
      request,
      "REQUIRED_EVIDENCE_MISSING",
      "A structured SCI-2 kinematic input is required.",
    );
  }
  if (!Array.isArray(request.inputProvenance)) {
    return structuredFailure(
      request,
      "REQUIRED_EVIDENCE_MISSING",
      "PSC4 input provenance is required as an array.",
    );
  }
  const provenance = request.inputProvenance.filter(
    (reference): reference is ScienceProvenanceRef =>
      isRecord(reference) &&
      typeof reference.type === "string" &&
      typeof reference.ref === "string" &&
      isPsc4SourceEvidenceType(reference.type) &&
      reference.ref.trim().length > 0,
  );
  if (provenance.length === 0) {
    return structuredFailure(
      request,
      "REQUIRED_EVIDENCE_MISSING",
      "SCI-3 requires PSC4 source-evidence provenance.",
    );
  }
  try {
    const evidence = record.evidence as SegmentationKinematicEvidence;
    const sci2Lineage = record.sci2Lineage as Sci2VelocityLineage;
    const movementTask = record.movementTask as MovementTask;
    const protocol = record.protocol as SegmentationProtocolDefinition;
    const configuration = record.configuration as SegmentationConfiguration;
    if (!Array.isArray(evidence.samples) || evidence.samples.length < 4) {
      return structuredFailure(
        request,
        "INSUFFICIENT_SAMPLES",
        "SCI-3 requires at least four aligned kinematic samples.",
      );
    }
    if (!validateConfiguration(configuration, expectedConfiguration)) {
      return structuredFailure(
        request,
        "UNSUPPORTED_CONFIGURATION",
        "Request configuration must exactly match the qualified protocol configuration.",
      );
    }
    const timebase = evidence.timebase;
    if (
      timebase.missingSamplePolicy !== "REJECT" ||
      timebase.irregularSamplingPolicy !== "REJECT" ||
      !Number.isInteger(timebase.declaredSampleCount) ||
      timebase.declaredSampleCount !== evidence.samples.length
    ) {
      return structuredFailure(
        request,
        "MISSING_SAMPLE_UNSUPPORTED",
        "SCI-3 requires a complete consecutive sample series.",
      );
    }
    const declaredStep = convertQuantity(
      createQuantity({
        value: timebase.declaredSamplingInterval,
        unit: timebase.declaredSamplingIntervalUnit,
        dimension: "time",
      }),
      "s",
    ).value;
    if (!Number.isFinite(declaredStep) || declaredStep <= 0) {
      return structuredFailure(
        request,
        "SAMPLING_INTERVAL_INVALID",
        "The declared sampling interval must be positive and finite.",
      );
    }
    requireText(timebase.provenanceReference, "Timebase provenance reference");
    const createdObject = createPhysicalObjectReference(
      evidence.objectOfInterest,
    );
    const createdPoint = createPhysicalObjectReference(
      evidence.measurementPoint,
    );
    if (createdPoint.objectKind !== "MEASUREMENT_POINT") {
      return structuredFailure(
        request,
        "MEASUREMENT_POINT_BINDING_MISSING",
        "The measurement point must be a MEASUREMENT_POINT object.",
      );
    }
    const createdFrame = createReferenceFrameReference(evidence.referenceFrame);
    const createdAxis = createDirectionDescriptor(evidence.axis);
    if (!sameFrame(createdFrame, createdAxis.frame)) {
      return structuredFailure(
        request,
        "AXIS_BINDING_MISSING",
        "The declared axis must use the declared reference frame.",
      );
    }
    const createdModality = createMeasurementModalityReference(
      evidence.modality,
    );
    if (
      evidence.quality.input !== "VALID" ||
      evidence.quality.acquisition !== "VALID"
    ) {
      return structuredFailure(
        request,
        "INPUT_INVALID",
        "SCI-3 requires valid acquisition and input quality.",
      );
    }
    if (evidence.quality.trial !== "VALID") {
      return structuredFailure(
        request,
        "TRIAL_INVALID",
        "SCI-3 requires a VALID trial.",
      );
    }
    if (evidence.quality.exclusion === "EXCLUDED") {
      return structuredFailure(
        request,
        "TRIAL_EXCLUDED",
        "Excluded trials cannot produce a segmentation.",
      );
    }
    if (evidence.quality.protocol !== "APPLICABLE") {
      return structuredFailure(
        request,
        "PROTOCOL_INCOMPATIBLE",
        "The declared protocol must be applicable.",
      );
    }
    if (
      evidence.calibrationStatus !== "CALIBRATED" &&
      evidence.calibrationStatus !== "NOT_REQUIRED"
    ) {
      return structuredFailure(
        request,
        "CALIBRATION_REQUIREMENT_UNSATISFIED",
        "SCI-3 accepts only CALIBRATED or NOT_REQUIRED input calibration.",
      );
    }
    let previousTime: number | undefined;
    evidence.samples.forEach((sample, index) => {
      if (
        !isRecord(sample) ||
        sample.sampleIndex !== index ||
        !isFiniteNumber(sample.time) ||
        !isFiniteNumber(sample.position) ||
        !isFiniteNumber(sample.velocity)
      ) {
        throw new Error(`${index}:NON_FINITE_SAMPLE_OR_ALIGNMENT`);
      }
      const time = convertQuantity(
        createQuantity({
          value: sample.time,
          unit: evidence.timeUnit,
          dimension: "time",
        }),
        "s",
      ).value;
      convertQuantity(
        createQuantity({
          value: sample.position,
          unit: evidence.positionUnit,
          dimension: "length",
        }),
        "m",
      );
      convertQuantity(
        createQuantity({
          value: sample.velocity,
          unit: evidence.velocityUnit,
          dimension: "speed",
        }),
        "m/s",
      );
      if (previousTime !== undefined) {
        const step = time - previousTime;
        const tolerance = Math.max(
          expectedConfiguration.uniformAbsoluteToleranceSeconds,
          expectedConfiguration.uniformRelativeTolerance *
            Math.max(Math.abs(step), Math.abs(declaredStep), 1),
        );
        if (step === 0) throw new Error(`${index}:DUPLICATE_TIMESTAMP`);
        if (step < 0) throw new Error(`${index}:NON_MONOTONIC_TIME`);
        if (Math.abs(step - declaredStep) > tolerance)
          throw new Error(`${index}:IRREGULAR_TIMEBASE_UNSUPPORTED`);
      }
      previousTime = time;
    });
    if (createdObject.objectKind === undefined)
      throw new Error("OBJECT_BINDING_MISSING");
    validatePhaseProtocol(movementTask, protocol);
    if (sci2Lineage.qualification.status !== "QUALIFIED")
      throw new Error("SCI2_NOT_QUALIFIED");
    if (
      sci2Lineage.processor.id !==
        "resistance_training.linear_velocity_from_position" ||
      sci2Lineage.processor.version !== "1.0.0" ||
      sci2Lineage.method.id !== "finite_difference.second_order_uniform" ||
      sci2Lineage.method.version !== "1.0.0" ||
      !SHA_PATTERN.test(sci2Lineage.software.sourceRevision) ||
      sci2Lineage.qualification.sourceRevision !==
        sci2Lineage.software.sourceRevision ||
      sci2Lineage.qualification.buildId !== sci2Lineage.software.buildId
    ) {
      throw new Error("SCI2_LINEAGE_MISMATCH");
    }
    requireText(sci2Lineage.claimId, "SCI-2 claim id");
    if (movementTask.kind !== "MOVEMENT_TASK" || movementTask.phases.length < 2)
      throw new Error("MOVEMENT_TASK_INVALID");
    const result: {
      readonly evidence: SegmentationKinematicEvidence;
      readonly sci2Lineage: Sci2VelocityLineage;
      readonly movementTask: MovementTask;
      readonly protocol: SegmentationProtocolDefinition;
      readonly configuration: SegmentationConfiguration;
      readonly provenance: readonly ScienceProvenanceRef[];
      readonly exerciseDefinition?: ScientificDefinitionRef;
      readonly exerciseVariation?: ScientificDefinitionRef;
    } = {
      evidence: {
        ...evidence,
        objectOfInterest: createdObject,
        measurementPoint: createdPoint,
        referenceFrame: createdFrame,
        axis: createdAxis,
        modality: createdModality,
      },
      sci2Lineage,
      movementTask,
      protocol,
      configuration,
      provenance,
      ...(record.exerciseDefinition === undefined
        ? {}
        : {
            exerciseDefinition:
              record.exerciseDefinition as ScientificDefinitionRef,
          }),
      ...(record.exerciseVariation === undefined
        ? {}
        : {
            exerciseVariation:
              record.exerciseVariation as ScientificDefinitionRef,
          }),
    };
    return result;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid SCI-3 input.";
    const code: ScientificFailureCode = message.includes("NON_FINITE")
      ? "NON_FINITE_SAMPLE"
      : message.includes("DUPLICATE")
        ? "DUPLICATE_TIMESTAMP"
        : message.includes("NON_MONOTONIC")
          ? "NON_MONOTONIC_TIME"
          : message.includes("IRREGULAR")
            ? "IRREGULAR_TIMEBASE_UNSUPPORTED"
            : message.includes("OBJECT_BINDING")
              ? "OBJECT_BINDING_MISSING"
              : message.includes("SCI2")
                ? "PROTOCOL_INCOMPATIBLE"
                : message.includes("MOVEMENT_TASK") ||
                    message.includes("PHASE") ||
                    message.includes("Protocol")
                  ? "PROTOCOL_INCOMPATIBLE"
                  : "INPUT_INVALID";
    return structuredFailure(request, code, message);
  }
}

function identityPayload(
  identity: ScientificDefinitionRef,
): Readonly<Record<string, unknown>> {
  return {
    id: identity.id,
    version: identity.version,
    revision: identity.revision,
  };
}

function evidencePayload(
  evidence: SegmentationKinematicEvidence,
): Readonly<Record<string, unknown>> {
  return {
    samples: evidence.samples.map((sample) => ({
      sample_index: sample.sampleIndex,
      time_s: convertQuantity(
        createQuantity({
          value: sample.time,
          unit: evidence.timeUnit,
          dimension: "time",
        }),
        "s",
      ).value,
      position_m: convertQuantity(
        createQuantity({
          value: sample.position,
          unit: evidence.positionUnit,
          dimension: "length",
        }),
        "m",
      ).value,
      velocity_mps: convertQuantity(
        createQuantity({
          value: sample.velocity,
          unit: evidence.velocityUnit,
          dimension: "speed",
        }),
        "m/s",
      ).value,
    })),
    timebase: {
      declared_time_step_s: convertQuantity(
        createQuantity({
          value: evidence.timebase.declaredSamplingInterval,
          unit: evidence.timebase.declaredSamplingIntervalUnit,
          dimension: "time",
        }),
        "s",
      ).value,
      declared_sample_count: evidence.timebase.declaredSampleCount,
      provenance_reference: evidence.timebase.provenanceReference,
    },
    measurement: {
      object_of_interest: {
        object_kind: evidence.objectOfInterest.objectKind,
        object_id: evidence.objectOfInterest.objectId,
      },
      measurement_point: {
        object_kind: evidence.measurementPoint.objectKind,
        object_id: evidence.measurementPoint.objectId,
      },
      reference_frame: {
        frame_kind: evidence.referenceFrame.frameKind,
        frame_id: evidence.referenceFrame.frameId,
        convention: evidence.referenceFrame.convention,
      },
      axis: {
        axis: evidence.axis.axis,
        sense: evidence.axis.sense,
        frame: {
          frame_kind: evidence.axis.frame.frameKind,
          frame_id: evidence.axis.frame.frameId,
          convention: evidence.axis.frame.convention,
        },
      },
      modality: {
        kind: evidence.modality.kind,
        id: evidence.modality.modalityId,
      },
      assessment_id: evidence.assessmentId,
      trial_id: evidence.trialId,
      quality: evidence.quality,
      calibration_status: evidence.calibrationStatus,
    },
  };
}

function taskPayload(task: MovementTask): Readonly<Record<string, unknown>> {
  return {
    kind: task.kind,
    id: task.id,
    version: task.version,
    revision: task.revision,
    phases: task.phases.map((phase) => ({
      id: phase.id,
      ordinal: phase.ordinal,
      label: phase.label,
      action: phase.action,
      description: phase.description,
    })),
  };
}

function protocolPayload(
  protocol: SegmentationProtocolDefinition,
): Readonly<Record<string, unknown>> {
  return {
    kind: protocol.kind,
    id: protocol.id,
    version: protocol.version,
    revision: protocol.revision,
    supported_task_class: protocol.supportedTaskClass,
    movement_task: identityPayload(protocol.movementTask),
    expected_phase_sequence: protocol.expectedPhaseSequence.map(
      (reference) => ({
        movement_task: identityPayload(reference.movementTask),
        phase_id: reference.phaseId,
        phase_ordinal: reference.phaseOrdinal,
        phase_action: reference.phaseAction,
        polarity: reference.polarity,
      }),
    ),
    filtering_policy: protocol.filteringPolicy,
    interpolation_policy: protocol.interpolationPolicy,
    dwell_policy: protocol.dwellPolicy,
    boundary_policy: protocol.boundaryPolicy,
  };
}

function sci2Payload(
  lineage: Sci2VelocityLineage,
): Readonly<Record<string, unknown>> {
  return {
    claim_id: lineage.claimId,
    processor: lineage.processor,
    method: lineage.method,
    software: {
      package_name: lineage.software.packageName,
      package_version: lineage.software.packageVersion,
      source_revision: lineage.software.sourceRevision,
      build_id: lineage.software.buildId,
    },
    qualification: {
      status: lineage.qualification.status,
      source_revision: lineage.qualification.sourceRevision,
      build_id: lineage.qualification.buildId,
    },
  };
}

function canonicalEnginePayload(
  validated: Extract<
    ReturnType<typeof validateEvidence>,
    { readonly evidence: SegmentationKinematicEvidence }
  >,
): Readonly<Record<string, unknown>> {
  return {
    ...evidencePayload(validated.evidence),
    sci2_lineage: sci2Payload(validated.sci2Lineage),
    movement_task: taskPayload(validated.movementTask),
    protocol: protocolPayload(validated.protocol),
    configuration: configurationPayload(validated.configuration),
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
    throw new Error("Python engine returned an invalid response envelope.");
  if (value.status === "FAILED") {
    if (
      !isRecord(value.failure) ||
      typeof value.failure.code !== "string" ||
      typeof value.failure.message !== "string" ||
      !Array.isArray(value.failure.details)
    ) {
      throw new Error("Python engine returned an invalid failure payload.");
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
        "Python engine returned an invalid infrastructure payload.",
      );
    }
    return value as unknown as EngineInfrastructureFailure;
  }
  if (value.status !== "SUCCEEDED")
    throw new Error("Python engine returned an unknown response status.");
  const timebase = isRecord(value.timebase) ? value.timebase : null;
  if (
    !expectedIdentity(value.processor, {
      id: SEGMENTATION_PROCESSOR_ID,
      version: SEGMENTATION_PROCESSOR_VERSION,
    }) ||
    !expectedIdentity(value.method, {
      id: SEGMENTATION_METHOD_ID,
      version: SEGMENTATION_METHOD_VERSION,
    }) ||
    !isRecord(timebase) ||
    !isFiniteNumber(timebase.declared_step_s) ||
    timebase.declared_step_s <= 0 ||
    !isInteger(timebase.declared_sample_count) ||
    !Array.isArray(value.state_runs) ||
    !Array.isArray(value.repetitions) ||
    !isRecord(value.uncertainty) ||
    !isRecord(value.diagnostics)
  ) {
    throw new Error("Python engine returned an invalid success payload.");
  }
  return value as unknown as EngineSuccess;
}

function closeEnough(left: number, right: number): boolean {
  const tolerance = Math.max(
    1e-12,
    1e-12 * Math.max(1, Math.abs(left), Math.abs(right)),
  );
  return Math.abs(left - right) <= tolerance;
}

function assertBoundary(
  boundary: EngineBoundary,
  samples: readonly SegmentationKinematicSample[],
  step: number,
): void {
  const sample = isInteger(boundary.sample_index)
    ? samples[boundary.sample_index]
    : undefined;
  if (
    !isInteger(boundary.sample_index) ||
    boundary.sample_index < 0 ||
    boundary.sample_index >= samples.length ||
    sample === undefined ||
    !isFiniteNumber(boundary.time_s) ||
    !closeEnough(boundary.time_s, sample.time) ||
    typeof boundary.event_type !== "string" ||
    boundary.event_method !== "SAMPLE_STATE_TRANSITION_NO_INTERPOLATION" ||
    !isFiniteNumber(boundary.temporal_resolution_s) ||
    !closeEnough(boundary.temporal_resolution_s, step)
  ) {
    throw new Error("Python engine returned an invalid sampled boundary.");
  }
}

function assertEngineAlignment(
  engine: EngineSuccess,
  validated: Extract<
    ReturnType<typeof validateEvidence>,
    { readonly evidence: SegmentationKinematicEvidence }
  >,
): void {
  const expectedStep = convertQuantity(
    createQuantity({
      value: validated.evidence.timebase.declaredSamplingInterval,
      unit: validated.evidence.timebase.declaredSamplingIntervalUnit,
      dimension: "time",
    }),
    "s",
  ).value;
  if (
    engine.timebase.declared_sample_count !==
      validated.evidence.samples.length ||
    !closeEnough(engine.timebase.declared_step_s, expectedStep)
  ) {
    throw new Error(
      "Python engine response does not match the input timebase.",
    );
  }
  const expectedPayload = canonicalEnginePayload(validated);
  if (
    canonicalJson(engine.measurement) !==
      canonicalJson(expectedPayload.measurement) ||
    canonicalJson(engine.sci2_lineage) !==
      canonicalJson(expectedPayload.sci2_lineage) ||
    canonicalJson(engine.movement_task) !==
      canonicalJson(expectedPayload.movement_task) ||
    canonicalJson(engine.protocol) !==
      canonicalJson(expectedPayload.protocol) ||
    canonicalJson(engine.configuration) !==
      canonicalJson(expectedPayload.configuration)
  ) {
    throw new Error(
      "Python engine response changed the bound scientific input identity.",
    );
  }
  for (const [repetitionIndex, repetition] of engine.repetitions.entries()) {
    if (
      !isInteger(repetition.ordinal) ||
      repetition.complete !== true ||
      repetition.phases.length !== 2
    ) {
      throw new Error(
        "Python engine returned an invalid repetition structure.",
      );
    }
    assertBoundary(repetition.start, validated.evidence.samples, expectedStep);
    assertBoundary(repetition.end, validated.evidence.samples, expectedStep);
    if (repetition.ordinal !== repetitionIndex + 1) {
      throw new Error(
        "Python engine returned a non-contiguous repetition ordinal.",
      );
    }
    const expectedPhases = validated.protocol.expectedPhaseSequence;
    for (const [phaseIndex, phase] of repetition.phases.entries()) {
      if (phase.polarity !== "POSITIVE" && phase.polarity !== "NEGATIVE")
        throw new Error("Python engine returned an invalid phase polarity.");
      assertBoundary(phase.start, validated.evidence.samples, expectedStep);
      assertBoundary(phase.end, validated.evidence.samples, expectedStep);
      const expectedPhase = expectedPhases[phaseIndex];
      if (
        expectedPhase === undefined ||
        phase.polarity !== expectedPhase.polarity ||
        !isRecord(phase.phase_ref) ||
        phase.phase_ref.phase_id !== expectedPhase.phaseId ||
        phase.phase_ref.phase_ordinal !== expectedPhase.phaseOrdinal
      ) {
        throw new Error(
          "Python engine returned a phase that does not match the active protocol.",
        );
      }
      if (
        !isFiniteNumber(phase.duration_s) ||
        phase.duration_s < 0 ||
        !isFiniteNumber(phase.excursion_m) ||
        phase.excursion_m < 0
      ) {
        throw new Error("Python engine returned invalid phase measurements.");
      }
    }
    const firstPhase = repetition.phases[0];
    const lastPhase = repetition.phases[repetition.phases.length - 1];
    if (
      firstPhase === undefined ||
      lastPhase === undefined ||
      repetition.start.sample_index !== firstPhase.start.sample_index ||
      repetition.end.sample_index !== lastPhase.end.sample_index
    ) {
      throw new Error(
        "Python engine repetition boundaries do not enclose its phases.",
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
          new Error(`Python engine exited with code ${code}: ${stderr.trim()}`),
        );
        return;
      }
      try {
        resolve(parseEngineResponse(JSON.parse(stdout) as unknown));
      } catch (error) {
        reject(
          error instanceof Error
            ? error
            : new Error("Python engine returned an invalid response."),
        );
      }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

function mapEngineFailureCode(code: string): ScientificFailureCode {
  if (FAILURE_CODES.has(code as ScientificFailureCode))
    return code as ScientificFailureCode;
  if (code === "PHASE_DEFINITION_MISSING") return "REQUIRED_EVIDENCE_MISSING";
  if (
    code === "NO_VALID_REPETITION" ||
    code === "PARTIAL_REPETITION" ||
    code === "INCOMPLETE_TRACE" ||
    code === "SEGMENTATION_AMBIGUOUS"
  )
    return "PROTOCOL_INCOMPATIBLE";
  if (
    code === "SCI2_NOT_QUALIFIED" ||
    code === "SCI2_LINEAGE_MISMATCH" ||
    code === "MOVEMENT_TASK_INVALID"
  )
    return "PROTOCOL_INCOMPATIBLE";
  return "INPUT_INVALID";
}

function buildResult(
  request: ScienceRequest,
  validated: Extract<
    ReturnType<typeof validateEvidence>,
    { readonly evidence: SegmentationKinematicEvidence }
  >,
  engine: EngineSuccess,
  contract: ScientificProcessorContract,
): ScienceResult {
  const inputPayload = canonicalEnginePayload(validated);
  const lineageProvenance = [
    ...validated.provenance,
    { type: "SCI2_CLAIM", ref: validated.sci2Lineage.claimId },
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
  const claimId = `segmentation-${inputFingerprint.slice(0, 24)}`;
  const nodeId = `derivation-${inputFingerprint.slice(0, 24)}`;
  const segmentationReference = `science-segmentation:${inputFingerprint}`;
  const parents = [
    ...validated.provenance.map((reference) => ({
      kind: "PSC4_EVIDENCE" as const,
      ref: reference.ref,
    })),
    {
      kind: "SCIENTIFIC_CLAIM" as const,
      ref: validated.sci2Lineage.claimId,
      claimClass: "MECHANICALLY_DERIVED" as const,
    },
  ];
  const claim = createScientificClaim({
    claimClass: "MECHANICALLY_DERIVED",
    claimId,
    value: { kind: "REFERENCE", value: segmentationReference },
    output: { kind: "REFERENCE" },
    method: contract.method,
    software: contract.software,
    assumptions: contract.assumptions,
    configuration: contract.configuration,
    lineage: { parents, provenance: lineageProvenance },
  });
  const derivationInputs: readonly DerivationInputReference[] = [
    ...validated.provenance.map((reference) => ({
      kind: "PSC4_EVIDENCE" as const,
      ref: reference.ref,
    })),
    {
      kind: "SCIENTIFIC_CLAIM" as const,
      ref: validated.sci2Lineage.claimId,
      claimClass: "MECHANICALLY_DERIVED" as const,
    },
  ];
  const derivation = createDerivationGraph({
    nodes: [
      {
        nodeId,
        outputClaimId: claimId,
        outputClass: "MECHANICALLY_DERIVED",
        inputs: derivationInputs,
        processor: contract.processor,
        method: contract.method,
        software: contract.software,
        assumptions: contract.assumptions,
        configuration: contract.configuration,
        createdAt: nowInstant(),
        supersession: { kind: "NONE" },
      },
    ],
    edges: [],
  });
  const recalculationHistory = createRecalculationHistory({
    records: [
      {
        recordId: `recalculation-${inputFingerprint.slice(0, 24)}`,
        outputClaimId: claimId,
        inputReferences: derivationInputs,
        processor: contract.processor,
        method: contract.method,
        software: contract.software,
        configuration: contract.configuration,
        generatedAt: nowInstant(),
        supersedesRecordId: null,
      },
    ],
  });
  const value = {
    claim,
    segmentationReference,
    measurement: validated.evidence,
    sci2Lineage: validated.sci2Lineage,
    movementTask: validated.movementTask,
    ...(validated.exerciseDefinition === undefined
      ? {}
      : { exerciseDefinition: validated.exerciseDefinition }),
    ...(validated.exerciseVariation === undefined
      ? {}
      : { exerciseVariation: validated.exerciseVariation }),
    protocol: validated.protocol,
    configuration: validated.configuration,
    qualification: contract.qualification,
    repetitions: engine.repetitions,
    stateRuns: engine.state_runs,
    uncertainty: engine.uncertainty,
    diagnostics: engine.diagnostics,
    failureState: "NONE",
    derivation,
    recalculationHistory,
  };
  const step = convertQuantity(
    createQuantity({
      value: validated.evidence.timebase.declaredSamplingInterval,
      unit: validated.evidence.timebase.declaredSamplingIntervalUnit,
      dimension: "time",
    }),
    "s",
  ).value;
  return {
    requestId: request.requestId,
    capabilityId: request.capabilityId,
    status: "ok",
    method: contract.method,
    inputFingerprint,
    value,
    unit: null,
    dimension: null,
    uncertainty: {
      status: "UNKNOWN",
      temporalResolutionSeconds: step,
      components: {
        samplingResolution: { status: "DECLARED", seconds: step },
        referenceLabel: { status: "NOT_PROVIDED" },
        algorithmicTiming: {
          status: "NOT_ESTIMATED",
          boundaryPolicy: "SAMPLE_ONLY",
        },
        deviceTiming: { status: "NOT_PROVIDED" },
        filterPhaseShift: { status: "NOT_APPLICABLE", filtering: "NONE" },
        acquisitionSensitivity: { status: "NOT_PROVIDED" },
        measurementPoint: { status: "DECLARED_INPUT_BINDING_ONLY" },
        protocolAmbiguity: { status: "FAIL_CLOSED_ON_UNKNOWN_OR_PARTIAL" },
      },
      statement:
        "Temporal resolution is reported separately and is not treated as an uncertainty estimate.",
    },
    assumptions: contract.assumptions.map(
      (assumption) => assumption.description,
    ),
    limitations: [
      "SCI-3 v1 detects boundaries for one protocol-defined two-phase one-dimensional implement-motion class only.",
      "Filtering and interpolation are explicitly disabled; boundaries are sample-time observations.",
      "Unknown, partial, and unsupported traces fail closed instead of being repaired or silently dropped.",
      "No fatigue, readiness, velocity loss, load velocity, 1RM, prescription, or quality inference is emitted.",
      "Empirical real-world segmentation validation is not bound to this candidate; qualification remains limited accordingly.",
    ],
    provenance: [
      ...lineageProvenance,
      { type: "SCI0_DERIVATION_NODE", ref: nodeId },
      { type: "SCI0_CLAIM", ref: claimId },
    ],
    generatedAt: nowInstant(),
  };
}

export function createSegmentationProtocolDefinition(
  input: SegmentationProtocolDefinition,
): SegmentationProtocolDefinition {
  requireText(input.id, "Segmentation protocol id");
  requireText(input.version, "Segmentation protocol version");
  if (!Number.isInteger(input.revision) || input.revision < 1)
    throw new Error("Segmentation protocol revision must be positive.");
  if (
    !Array.isArray(input.expectedPhaseSequence) ||
    input.expectedPhaseSequence.length !== 2
  )
    throw new Error("SCI-3 v1 requires exactly two phase references.");
  if (
    input.expectedPhaseSequence[0]?.polarity ===
    input.expectedPhaseSequence[1]?.polarity
  )
    throw new Error("SCI-3 phase polarities must be opposite.");
  return input;
}

export function createSegmentationRequest(
  input: SegmentationRequestInput,
): ScienceRequest {
  requireText(input.requestId, "Science request id");
  if (input.inputProvenance.length === 0)
    throw new Error("SCI-3 requests require input provenance.");
  createSegmentationProtocolDefinition(input.protocol);
  const structured: Record<string, unknown> = {
    evidence: input.evidence,
    sci2Lineage: input.sci2Lineage,
    movementTask: input.movementTask,
    protocol: input.protocol,
    configuration: input.configuration,
    ...(input.exerciseDefinition === undefined
      ? {}
      : { exerciseDefinition: input.exerciseDefinition }),
    ...(input.exerciseVariation === undefined
      ? {}
      : { exerciseVariation: input.exerciseVariation }),
  };
  return {
    requestId: input.requestId,
    capabilityId: SEGMENTATION_CAPABILITY_ID,
    capabilityVersion: SEGMENTATION_CAPABILITY_VERSION,
    ...(input.athleteId === undefined
      ? {}
      : { subjectRef: { athleteId: input.athleteId as never } }),
    ...(input.observedAt === undefined
      ? {}
      : { observedAt: parseInstant(input.observedAt) }),
    inputs: {
      [KINEMATIC_INPUT_KEY]: { kind: "structured", value: structured },
    },
    inputProvenance: input.inputProvenance,
  };
}

export class SegmentationSciencePort implements SciencePort {
  readonly contract: ScientificProcessorContract;
  private readonly configuration: SegmentationConfiguration;
  private readonly pythonExecutable: string;
  private readonly pythonScriptPath: string;
  private readonly engineInvoker: SegmentationEngineInvoker | undefined;

  constructor(options: SegmentationAdapterOptions) {
    this.contract = processorContract(options);
    this.configuration = options.configuration;
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
        capabilityId: SEGMENTATION_CAPABILITY_ID,
        status:
          this.contract.qualification.status === "QUALIFIED"
            ? "ok"
            : "method_unavailable",
        description:
          "Segment protocol-defined repetitions and task-defined phases from qualified SCI-2 kinematics without interpreting performance.",
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
    ) {
      return malformedRequestFailure(request);
    }
    if (request.capabilityId !== SEGMENTATION_CAPABILITY_ID) {
      return {
        requestId: request.requestId,
        capabilityId: request.capabilityId,
        status: "not_applicable",
        generatedAt: nowInstant(),
        error: {
          code: "CAPABILITY_NOT_SUPPORTED",
          message:
            "The SCI-3 port owns one narrow segmentation capability only.",
        },
      };
    }
    if (
      request.capabilityVersion !== undefined &&
      request.capabilityVersion !== SEGMENTATION_CAPABILITY_VERSION
    ) {
      return structuredFailure(
        request,
        "UNSUPPORTED_CONFIGURATION",
        "The requested SCI-3 capability version is unsupported.",
      );
    }
    if (this.contract.qualification.status !== "QUALIFIED") {
      return {
        requestId: request.requestId,
        capabilityId: request.capabilityId,
        status: "method_unavailable",
        generatedAt: nowInstant(),
        error: {
          code: "PROCESSOR_NOT_QUALIFIED",
          message: "The SCI-3 processor is not qualified for execution.",
        },
      };
    }
    const validated = validateEvidence(request, this.configuration);
    if ("status" in validated) return validated;
    try {
      const payload = canonicalEnginePayload(validated);
      const engine =
        this.engineInvoker === undefined
          ? await runPython(
              payload,
              this.pythonExecutable,
              this.pythonScriptPath,
            )
          : parseEngineResponse(await this.engineInvoker(payload));
      if (engine.status === "FAILED") {
        const code = mapEngineFailureCode(engine.failure.code);
        return structuredFailure(
          request,
          code,
          `SCI3_FAILURE_CODE=${engine.failure.code}: ${engine.failure.message}`,
          engine.failure.details,
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
          : "The SCI-3 engine could not be executed.",
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
