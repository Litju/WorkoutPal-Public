import type {
  AthleteId,
  IanaTimeZone,
  Instant,
  LocalDate,
  UUID,
  WorkspaceId,
} from "@workoutpal/shared-kernel";
import type {
  EnduranceSegment,
  MobilityItem,
  SessionPrescription,
  StrengthExercisePrescription,
  StrengthSetPrescription,
} from "@workoutpal/training-design";
import type {
  ExecutedSession,
  ExecutionAmendment,
  PerformedEnduranceSegment,
  PerformedFact,
  PerformedMobilityItem,
  PerformedStrengthSet,
  SessionObservation,
} from "@workoutpal/training-execution";
import {
  applyExecutionAmendmentsToFact,
  type PerformedFactKind,
} from "@workoutpal/training-execution";

/**
 * F5 statuses describe stored product facts only. They do not describe
 * physiological meaning, quality, or significance.
 */
export type MonitoringFactStatus =
  | "MATCHED"
  | "DIFFERENT"
  | "NOT_RECORDED"
  | "NOT_PERFORMED"
  | "UNPLANNED"
  | "NOT_APPLICABLE";

export type MonitoringSessionStatus =
  | "PRESCRIBED_NOT_STARTED"
  | "PRESCRIBED_STARTED"
  | "PRESCRIBED_COMPLETED"
  | "PRESCRIBED_WITH_EXECUTION_DEVIATION"
  | "UNPLANNED_EXECUTION"
  | "ARCHIVED_OR_SUPERSEDED_CONTEXT";

export type MonitoringWindowKind = "day" | "week";

export interface MonitoringWindow {
  readonly kind: MonitoringWindowKind;
  readonly startDate: LocalDate;
  readonly endDate: LocalDate;
  readonly timeZone: IanaTimeZone;
}

export interface AmendmentProvenance {
  readonly amendmentId: UUID;
  readonly factId: UUID;
  readonly factKind: PerformedFactKind | null;
  readonly actorId: UUID;
  readonly reason: string;
  readonly originalValues: Readonly<Record<string, unknown>>;
  readonly correctedFields: Readonly<Record<string, unknown>>;
  readonly occurredAt: Instant;
}

export interface MonitoringFactProvenance {
  readonly workspaceId: WorkspaceId;
  readonly prescriptionId: UUID | null;
  readonly prescriptionVersion: number | null;
  readonly prescriptionRevision: number | null;
  readonly prescriptionSnapshotFingerprint: string | null;
  readonly executionId: UUID | null;
  readonly performedFactId: UUID | null;
  readonly sourceTimestamp: Instant | null;
  readonly amendmentIds: readonly UUID[];
}

export interface ObservationView {
  readonly id: UUID;
  readonly workspaceId: WorkspaceId;
  readonly executionId: UUID;
  readonly observedAt: Instant;
  readonly kind: SessionObservation["kind"];
  readonly valueText: string | null;
  readonly valueNumber: number | null;
  readonly unit: string | null;
  readonly notes: string | null;
  readonly provenance: MonitoringFactProvenance;
}

export interface StrengthSetComparison {
  readonly movementId: UUID | null;
  readonly movementName: string | null;
  readonly performedMovementId: UUID | null;
  readonly performedMovementName: string | null;
  readonly prescribedSetId: UUID | null;
  readonly prescribedSetOrdinal: number | null;
  readonly performedSetOrdinal: number | null;
  readonly prescribedRepMin: number | null;
  readonly prescribedRepMax: number | null;
  readonly performedRepetitions: number | null;
  readonly prescribedLoadKg: number | null;
  readonly performedLoadKg: number | null;
  readonly prescribedRpe: number | null;
  readonly observedRpe: number | null;
  readonly prescribedRir: number | null;
  readonly observedRir: number | null;
  readonly prescribedRestSeconds: number | null;
  readonly observedDurationSeconds: number | null;
  readonly prescribedDurationSeconds: number | null;
  readonly prescribedVelocityMps: number | null;
  readonly observedAt: Instant | null;
  readonly performedFactId: UUID | null;
  readonly status: MonitoringFactStatus;
  readonly provenance: MonitoringFactProvenance;
  readonly amendments: readonly AmendmentProvenance[];
}

export interface EnduranceSegmentComparison {
  readonly segmentKind: EnduranceSegment["kind"] | null;
  readonly prescribedSegmentId: UUID | null;
  readonly prescribedOrdinal: number | null;
  readonly prescribedTreePosition: string | null;
  readonly repeatCount: number | null;
  readonly performedFactId: UUID | null;
  readonly prescribedDurationSeconds: number | null;
  readonly performedDurationSeconds: number | null;
  readonly prescribedDistanceMeters: number | null;
  readonly performedDistanceMeters: number | null;
  readonly prescribedHrMin: number | null;
  readonly prescribedHrMax: number | null;
  readonly observedAverageHeartRateBpm: number | null;
  readonly prescribedSpeedMpsMin: number | null;
  readonly prescribedSpeedMpsMax: number | null;
  readonly observedSpeedMps: number | null;
  readonly prescribedPowerWattsMin: number | null;
  readonly prescribedPowerWattsMax: number | null;
  readonly observedAveragePowerWatts: number | null;
  readonly prescribedRpe: number | null;
  readonly observedRpe: number | null;
  readonly modality: string | null;
  readonly observedAt: Instant | null;
  readonly status: MonitoringFactStatus;
  readonly provenance: MonitoringFactProvenance;
  readonly amendments: readonly AmendmentProvenance[];
}

