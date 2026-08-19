import type { Dimension, Instant, Quantity } from "@workoutpal/shared-kernel";
import { createQuantity, parseInstant } from "@workoutpal/shared-kernel";
import {
  assertAssumptionDeclarations,
  assertConfigurationSnapshot,
  assertSoftwareProvenance,
  requireNonEmpty,
  requireReference,
  requireUnique,
  requireVersionedIdentity,
} from "./invariants.js";
import { assertUncertainty, type Uncertainty } from "./quality.js";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type ScientificClaimClass =
  | "OBSERVED"
  | "MECHANICALLY_DERIVED"
  | "STATISTICALLY_ESTIMATED"
  | "SCIENTIFIC_INFERENCE"
  | "INTERPRETATION"
  | "DECISION_RECOMMENDATION";

export const SCIENTIFIC_CLAIM_CLASSES: readonly ScientificClaimClass[] = [
  "OBSERVED",
  "MECHANICALLY_DERIVED",
  "STATISTICALLY_ESTIMATED",
  "SCIENTIFIC_INFERENCE",
  "INTERPRETATION",
  "DECISION_RECOMMENDATION",
];

export interface ScienceProvenanceRef {
  readonly type: string;
  readonly ref: string;
}

/**
 * Stable SCI-0 names for PSC4-owned source evidence. Keeping this allowlist
 * here prevents an arbitrary `PSC4_*` label from being treated as authority.
 */
export const PSC4_SOURCE_EVIDENCE_TYPES = [
  "PSC4_EVIDENCE",
  "PSC4_TRIAL",
  "PSC4_OBSERVATION",
  "PSC4_RAW_OBSERVATION",
  "PSC4_RESULT",
  "PSC4_NEUTRAL_RESULT",
] as const;

export type Psc4SourceEvidenceType =
  (typeof PSC4_SOURCE_EVIDENCE_TYPES)[number];

export function isPsc4SourceEvidenceType(
  type: string,
): type is Psc4SourceEvidenceType {
  return (PSC4_SOURCE_EVIDENCE_TYPES as readonly string[]).includes(type);
}

export type ClaimReference =
  | { readonly kind: "PSC4_EVIDENCE"; readonly ref: string }
  | {
      readonly kind: "SCIENTIFIC_CLAIM";
      readonly ref: string;
      readonly claimClass: ScientificClaimClass;
    };

export type ScientificClaimValue =
  | { readonly kind: "QUANTITY"; readonly value: Quantity }
  | { readonly kind: "TEXT"; readonly value: string }
  | { readonly kind: "REFERENCE"; readonly value: string }
  | { readonly kind: "TIMESTAMP"; readonly value: Instant };

export type ClaimOutputSpecification =
  | {
      readonly kind: "QUANTITY";
      readonly dimension: Dimension;
      readonly unit: string;
    }
  | { readonly kind: "TEXT" }
  | { readonly kind: "REFERENCE" }
  | { readonly kind: "TIMESTAMP" };

export interface MethodIdentity {
  readonly id: string;
  readonly version: string;
}

export interface SoftwareProvenance {
  readonly packageName: string;
  readonly packageVersion: string;
  readonly sourceRevision: string;
  readonly buildId: string;
}

export interface AssumptionDeclaration {
  readonly id: string;
  readonly version: string;
  readonly description: string;
  readonly reference: ScienceProvenanceRef;
  readonly status: "DECLARED" | "NOT_APPLICABLE";
  readonly parameters: Readonly<Record<string, JsonValue>>;
}

export interface ConfigurationSnapshot {
  readonly id: string;
  readonly parameters: Readonly<Record<string, JsonValue>>;
  readonly canonicalSerialization: string;
  readonly contentHash: string;
}

export interface ClaimLineage {
  readonly parents: readonly ClaimReference[];
  readonly provenance: readonly ScienceProvenanceRef[];
}

export interface ClaimAuthority {
  readonly method: MethodIdentity;
  readonly software: SoftwareProvenance;
  readonly assumptions: readonly AssumptionDeclaration[];
  readonly configuration: ConfigurationSnapshot;
  readonly lineage: ClaimLineage;
}

export interface ObservedClaim {
  readonly claimClass: "OBSERVED";
  readonly claimId: string;
  readonly value: ScientificClaimValue;
  readonly evidence: readonly ScienceProvenanceRef[];
  readonly observedAt: Instant | null;
}

