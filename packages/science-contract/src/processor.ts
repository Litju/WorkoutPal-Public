import type { Dimension, MissingReason } from "@workoutpal/shared-kernel";
import { createQuantity } from "@workoutpal/shared-kernel";
import type {
  AssumptionDeclaration,
  ConfigurationSnapshot,
  MethodIdentity,
  ScientificClaimClass,
  SoftwareProvenance,
} from "./claim.js";
import {
  assertAssumptionDeclarations,
  assertConfigurationSnapshot,
  assertKeyValueDetails,
  assertSoftwareProvenance,
  requireNonEmpty,
  requireUnique,
  requireVersionedIdentity,
} from "./invariants.js";
import {
  assertCalibrationRequirement,
  assertUncertaintyPolicy,
  type CalibrationRequirement,
  type UncertaintyPolicy,
} from "./quality.js";
import {
  assertQualificationBinding,
  type QualificationBinding,
} from "./validation.js";

export type ProcessorIdentity = MethodIdentity;
export type ProcessorClaimClass = Exclude<ScientificClaimClass, "OBSERVED">;

export type InputSourceKind = "PSC4_EVIDENCE" | "SCIENTIFIC_CLAIM";
export type InputValidityAcceptance = "VALID" | "INVALID" | "UNKNOWN";
export type InputExclusionAcceptance = "INCLUDED" | "EXCLUDED";

export type ProtocolCompatibility =
  | { readonly kind: "NONE" }
  | {
      readonly kind: "EXACT_REVISION" | "MINIMUM_REVISION";
      readonly protocolId: string;
      readonly revision: number;
    };

export interface ScientificInputRequirement {
  readonly id: string;
  readonly source: InputSourceKind;
  readonly required: boolean;
  readonly acceptedClaimClasses: readonly ScientificClaimClass[];
  readonly dimensions: readonly Dimension[];
  readonly units: readonly string[];
  readonly acceptedValidityStates: readonly InputValidityAcceptance[];
  readonly acceptedExclusionStates: readonly InputExclusionAcceptance[];
  readonly acceptedMissingness: readonly MissingReason[];
  readonly protocol: ProtocolCompatibility;
}

export type ProcessorOutputSpecification =
  | {
      readonly claimClass: ProcessorClaimClass;
      readonly valueKind: "QUANTITY";
      readonly dimension: Dimension;
      readonly unit: string;
    }
  | {
      readonly claimClass: ProcessorClaimClass;
      readonly valueKind: "TEXT" | "REFERENCE" | "TIMESTAMP";
    };

export type LineageField =
  | "INPUTS"
  | "PROCESSOR"
  | "METHOD"
  | "ASSUMPTIONS"
  | "CONFIGURATION";

export interface LineagePolicy {
  readonly requiredFields: readonly LineageField[];
}

export type ProcessorDeterminism = "DETERMINISTIC" | "NON_DETERMINISTIC";