export interface MobilityItemComparison {
  readonly movementId: UUID | null;
  readonly movementName: string | null;
  readonly performedMovementId: UUID | null;
  readonly performedMovementName: string | null;
  readonly side: MobilityItem["side"] | null;
  readonly performedSide: PerformedMobilityItem["side"] | null;
  readonly prescribedItemId: UUID | null;
  readonly prescribedOrdinal: number | null;
  readonly performedFactId: UUID | null;
  readonly prescribedSets: number | null;
  readonly performedSets: number | null;
  readonly prescribedRepetitions: number | null;
  readonly performedRepetitions: number | null;
  readonly prescribedHoldSeconds: number | null;
  readonly performedHoldSeconds: number | null;
  readonly prescribedRpe: number | null;
  readonly observedRpe: number | null;
  readonly observedAt: Instant | null;
  readonly status: MonitoringFactStatus;
  readonly provenance: MonitoringFactProvenance;
  readonly amendments: readonly AmendmentProvenance[];
}

export interface MonitoringCounts {
  readonly prescribedStrengthSetCount: number;
  readonly performedStrengthSetCount: number;
  readonly prescribedEnduranceSegmentCount: number;
  readonly performedEnduranceSegmentCount: number;
  readonly prescribedMobilityItemCount: number;
  readonly performedMobilityItemCount: number;
  readonly amendedPerformedFactCount: number;
}

export interface MonitoringPrescriptionReference {
  readonly prescriptionId: UUID;
  readonly prescriptionVersion: number;
  readonly prescriptionRevision: number;
  readonly snapshotFingerprint: string | null;
  readonly scheduledLocalDate: LocalDate;
  readonly timeZone: IanaTimeZone;
}

export interface MonitoringExecutionReference {
  readonly executionId: UUID;
  readonly status: ExecutedSession["status"];
  readonly startedAt: Instant;
  readonly completedAt: Instant | null;
  readonly timeZone: IanaTimeZone;
}

export interface MonitoringSessionSummary {
  readonly id: UUID;
  readonly workspaceId: WorkspaceId;
  readonly athleteId: AthleteId;
  readonly title: string;
  readonly scheduledLocalDate: LocalDate | null;
  readonly classification: MonitoringSessionStatus;
  readonly prescriptionId: UUID | null;
  readonly executionId: UUID | null;
  readonly executionStatus: ExecutedSession["status"] | null;
  readonly counts: MonitoringCounts;
}

export interface SessionMonitoringView extends MonitoringSessionSummary {
  readonly timeZone: IanaTimeZone;
  readonly prescription: MonitoringPrescriptionReference | null;
  readonly execution: MonitoringExecutionReference | null;
  readonly strength: readonly StrengthSetComparison[];
  readonly endurance: readonly EnduranceSegmentComparison[];
  readonly mobility: readonly MobilityItemComparison[];
  readonly observations: readonly ObservationView[];
  readonly amendments: readonly AmendmentProvenance[];
}

export interface MonitoringOverview {
  readonly workspaceId: WorkspaceId;
  readonly athleteId: AthleteId;
  readonly window: MonitoringWindow;
  readonly prescribedSessionCount: number;
  readonly executedSessionCount: number;
  readonly linkedExecutedSessionCount: number;
  readonly completedSessionCount: number;
  readonly unplannedSessionCount: number;
  readonly amendedPerformedFactCount: number;
  readonly counts: MonitoringCounts;
  readonly sessions: readonly MonitoringSessionSummary[];
}

export interface MonitoringProjectionInput {
  readonly workspaceId: WorkspaceId;
  readonly athleteId: AthleteId;
  readonly prescription: SessionPrescription | null;
  readonly execution: ExecutedSession | null;
  readonly strengthSets: readonly PerformedStrengthSet[];
  readonly enduranceSegments: readonly PerformedEnduranceSegment[];
  readonly mobilityItems: readonly PerformedMobilityItem[];
  readonly observations: readonly SessionObservation[];
  readonly amendments: readonly ExecutionAmendment[];
  readonly movementNames?: ReadonlyMap<UUID, string>;
  readonly sessionDate?: LocalDate;
}

interface StrengthEntry {
  readonly exercise: StrengthExercisePrescription;
  readonly set: StrengthSetPrescription;
}

interface EnduranceEntry {
  readonly blockOrdinal: number;
  readonly segment: EnduranceSegment;
  readonly treePosition: string;
}

type StrengthPrescriptionBlock = Extract<
  SessionPrescription["blocks"][number],
  { readonly kind: "strength" }
>;
type EndurancePrescriptionBlock = Extract<
  SessionPrescription["blocks"][number],
  { readonly kind: "endurance" }
>;
type MobilityPrescriptionBlock = Extract<
  SessionPrescription["blocks"][number],
  { readonly kind: "mobility" }
>;

function nullableNumber(value: number | undefined): number | null {
  return value === undefined ? null : value;
}

function byObservedAt<
  T extends { readonly id: UUID; readonly observedAt: Instant },
>(left: T, right: T): number {
  return (
    left.observedAt.localeCompare(right.observedAt) ||
    left.id.localeCompare(right.id)
  );
}