export interface MechanicallyDerivedClaim extends ClaimAuthority {
  readonly claimClass: "MECHANICALLY_DERIVED";
  readonly claimId: string;
  readonly value: ScientificClaimValue;
  readonly output: ClaimOutputSpecification;
}

export type SampleScope =
  | {
      readonly kind: "SAMPLE";
      readonly reference: ScienceProvenanceRef;
      readonly count: number;
    }
  | {
      readonly kind: "POPULATION";
      readonly reference: ScienceProvenanceRef;
      readonly label: string;
    }
  | { readonly kind: "NOT_SPECIFIED"; readonly reason: string };

export interface StatisticallyEstimatedClaim extends ClaimAuthority {
  readonly claimClass: "STATISTICALLY_ESTIMATED";
  readonly claimId: string;
  readonly value: ScientificClaimValue;
  readonly output: ClaimOutputSpecification;
  readonly estimator: MethodIdentity;
  readonly sampleScope: SampleScope;
  readonly uncertainty: Uncertainty;
}

export interface ScientificInferenceClaim extends ClaimAuthority {
  readonly claimClass: "SCIENTIFIC_INFERENCE";
  readonly claimId: string;
  readonly proposition: string;
  readonly evidenceBasis: readonly ClaimReference[];
  readonly uncertainty: Uncertainty;
}

export interface InterpretationClaim extends ClaimAuthority {
  readonly claimClass: "INTERPRETATION";
  readonly claimId: string;
  readonly statement: string;
}

export interface DecisionRecommendationClaim extends ClaimAuthority {
  readonly claimClass: "DECISION_RECOMMENDATION";
  readonly claimId: string;
  readonly action: string;
}

export type ScientificClaim =
  | ObservedClaim
  | MechanicallyDerivedClaim
  | StatisticallyEstimatedClaim
  | ScientificInferenceClaim
  | InterpretationClaim
  | DecisionRecommendationClaim;

const CLAIM_RANK: Readonly<Record<ScientificClaimClass, number>> = {
  OBSERVED: 0,
  MECHANICALLY_DERIVED: 1,
  STATISTICALLY_ESTIMATED: 2,
  SCIENTIFIC_INFERENCE: 3,
  INTERPRETATION: 4,
  DECISION_RECOMMENDATION: 5,
};

function validateClaimReference(reference: ClaimReference): void {
  requireNonEmpty(reference.ref, "Claim reference");
}

function parentClass(reference: ClaimReference): ScientificClaimClass {
  return reference.kind === "PSC4_EVIDENCE" ? "OBSERVED" : reference.claimClass;
}

function validateProductionReferences(
  references: readonly ClaimReference[],
  outputClass: ScientificClaimClass,
): void {
  if (references.length === 0) {
    throw new Error(
      "Scientific claim production requires at least one parent reference.",
    );
  }
  references.forEach(validateClaimReference);
  assertLegalClaimProduction({
    parentClasses: references.map(parentClass),
    outputClass,
    producerOutputClass: outputClass,
  });
}

function validateLineage(
  lineage: ClaimLineage,
  outputClass: ScientificClaimClass,
): void {
  if (lineage.parents.length === 0) {
    throw new Error(
      "Derived claims require at least one parent claim or evidence reference.",
    );
  }
  lineage.parents.forEach(validateClaimReference);
  requireUnique(
    lineage.parents.map((parent) => `${parent.kind}:${parent.ref}`),
    "Claim parent references",
  );
  validateProductionReferences(lineage.parents, outputClass);
  if (lineage.provenance.length === 0) {
    throw new Error("Derived claims require derivation provenance.");
  }
  lineage.provenance.forEach((reference) => {
    requireReference(reference, "Claim provenance");
  });
}

function validateAuthority(
  authority: ClaimAuthority,
  outputClass: ScientificClaimClass,
): void {
  requireVersionedIdentity(authority.method, "Scientific method");
  assertSoftwareProvenance(authority.software);
  assertAssumptionDeclarations(authority.assumptions);
  assertConfigurationSnapshot(authority.configuration);
  validateLineage(authority.lineage, outputClass);
}