export type ScientificFailureCode =
  | "REQUIRED_EVIDENCE_MISSING"
  | "INPUT_INVALID"
  | "INPUT_EXCLUDED"
  | "DIMENSION_MISMATCH"
  | "POSITION_DIMENSION_MISMATCH"
  | "TIME_DIMENSION_MISMATCH"
  | "INSUFFICIENT_SAMPLES"
  | "NON_FINITE_SAMPLE"
  | "NUMERICAL_OVERFLOW"
  | "NON_MONOTONIC_TIME"
  | "DUPLICATE_TIMESTAMP"
  | "SAMPLING_INTERVAL_INVALID"
  | "MISSING_SAMPLE_UNSUPPORTED"
  | "IRREGULAR_TIMEBASE_UNSUPPORTED"
  | "OBJECT_BINDING_MISSING"
  | "MEASUREMENT_POINT_BINDING_MISSING"
  | "REFERENCE_FRAME_MISSING"
  | "AXIS_BINDING_MISSING"
  | "TRIAL_INVALID"
  | "TRIAL_EXCLUDED"
  | "PROTOCOL_INCOMPATIBLE"
  | "CALIBRATION_REQUIREMENT_UNSATISFIED"
  | "METHOD_NOT_APPLICABLE"
  | "UNSUPPORTED_CONFIGURATION"
  | "SEQUENCE_EMPTY"
  | "REPETITION_ORDINAL_INVALID"
  | "REPETITION_ORDER_INVALID"
  | "DUPLICATE_REPETITION_ID"
  | "SET_ID_MISMATCH"
  | "EXERCISE_DEFINITION_MISMATCH"
  | "EXERCISE_VARIATION_MISMATCH"
  | "MOVEMENT_TASK_MISMATCH"
  | "LOAD_CONFIGURATION_MISMATCH"
  | "MEASUREMENT_OBJECT_MISMATCH"
  | "MEASUREMENT_POINT_MISMATCH"
  | "REFERENCE_FRAME_MISMATCH"
  | "AXIS_MISMATCH"
  | "MODALITY_MISMATCH"
  | "METRIC_DEFINITION_MISMATCH"
  | "METRIC_METHOD_MISMATCH"
  | "REP_PHASE_MISMATCH"
  | "REP_INCOMPLETE"
  | "REP_METRIC_MISSING"
  | "REP_METRIC_INVALID"
  | "NON_FINITE_VELOCITY"
  | "REP_UPSTREAM_INVALID"
  | "UPSTREAM_QUALIFICATION_MISSING"
  | "UPSTREAM_QUALIFICATION_UNSUPPORTED"
  | "REFERENCE_POLICY_INVALID"
  | "REFERENCE_POLICY_INCOMPATIBLE_WITH_MODE"
  | "REFERENCE_REPETITION_NOT_FOUND"
  | "REFERENCE_VELOCITY_INVALID"
  | "RELATIVE_CHANGE_UNDEFINED"
  | "THRESHOLD_INVALID"
  | "THRESHOLD_BINDING_MISMATCH"
  | "EXPLICIT_EXCLUSION_REASON_MISSING"
  | "SNAPSHOT_ALIGNMENT_INVALID"
  | "PROFILE_NOT_FOUND"
  | "PROFILE_UNQUALIFIED"
  | "PROFILE_METHOD_UNSUPPORTED"
  | "PROFILE_DIRECTIONALLY_INCONSISTENT"
  | "TARGET_VELOCITY_MISSING"
  | "TARGET_VELOCITY_INVALID"
  | "TARGET_VELOCITY_METRIC_MISMATCH"
  | "TARGET_VELOCITY_PHASE_MISMATCH"
  | "TARGET_VELOCITY_EXERCISE_MISMATCH"
  | "TARGET_VELOCITY_VARIATION_MISMATCH"
  | "TARGET_VELOCITY_TASK_MISMATCH"
  | "TARGET_AUTHORITY_UNQUALIFIED"
  | "MVT_AUTHORITY_MISSING"
  | "MVT_AUTHORITY_INCOMPATIBLE"
  | "SLOPE_ZERO"
  | "SLOPE_NONFINITE"
  | "EXPECTED_INVERSE_RELATIONSHIP_NOT_OBSERVED"
  | "ESTIMATED_LOAD_NONFINITE"
  | "ESTIMATED_LOAD_NON_POSITIVE"
  | "MEASUREMENT_BINDING_MISMATCH"
  | "ATHLETE_MISMATCH"
  | "PROFILE_CONTEXT_MISMATCH"
  | "MEASURED_1RM_PROTOCOL_MISSING";

export interface ScientificFailureDetail {
  readonly key: string;
  readonly value: string;
}

export interface ScientificFailure {
  readonly code: ScientificFailureCode;
  readonly message: string;
  readonly details: readonly ScientificFailureDetail[];
}

export interface ScientificInfrastructureException {
  readonly code: "INFRASTRUCTURE_EXCEPTION";
  readonly message: string;
  readonly details: readonly ScientificFailureDetail[];
}