function amendmentListForFact(
  amendments: readonly ExecutionAmendment[],
  factId: UUID,
): readonly ExecutionAmendment[] {
  return amendments
    .filter((amendment) => amendment.factId === factId)
    .slice()
    .sort(
      (left, right) =>
        left.occurredAt.localeCompare(right.occurredAt) ||
        left.id.localeCompare(right.id),
    );
}

function toAmendmentProvenance(
  amendment: ExecutionAmendment,
): AmendmentProvenance {
  return {
    amendmentId: amendment.id,
    factId: amendment.factId,
    factKind: amendment.factKind ?? null,
    actorId: amendment.actorId,
    reason: amendment.reason,
    originalValues: amendment.originalValues ?? {},
    correctedFields: amendment.correctedFields,
    occurredAt: amendment.occurredAt,
  };
}

function snapshotPrescription(
  execution: ExecutedSession,
): SessionPrescription | null {
  const snapshot = execution.prescription?.snapshot;
  if (
    snapshot === undefined ||
    snapshot === null ||
    typeof snapshot !== "object"
  ) {
    return null;
  }
  if (
    typeof snapshot.id !== "string" ||
    typeof snapshot.title !== "string" ||
    !Array.isArray(snapshot.blocks) ||
    typeof snapshot.scheduledLocalDate !== "string" ||
    typeof snapshot.timeZone !== "string"
  ) {
    return null;
  }
  return snapshot as unknown as SessionPrescription;
}

export function prescriptionSnapshotForExecution(
  execution: ExecutedSession,
): SessionPrescription | null {
  return snapshotPrescription(execution);
}

function referenceFor(
  input: MonitoringProjectionInput,
  prescription: SessionPrescription | null,
  execution: ExecutedSession | null,
  fact: PerformedFact | null,
  amendments: readonly ExecutionAmendment[],
): MonitoringFactProvenance {
  return {
    workspaceId: input.workspaceId,
    prescriptionId:
      execution?.prescription?.prescriptionId ?? prescription?.id ?? null,
    prescriptionVersion:
      execution?.prescription?.prescriptionVersion ??
      prescription?.version ??
      null,
    prescriptionRevision:
      execution?.prescription?.prescriptionRevision ??
      prescription?.publishedRevision ??
      prescription?.revision ??
      null,
    prescriptionSnapshotFingerprint:
      execution?.prescription?.snapshotFingerprint ?? null,
    executionId: execution?.id ?? null,
    performedFactId: fact?.id ?? null,
    sourceTimestamp: fact?.observedAt ?? prescription?.publishedAt ?? null,
    amendmentIds: amendments.map((amendment) => amendment.id),
  };
}

function compareExact(
  prescribed: number | string | null,
  observed: number | string | null,
): { readonly different: boolean; readonly notRecorded: boolean } {
  if (prescribed === null) return { different: false, notRecorded: false };
  if (observed === null) return { different: false, notRecorded: true };
  return { different: prescribed !== observed, notRecorded: false };
}

function compareRange(
  min: number | null,
  max: number | null,
  observed: number | null,
): { readonly different: boolean; readonly notRecorded: boolean } {
  if (min === null && max === null)
    return { different: false, notRecorded: false };
  if (observed === null) return { different: false, notRecorded: true };
  return {
    different:
      (min !== null && observed < min) || (max !== null && observed > max),
    notRecorded: false,
  };
}

function comparisonStatus(
  checks: readonly {
    readonly different: boolean;
    readonly notRecorded: boolean;
  }[],
): MonitoringFactStatus {
  if (checks.some((check) => check.different)) return "DIFFERENT";
  if (checks.some((check) => check.notRecorded)) return "NOT_RECORDED";
  return "MATCHED";
}

function strengthEntries(
  prescription: SessionPrescription | null,
): readonly StrengthEntry[] {
  if (prescription === null) return [];
  return prescription.blocks
    .filter(
      (block): block is StrengthPrescriptionBlock => block.kind === "strength",
    )
    .slice()
    .sort(
      (left, right) =>
        left.ordinal - right.ordinal || left.id.localeCompare(right.id),
    )
    .flatMap((block) =>
      block.exercises
        .slice()
        .sort(
          (left, right) =>
            left.ordinal - right.ordinal || left.id.localeCompare(right.id),
        )
        .flatMap((exercise) =>
          exercise.sets
            .slice()
            .sort(
              (left, right) =>
                left.ordinal - right.ordinal || left.id.localeCompare(right.id),
            )
            .map((set) => ({ exercise, set })),
        ),
    );
}

function enduranceEntries(
  prescription: SessionPrescription | null,
): readonly EnduranceEntry[] {
  if (prescription === null) return [];
  const entries: EnduranceEntry[] = [];
  const blocks = prescription.blocks
    .filter(
      (block): block is EndurancePrescriptionBlock =>
        block.kind === "endurance",
    )
    .slice()
    .sort(
      (left, right) =>
        left.ordinal - right.ordinal || left.id.localeCompare(right.id),
    );
  for (const block of blocks) {
    const children = new Map<UUID | null, EnduranceSegment[]>();
    for (const segment of block.segments) {
      const list = children.get(segment.parentSegmentId) ?? [];
      list.push(segment);
      children.set(segment.parentSegmentId, list);
    }
    const visit = (parentId: UUID | null, prefix: string): void => {
      const siblings = (children.get(parentId) ?? [])
        .slice()
        .sort(
          (left, right) =>
            left.ordinal - right.ordinal || left.id.localeCompare(right.id),
        );
      siblings.forEach((segment, index) => {
        const position =
          prefix.length === 0 ? `${index + 1}` : `${prefix}.${index + 1}`;
        entries.push({
          blockOrdinal: block.ordinal,
          segment,
          treePosition: position,
        });
        visit(segment.id, position);
      });
    };
    visit(null, "");
  }
  return entries;
}

