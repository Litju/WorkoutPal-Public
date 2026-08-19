import type {
  MethodIdentity,
  ScienceProvenanceRef,
  SoftwareProvenance,
} from "./claim.js";
import {
  requireNonEmpty,
  requireNonNegative,
  requireReference,
  requireVersionedIdentity,
} from "./invariants.js";

export type ValidationEvidenceKind =
  | "DIMENSIONAL_INVARIANT"
  | "ANALYTICAL_CASE"
  | "SYNTHETIC_CASE"
  | "INDEPENDENT_REFERENCE_IMPLEMENTATION"
  | "REFERENCE_DATASET"
  | "EMPIRICAL_COMPARISON"
  | "PROPERTY_METAMORPHIC_TEST"
  | "REGRESSION_FIXTURE";

export interface ValidationArtifactIdentity {
  readonly id: string;
  readonly version: string;
}

export type ReferenceOracleKind =
  | "ANALYTICAL_SOLUTION"
  | "INDEPENDENT_IMPLEMENTATION"
  | "VALIDATED_EXTERNAL_TOOL"
  | "PUBLISHED_REFERENCE_VALUES"
  | "REFERENCE_DATASET"
  | "MANUALLY_ADJUDICATED_FIXTURE";

export interface ReferenceOracle {
  readonly kind: ReferenceOracleKind;
  readonly identity: ValidationArtifactIdentity;
  readonly provenance: ScienceProvenanceRef;
}

export type OracleBinding =
  | { readonly kind: "DECLARED"; readonly oracle: ReferenceOracle }
  | { readonly kind: "NOT_REQUIRED"; readonly reason: string };

export type ToleranceJustificationKind =
  | "FLOATING_POINT"
  | "MEASUREMENT_RESOLUTION"
  | "REFERENCE_UNCERTAINTY"
  | "PUBLISHED_ACCEPTANCE_CRITERION"
  | "KNOWN_ALGORITHM_TOLERANCE";

export interface ToleranceJustification {
  readonly kind: ToleranceJustificationKind;
  readonly reference: ScienceProvenanceRef;
  readonly rationale: string;
}

export type Tolerance =
  | { readonly kind: "EXACT"; readonly justification: ToleranceJustification }
  | {
      readonly kind: "ABSOLUTE";
      readonly value: number;
      readonly unit: string;
      readonly justification: ToleranceJustification;
    }
  | {
      readonly kind: "RELATIVE";
      readonly fraction: number;
      readonly justification: ToleranceJustification;
    };

export type ToleranceBinding =
  | { readonly kind: "DECLARED"; readonly tolerances: readonly Tolerance[] }
  | { readonly kind: "NOT_APPLICABLE"; readonly reason: string };

export type DatasetStorage =
  | { readonly kind: "FILE"; readonly checksumSha256: string }
  | { readonly kind: "SYNTHETIC_INLINE" };

export type DatasetLicenseUseStatus = "PERMITTED" | "RESTRICTED" | "UNKNOWN";

export interface ReferenceDatasetContract {
  readonly identity: ValidationArtifactIdentity;
  readonly provenance: ScienceProvenanceRef;
  readonly licenseUseStatus: DatasetLicenseUseStatus;
  readonly protocol: string;
  readonly deviceOrSource: string;
  readonly populationContext: string;
  readonly expectedOutputs: readonly string[];
  readonly storage: DatasetStorage;
}

export type DatasetBinding =
  | { readonly kind: "DECLARED"; readonly dataset: ReferenceDatasetContract }
  | { readonly kind: "NOT_A_DATASET"; readonly reason: string };

export interface ValidationEvidence {
  readonly evidenceId: string;
  readonly kind: ValidationEvidenceKind;
  readonly artifact: ValidationArtifactIdentity;
  readonly provenance: ScienceProvenanceRef;
  readonly description: string;
  readonly oracle: OracleBinding;
  readonly tolerance: ToleranceBinding;
  readonly dataset: DatasetBinding;
}

export interface QualificationIdentity {
  readonly qualificationId: string;
  readonly qualificationVersion: string;
  readonly processor: MethodIdentity;
  readonly method: MethodIdentity;
  readonly software: SoftwareProvenance;
  readonly oracle: ValidationArtifactIdentity;
  readonly validationData: ValidationArtifactIdentity;
}

export type QualificationBinding =
  | { readonly status: "QUALIFIED"; readonly identity: QualificationIdentity }
  | { readonly status: "NOT_QUALIFIED"; readonly reason: string };

function assertArtifactIdentity(identity: ValidationArtifactIdentity): void {
  requireVersionedIdentity(identity, "Validation artifact");
}

function assertOracle(oracle: ReferenceOracle): void {
  assertArtifactIdentity(oracle.identity);
  requireReference(oracle.provenance, "Oracle provenance");
}