export interface ScientificProcessorContract {
  readonly processor: ProcessorIdentity;
  readonly method: MethodIdentity;
  readonly software: SoftwareProvenance;
  readonly inputs: readonly ScientificInputRequirement[];
  readonly output: ProcessorOutputSpecification;
  readonly assumptions: readonly AssumptionDeclaration[];
  readonly calibration: CalibrationRequirement;
  readonly uncertainty: UncertaintyPolicy;
  readonly configuration: ConfigurationSnapshot;
  readonly determinism: ProcessorDeterminism;
  readonly failureModes: readonly ScientificFailureCode[];
  readonly lineage: LineagePolicy;
  readonly qualification: QualificationBinding;
}

export type ProcessorExecution =
  | {
      readonly status: "SUCCEEDED";
      readonly claimId: string;
      readonly claimClass: ProcessorClaimClass;
      readonly derivationId: string;
    }
  | { readonly status: "FAILED"; readonly failure: ScientificFailure }
  | {
      readonly status: "INFRASTRUCTURE_FAILED";
      readonly exception: ScientificInfrastructureException;
    };

const FAILURE_CODES: readonly ScientificFailureCode[] = [
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
];

const REQUIRED_LINEAGE_FIELDS: readonly LineageField[] = [
  "INPUTS",
  "PROCESSOR",
  "METHOD",
  "ASSUMPTIONS",
  "CONFIGURATION",
];

function assertProtocol(protocol: ProtocolCompatibility): void {
  if (protocol.kind === "NONE") return;
  requireNonEmpty(protocol.protocolId, "Protocol id");
  if (!Number.isInteger(protocol.revision) || protocol.revision < 1) {
    throw new Error(
      "Protocol compatibility revision must be a positive integer.",
    );
  }
}

function assertInputRequirement(requirement: ScientificInputRequirement): void {
  requireNonEmpty(requirement.id, "Input requirement id");
  if (requirement.acceptedValidityStates.length === 0) {
    throw new Error(
      "Input requirements must declare accepted validity states.",
    );
  }
  if (requirement.acceptedExclusionStates.length === 0) {
    throw new Error(
      "Input requirements must declare accepted exclusion states.",
    );
  }
  if (requirement.acceptedMissingness.length === 0) {
    throw new Error(
      "Input requirements must declare accepted missingness states.",
    );
  }
  if (
    requirement.source === "SCIENTIFIC_CLAIM" &&
    requirement.acceptedClaimClasses.length === 0
  ) {
    throw new Error(
      "Scientific-claim inputs must declare accepted claim classes.",
    );
  }
  if (
    (requirement.dimensions.length > 0 && requirement.units.length === 0) ||
    (requirement.dimensions.length === 0 && requirement.units.length > 0)
  ) {
    throw new Error(
      "Dimensional input requirements must declare matching dimensions and units.",
    );
  }
  const unitDimensions = requirement.units.map(
    (unit) => createQuantity({ value: 0, unit }).dimension,
  );
  if (
    requirement.dimensions.some(
      (dimension) => !unitDimensions.includes(dimension),
    ) ||
    unitDimensions.some(
      (dimension) => !requirement.dimensions.includes(dimension),
    )
  ) {
    throw new Error(
      "Input requirement dimensions must match its accepted units.",
    );
  }
  assertProtocol(requirement.protocol);
}

function assertOutput(output: ProcessorOutputSpecification): void {
  if (output.valueKind === "QUANTITY") {
    createQuantity({
      value: 0,
      unit: output.unit,
      dimension: output.dimension,
    });
  }
}

export function assertScientificFailure(failure: ScientificFailure): void {
  if (!FAILURE_CODES.includes(failure.code)) {
    throw new Error("Unknown scientific failure code.");
  }
  requireNonEmpty(failure.message, "Scientific failure message");
  assertKeyValueDetails(failure.details, "Scientific failure");
}