function mobilityEntries(
  prescription: SessionPrescription | null,
): readonly MobilityItem[] {
  if (prescription === null) return [];
  return prescription.blocks
    .filter(
      (block): block is MobilityPrescriptionBlock => block.kind === "mobility",
    )
    .slice()
    .sort(
      (left, right) =>
        left.ordinal - right.ordinal || left.id.localeCompare(right.id),
    )
    .flatMap((block) =>
      block.items
        .slice()
        .sort(
          (left, right) =>
            left.ordinal - right.ordinal || left.id.localeCompare(right.id),
        ),
    );
}

function buildStrengthComparisons(
  input: MonitoringProjectionInput,
  prescription: SessionPrescription | null,
  execution: ExecutedSession | null,
): readonly StrengthSetComparison[] {
  const facts = input.strengthSets
    .slice()
    .sort(byObservedAt)
    .map((fact, index) => ({ fact, performedOrdinal: index + 1 }));
  const used = new Set<UUID>();
  const rows: StrengthSetComparison[] = [];
  for (const entry of strengthEntries(prescription)) {
    const factEntry = facts.find(
      (candidate) =>
        candidate.fact.prescriptionSetId === entry.set.id &&
        !used.has(candidate.fact.id),
    );
    const fact = factEntry?.fact ?? null;
    if (fact !== null) used.add(fact.id);
    const amendments =
      fact === null ? [] : amendmentListForFact(input.amendments, fact.id);
    const effective =
      fact === null
        ? null
        : (applyExecutionAmendmentsToFact(
            fact,
            amendments,
          ) as PerformedStrengthSet);
    const prescribedRepMin = nullableNumber(entry.set.targetRepMin);
    const prescribedRepMax = nullableNumber(entry.set.targetRepMax);
    const prescribedLoadKg = nullableNumber(entry.set.targetLoadKg);
    const prescribedRpe = nullableNumber(entry.set.targetRpe);
    const prescribedRir = nullableNumber(entry.set.targetRir);
    const prescribedDurationSeconds = nullableNumber(
      entry.set.targetDurationSeconds,
    );
    const checks =
      effective === null
        ? []
        : [
            compareExact(entry.exercise.movementId, effective.movementId),
            compareRange(
              prescribedRepMin,
              prescribedRepMax,
              nullableNumber(effective.repetitions),
            ),
            compareExact(prescribedLoadKg, nullableNumber(effective.loadKg)),
            compareExact(prescribedRpe, nullableNumber(effective.rpe)),
            compareExact(prescribedRir, nullableNumber(effective.rir)),
            compareExact(
              prescribedDurationSeconds,
              nullableNumber(effective.durationSeconds),
            ),
            compareExact(nullableNumber(entry.set.targetVelocityMps), null),
          ];
    rows.push({
      movementId: entry.exercise.movementId,
      movementName: input.movementNames?.get(entry.exercise.movementId) ?? null,
      performedMovementId: effective?.movementId ?? null,
      performedMovementName:
        effective === null
          ? null
          : (input.movementNames?.get(effective.movementId) ?? null),
      prescribedSetId: entry.set.id,
      prescribedSetOrdinal: entry.set.ordinal,
      performedSetOrdinal: factEntry?.performedOrdinal ?? null,
      prescribedRepMin,
      prescribedRepMax,
      performedRepetitions:
        effective === null ? null : nullableNumber(effective.repetitions),
      prescribedLoadKg,
      performedLoadKg:
        effective === null ? null : nullableNumber(effective.loadKg),
      prescribedRpe,
      observedRpe: effective === null ? null : nullableNumber(effective.rpe),
      prescribedRir,
      observedRir: effective === null ? null : nullableNumber(effective.rir),
      prescribedRestSeconds: nullableNumber(entry.set.targetRestSeconds),
      observedDurationSeconds:
        effective === null ? null : nullableNumber(effective.durationSeconds),
      prescribedDurationSeconds,
      prescribedVelocityMps: nullableNumber(entry.set.targetVelocityMps),
      observedAt: effective?.observedAt ?? null,
      performedFactId: effective?.id ?? null,
      status: fact === null ? "NOT_PERFORMED" : comparisonStatus(checks),
      provenance: referenceFor(
        input,
        prescription,
        execution,
        effective,
        amendments,
      ),
      amendments: amendments.map(toAmendmentProvenance),
    });
  }
  for (const candidate of facts) {
    if (used.has(candidate.fact.id)) continue;
    const amendments = amendmentListForFact(
      input.amendments,
      candidate.fact.id,
    );
    const effective = applyExecutionAmendmentsToFact(
      candidate.fact,
      amendments,
    ) as PerformedStrengthSet;
    rows.push({
      movementId: null,
      movementName: null,
      performedMovementId: effective.movementId,
      performedMovementName:
        input.movementNames?.get(effective.movementId) ?? null,
      prescribedSetId: null,
      prescribedSetOrdinal: null,
      performedSetOrdinal: candidate.performedOrdinal,
      prescribedRepMin: null,
      prescribedRepMax: null,
      performedRepetitions: nullableNumber(effective.repetitions),
      prescribedLoadKg: null,
      performedLoadKg: nullableNumber(effective.loadKg),
      prescribedRpe: null,
      observedRpe: nullableNumber(effective.rpe),
      prescribedRir: null,
      observedRir: nullableNumber(effective.rir),
      prescribedRestSeconds: null,
      observedDurationSeconds: nullableNumber(effective.durationSeconds),
      prescribedDurationSeconds: null,
      prescribedVelocityMps: null,
      observedAt: effective.observedAt,
      performedFactId: effective.id,
      status: "UNPLANNED",
      provenance: referenceFor(
        input,
        prescription,
        execution,
        effective,
        amendments,
      ),
      amendments: amendments.map(toAmendmentProvenance),
    });
  }
  return rows;
}

