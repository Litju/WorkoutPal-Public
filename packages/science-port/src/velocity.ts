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
  type PhysicalObjectReference,
  type ReferenceFrameReference,
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

export const POSITION_VELOCITY_CAPABILITY_ID =
  "resistance_training.linear_velocity_from_position";
export const POSITION_VELOCITY_CAPABILITY_VERSION = "1.0.0";
export const POSITION_VELOCITY_PROCESSOR_ID = POSITION_VELOCITY_CAPABILITY_ID;
export const POSITION_VELOCITY_PROCESSOR_VERSION = "1.0.0";
export const POSITION_VELOCITY_METHOD_ID =
  "finite_difference.second_order_uniform";
export const POSITION_VELOCITY_METHOD_VERSION = "1.0.0";

const PYTHON_PROCESSOR_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../engine/velocity_processor.py",
);

const DEFAULT_CONFIGURATION = {
  minimumSamples: 3,
  uniformAbsoluteToleranceSeconds: 1e-12,
  uniformRelativeTolerance: 1e-9,
  filtering: "NONE",
  boundaryTreatment: "SECOND_ORDER_ONE_SIDED",
} as const;

const POSITION_TIME_INPUT_KEY = "position_time_series";

const PHYSICAL_OBJECT_KINDS = new Set([
  "ATHLETE",
  "ATHLETE_BODY_COM",
  "ATHLETE_PLUS_EXTERNAL_LOAD_SYSTEM",
  "IMPLEMENT",
  "BODY_SEGMENT",
  "EXTERNAL_OBJECT",
  "MEASUREMENT_POINT",
  "CUSTOM_DECLARED_OBJECT",
]);
const REFERENCE_FRAME_KINDS = new Set([
  "GLOBAL_LAB",
  "BODY",
  "SEGMENT_LOCAL",
  "IMPLEMENT",
  "DEVICE",
  "CUSTOM_DECLARED",
]);
const DIRECTION_AXES = new Set(["X", "Y", "Z", "CUSTOM"]);
const DIRECTION_SENSES = new Set(["POSITIVE", "NEGATIVE", "UNSPECIFIED"]);
const MODALITY_KINDS = new Set([
  "POSITION_TRANSDUCER",
  "ENCODER",
  "FORCE_PLATFORM",
  "INERTIAL_SENSOR",
  "VIDEO_KINEMATICS",
  "TIMING_GATE",
  "MANUAL_OBSERVATION",
  "CUSTOM_DECLARED",
]);

function nowInstant(): Instant {
  return parseInstant(new Date().toISOString());
}

export interface PositionTimeSample {
  readonly sampleIndex: number;
  readonly time: number;
  readonly position: number;
}

export interface PositionTimebaseEvidence {
  readonly declaredSamplingInterval: number;
  readonly declaredSamplingIntervalUnit: string;
  readonly declaredSampleCount: number;
  readonly provenanceReference: string;
  readonly missingSamplePolicy: "REJECT";
  readonly irregularSamplingPolicy: "REJECT";
}

