import type { Instant, Quantity } from "@workoutpal/shared-kernel";
import { createQuantity, parseInstant } from "@workoutpal/shared-kernel";
import type { MethodIdentity, ScienceProvenanceRef } from "./claim.js";
import {
  requireFraction,
  requireNonEmpty,
  requireReference,
  requireUnique,
  requireVersionedIdentity,
} from "./invariants.js";

export type AcquisitionValidityState = "VALID" | "INVALID" | "UNKNOWN";
export type TrialValidityAcceptance = "VALID" | "INVALID" | "UNASSESSED";
export type TrialExclusionState = "INCLUDED" | "EXCLUDED";
export type ProtocolApplicability = "APPLICABLE" | "INAPPLICABLE" | "UNKNOWN";

/**
 * A processor consumes these states; PSC4 remains the owner of acquisition,
 * trial validity, and exclusion records.
 */
export interface ProcessorInputQuality {
  readonly acquisition: AcquisitionValidityState;
  readonly trial: TrialValidityAcceptance;
  readonly exclusion: TrialExclusionState;
  readonly protocol: ProtocolApplicability;
  readonly input: AcquisitionValidityState;
}

const ACQUISITION_VALIDITY_STATES: readonly AcquisitionValidityState[] = [
  "VALID",
  "INVALID",
  "UNKNOWN",
];
const TRIAL_VALIDITY_STATES: readonly TrialValidityAcceptance[] = [
  "VALID",
  "INVALID",
  "UNASSESSED",
];
const EXCLUSION_STATES: readonly TrialExclusionState[] = [
  "INCLUDED",
  "EXCLUDED",
];
const PROTOCOL_STATES: readonly ProtocolApplicability[] = [
  "APPLICABLE",
  "INAPPLICABLE",
  "UNKNOWN",
];

export function createProcessorInputQuality(
  input: ProcessorInputQuality,
): ProcessorInputQuality {
  if (!ACQUISITION_VALIDITY_STATES.includes(input.acquisition)) {
    throw new Error("Acquisition validity state is invalid.");
  }
  if (!TRIAL_VALIDITY_STATES.includes(input.trial)) {
    throw new Error("Trial validity state is invalid.");
  }
  if (!EXCLUSION_STATES.includes(input.exclusion)) {
    throw new Error("Trial exclusion state is invalid.");
  }
  if (!PROTOCOL_STATES.includes(input.protocol)) {
    throw new Error("Protocol applicability state is invalid.");
  }
  if (!ACQUISITION_VALIDITY_STATES.includes(input.input)) {
    throw new Error("Processor input validity state is invalid.");
  }
  return input;
}

export type CalibrationStatus =
  | "CALIBRATED"
  | "UNCALIBRATED"
  | "EXPIRED"
  | "UNKNOWN"
  | "NOT_REQUIRED";

export type CalibrationRequirement =
  | { readonly kind: "NOT_REQUIRED" }
  | {
      readonly kind: "OPTIONAL" | "REQUIRED";
      readonly acceptedStatuses: readonly CalibrationStatus[];
    };

export type CalibrationValidity =
  | {
      readonly kind: "INTERVAL";
      readonly startsAt: Instant;
      readonly endsAt: Instant;
    }
  | { readonly kind: "NOT_SPECIFIED"; readonly reason: string };

export type CalibrationArtifact =
  | { readonly kind: "PROVIDED"; readonly reference: ScienceProvenanceRef }
  | { readonly kind: "NOT_PROVIDED"; readonly reason: string };

export type UncertaintySource =
  | { readonly kind: "METHOD"; readonly method: MethodIdentity }
  | { readonly kind: "REFERENCE"; readonly reference: ScienceProvenanceRef };

export type CoverageSemantics =
  | {
      readonly kind: "CONFIDENCE" | "CREDIBLE";
      readonly level: number;
      readonly reference: ScienceProvenanceRef;
    }
  | { readonly kind: "NOT_APPLICABLE" };

export type DistributionSummary =
  | {
      readonly kind: "DECLARED";
      readonly values: Readonly<Record<string, number>>;
    }
  | { readonly kind: "NOT_AVAILABLE"; readonly reason: string };

export type Uncertainty =
  | {
      readonly kind: "STANDARD";
      readonly value: Quantity;
      readonly source: UncertaintySource;
    }
  | {
      readonly kind: "INTERVAL";
      readonly intervalKind: "CONFIDENCE" | "CREDIBLE" | "BOUNDED";
      readonly lower: Quantity;
      readonly upper: Quantity;
      readonly coverage: CoverageSemantics;
      readonly source: UncertaintySource;
    }
  | {
      readonly kind: "DISTRIBUTION";
      readonly reference: ScienceProvenanceRef;
      readonly summary: DistributionSummary;
      readonly source: UncertaintySource;
    }
  | {
      readonly kind: "UNKNOWN" | "NOT_AVAILABLE" | "NOT_APPLICABLE";
      readonly reason: string;
      readonly source: UncertaintySource;
    };

export type UncertaintyResponsibility =
  | {
      readonly kind: "PROPAGATED_BY_PROCESSOR";
      readonly method: MethodIdentity;
    }
  | { readonly kind: "PRODUCED_BY_ESTIMATOR"; readonly method: MethodIdentity }
  | { readonly kind: "CONSUMED_BY_INFERENCE"; readonly method: MethodIdentity }
  | { readonly kind: "NOT_PROPAGATED"; readonly reason: string }
  | { readonly kind: "UNKNOWN"; readonly reason: string };