function buildEnduranceComparisons(
  input: MonitoringProjectionInput,
  prescription: SessionPrescription | null,
  execution: ExecutedSession | null,
): readonly EnduranceSegmentComparison[] {
  const facts = input.enduranceSegments
    .slice()
    .sort(byObservedAt)
    .map((fact, index) => ({ fact, performedOrdinal: index + 1 }));
  const used = new Set<UUID>();
  const rows: EnduranceSegmentComparison[] = [];
  for (const entry of enduranceEntries(prescription)) {
    const factEntry = facts.find(
      (candidate) =>
        candidate.fact.prescriptionSegmentId === entry.segment.id &&
        !used.has(candidate.fact.id),
    );
    const fact = factEntry?.fact ?? null;
    if (fact !== null) used.add(fact.id);
    const amendments =
      fact === null ? [] : amendmentListForFact(input.amendments, fact.id);
    const effective =
      fact === null
        ? null
        : (applyExecutionAmendmentsToFact(
            fact,
            amendments,
          ) as PerformedEnduranceSegment);
    const prescribedDurationSeconds = nullableNumber(
      entry.segment.durationSeconds,
    );
    const prescribedDistanceMeters = nullableNumber(
      entry.segment.distanceMeters,
    );
    const prescribedHrMin = nullableNumber(entry.segment.targetHrMin);
    const prescribedHrMax = nullableNumber(entry.segment.targetHrMax);
    const prescribedSpeedMpsMin = nullableNumber(
      entry.segment.targetSpeedMpsMin,
    );
    const prescribedSpeedMpsMax = nullableNumber(
      entry.segment.targetSpeedMpsMax,
    );
    const prescribedPowerWattsMin = nullableNumber(
      entry.segment.targetPowerWattsMin,
    );
    const prescribedPowerWattsMax = nullableNumber(
      entry.segment.targetPowerWattsMax,
    );
    const prescribedRpe = nullableNumber(entry.segment.targetRpe);
    const checks =
      effective === null
        ? []
        : [
            compareExact(
              prescribedDurationSeconds,
              nullableNumber(effective.durationSeconds),
            ),
            compareExact(
              prescribedDistanceMeters,
              nullableNumber(effective.distanceMeters),
            ),
            compareRange(
              prescribedHrMin,
              prescribedHrMax,
              nullableNumber(effective.averageHeartRateBpm),
            ),
            compareRange(
              prescribedSpeedMpsMin,
              prescribedSpeedMpsMax,
              nullableNumber(effective.averageSpeedMps),
            ),
            compareRange(
              prescribedPowerWattsMin,
              prescribedPowerWattsMax,
              nullableNumber(effective.averagePowerWatts),
            ),
            compareExact(prescribedRpe, nullableNumber(effective.rpe)),
          ];
    rows.push({
      segmentKind: entry.segment.kind,
      prescribedSegmentId: entry.segment.id,
      prescribedOrdinal: entry.segment.ordinal,
      prescribedTreePosition: entry.treePosition,
      repeatCount: entry.segment.repeatCount,
      performedFactId: effective?.id ?? null,
      prescribedDurationSeconds,
      performedDurationSeconds:
        effective === null ? null : nullableNumber(effective.durationSeconds),
      prescribedDistanceMeters,
      performedDistanceMeters:
        effective === null ? null : nullableNumber(effective.distanceMeters),
      prescribedHrMin,
      prescribedHrMax,
      observedAverageHeartRateBpm:
        effective === null
          ? null
          : nullableNumber(effective.averageHeartRateBpm),
      prescribedSpeedMpsMin,
      prescribedSpeedMpsMax,
      observedSpeedMps:
        effective === null ? null : nullableNumber(effective.averageSpeedMps),
      prescribedPowerWattsMin,
      prescribedPowerWattsMax,
      observedAveragePowerWatts:
        effective === null ? null : nullableNumber(effective.averagePowerWatts),
      prescribedRpe,
      observedRpe: effective === null ? null : nullableNumber(effective.rpe),
      modality: effective?.modality ?? null,
      observedAt: effective?.observedAt ?? null,
      status: fact === null ? "NOT_PERFORMED" : comparisonStatus(checks),
      provenance: referenceFor(
        input,
        prescription,
        execution,
        effective,
        amendments,
      ),
      amendments: amendments.map(toAmendmentProvenance),
    });
  }
  for (const candidate of facts) {
    if (used.has(candidate.fact.id)) continue;
    const amendments = amendmentListForFact(
      input.amendments,
      candidate.fact.id,
    );
    const effective = applyExecutionAmendmentsToFact(
      candidate.fact,
      amendments,
    ) as PerformedEnduranceSegment;
    rows.push({
      segmentKind: null,
      prescribedSegmentId: null,
      prescribedOrdinal: null,
      prescribedTreePosition: null,
      repeatCount: null,
      performedFactId: effective.id,
      prescribedDurationSeconds: null,
      performedDurationSeconds: nullableNumber(effective.durationSeconds),
      prescribedDistanceMeters: null,
      performedDistanceMeters: nullableNumber(effective.distanceMeters),
      prescribedHrMin: null,
      prescribedHrMax: null,
      observedAverageHeartRateBpm: nullableNumber(
        effective.averageHeartRateBpm,
      ),
      prescribedSpeedMpsMin: null,
      prescribedSpeedMpsMax: null,
      observedSpeedMps: nullableNumber(effective.averageSpeedMps),
      prescribedPowerWattsMin: null,
      prescribedPowerWattsMax: null,
      observedAveragePowerWatts: nullableNumber(effective.averagePowerWatts),
      prescribedRpe: null,
      observedRpe: nullableNumber(effective.rpe),
      modality: effective.modality ?? null,
      observedAt: effective.observedAt,
      status: "UNPLANNED",
      provenance: referenceFor(
        input,
        prescription,
        execution,
        effective,
        amendments,
      ),
      amendments: amendments.map(toAmendmentProvenance),
    });
  }
  return rows;
}

