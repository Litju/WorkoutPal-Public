import type {
  EvidenceLineage,
  EvidenceOrigin,
  EvidenceSourceClass,
} from "@workoutpal/provenance";
import { createEvidenceLineage } from "@workoutpal/provenance";
import type { AthleteId, UUID, WorkspaceId } from "@workoutpal/shared-kernel";
import {
  createQuantity,
  type Dimension,
  type EvidenceValue,
  type IanaTimeZone,
  type Instant,
  type LocalDate,
  parseIanaTimeZone,
  parseInstant,
  parseLocalDate,
  type Quantity,
} from "@workoutpal/shared-kernel";

export type AssessmentStatus = "DRAFT" | "RECORDED" | "AMENDED" | "ARCHIVED";

export type ProtocolStatus = "ACTIVE" | "RETIRED";

export interface Protocol {
  readonly id: UUID;
  readonly workspaceId: WorkspaceId;
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: ProtocolStatus;
  readonly currentRevision: number;
  readonly createdAt: Instant;
  readonly createdBy: UUID;
  readonly updatedAt: Instant;
  readonly updatedBy: UUID;
  readonly version: number;
}

export interface ProtocolRevision {
  readonly id: UUID;
  readonly workspaceId: WorkspaceId;
  readonly protocolId: UUID;
  readonly revision: number;
  readonly name: string;
  readonly description: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: Instant;
  readonly createdBy: UUID;
}

export type AcquisitionSourceClass = EvidenceSourceClass;

export interface AcquisitionSource {
  readonly id: UUID;
  readonly workspaceId: WorkspaceId;
  readonly sourceClass: AcquisitionSourceClass;
  readonly label: string;
  readonly manufacturer: string | null;
  readonly model: string | null;
  readonly serialNumber: string | null;
  readonly firmwareVersion: string | null;
  readonly softwareVersion: string | null;
  readonly configurationMetadata: Readonly<Record<string, unknown>>;
  readonly createdAt: Instant;
  readonly createdBy: UUID;
  readonly updatedAt: Instant;
  readonly updatedBy: UUID;
  readonly version: number;
}

export interface Assessment {
  readonly id: UUID;
  readonly workspaceId: WorkspaceId;
  readonly athleteId: AthleteId;
  readonly assessmentType: string;
  readonly purpose: string | null;
  readonly status: AssessmentStatus;
  readonly occurrenceDate: LocalDate;
  readonly occurredAt: Instant | null;
  readonly timeZone: IanaTimeZone;
  readonly protocolRevision: ProtocolRevision | null;
  readonly source: AcquisitionSource | null;
  readonly sourceVersion: number | null;
  readonly artifactIds: readonly UUID[];
  readonly notes: string | null;
  readonly createdAt: Instant;
  readonly createdBy: UUID;
  readonly updatedAt: Instant;
  readonly updatedBy: UUID;
  readonly version: number;
}

export type TrialLifecycleStatus = "RECORDED" | "AMENDED" | "ARCHIVED";
export type TrialValidityState = "UNASSESSED" | "VALID" | "INVALID";
export type TrialExclusionState = "INCLUDED" | "EXCLUDED";

export interface Trial {
  readonly id: UUID;
  readonly workspaceId: WorkspaceId;
  readonly assessmentId: UUID;
  readonly ordinal: number;
  readonly status: TrialLifecycleStatus;
  readonly validity: TrialValidityState;
  readonly exclusion: TrialExclusionState;
  readonly exclusionReason: string | null;
  readonly provenance: EvidenceLineage;
  readonly createdAt: Instant;
  readonly createdBy: UUID;
  readonly updatedAt: Instant;
  readonly updatedBy: UUID;
  readonly version: number;
}

export interface RawObservation {
  readonly id: UUID;
  readonly workspaceId: WorkspaceId;
  readonly assessmentId: UUID;
  readonly trialId: UUID;
  readonly observationKey: string;
  readonly value: EvidenceValue<Quantity>;
  readonly observedAt: Instant | null;
  readonly provenance: EvidenceLineage;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly supersedesObservationId: UUID | null;
  readonly recordedAt: Instant;
  readonly recordedBy: UUID;
}