export interface UncertaintyPolicy {
  readonly measurement: UncertaintyResponsibility;
  readonly statistical: UncertaintyResponsibility;
  readonly model: UncertaintyResponsibility;
  readonly propagated: UncertaintyResponsibility;
  readonly output: "REQUIRED" | "UNKNOWN_ALLOWED";
}

export type CalibrationUncertainty =
  | { readonly kind: "CONTRIBUTION"; readonly uncertainty: Uncertainty }
  | { readonly kind: "NOT_REPORTED"; readonly reason: string };

export interface CalibrationRecord {
  readonly deviceOrSource: ScienceProvenanceRef;
  readonly procedure: MethodIdentity;
  readonly eventAt: Instant;
  readonly validity: CalibrationValidity;
  readonly artifact: CalibrationArtifact;
  readonly status: CalibrationStatus;
  readonly uncertaintyContribution: CalibrationUncertainty;
}

function validateSource(source: UncertaintySource): void {
  if (source.kind === "METHOD") {
    requireVersionedIdentity(source.method, "Uncertainty method");
  } else {
    requireReference(source.reference, "Uncertainty reference");
  }
}

function validateCalibrationValidity(validity: CalibrationValidity): void {
  if (validity.kind === "INTERVAL") {
    const startsAt = parseInstant(validity.startsAt);
    const endsAt = parseInstant(validity.endsAt);
    if (startsAt >= endsAt) {
      throw new Error("Calibration validity interval must have a later end.");
    }
  } else {
    requireNonEmpty(validity.reason, "Calibration validity reason");
  }
}

function validateCoverage(
  intervalKind: "CONFIDENCE" | "CREDIBLE" | "BOUNDED",
  coverage: CoverageSemantics,
): void {
  if (intervalKind === "BOUNDED") {
    if (coverage.kind !== "NOT_APPLICABLE") {
      throw new Error(
        "Bounded uncertainty cannot claim confidence or credible coverage.",
      );
    }
    return;
  }
  if (coverage.kind !== intervalKind) {
    throw new Error(
      `${intervalKind} uncertainty requires matching coverage semantics.`,
    );
  }
  requireFraction(coverage.level, `${intervalKind} coverage level`);
  requireReference(coverage.reference, "Coverage reference");
}

export function assertUncertainty(uncertainty: Uncertainty): void {
  validateSource(uncertainty.source);
  switch (uncertainty.kind) {
    case "STANDARD":
      createQuantity(uncertainty.value);
      return;
    case "INTERVAL": {
      const lower = createQuantity(uncertainty.lower);
      const upper = createQuantity(uncertainty.upper);
      if (lower.dimension !== upper.dimension || lower.unit !== upper.unit) {
        throw new Error(
          "Uncertainty interval bounds must use the same unit and dimension.",
        );
      }
      if (lower.value > upper.value) {
        throw new Error(
          "Uncertainty interval lower bound must not exceed its upper bound.",
        );
      }
      validateCoverage(uncertainty.intervalKind, uncertainty.coverage);
      return;
    }
    case "DISTRIBUTION":
      requireReference(uncertainty.reference, "Distribution reference");
      if (uncertainty.summary.kind === "NOT_AVAILABLE") {
        requireNonEmpty(
          uncertainty.summary.reason,
          "Distribution summary reason",
        );
      } else {
        for (const value of Object.values(uncertainty.summary.values)) {
          if (!Number.isFinite(value)) {
            throw new Error("Distribution summary values must be finite.");
          }
        }
      }
      return;
    case "UNKNOWN":
    case "NOT_AVAILABLE":
    case "NOT_APPLICABLE":
      requireNonEmpty(uncertainty.reason, "Uncertainty state reason");
      return;
  }
}

export function assertUncertaintyPolicy(policy: UncertaintyPolicy): void {
  for (const responsibility of [
    policy.measurement,
    policy.statistical,
    policy.model,
    policy.propagated,
  ]) {
    if ("method" in responsibility) {
      requireVersionedIdentity(
        responsibility.method,
        "Uncertainty responsibility method",
      );
    } else {
      requireNonEmpty(
        responsibility.reason,
        "Uncertainty responsibility reason",
      );
    }
  }
}

export function assertCalibrationRequirement(
  requirement: CalibrationRequirement,
): void {
  if (requirement.kind === "NOT_REQUIRED") return;
  if (requirement.acceptedStatuses.length === 0) {
    throw new Error("Calibration requirements must declare accepted statuses.");
  }
  requireUnique(requirement.acceptedStatuses, "Calibration statuses");
}

export function assertCalibrationRecord(record: CalibrationRecord): void {
  requireReference(record.deviceOrSource, "Calibration device or source");
  requireVersionedIdentity(record.procedure, "Calibration procedure");
  parseInstant(record.eventAt);
  validateCalibrationValidity(record.validity);
  if (record.artifact.kind === "PROVIDED") {
    requireReference(record.artifact.reference, "Calibration artifact");
  } else {
    requireNonEmpty(record.artifact.reason, "Calibration artifact reason");
  }
  if (record.uncertaintyContribution.kind === "CONTRIBUTION") {
    assertUncertainty(record.uncertaintyContribution.uncertainty);
  } else {
    requireNonEmpty(
      record.uncertaintyContribution.reason,
      "Calibration uncertainty reason",
    );
  }
}