function buildMobilityComparisons(
  input: MonitoringProjectionInput,
  prescription: SessionPrescription | null,
  execution: ExecutedSession | null,
): readonly MobilityItemComparison[] {
  const facts = input.mobilityItems
    .slice()
    .sort(byObservedAt)
    .map((fact, index) => ({ fact, performedOrdinal: index + 1 }));
  const used = new Set<UUID>();
  const rows: MobilityItemComparison[] = [];
  for (const item of mobilityEntries(prescription)) {
    const factEntry = facts.find(
      (candidate) =>
        candidate.fact.prescriptionItemId === item.id &&
        !used.has(candidate.fact.id),
    );
    const fact = factEntry?.fact ?? null;
    if (fact !== null) used.add(fact.id);
    const amendments =
      fact === null ? [] : amendmentListForFact(input.amendments, fact.id);
    const effective =
      fact === null
        ? null
        : (applyExecutionAmendmentsToFact(
            fact,
            amendments,
          ) as PerformedMobilityItem);
    const movementCheck =
      effective === null
        ? { different: false, notRecorded: false }
        : compareExact(item.movementId, effective.movementId);
    const checks =
      effective === null
        ? []
        : [
            movementCheck,
            compareExact(item.side ?? null, effective.side ?? null),
            compareExact(
              nullableNumber(item.sets),
              nullableNumber(effective.sets),
            ),
            compareExact(
              nullableNumber(item.reps),
              nullableNumber(effective.repetitions),
            ),
            compareExact(
              nullableNumber(item.holdSeconds),
              nullableNumber(effective.durationSeconds),
            ),
            compareExact(
              nullableNumber(item.targetRpe),
              nullableNumber(effective.rpe),
            ),
          ];
    rows.push({
      movementId: item.movementId,
      movementName: input.movementNames?.get(item.movementId) ?? null,
      performedMovementId: effective?.movementId ?? null,
      performedMovementName:
        effective === null
          ? null
          : (input.movementNames?.get(effective.movementId) ?? null),
      side: item.side ?? null,
      performedSide: effective?.side ?? null,
      prescribedItemId: item.id,
      prescribedOrdinal: item.ordinal,
      performedFactId: effective?.id ?? null,
      prescribedSets: nullableNumber(item.sets),
      performedSets: effective === null ? null : nullableNumber(effective.sets),
      prescribedRepetitions: nullableNumber(item.reps),
      performedRepetitions:
        effective === null ? null : nullableNumber(effective.repetitions),
      prescribedHoldSeconds: nullableNumber(item.holdSeconds),
      performedHoldSeconds:
        effective === null ? null : nullableNumber(effective.durationSeconds),
      prescribedRpe: nullableNumber(item.targetRpe),
      observedRpe: effective === null ? null : nullableNumber(effective.rpe),
      observedAt: effective?.observedAt ?? null,
      status: fact === null ? "NOT_PERFORMED" : comparisonStatus(checks),
      provenance: referenceFor(
        input,
        prescription,
        execution,
        effective,
        amendments,
      ),
      amendments: amendments.map(toAmendmentProvenance),
    });
  }
  for (const candidate of facts) {
    if (used.has(candidate.fact.id)) continue;
    const amendments = amendmentListForFact(
      input.amendments,
      candidate.fact.id,
    );
    const effective = applyExecutionAmendmentsToFact(
      candidate.fact,
      amendments,
    ) as PerformedMobilityItem;
    rows.push({
      movementId: null,
      movementName: null,
      performedMovementId: effective.movementId,
      performedMovementName:
        input.movementNames?.get(effective.movementId) ?? null,
      side: null,
      performedSide: effective.side ?? null,
      prescribedItemId: null,
      prescribedOrdinal: null,
      performedFactId: effective.id,
      prescribedSets: null,
      performedSets: nullableNumber(effective.sets),
      prescribedRepetitions: null,
      performedRepetitions: nullableNumber(effective.repetitions),
      prescribedHoldSeconds: null,
      performedHoldSeconds: nullableNumber(effective.durationSeconds),
      prescribedRpe: null,
      observedRpe: nullableNumber(effective.rpe),
      observedAt: effective.observedAt,
      status: "UNPLANNED",
      provenance: referenceFor(
        input,
        prescription,
        execution,
        effective,
        amendments,
      ),
      amendments: amendments.map(toAmendmentProvenance),
    });
  }
  return rows;
}