export function createScientificFailure(
  input: ScientificFailure,
): ScientificFailure {
  assertScientificFailure(input);
  return input;
}

export function assertScientificInfrastructureException(
  exception: ScientificInfrastructureException,
): void {
  if (exception.code !== "INFRASTRUCTURE_EXCEPTION") {
    throw new Error("Unknown infrastructure exception code.");
  }
  requireNonEmpty(exception.message, "Infrastructure exception message");
  assertKeyValueDetails(exception.details, "Infrastructure exception");
}

export function createScientificInfrastructureException(
  input: ScientificInfrastructureException,
): ScientificInfrastructureException {
  assertScientificInfrastructureException(input);
  return input;
}

export function createProcessorContract(
  input: ScientificProcessorContract,
): ScientificProcessorContract {
  requireVersionedIdentity(input.processor, "Processor");
  requireVersionedIdentity(input.method, "Scientific method");
  assertSoftwareProvenance(input.software);
  if (input.inputs.length === 0) {
    throw new Error(
      "Scientific processors must declare input requirements before execution.",
    );
  }
  requireUnique(
    input.inputs.map((requirement) => requirement.id),
    "Input requirement ids",
  );
  input.inputs.forEach(assertInputRequirement);
  assertOutput(input.output);
  assertAssumptionDeclarations(input.assumptions);
  assertCalibrationRequirement(input.calibration);
  assertUncertaintyPolicy(input.uncertainty);
  assertConfigurationSnapshot(input.configuration);
  if (input.failureModes.length === 0) {
    throw new Error(
      "Scientific processors must declare structured failure modes.",
    );
  }
  requireUnique(input.failureModes, "Scientific failure modes");
  for (const failureMode of input.failureModes) {
    if (!FAILURE_CODES.includes(failureMode)) {
      throw new Error("Unknown scientific failure mode.");
    }
  }
  if (
    input.inputs.some((requirement) => requirement.required) &&
    !input.failureModes.includes("REQUIRED_EVIDENCE_MISSING")
  ) {
    throw new Error("Required inputs must map to REQUIRED_EVIDENCE_MISSING.");
  }
  requireUnique(input.lineage.requiredFields, "Lineage fields");
  for (const field of REQUIRED_LINEAGE_FIELDS) {
    if (!input.lineage.requiredFields.includes(field)) {
      throw new Error(`Lineage must retain ${field}.`);
    }
  }
  assertQualificationBinding(input.qualification);
  if (input.qualification.status === "QUALIFIED") {
    const identity = input.qualification.identity;
    if (
      identity.processor.id !== input.processor.id ||
      identity.processor.version !== input.processor.version
    ) {
      throw new Error("Qualification processor must match the contract.");
    }
    if (
      identity.method.id !== input.method.id ||
      identity.method.version !== input.method.version
    ) {
      throw new Error("Qualification method must match the contract.");
    }
    if (
      identity.software.packageName !== input.software.packageName ||
      identity.software.packageVersion !== input.software.packageVersion ||
      identity.software.sourceRevision !== input.software.sourceRevision ||
      identity.software.buildId !== input.software.buildId
    ) {
      throw new Error("Qualification software must match the contract.");
    }
  }
  return input;
}

export function assertProcessorOutputClass(
  contract: ScientificProcessorContract,
  claimClass: ScientificClaimClass,
): void {
  if (contract.output.claimClass !== claimClass) {
    throw new Error(
      "Processor output claim class does not match its contract.",
    );
  }
}

export function createProcessorExecution(
  input: ProcessorExecution,
): ProcessorExecution {
  if (input.status === "FAILED") {
    assertScientificFailure(input.failure);
    return input;
  }
  if (input.status === "INFRASTRUCTURE_FAILED") {
    assertScientificInfrastructureException(input.exception);
    return input;
  }
  requireNonEmpty(input.claimId, "Processor claim id");
  requireNonEmpty(input.derivationId, "Processor derivation id");
  return input;
}