export type MetricResultScope = "ASSESSMENT" | "TRIAL";
export type ResultOrigin =
  | "MANUAL"
  | "MEASURED"
  | "IMPORTED"
  | "DERIVED_NEUTRAL";

export interface MetricDefinition {
  readonly id: UUID;
  readonly workspaceId: WorkspaceId;
  readonly key: string;
  readonly revision: number;
  readonly displayName: string;
  readonly description: string | null;
  readonly expectedDimension: Dimension | null;
  readonly methodProtocolRevision: ProtocolRevision | null;
  readonly resultScope: MetricResultScope;
  readonly createdAt: Instant;
  readonly createdBy: UUID;
}

export interface NeutralResult {
  readonly id: UUID;
  readonly workspaceId: WorkspaceId;
  readonly assessmentId: UUID;
  readonly trialId: UUID | null;
  readonly metricDefinition: MetricDefinition;
  readonly value: EvidenceValue<Quantity>;
  readonly origin: ResultOrigin;
  readonly sourceClass: EvidenceSourceClass;
  readonly methodProtocolRevision: ProtocolRevision | null;
  readonly provenance: EvidenceLineage;
  readonly recordedAt: Instant;
  readonly recordedBy: UUID;
  readonly supersedesResultId: UUID | null;
}

export type AmendmentTarget = "ASSESSMENT" | "TRIAL" | "OBSERVATION" | "RESULT";

export interface AssessmentAmendment {
  readonly id: UUID;
  readonly workspaceId: WorkspaceId;
  readonly assessmentId: UUID;
  readonly targetType: AmendmentTarget;
  readonly targetId: UUID;
  readonly reason: string;
  readonly originalState: Readonly<Record<string, unknown>>;
  readonly correctedFields: Readonly<Record<string, unknown>>;
  readonly supersedesAmendmentId: UUID | null;
  readonly occurredAt: Instant;
  readonly actorId: UUID;
}

// Compatibility surface for the pre-PSC4 assessment shell. New evidence uses
// RawObservation and NeutralResult, not this legacy record.
export type MeasurementValue =
  | {
      readonly kind: "scalar";
      readonly value: number;
      readonly unit: string;
      readonly dimension?: Dimension;
    }
  | {
      readonly kind: "categorical";
      readonly value: string;
      readonly vocabulary?: string;
    }
  | { readonly kind: "text"; readonly value: string }
  | {
      readonly kind: "series_ref";
      readonly artifactRef: string;
      readonly unit?: string;
    };

export type MeasurementSource = "manual" | "device" | "import" | "system";

export interface MeasurementRecord {
  readonly id: UUID;
  readonly workspaceId: WorkspaceId;
  readonly athleteId: AthleteId;
  readonly measurementKey: string;
  readonly value: MeasurementValue;
  readonly observedAt: Instant;
  readonly source: MeasurementSource;
  readonly protocolRef: string | null;
  readonly deviceRef: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
}

function requiredText(value: string, label: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) throw new Error(`${label} is required.`);
  return normalized;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
}

function validateLineage(lineage: EvidenceLineage): EvidenceLineage {
  return createEvidenceLineage(lineage);
}

export function createProtocol(input: Protocol): Protocol {
  requiredText(input.key, "Protocol key");
  requiredText(input.name, "Protocol name");
  if (!Number.isInteger(input.currentRevision) || input.currentRevision < 0) {
    throw new Error(
      "Protocol current revision must be a non-negative integer.",
    );
  }
  positiveInteger(input.version, "Protocol version");
  parseInstant(input.createdAt);
  parseInstant(input.updatedAt);
  return input;
}

export function createProtocolRevision(
  input: ProtocolRevision,
): ProtocolRevision {
  requiredText(input.name, "Protocol revision name");
  positiveInteger(input.revision, "Protocol revision");
  parseInstant(input.createdAt);
  return input;
}

export function createAcquisitionSource(
  input: AcquisitionSource,
): AcquisitionSource {
  requiredText(input.label, "Acquisition source label");
  positiveInteger(input.version, "Acquisition source version");
  parseInstant(input.createdAt);
  parseInstant(input.updatedAt);
  return input;
}