function countFor(
  prescription: SessionPrescription | null,
  input: MonitoringProjectionInput,
): MonitoringCounts {
  const amendedFactIds = new Set(
    input.amendments.map((amendment) => amendment.factId),
  );
  return {
    prescribedStrengthSetCount: strengthEntries(prescription).length,
    performedStrengthSetCount: input.strengthSets.length,
    prescribedEnduranceSegmentCount: enduranceEntries(prescription).length,
    performedEnduranceSegmentCount: input.enduranceSegments.length,
    prescribedMobilityItemCount: mobilityEntries(prescription).length,
    performedMobilityItemCount: input.mobilityItems.length,
    amendedPerformedFactCount: amendedFactIds.size,
  };
}

function hasExecutionDeviation(
  rows: readonly { readonly status: MonitoringFactStatus }[],
): boolean {
  return rows.some(
    (row) => row.status !== "MATCHED" && row.status !== "NOT_APPLICABLE",
  );
}

function sessionClassification(
  prescription: SessionPrescription | null,
  execution: ExecutedSession | null,
  strength: readonly StrengthSetComparison[],
  endurance: readonly EnduranceSegmentComparison[],
  mobility: readonly MobilityItemComparison[],
): MonitoringSessionStatus {
  if (execution === null) {
    return prescription?.status === "archived" ||
      prescription?.archivedAt !== null
      ? "ARCHIVED_OR_SUPERSEDED_CONTEXT"
      : "PRESCRIBED_NOT_STARTED";
  }
  if (execution.prescription === null) return "UNPLANNED_EXECUTION";
  if (
    execution.status === "started" &&
    !hasExecutionDeviation([...strength, ...endurance, ...mobility])
  ) {
    return "PRESCRIBED_STARTED";
  }
  if (hasExecutionDeviation([...strength, ...endurance, ...mobility])) {
    return "PRESCRIBED_WITH_EXECUTION_DEVIATION";
  }
  return execution.status === "completed"
    ? "PRESCRIBED_COMPLETED"
    : "PRESCRIBED_STARTED";
}

function viewObservation(
  input: MonitoringProjectionInput,
  execution: ExecutedSession,
  observation: SessionObservation,
  prescription: SessionPrescription | null,
): ObservationView {
  const provenance = referenceFor(input, prescription, execution, null, []);
  return {
    id: observation.id,
    workspaceId: observation.workspaceId,
    executionId: execution.id,
    observedAt: observation.observedAt,
    kind: observation.kind,
    valueText: observation.valueText ?? null,
    valueNumber: observation.valueNumber ?? null,
    unit: observation.unit ?? null,
    notes: observation.notes ?? null,
    provenance: { ...provenance, sourceTimestamp: observation.observedAt },
  };
}

function assertProjectionScope(input: MonitoringProjectionInput): void {
  const executionId = input.execution?.id ?? null;
  const assertWorkspace = (workspaceId: WorkspaceId, source: string): void => {
    if (workspaceId !== input.workspaceId) {
      throw new Error(
        `Monitoring projection received ${source} from another workspace.`,
      );
    }
  };
  const assertSession = (sessionId: UUID, source: string): void => {
    if (executionId === null || sessionId !== executionId) {
      throw new Error(
        `Monitoring projection received ${source} for another execution.`,
      );
    }
  };

  if (input.prescription !== null) {
    assertWorkspace(input.prescription.workspaceId, "a prescription");
    if (input.prescription.athleteId !== input.athleteId) {
      throw new Error(
        "Monitoring projection received a prescription for another athlete.",
      );
    }
  }
  if (input.execution !== null) {
    assertWorkspace(input.execution.workspaceId, "an execution");
    if (input.execution.athleteId !== input.athleteId) {
      throw new Error(
        "Monitoring projection received an execution for another athlete.",
      );
    }
  }
  for (const fact of [
    ...input.strengthSets,
    ...input.enduranceSegments,
    ...input.mobilityItems,
  ]) {
    assertWorkspace(fact.workspaceId, "a performed fact");
    assertSession(fact.sessionId, "a performed fact");
  }
  for (const observation of input.observations) {
    assertWorkspace(observation.workspaceId, "an observation");
    assertSession(observation.sessionId, "an observation");
  }
  for (const amendment of input.amendments) {
    assertWorkspace(amendment.workspaceId, "an amendment");
    if (amendment.sessionId === undefined) {
      throw new Error(
        "Monitoring projection received an amendment without an execution.",
      );
    }
    assertSession(amendment.sessionId, "an amendment");
  }
}