export interface PositionTimeSeriesEvidence {
  readonly samples: readonly PositionTimeSample[];
  readonly timebase: PositionTimebaseEvidence;
  readonly positionUnit: string;
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

export interface ExplicitVelocityInterval {
  readonly id: string;
  readonly startIndex: number;
  readonly endIndex: number;
  readonly qualificationReference: string;
}

export interface PositionVelocityRequestInput {
  readonly requestId: string;
  readonly evidence: PositionTimeSeriesEvidence;
  readonly inputProvenance: readonly ScienceProvenanceRef[];
  readonly intervals?: readonly ExplicitVelocityInterval[];
  readonly observedAt?: string;
  readonly athleteId?: string;
}

export interface PositionVelocityAdapterOptions {
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
  readonly engineInvoker?: PositionVelocityEngineInvoker;
  readonly configuration?: Partial<{
    readonly minimumSamples: number;
    readonly uniformAbsoluteToleranceSeconds: number;
    readonly uniformRelativeTolerance: number;
    readonly filtering: "NONE";
    readonly boundaryTreatment: "SECOND_ORDER_ONE_SIDED";
  }>;
}

export type PositionVelocityEngineInvoker = (
  payload: Readonly<Record<string, unknown>>,
) => Promise<unknown>;

interface EngineSuccess {
  readonly status: "SUCCEEDED";
  readonly processor: MethodIdentity;
  readonly method: MethodIdentity;
  readonly time_step_s: number;
  readonly timebase: {
    readonly declared_step_s: number;
    readonly declared_sample_count: number;
  };
  readonly velocity_samples: readonly {
    readonly time_s: number;
    readonly velocity_mps: number;
  }[];
  readonly interval_summaries: readonly {
    readonly id: string;
    readonly qualification_reference: string;
    readonly start_index: number;
    readonly end_index: number;
    readonly interval_average_velocity_mps: number;
    readonly peak_sampled_velocity_mps: number;
  }[];
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

const SCIENTIFIC_FAILURE_CODES = new Set<ScientificFailureCode>([
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

function requireText(value: string, label: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) throw new Error(`${label} is required.`);
  return normalized;
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

function qualificationBinding(
  options: PositionVelocityAdapterOptions,
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
    const qualificationId = requireText(
      qualification.qualificationId,
      "Qualification id",
    );
    const qualificationVersion = requireText(
      qualification.qualificationVersion,
      "Qualification version",
    );
    const oracleId = requireText(qualification.oracle.id, "Oracle id");
    const oracleVersion = requireText(
      qualification.oracle.version,
      "Oracle version",
    );
    const validationDataId = requireText(
      qualification.validationData.id,
      "Validation data id",
    );
    const validationDataVersion = requireText(
      qualification.validationData.version,
      "Validation data version",
    );
    const sourceRevision = requireText(
      qualification.sourceRevision,
      "Qualified source revision",
    );
    const buildId = requireText(qualification.buildId, "Qualified build id");
    if (
      sourceRevision !== options.software.sourceRevision ||
      buildId !== options.software.buildId
    ) {
      return {
        status: "NOT_QUALIFIED",
        reason:
          "Qualification software identity must exactly match the bound software provenance.",
      };
    }
    if (!/^[0-9a-f]{40,64}$/iu.test(options.software.sourceRevision)) {
      return {
        status: "NOT_QUALIFIED",
        reason: "Qualified software provenance must bind an exact commit SHA.",
      };
    }
    return {
      status: "QUALIFIED",
      identity: {
        qualificationId,
        qualificationVersion,
        processor,
        method,
        software: options.software,
        oracle: { id: oracleId, version: oracleVersion },
        validationData: {
          id: validationDataId,
          version: validationDataVersion,
        },
      },
    };
  } catch (error) {
    return {
      status: "NOT_QUALIFIED",
      reason:
        error instanceof Error
          ? error.message
          : "Qualification identity is incomplete.",
    };
  }
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

function configurationSnapshot(
  configuration: PositionVelocityAdapterOptions["configuration"],
): ConfigurationSnapshot {
  const parameters = {
    minimumSamples:
      configuration?.minimumSamples ?? DEFAULT_CONFIGURATION.minimumSamples,
    uniformAbsoluteToleranceSeconds:
      configuration?.uniformAbsoluteToleranceSeconds ??
      DEFAULT_CONFIGURATION.uniformAbsoluteToleranceSeconds,
    uniformRelativeTolerance:
      configuration?.uniformRelativeTolerance ??
      DEFAULT_CONFIGURATION.uniformRelativeTolerance,
    filtering: configuration?.filtering ?? DEFAULT_CONFIGURATION.filtering,
    boundaryTreatment:
      configuration?.boundaryTreatment ??
      DEFAULT_CONFIGURATION.boundaryTreatment,
  } as const;
  const canonicalSerialization = canonicalJson(parameters);
  return {
    id: "resistance_training.linear_velocity_from_position.configuration",
    parameters,
    canonicalSerialization,
    contentHash: sha256(canonicalSerialization),
  };
}

function assumptions(): readonly AssumptionDeclaration[] {
  return [
    {
      id: "uniform-timebase",
      version: "1.0.0",
      description:
        "Position samples have a declared, provenance-bound uniform timebase and complete consecutive indexes; missing and irregular samples are rejected.",
      reference: {
        type: "DOI",
        ref: "10.1090/S0025-5718-1988-0935077-0",
      },
      status: "DECLARED",
      parameters: {
        sampling: "uniform",
        interpolation: "NONE",
        missingSamples: "REJECT",
      },
    },
    {
      id: "signed-axis-projection",
      version: "1.0.0",
      description:
        "The scalar position is already projected onto the declared reference-frame axis and retains its sign.",
      reference: {
        type: "REPOSITORY_AUTHORITY",
        ref: "public-scientific-contract:SCI-1:measurement-semantics",
      },
      status: "DECLARED",
      parameters: { absoluteValue: false },
    },
  ];
}

function uncertaintyPolicy(): UncertaintyPolicy {
  const unknown = (reason: string) => ({ kind: "UNKNOWN" as const, reason });
  return {
    measurement: unknown(
      "Input measurement uncertainty is retained as a limitation; SCI-2 v1 does not propagate it.",
    ),
    statistical: unknown("No statistical estimator is used by this processor."),
    model: unknown("No biomechanical model is used by this processor."),
    propagated: unknown(
      "No validated propagation method is bound to the v1 numerical processor.",
    ),
    output: "UNKNOWN_ALLOWED",
  };
}

function processorContract(
  options: PositionVelocityAdapterOptions,
): ScientificProcessorContract {
  const processor = {
    id: POSITION_VELOCITY_PROCESSOR_ID,
    version: POSITION_VELOCITY_PROCESSOR_VERSION,
  };
  const method = {
    id: POSITION_VELOCITY_METHOD_ID,
    version: POSITION_VELOCITY_METHOD_VERSION,
  };
  const configuration = configurationSnapshot(options.configuration);
  const declaredAssumptions = assumptions();
  const qualification = qualificationBinding(options, processor, method);
  return createProcessorContract({
    processor,
    method,
    software: options.software,
    inputs: [
      {
        id: POSITION_TIME_INPUT_KEY,
        source: "PSC4_EVIDENCE",
        required: true,
        acceptedClaimClasses: [],
        dimensions: ["length"] as readonly Dimension[],
        units: ["m"],
        acceptedValidityStates: ["VALID"],
        acceptedExclusionStates: ["INCLUDED"],
        acceptedMissingness: ["NOT_APPLICABLE"],
        protocol: { kind: "NONE" },
      },
    ],
    output: {
      claimClass: "MECHANICALLY_DERIVED",
      valueKind: "REFERENCE",
    },
    assumptions: declaredAssumptions,
    calibration: {
      kind: "OPTIONAL",
      acceptedStatuses: ["CALIBRATED", "NOT_REQUIRED"],
    },
    uncertainty: uncertaintyPolicy(),
    configuration,
    determinism: "DETERMINISTIC",
    failureModes: [
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
    ],
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

function inputRecord(
  request: ScienceRequest,
): Readonly<Record<string, unknown>> | null {
  const input: ScienceInputValue | undefined =
    request.inputs[POSITION_TIME_INPUT_KEY];
  if (input?.kind !== "structured") return null;
  return input.value;
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
        : POSITION_VELOCITY_CAPABILITY_ID,
    status: "invalid_input",
    generatedAt: nowInstant(),
    error: {
      code: "REQUIRED_EVIDENCE_MISSING",
      message:
        "A ScienceRequest must include requestId, capabilityId, inputs, and inputProvenance.",
    },
  };
}

function validateEvidence(request: ScienceRequest):
  | {
      readonly evidence: PositionTimeSeriesEvidence;
      readonly provenance: readonly ScienceProvenanceRef[];
    }
  | ScienceResult {
  const record = inputRecord(request);
  if (record === null) {
    return structuredFailure(
      request,
      "REQUIRED_EVIDENCE_MISSING",
      "A structured position_time_series input is required.",
    );
  }
  const evidence = record as unknown as PositionTimeSeriesEvidence;
  if (!Array.isArray(evidence.samples)) {
    return structuredFailure(
      request,
      "REQUIRED_EVIDENCE_MISSING",
      "Position-time samples are required.",
    );
  }
  if (!Array.isArray(request.inputProvenance)) {
    return structuredFailure(
      request,
      "REQUIRED_EVIDENCE_MISSING",
      "PSC4 source-evidence provenance is required as an array.",
    );
  }
  if (evidence.samples.length < 3) {
    return structuredFailure(
      request,
      "INSUFFICIENT_SAMPLES",
      "At least three consecutive position-time samples are required.",
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
      "Position-time processing requires PSC4 source-evidence provenance.",
    );
  }
  if (
    evidence.objectOfInterest === undefined ||
    evidence.objectOfInterest === null
  ) {
    return structuredFailure(
      request,
      "OBJECT_BINDING_MISSING",
      "The physical object of interest must be explicitly declared.",
    );
  }
  if (
    evidence.measurementPoint === undefined ||
    evidence.measurementPoint === null
  ) {
    return structuredFailure(
      request,
      "MEASUREMENT_POINT_BINDING_MISSING",
      "The physical measurement point must be explicitly declared.",
    );
  }
  if (
    evidence.referenceFrame === undefined ||
    evidence.referenceFrame === null
  ) {
    return structuredFailure(
      request,
      "REFERENCE_FRAME_MISSING",
      "The reference frame must be explicitly declared.",
    );
  }
  if (evidence.axis === undefined || evidence.axis === null) {
    return structuredFailure(
      request,
      "AXIS_BINDING_MISSING",
      "The measurement axis must be explicitly declared.",
    );
  }
  if (evidence.timebase === undefined || evidence.timebase === null) {
    return structuredFailure(
      request,
      "REQUIRED_EVIDENCE_MISSING",
      "A declared timebase and its provenance are required.",
    );
  }
  try {
    if (
      !isRecord(evidence.objectOfInterest) ||
      typeof evidence.objectOfInterest.objectKind !== "string" ||
      !PHYSICAL_OBJECT_KINDS.has(evidence.objectOfInterest.objectKind)
    ) {
      return structuredFailure(
        request,
        "OBJECT_BINDING_MISSING",
        "The object of interest has an unsupported object-kind discriminator.",
      );
    }
    if (
      !isRecord(evidence.measurementPoint) ||
      typeof evidence.measurementPoint.objectKind !== "string" ||
      !PHYSICAL_OBJECT_KINDS.has(evidence.measurementPoint.objectKind)
    ) {
      return structuredFailure(
        request,
        "MEASUREMENT_POINT_BINDING_MISSING",
        "The measurement point has an unsupported object-kind discriminator.",
      );
    }
    if (
      !isRecord(evidence.referenceFrame) ||
      typeof evidence.referenceFrame.frameKind !== "string" ||
      !REFERENCE_FRAME_KINDS.has(evidence.referenceFrame.frameKind)
    ) {
      return structuredFailure(
        request,
        "REFERENCE_FRAME_MISSING",
        "The reference frame has an unsupported frame-kind discriminator.",
      );
    }
    if (
      !isRecord(evidence.axis) ||
      typeof evidence.axis.axis !== "string" ||
      !DIRECTION_AXES.has(evidence.axis.axis) ||
      typeof evidence.axis.sense !== "string" ||
      !DIRECTION_SENSES.has(evidence.axis.sense) ||
      !isRecord(evidence.axis.frame) ||
      typeof evidence.axis.frame.frameKind !== "string" ||
      !REFERENCE_FRAME_KINDS.has(evidence.axis.frame.frameKind)
    ) {
      return structuredFailure(
        request,
        "AXIS_BINDING_MISSING",
        "The axis has an unsupported direction or frame discriminator.",
      );
    }
    if (
      !isRecord(evidence.modality) ||
      typeof evidence.modality.kind !== "string" ||
      !MODALITY_KINDS.has(evidence.modality.kind)
    ) {
      return structuredFailure(
        request,
        "INPUT_INVALID",
        "The measurement modality has an unsupported kind discriminator.",
      );
    }
    const objectOfInterest = createPhysicalObjectReference(
      evidence.objectOfInterest,
    );
    const measurementPoint = createPhysicalObjectReference(
      evidence.measurementPoint,
    );
    if (measurementPoint.objectKind !== "MEASUREMENT_POINT") {
      return structuredFailure(
        request,
        "MEASUREMENT_POINT_BINDING_MISSING",
        "The measurement point must be explicitly declared as a MEASUREMENT_POINT object.",
      );
    }
    const referenceFrame = createReferenceFrameReference(
      evidence.referenceFrame,
    );
    const axis = createDirectionDescriptor(evidence.axis);
    if (!sameFrame(referenceFrame, axis.frame)) {
      return structuredFailure(
        request,
        "AXIS_BINDING_MISSING",
        "The declared axis must use the declared reference frame.",
      );
    }
    createMeasurementModalityReference(evidence.modality);
    const timebase = evidence.timebase;
    if (
      timebase.missingSamplePolicy !== "REJECT" ||
      timebase.irregularSamplingPolicy !== "REJECT"
    ) {
      return structuredFailure(
        request,
        "MISSING_SAMPLE_UNSUPPORTED",
        "SCI-2 v1 requires explicit rejection of missing and irregular samples.",
      );
    }
    if (
      !Number.isInteger(timebase.declaredSampleCount) ||
      timebase.declaredSampleCount !== evidence.samples.length
    ) {
      return structuredFailure(
        request,
        "MISSING_SAMPLE_UNSUPPORTED",
        "The declared sample count must equal the complete consecutive sample series.",
      );
    }
    if (!isFiniteNumber(timebase.declaredSamplingInterval)) {
      return structuredFailure(
        request,
        "SAMPLING_INTERVAL_INVALID",
        "The declared sampling interval must be finite.",
      );
    }
    if (
      typeof timebase.provenanceReference !== "string" ||
      timebase.provenanceReference.trim().length === 0
    ) {
      return structuredFailure(
        request,
        "REQUIRED_EVIDENCE_MISSING",
        "Timebase provenance is required.",
      );
    }
    const declaredTimeStepSeconds = convertQuantity(
      createQuantity({
        value: timebase.declaredSamplingInterval,
        unit: timebase.declaredSamplingIntervalUnit,
        dimension: "time",
      }),
      "s",
    ).value;
    if (declaredTimeStepSeconds <= 0) {
      return structuredFailure(
        request,
        "SAMPLING_INTERVAL_INVALID",
        "The declared sampling interval must be positive.",
      );
    }
    evidence.samples.forEach((sample, index) => {
      if (
        sample === null ||
        typeof sample !== "object" ||
        !Number.isInteger(sample.sampleIndex) ||
        sample.sampleIndex !== index
      ) {
        throw new Error(`${index}:missing-sample-index`);
      }
    });
    if (
      evidence.assessmentId.trim().length === 0 ||
      evidence.trialId.trim().length === 0
    ) {
      return structuredFailure(
        request,
        "REQUIRED_EVIDENCE_MISSING",
        "Assessment and trial identity are required.",
      );
    }
    if (
      evidence.calibrationStatus !== "CALIBRATED" &&
      evidence.calibrationStatus !== "NOT_REQUIRED"
    ) {
      return structuredFailure(
        request,
        "CALIBRATION_REQUIREMENT_UNSATISFIED",
        "SCI-2 v1 accepts only CALIBRATED or NOT_REQUIRED input calibration states.",
      );
    }
    if (
      evidence.quality.input !== "VALID" ||
      evidence.quality.acquisition !== "VALID"
    ) {
      return structuredFailure(
        request,
        "INPUT_INVALID",
        "Position-time evidence must be explicitly valid.",
      );
    }
    if (evidence.quality.trial !== "VALID") {
      return structuredFailure(
        request,
        "TRIAL_INVALID",
        "Position-time processing requires a VALID trial.",
      );
    }
    if (evidence.quality.exclusion === "EXCLUDED") {
      return structuredFailure(
        request,
        "TRIAL_EXCLUDED",
        "Excluded trials cannot produce a velocity claim.",
      );
    }
    if (evidence.quality.protocol !== "APPLICABLE") {
      return structuredFailure(
        request,
        "PROTOCOL_INCOMPATIBLE",
        "The position-time protocol must be explicitly applicable.",
      );
    }
    evidence.samples.forEach((sample, index) => {
      if (
        sample === null ||
        typeof sample !== "object" ||
        typeof sample.position !== "number" ||
        typeof sample.time !== "number"
      ) {
        throw new Error(`${index}:missing-sample`);
      }
      try {
        convertQuantity(
          createQuantity({
            value: sample.position,
            unit: evidence.positionUnit,
            dimension: "length",
          }),
          "m",
        );
      } catch (error) {
        const label =
          error instanceof Error ? error.message : "invalid quantity";
        throw new Error(`${index}:position:${label}`);
      }
      try {
        convertQuantity(
          createQuantity({
            value: sample.time,
            unit: evidence.timeUnit,
            dimension: "time",
          }),
          "s",
        );
      } catch (error) {
        const label =
          error instanceof Error ? error.message : "invalid quantity";
        throw new Error(`${index}:time:${label}`);
      }
    });
    const rawIntervals = record.intervals;
    if (rawIntervals !== undefined) {
      if (!Array.isArray(rawIntervals)) {
        return structuredFailure(
          request,
          "METHOD_NOT_APPLICABLE",
          "Explicit intervals must be provided as an array.",
        );
      }
      for (const [intervalIndex, interval] of rawIntervals.entries()) {
        if (
          !isRecord(interval) ||
          typeof interval.id !== "string" ||
          interval.id.trim().length === 0 ||
          typeof interval.qualificationReference !== "string" ||
          interval.qualificationReference.trim().length === 0 ||
          !isInteger(interval.startIndex) ||
          !isInteger(interval.endIndex) ||
          interval.startIndex < 0 ||
          interval.endIndex <= interval.startIndex ||
          interval.endIndex >= evidence.samples.length
        ) {
          return structuredFailure(
            request,
            "METHOD_NOT_APPLICABLE",
            `Explicit interval ${intervalIndex} is invalid or outside the sample series.`,
          );
        }
      }
    }
    return {
      evidence: {
        ...evidence,
        objectOfInterest,
        measurementPoint,
        referenceFrame,
        axis,
        samples: evidence.samples,
      },
      provenance,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Invalid position-time evidence.";
    const code = message.includes("missing-sample")
      ? "MISSING_SAMPLE_UNSUPPORTED"
      : message.includes("finite")
        ? "NON_FINITE_SAMPLE"
        : message.includes(":time:Unit") || message.includes("time:Quantity")
          ? "TIME_DIMENSION_MISMATCH"
          : message.includes(":position:Unit") ||
              message.includes("position:Quantity")
            ? "POSITION_DIMENSION_MISMATCH"
            : "INPUT_INVALID";
    return structuredFailure(request, code, message);
  }
}

function canonicalEnginePayload(
  evidence: PositionTimeSeriesEvidence,
  intervals: readonly ExplicitVelocityInterval[] | undefined,
  configuration: ConfigurationSnapshot,
): Readonly<Record<string, unknown>> {
  const samples = evidence.samples.map((sample) => ({
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
  }));
  const declaredTimeStepSeconds = convertQuantity(
    createQuantity({
      value: evidence.timebase.declaredSamplingInterval,
      unit: evidence.timebase.declaredSamplingIntervalUnit,
      dimension: "time",
    }),
    "s",
  ).value;
  const parameters = configuration.parameters;
  return {
    samples,
    timebase: {
      declared_time_step_s: declaredTimeStepSeconds,
      declared_sample_count: evidence.timebase.declaredSampleCount,
      provenance_reference: evidence.timebase.provenanceReference,
    },
    intervals:
      intervals?.map((interval) => ({
        id: interval.id,
        start_index: interval.startIndex,
        end_index: interval.endIndex,
        qualification_reference: interval.qualificationReference,
      })) ?? [],
    configuration: {
      minimum_samples: parameters.minimumSamples,
      uniform_absolute_tolerance_seconds:
        parameters.uniformAbsoluteToleranceSeconds,
      uniform_relative_tolerance: parameters.uniformRelativeTolerance,
    },
  };
}

function isExpectedIdentity(
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
  if (!isRecord(value) || typeof value.status !== "string") {
    throw new Error("Python engine returned an invalid response envelope.");
  }
  if (value.status === "SUCCEEDED") {
    const timebase = isRecord(value.timebase) ? value.timebase : null;
    const declaredStep = timebase?.declared_step_s;
    const declaredSampleCount = timebase?.declared_sample_count;
    const velocitySamples = value.velocity_samples;
    const intervalSummaries = value.interval_summaries;
    if (
      !isExpectedIdentity(value.processor, {
        id: POSITION_VELOCITY_PROCESSOR_ID,
        version: POSITION_VELOCITY_PROCESSOR_VERSION,
      }) ||
      !isExpectedIdentity(value.method, {
        id: POSITION_VELOCITY_METHOD_ID,
        version: POSITION_VELOCITY_METHOD_VERSION,
      }) ||
      !isFiniteNumber(value.time_step_s) ||
      value.time_step_s <= 0 ||
      !isFiniteNumber(declaredStep) ||
      declaredStep <= 0 ||
      declaredStep !== value.time_step_s ||
      !isInteger(declaredSampleCount) ||
      declaredSampleCount < 3 ||
      !Array.isArray(velocitySamples) ||
      velocitySamples.length !== declaredSampleCount ||
      !Array.isArray(intervalSummaries)
    ) {
      throw new Error("Python engine returned an invalid success payload.");
    }
    for (const [index, sample] of velocitySamples.entries()) {
      if (
        !isRecord(sample) ||
        !isFiniteNumber(sample.time_s) ||
        !isFiniteNumber(sample.velocity_mps)
      ) {
        throw new Error(
          `Python engine returned an invalid velocity sample at index ${index}.`,
        );
      }
    }
    for (const [index, interval] of intervalSummaries.entries()) {
      const startIndex = isRecord(interval) ? interval.start_index : undefined;
      const endIndex = isRecord(interval) ? interval.end_index : undefined;
      if (
        !isRecord(interval) ||
        typeof interval.id !== "string" ||
        interval.id.trim().length === 0 ||
        typeof interval.qualification_reference !== "string" ||
        interval.qualification_reference.trim().length === 0 ||
        !isInteger(startIndex) ||
        !isInteger(endIndex) ||
        startIndex < 0 ||
        endIndex <= startIndex ||
        endIndex >= declaredSampleCount ||
        !isFiniteNumber(interval.interval_average_velocity_mps) ||
        !isFiniteNumber(interval.peak_sampled_velocity_mps)
      ) {
        throw new Error(
          `Python engine returned an invalid interval summary at index ${index}.`,
        );
      }
    }
    return value as unknown as EngineSuccess;
  }
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
        "Python engine returned an invalid infrastructure-failure payload.",
      );
    }
    return value as unknown as EngineInfrastructureFailure;
  }
  throw new Error("Python engine returned an unknown response status.");
}

function closeEnough(left: number, right: number): boolean {
  const tolerance = Math.max(
    1e-12,
    1e-12 * Math.max(1, Math.abs(left), Math.abs(right)),
  );
  return Math.abs(left - right) <= tolerance;
}

function assertEngineAlignment(
  engine: EngineSuccess,
  evidence: PositionTimeSeriesEvidence,
  intervals: readonly ExplicitVelocityInterval[] | undefined,
): void {
  const expectedStep = convertQuantity(
    createQuantity({
      value: evidence.timebase.declaredSamplingInterval,
      unit: evidence.timebase.declaredSamplingIntervalUnit,
      dimension: "time",
    }),
    "s",
  ).value;
  if (
    engine.timebase.declared_sample_count !== evidence.samples.length ||
    !closeEnough(engine.time_step_s, expectedStep)
  ) {
    throw new Error(
      "Python engine response does not match the input timebase.",
    );
  }
  for (const [index, sample] of evidence.samples.entries()) {
    const expectedTime = convertQuantity(
      createQuantity({
        value: sample.time,
        unit: evidence.timeUnit,
        dimension: "time",
      }),
      "s",
    ).value;
    const actual = engine.velocity_samples[index];
    if (actual === undefined || !closeEnough(actual.time_s, expectedTime)) {
      throw new Error(
        `Python engine response does not match input sample time at index ${index}.`,
      );
    }
  }
  const requestedIntervals = intervals ?? [];
  if (engine.interval_summaries.length !== requestedIntervals.length) {
    throw new Error(
      "Python engine response does not match requested intervals.",
    );
  }
  for (const [index, interval] of requestedIntervals.entries()) {
    const actual = engine.interval_summaries[index];
    if (
      actual === undefined ||
      actual.id !== interval.id ||
      actual.start_index !== interval.startIndex ||
      actual.end_index !== interval.endIndex ||
      actual.qualification_reference !== interval.qualificationReference
    ) {
      throw new Error(
        `Python engine response does not match requested interval ${index}.`,
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
          new Error(
            error instanceof Error
              ? error.message
              : "Python engine returned an invalid response.",
          ),
        );
      }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

function mapEngineFailure(
  request: ScienceRequest,
  response: EngineFailureResponse,
): ScienceResult {
  const code = SCIENTIFIC_FAILURE_CODES.has(
    response.failure.code as ScientificFailureCode,
  )
    ? (response.failure.code as ScientificFailureCode)
    : "INPUT_INVALID";
  return structuredFailure(
    request,
    code,
    response.failure.message,
    response.failure.details,
  );
}

function buildResult(
  request: ScienceRequest,
  evidence: PositionTimeSeriesEvidence,
  provenance: readonly ScienceProvenanceRef[],
  engine: EngineSuccess,
  contract: ScientificProcessorContract,
  intervals: readonly ExplicitVelocityInterval[] | undefined,
): ScienceResult {
  const inputPayload = canonicalEnginePayload(
    evidence,
    intervals,
    contract.configuration,
  );
  const intervalProvenance = (intervals ?? []).map((interval) => ({
    type: "INTERVAL_QUALIFICATION",
    ref: interval.qualificationReference,
  }));
  const lineageProvenance = [...provenance, ...intervalProvenance];
  const inputFingerprint = sha256(
    canonicalJson({
      capabilityId: request.capabilityId,
      inputProvenance: provenance,
      input: inputPayload,
      configuration: contract.configuration,
      evidenceIdentity: evidence,
      processor: contract.processor,
      method: contract.method,
      software: contract.software,
      qualification: contract.qualification,
    }),
  );
  const claimId = `velocity-series-${inputFingerprint.slice(0, 24)}`;
  const nodeId = `derivation-${inputFingerprint.slice(0, 24)}`;
  const seriesReference = `science-series:${inputFingerprint}`;
  const parents = provenance.map((reference) => ({
    kind: "PSC4_EVIDENCE" as const,
    ref: reference.ref,
  }));
  const claim = createScientificClaim({
    claimClass: "MECHANICALLY_DERIVED",
    claimId,
    value: { kind: "REFERENCE", value: seriesReference },
    output: { kind: "REFERENCE" },
    method: contract.method,
    software: contract.software,
    assumptions: contract.assumptions,
    configuration: contract.configuration,
    lineage: { parents, provenance: lineageProvenance },
  });
  const derivationInputs: readonly DerivationInputReference[] = provenance.map(
    (reference) => ({ kind: "PSC4_EVIDENCE", ref: reference.ref }),
  );
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
    seriesReference,
    measurement: {
      objectOfInterest: evidence.objectOfInterest,
      measurementPoint: evidence.measurementPoint,
      referenceFrame: evidence.referenceFrame,
      axis: evidence.axis,
      modality: evidence.modality,
      assessmentId: evidence.assessmentId,
      trialId: evidence.trialId,
      inputUnits: {
        position: evidence.positionUnit,
        time: evidence.timeUnit,
      },
      timebase: evidence.timebase,
    },
    qualification: contract.qualification,
    intervalQualifications: intervalProvenance,
    samples: engine.velocity_samples,
    intervalSummaries: engine.interval_summaries,
    timeStepSeconds: engine.time_step_s,
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
    unit: "m/s",
    dimension: "speed",
    uncertainty: {
      status: "UNKNOWN",
      reason:
        "SCI-2 v1 does not propagate measurement, timebase, or device uncertainty.",
      separatedSources: [
        "measurement uncertainty",
        "sampling/timebase uncertainty",
        "numerical approximation error",
        "device systematic error",
        "attachment-point error",
        "protocol/setup uncertainty",
        "algorithm/model uncertainty",
      ],
    },
    assumptions: contract.assumptions.map(
      (assumption) => assumption.description,
    ),
    limitations: [
      "Numerical differentiation can amplify high-frequency position noise; no filtering is applied.",
      "The measurement point is not silently promoted to object COM or athlete COM.",
      "Peak sampled velocity is a discrete sampled maximum, not a continuous-time peak estimate.",
      "Automatic repetition and phase detection are out of scope.",
    ],
    provenance: [
      ...provenance,
      { type: "SCI0_DERIVATION_NODE", ref: nodeId },
      { type: "SCI0_CLAIM", ref: claimId },
    ],
    generatedAt: nowInstant(),
  };
}

export function createPositionVelocityRequest(
  input: PositionVelocityRequestInput,
): ScienceRequest {
  requireText(input.requestId, "Science request id");
  if (input.inputProvenance.length === 0) {
    throw new Error("Position velocity requests require input provenance.");
  }
  const structured: Record<string, unknown> = {
    ...input.evidence,
    intervals: input.intervals ?? [],
  };
  return {
    requestId: input.requestId,
    capabilityId: POSITION_VELOCITY_CAPABILITY_ID,
    capabilityVersion: POSITION_VELOCITY_CAPABILITY_VERSION,
    ...(input.athleteId === undefined
      ? {}
      : { subjectRef: { athleteId: input.athleteId as never } }),
    ...(input.observedAt === undefined
      ? {}
      : { observedAt: parseInstant(input.observedAt) }),
    inputs: {
      [POSITION_TIME_INPUT_KEY]: { kind: "structured", value: structured },
    },
    inputProvenance: input.inputProvenance,
  };
}

export class PositionVelocitySciencePort implements SciencePort {
  readonly contract: ScientificProcessorContract;
  private readonly pythonExecutable: string;
  private readonly pythonScriptPath: string;
  private readonly engineInvoker: PositionVelocityEngineInvoker | undefined;

  constructor(options: PositionVelocityAdapterOptions) {
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
        capabilityId: POSITION_VELOCITY_CAPABILITY_ID,
        status:
          this.contract.qualification.status === "QUALIFIED"
            ? "ok"
            : "method_unavailable",
        description:
          "Derive signed linear velocity from qualified position-time evidence for one declared measurement point, object, frame, and axis.",
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
    if (request.capabilityId !== POSITION_VELOCITY_CAPABILITY_ID) {
      return {
        requestId: request.requestId,
        capabilityId: request.capabilityId,
        status: "not_applicable",
        generatedAt: nowInstant(),
        error: {
          code: "CAPABILITY_NOT_SUPPORTED",
          message:
            "The position velocity port owns one narrow capability only.",
        },
      };
    }
    if (
      request.capabilityVersion !== undefined &&
      request.capabilityVersion !== POSITION_VELOCITY_CAPABILITY_VERSION
    ) {
      return structuredFailure(
        request,
        "UNSUPPORTED_CONFIGURATION",
        "The requested capability version is not supported.",
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
          message:
            "The position-to-velocity processor is not qualified for execution.",
        },
      };
    }
    const validated = validateEvidence(request);
    if ("status" in validated) return validated;
    const intervals =
      (inputRecord(request)?.intervals as
        | readonly ExplicitVelocityInterval[]
        | undefined) ?? [];
    try {
      const payload = canonicalEnginePayload(
        validated.evidence,
        intervals,
        this.contract.configuration,
      );
      const engine =
        this.engineInvoker === undefined
          ? await runPython(
              payload,
              this.pythonExecutable,
              this.pythonScriptPath,
            )
          : parseEngineResponse(await this.engineInvoker(payload));
      if (engine.status === "FAILED") return mapEngineFailure(request, engine);
      if (engine.status === "INFRASTRUCTURE_FAILED") {
        return infrastructureFailure(request, engine.exception.message);
      }
      assertEngineAlignment(engine, validated.evidence, intervals);
      return buildResult(
        request,
        validated.evidence,
        validated.provenance,
        engine,
        this.contract,
        intervals,
      );
    } catch (error) {
      return infrastructureFailure(
        request,
        error instanceof Error
          ? error.message
          : "The Python engine could not be executed.",
      );
    }
  }
}

export function createQualifiedSoftwareProvenance(
  sourceRevision: string,
  buildId: string,
): SoftwareProvenance {
  if (!/^[0-9a-f]{40,64}$/iu.test(sourceRevision)) {
    throw new Error("Source revision must be an exact hexadecimal commit SHA.");
  }
  return {
    packageName: "@workoutpal/science-port",
    packageVersion: "0.1.0",
    sourceRevision: requireText(sourceRevision, "Source revision"),
    buildId: requireText(buildId, "Build id"),
  };
}

export type {
  DirectionDescriptor,
  MeasurementModalityReference,
  PhysicalObjectReference,
  ReferenceFrameReference,
};