export function createAssessment(input: Assessment): Assessment {
  requiredText(input.assessmentType, "Assessment type");
  if (
    !(["DRAFT", "RECORDED", "AMENDED", "ARCHIVED"] as const).includes(
      input.status,
    )
  ) {
    throw new Error("Assessment status is invalid.");
  }
  parseLocalDate(input.occurrenceDate);
  if (input.occurredAt !== null) parseInstant(input.occurredAt);
  parseIanaTimeZone(input.timeZone);
  positiveInteger(input.version, "Assessment version");
  parseInstant(input.createdAt);
  parseInstant(input.updatedAt);
  if (input.sourceVersion !== null)
    positiveInteger(input.sourceVersion, "Source version");
  if (new Set(input.artifactIds).size !== input.artifactIds.length) {
    throw new Error("Assessment artifact identifiers must be unique.");
  }
  return input;
}

export function createTrial(input: Trial): Trial {
  positiveInteger(input.ordinal, "Trial ordinal");
  positiveInteger(input.version, "Trial version");
  if (input.exclusion === "EXCLUDED" && input.exclusionReason === null) {
    throw new Error("Excluded trials require an explicit reason.");
  }
  if (input.exclusion === "INCLUDED" && input.exclusionReason !== null) {
    throw new Error("Included trials cannot carry an exclusion reason.");
  }
  validateLineage(input.provenance);
  parseInstant(input.createdAt);
  parseInstant(input.updatedAt);
  return input;
}

export function createRawObservation(input: RawObservation): RawObservation {
  requiredText(input.observationKey, "Observation key");
  if (input.value.kind === "PRESENT") {
    createQuantity(input.value.value);
    if (input.observedAt === null) {
      throw new Error("Present observations require an observed Instant.");
    }
  }
  if (input.observedAt !== null) parseInstant(input.observedAt);
  validateLineage(input.provenance);
  parseInstant(input.recordedAt);
  return input;
}

export function createMetricDefinition(
  input: MetricDefinition,
): MetricDefinition {
  requiredText(input.key, "Metric key");
  requiredText(input.displayName, "Metric display name");
  positiveInteger(input.revision, "Metric revision");
  parseInstant(input.createdAt);
  return input;
}

export function createNeutralResult(input: NeutralResult): NeutralResult {
  createMetricDefinition(input.metricDefinition);
  if (input.value.kind === "PRESENT") {
    const quantity = createQuantity(input.value.value);
    if (
      input.metricDefinition.expectedDimension !== null &&
      quantity.dimension !== input.metricDefinition.expectedDimension
    ) {
      throw new Error(
        "Result quantity dimension does not match the metric definition.",
      );
    }
  }
  if (input.sourceClass !== input.provenance.sourceClass) {
    throw new Error("Result source class must match its provenance.");
  }
  if (
    input.trialId !== null &&
    input.metricDefinition.resultScope !== "TRIAL"
  ) {
    throw new Error(
      "An assessment-scoped metric cannot be attached to a trial.",
    );
  }
  if (
    input.trialId === null &&
    input.metricDefinition.resultScope === "TRIAL"
  ) {
    throw new Error("A trial-scoped metric requires a trial.");
  }
  validateLineage(input.provenance);
  parseInstant(input.recordedAt);
  return input;
}

export function createAssessmentAmendment(
  input: AssessmentAmendment,
): AssessmentAmendment {
  requiredText(input.reason, "Amendment reason");
  if (Object.keys(input.correctedFields).length === 0) {
    throw new Error("An amendment must identify corrected fields.");
  }
  parseInstant(input.occurredAt);
  return input;
}

export function createMeasurementRecord(
  input: Omit<MeasurementRecord, "measurementKey" | "value"> & {
    readonly measurementKey: string;
    readonly value: MeasurementValue;
  },
): MeasurementRecord {
  const measurementKey = requiredText(input.measurementKey, "Measurement key");
  if (input.value.kind === "scalar") {
    createQuantity({
      value: input.value.value,
      unit: input.value.unit,
      ...(input.value.dimension === undefined
        ? {}
        : { dimension: input.value.dimension }),
    });
  }
  parseInstant(input.observedAt);
  return { ...input, measurementKey };
}

export type { EvidenceLineage, EvidenceOrigin, EvidenceSourceClass };