function validateValueAgainstOutput(
  value: ScientificClaimValue,
  output: ClaimOutputSpecification,
): void {
  if (output.kind === "QUANTITY") {
    if (value.kind !== "QUANTITY") {
      throw new Error("Claim value kind must match its output specification.");
    }
    const quantity = createQuantity(value.value);
    if (
      quantity.dimension !== output.dimension ||
      quantity.unit !== output.unit
    ) {
      throw new Error(
        "Claim quantity does not match its output specification.",
      );
    }
    return;
  }
  if (value.kind !== output.kind) {
    throw new Error("Claim value kind must match its output specification.");
  }
  if (value.kind === "TEXT" && value.value.trim().length === 0) {
    throw new Error("Claim text is required.");
  }
  if (value.kind === "REFERENCE")
    requireNonEmpty(value.value, "Claim reference");
  if (value.kind === "TIMESTAMP") parseInstant(value.value);
}

function validateSampleScope(scope: SampleScope): void {
  if (scope.kind === "SAMPLE") {
    requireReference(scope.reference, "Sample scope reference");
    if (!Number.isInteger(scope.count) || scope.count < 1) {
      throw new Error("Sample scope count must be a positive integer.");
    }
  } else if (scope.kind === "POPULATION") {
    requireReference(scope.reference, "Population scope reference");
    requireNonEmpty(scope.label, "Population scope label");
  } else {
    requireNonEmpty(scope.reason, "Unspecified sample scope reason");
  }
}

export function claimClassRank(claimClass: ScientificClaimClass): number {
  return CLAIM_RANK[claimClass];
}

export function isLegalClaimTransition(
  parentClass: ScientificClaimClass,
  outputClass: ScientificClaimClass,
): boolean {
  return (
    outputClass !== "OBSERVED" &&
    claimClassRank(outputClass) >= claimClassRank(parentClass)
  );
}

export function assertLegalClaimProduction(input: {
  readonly parentClasses: readonly ScientificClaimClass[];
  readonly outputClass: ScientificClaimClass;
  readonly producerOutputClass: ScientificClaimClass;
}): void {
  if (input.parentClasses.length === 0) {
    throw new Error("Claim production requires at least one parent class.");
  }
  if (input.outputClass !== input.producerOutputClass) {
    throw new Error(
      "A method cannot emit a claim class different from its declared output class.",
    );
  }
  if (
    input.outputClass === "OBSERVED" ||
    input.parentClasses.some(
      (parentClass) => !isLegalClaimTransition(parentClass, input.outputClass),
    )
  ) {
    throw new Error("Illegal scientific claim transition.");
  }
}

export function createScientificClaim(input: ScientificClaim): ScientificClaim {
  requireNonEmpty(input.claimId, "Claim id");
  switch (input.claimClass) {
    case "OBSERVED":
      if (input.evidence.length === 0) {
        throw new Error("Observed claims must point to PSC4 source evidence.");
      }
      if (input.value.kind === "QUANTITY") {
        createQuantity(input.value.value);
      } else if (input.value.kind === "TEXT") {
        requireNonEmpty(input.value.value, "Observed claim text");
      } else if (input.value.kind === "REFERENCE") {
        requireNonEmpty(input.value.value, "Observed claim reference");
      } else {
        parseInstant(input.value.value);
      }
      input.evidence.forEach((reference) => {
        requireReference(reference, "Observed evidence reference");
        if (!isPsc4SourceEvidenceType(reference.type)) {
          throw new Error(
            "Observed evidence must point to PSC4 source evidence.",
          );
        }
      });
      if (input.observedAt !== null) parseInstant(input.observedAt);
      return input;
    case "MECHANICALLY_DERIVED":
      validateAuthority(input, input.claimClass);
      validateValueAgainstOutput(input.value, input.output);
      return input;
    case "STATISTICALLY_ESTIMATED":
      validateAuthority(input, input.claimClass);
      requireVersionedIdentity(input.estimator, "Estimator");
      validateSampleScope(input.sampleScope);
      assertUncertainty(input.uncertainty);
      validateValueAgainstOutput(input.value, input.output);
      return input;
    case "SCIENTIFIC_INFERENCE":
      validateAuthority(input, input.claimClass);
      validateProductionReferences(input.evidenceBasis, input.claimClass);
      requireNonEmpty(input.proposition, "Inference proposition");
      assertUncertainty(input.uncertainty);
      return input;
    case "INTERPRETATION":
      validateAuthority(input, input.claimClass);
      requireNonEmpty(input.statement, "Interpretation statement");
      return input;
    case "DECISION_RECOMMENDATION":
      validateAuthority(input, input.claimClass);
      requireNonEmpty(input.action, "Decision or recommendation action");
      return input;
  }
}