function assertToleranceJustification(
  justification: ToleranceJustification,
): void {
  requireReference(
    justification.reference,
    "Tolerance justification reference",
  );
  requireNonEmpty(justification.rationale, "Tolerance justification rationale");
}

export function createTolerance(input: Tolerance): Tolerance {
  assertToleranceJustification(input.justification);
  if (input.kind === "ABSOLUTE") {
    requireNonNegative(input.value, "Absolute tolerance");
    requireNonEmpty(input.unit, "Absolute tolerance unit");
  } else if (input.kind === "RELATIVE") {
    requireNonNegative(input.fraction, "Relative tolerance");
  }
  return input;
}

function assertToleranceBinding(binding: ToleranceBinding): void {
  if (binding.kind === "NOT_APPLICABLE") {
    requireNonEmpty(binding.reason, "Tolerance not-applicable reason");
    return;
  }
  if (binding.tolerances.length === 0) {
    throw new Error("Declared tolerance binding must contain a tolerance.");
  }
  binding.tolerances.forEach((tolerance) => {
    createTolerance(tolerance);
  });
}

export function assertReferenceDataset(
  dataset: ReferenceDatasetContract,
): void {
  assertArtifactIdentity(dataset.identity);
  requireReference(dataset.provenance, "Dataset provenance");
  requireNonEmpty(dataset.protocol, "Dataset protocol");
  requireNonEmpty(dataset.deviceOrSource, "Dataset device or source");
  requireNonEmpty(dataset.populationContext, "Dataset population context");
  if (dataset.expectedOutputs.length === 0) {
    throw new Error(
      "Reference datasets must declare expected outputs or adjudication.",
    );
  }
  dataset.expectedOutputs.forEach((output) => {
    requireNonEmpty(output, "Dataset expected output");
  });
  if (
    dataset.storage.kind === "FILE" &&
    !/^[0-9a-f]{64}$/u.test(dataset.storage.checksumSha256)
  ) {
    throw new Error(
      "File-based reference datasets require a SHA-256 checksum.",
    );
  }
}

export function assertQualificationBinding(
  binding: QualificationBinding,
): void {
  if (binding.status === "NOT_QUALIFIED") {
    requireNonEmpty(binding.reason, "Qualification status reason");
    return;
  }
  requireNonEmpty(binding.identity.qualificationId, "Qualification id");
  requireNonEmpty(
    binding.identity.qualificationVersion,
    "Qualification version",
  );
  requireVersionedIdentity(binding.identity.processor, "Qualified processor");
  requireVersionedIdentity(binding.identity.method, "Qualified method");
  requireNonEmpty(
    binding.identity.software.packageName,
    "Qualified software package",
  );
  requireNonEmpty(
    binding.identity.software.packageVersion,
    "Qualified software version",
  );
  requireNonEmpty(
    binding.identity.software.sourceRevision,
    "Qualified source revision",
  );
  requireNonEmpty(binding.identity.software.buildId, "Qualified build id");
  assertArtifactIdentity(binding.identity.oracle);
  assertArtifactIdentity(binding.identity.validationData);
}

export function assertOracleIndependentFromProcessor(
  oracle: ReferenceOracle,
  processor: MethodIdentity,
): void {
  assertOracle(oracle);
  if (
    oracle.kind === "INDEPENDENT_IMPLEMENTATION" &&
    oracle.identity.id === processor.id
  ) {
    throw new Error(
      "The implementation under test cannot be its own independent oracle.",
    );
  }
}

export function assertValidationEvidence(input: ValidationEvidence): void {
  requireNonEmpty(input.evidenceId, "Validation evidence id");
  assertArtifactIdentity(input.artifact);
  requireReference(input.provenance, "Validation evidence provenance");
  requireNonEmpty(input.description, "Validation evidence description");
  if (input.oracle.kind === "DECLARED") {
    assertOracle(input.oracle.oracle);
  } else {
    requireNonEmpty(input.oracle.reason, "Oracle not-required reason");
  }
  assertToleranceBinding(input.tolerance);
  if (input.dataset.kind === "DECLARED") {
    assertReferenceDataset(input.dataset.dataset);
  } else {
    requireNonEmpty(input.dataset.reason, "Dataset not-applicable reason");
  }
}

export function createValidationEvidence(
  input: ValidationEvidence,
): ValidationEvidence {
  assertValidationEvidence(input);
  return input;
}

export function createQualificationBinding(
  input: QualificationBinding,
): QualificationBinding {
  assertQualificationBinding(input);
  return input;
}

export function assertQualificationIdentity(
  identity: QualificationIdentity,
): void {
  assertQualificationBinding({ status: "QUALIFIED", identity });
}