export function projectSessionMonitoring(
  input: MonitoringProjectionInput,
): SessionMonitoringView {
  assertProjectionScope(input);
  const executionPrescription =
    input.execution === null ? null : snapshotPrescription(input.execution);
  const prescription =
    input.execution === null
      ? input.prescription
      : input.execution.prescription === null
        ? null
        : executionPrescription;
  const execution = input.execution;
  const strength = buildStrengthComparisons(input, prescription, execution);
  const endurance = buildEnduranceComparisons(input, prescription, execution);
  const mobility = buildMobilityComparisons(input, prescription, execution);
  const counts = countFor(prescription, input);
  const classification = sessionClassification(
    prescription,
    execution,
    strength,
    endurance,
    mobility,
  );
  const amendments = input.amendments
    .slice()
    .sort(
      (left, right) =>
        left.occurredAt.localeCompare(right.occurredAt) ||
        left.id.localeCompare(right.id),
    )
    .map(toAmendmentProvenance);
  const scheduledLocalDate =
    prescription?.scheduledLocalDate ?? input.sessionDate ?? null;
  const timeZone =
    prescription?.timeZone ?? execution?.timeZone ?? ("UTC" as IanaTimeZone);
  const id = execution?.id ?? input.prescription?.id;
  if (id === undefined) {
    throw new Error(
      "A monitoring view requires a prescription or execution identity.",
    );
  }
  const prescriptionId =
    execution?.prescription?.prescriptionId ?? prescription?.id ?? null;
  return {
    id,
    workspaceId: input.workspaceId,
    athleteId: input.athleteId,
    title:
      prescription?.title ??
      (execution?.prescription === null
        ? "Unplanned execution"
        : "Historical prescription unavailable"),
    scheduledLocalDate,
    classification,
    prescriptionId,
    executionId: execution?.id ?? null,
    executionStatus: execution?.status ?? null,
    counts,
    timeZone,
    prescription:
      prescriptionId === null || prescription === null
        ? null
        : {
            prescriptionId,
            prescriptionVersion:
              execution?.prescription?.prescriptionVersion ??
              prescription.version,
            prescriptionRevision:
              execution?.prescription?.prescriptionRevision ??
              prescription.publishedRevision ??
              prescription.revision,
            snapshotFingerprint:
              execution?.prescription?.snapshotFingerprint ?? null,
            scheduledLocalDate: prescription.scheduledLocalDate,
            timeZone: prescription.timeZone,
          },
    execution:
      execution === null
        ? null
        : {
            executionId: execution.id,
            status: execution.status,
            startedAt: execution.startedAt,
            completedAt: execution.completedAt,
            timeZone: execution.timeZone,
          },
    strength,
    endurance,
    mobility,
    observations:
      execution === null
        ? []
        : input.observations
            .slice()
            .sort(byObservedAt)
            .map((observation) =>
              viewObservation(input, execution, observation, prescription),
            ),
    amendments,
  };
}

export function summarizeMonitoringViews(
  workspaceId: WorkspaceId,
  athleteId: AthleteId,
  window: MonitoringWindow,
  views: readonly SessionMonitoringView[],
): MonitoringOverview {
  const sessions = views
    .map(
      (view): MonitoringSessionSummary => ({
        id: view.id,
        workspaceId: view.workspaceId,
        athleteId: view.athleteId,
        title: view.title,
        scheduledLocalDate: view.scheduledLocalDate,
        classification: view.classification,
        prescriptionId: view.prescriptionId,
        executionId: view.executionId,
        executionStatus: view.executionStatus,
        counts: view.counts,
      }),
    )
    .sort(
      (left, right) =>
        (left.scheduledLocalDate ?? "9999-99-99").localeCompare(
          right.scheduledLocalDate ?? "9999-99-99",
        ) || left.id.localeCompare(right.id),
    );
  const linkedExecutedSessionCount = views.filter(
    (view) => view.executionId !== null && view.prescriptionId !== null,
  ).length;
  const executedSessionCount = views.filter(
    (view) => view.executionId !== null,
  ).length;
  const unplannedSessionCount = views.filter(
    (view) => view.classification === "UNPLANNED_EXECUTION",
  ).length;
  const completedSessionCount = views.filter(
    (view) => view.executionStatus === "completed",
  ).length;
  const counts = views.reduce<MonitoringCounts>(
    (total, view) => ({
      prescribedStrengthSetCount:
        total.prescribedStrengthSetCount +
        view.counts.prescribedStrengthSetCount,
      performedStrengthSetCount:
        total.performedStrengthSetCount + view.counts.performedStrengthSetCount,
      prescribedEnduranceSegmentCount:
        total.prescribedEnduranceSegmentCount +
        view.counts.prescribedEnduranceSegmentCount,
      performedEnduranceSegmentCount:
        total.performedEnduranceSegmentCount +
        view.counts.performedEnduranceSegmentCount,
      prescribedMobilityItemCount:
        total.prescribedMobilityItemCount +
        view.counts.prescribedMobilityItemCount,
      performedMobilityItemCount:
        total.performedMobilityItemCount +
        view.counts.performedMobilityItemCount,
      amendedPerformedFactCount:
        total.amendedPerformedFactCount + view.counts.amendedPerformedFactCount,
    }),
    {
      prescribedStrengthSetCount: 0,
      performedStrengthSetCount: 0,
      prescribedEnduranceSegmentCount: 0,
      performedEnduranceSegmentCount: 0,
      prescribedMobilityItemCount: 0,
      performedMobilityItemCount: 0,
      amendedPerformedFactCount: 0,
    },
  );
  return {
    workspaceId,
    athleteId,
    window,
    prescribedSessionCount: views.filter((view) => view.prescriptionId !== null)
      .length,
    executedSessionCount,
    linkedExecutedSessionCount,
    completedSessionCount,
    unplannedSessionCount,
    amendedPerformedFactCount: counts.amendedPerformedFactCount,
    counts,
    sessions,
  };
}
