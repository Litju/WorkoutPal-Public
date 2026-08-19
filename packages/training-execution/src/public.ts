import type {
  AthleteId,
  IanaTimeZone,
  Instant,
  UUID,
  Versioned,
  WorkspaceId,
} from "@workoutpal/shared-kernel";

export type ExecutedSessionStatus = "started" | "completed" | "cancelled";

export type ExecutionJsonPrimitive = string | number | boolean | null;
export type ExecutionJsonValue =
  | ExecutionJsonPrimitive
  | readonly ExecutionJsonValue[]
  | { readonly [key: string]: ExecutionJsonValue };
export type ExecutionJsonObject = {
  readonly [key: string]: ExecutionJsonValue;
};

export interface PrescriptionSnapshotRef {
  readonly prescriptionId: UUID;
  /** Aggregate version at the time the execution snapshot was captured. */
  readonly prescriptionVersion: number;
  /** Published revision represented by the immutable snapshot. */
  readonly prescriptionRevision: number;
  readonly snapshotFingerprint: string;
  readonly snapshot: ExecutionJsonObject;
}

interface PerformedFactBase {
  readonly id: UUID;
  readonly workspaceId: WorkspaceId;
  readonly sessionId: UUID;
  readonly observedAt: Instant;
  readonly notes?: string;
}

export interface PerformedStrengthSet extends PerformedFactBase {
  readonly kind: "strength-set";
  readonly movementId: UUID;
  readonly prescriptionExerciseId?: UUID;
  readonly prescriptionSetId?: UUID;
  readonly repetitions?: number;
  readonly loadKg?: number;
  readonly rpe?: number;
  readonly rir?: number;
  readonly durationSeconds?: number;
}

export interface PerformedEnduranceSegment extends PerformedFactBase {
  readonly kind: "endurance-segment";
  readonly prescriptionSegmentId?: UUID;
  readonly modality?: string;
  readonly durationSeconds?: number;
  readonly distanceMeters?: number;
  /** Raw observed average speed in canonical metres per second. */
  readonly averageSpeedMps?: number;
  readonly averageHeartRateBpm?: number;
  readonly averagePowerWatts?: number;
  readonly rpe?: number;
}

export interface PerformedMobilityItem extends PerformedFactBase {
  readonly kind: "mobility-item";
  readonly movementId: UUID;
  readonly prescriptionItemId?: UUID;
  readonly sets?: number;
  readonly repetitions?: number;
  readonly durationSeconds?: number;
  readonly side?: "left" | "right" | "bilateral" | "alternating";
  readonly rpe?: number;
}

export type PerformedFact =
  | PerformedStrengthSet
  | PerformedEnduranceSegment
  | PerformedMobilityItem;

export type PerformedFactKind = PerformedFact["kind"];

export type SessionObservationKind = "session-rpe" | "pain" | "note" | "other";

export interface SessionObservation {
  readonly id: UUID;
  readonly workspaceId: WorkspaceId;
  readonly sessionId: UUID;
  readonly observedAt: Instant;
  readonly kind: SessionObservationKind;
  readonly valueText?: string;
  readonly valueNumber?: number;
  readonly unit?: string;
  readonly notes?: string;
}

export interface ExecutedSession extends Versioned {
  readonly id: UUID;
  readonly workspaceId: WorkspaceId;
  readonly athleteId: AthleteId;
  readonly status: ExecutedSessionStatus;
  readonly startedAt: Instant;
  readonly completedAt: Instant | null;
  readonly timeZone: IanaTimeZone;
  readonly prescription: PrescriptionSnapshotRef | null;
  readonly createdAt: Instant;
  readonly createdBy: UUID;
  readonly updatedAt: Instant;
  readonly updatedBy: UUID;
  /** Compatibility projection; persisted fact collections are returned by the application review. */
  readonly facts: readonly PerformedFact[];
}

export interface ExecutionAmendment {
  readonly id: UUID;
  readonly workspaceId: WorkspaceId;
  readonly sessionId?: UUID;
  readonly factKind?: PerformedFactKind;
  readonly factId: UUID;
  readonly actorId: UUID;
  readonly reason: string;
  readonly originalValues?: Readonly<Record<string, unknown>>;
  readonly correctedFields: Readonly<Record<string, unknown>>;
  readonly occurredAt: Instant;
}

function assertNonnegative(value: number | undefined, label: string): void {
  if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
    throw new Error(`${label} must be finite and non-negative.`);
  }
}

function assertRpe(value: number | undefined, label: string): void {
  if (
    value !== undefined &&
    (!Number.isFinite(value) || value < 0 || value > 10)
  ) {
    throw new Error(`${label} must be between 0 and 10.`);
  }
}

function assertObservedAt(value: Instant): void {
  if (Number.isNaN(Date.parse(value))) {
    throw new Error("observedAt must be a valid instant.");
  }
}

export function startExecutedSession(input: {
  readonly id: UUID;
  readonly workspaceId: WorkspaceId;
  readonly athleteId: AthleteId;
  readonly startedAt: Instant;
  readonly timeZone: IanaTimeZone;
  readonly prescription?: PrescriptionSnapshotRef;
  readonly createdBy?: UUID;
}): ExecutedSession {
  if (input.prescription !== undefined) {
    if (input.prescription.prescriptionVersion < 1) {
      throw new Error("Prescription version must be positive.");
    }
    if (input.prescription.prescriptionRevision < 1) {
      throw new Error("Prescription revision must be positive.");
    }
    if (input.prescription.snapshotFingerprint.trim().length === 0) {
      throw new Error("Prescription snapshot fingerprint is required.");
    }
  }
  const createdBy = input.createdBy ?? input.workspaceId;
  return {
    id: input.id,
    workspaceId: input.workspaceId,
    athleteId: input.athleteId,
    status: "started",
    startedAt: input.startedAt,
    completedAt: null,
    timeZone: input.timeZone,
    prescription: input.prescription ?? null,
    createdAt: input.startedAt,
    createdBy,
    updatedAt: input.startedAt,
    updatedBy: createdBy,
    facts: [],
    version: 1,
  };
}

export function completeExecutedSession(
  session: ExecutedSession,
  completedAt: Instant,
): ExecutedSession {
  if (session.status !== "started") {
    throw new Error("Only started sessions can be completed.");
  }

  return {
    ...session,
    status: "completed",
    completedAt,
    updatedAt: completedAt,
    version: session.version + 1,
  };
}

export function createPerformedStrengthSet(input: {
  readonly id: UUID;
  readonly workspaceId: WorkspaceId;
  readonly sessionId: UUID;
  readonly movementId: UUID;
  readonly prescriptionExerciseId?: UUID;
  readonly prescriptionSetId?: UUID;
  readonly observedAt: Instant;
  readonly repetitions?: number;
  readonly loadKg?: number;
  readonly rpe?: number;
  readonly rir?: number;
  readonly durationSeconds?: number;
  readonly notes?: string;
}): PerformedStrengthSet {
  assertObservedAt(input.observedAt);
  assertNonnegative(input.repetitions, "repetitions");
  assertNonnegative(input.loadKg, "loadKg");
  assertRpe(input.rpe, "rpe");
  assertRpe(input.rir, "rir");
  assertNonnegative(input.durationSeconds, "durationSeconds");
  return { kind: "strength-set", ...input };
}

export function createPerformedEnduranceSegment(input: {
  readonly id: UUID;
  readonly workspaceId: WorkspaceId;
  readonly sessionId: UUID;
  readonly prescriptionSegmentId?: UUID;
  readonly observedAt: Instant;
  readonly modality?: string;
  readonly durationSeconds?: number;
  readonly distanceMeters?: number;
  readonly averageSpeedMps?: number;
  readonly averageHeartRateBpm?: number;
  readonly averagePowerWatts?: number;
  readonly rpe?: number;
  readonly notes?: string;
}): PerformedEnduranceSegment {
  assertObservedAt(input.observedAt);
  assertNonnegative(input.durationSeconds, "durationSeconds");
  assertNonnegative(input.distanceMeters, "distanceMeters");
  assertNonnegative(input.averageSpeedMps, "averageSpeedMps");
  assertNonnegative(input.averageHeartRateBpm, "averageHeartRateBpm");
  assertNonnegative(input.averagePowerWatts, "averagePowerWatts");
  assertRpe(input.rpe, "rpe");
  return { kind: "endurance-segment", ...input };
}

export function createPerformedMobilityItem(input: {
  readonly id: UUID;
  readonly workspaceId: WorkspaceId;
  readonly sessionId: UUID;
  readonly movementId: UUID;
  readonly prescriptionItemId?: UUID;
  readonly observedAt: Instant;
  readonly sets?: number;
  readonly repetitions?: number;
  readonly durationSeconds?: number;
  readonly side?: PerformedMobilityItem["side"];
  readonly rpe?: number;
  readonly notes?: string;
}): PerformedMobilityItem {
  assertObservedAt(input.observedAt);
  assertNonnegative(input.sets, "sets");
  assertNonnegative(input.repetitions, "repetitions");
  assertNonnegative(input.durationSeconds, "durationSeconds");
  assertRpe(input.rpe, "rpe");
  const { side, ...rest } = input;
  return side === undefined
    ? { kind: "mobility-item", ...rest }
    : { kind: "mobility-item", ...rest, side };
}

export function createSessionObservation(input: {
  readonly id: UUID;
  readonly workspaceId: WorkspaceId;
  readonly sessionId: UUID;
  readonly observedAt: Instant;
  readonly kind: SessionObservationKind;
  readonly valueText?: string;
  readonly valueNumber?: number;
  readonly unit?: string;
  readonly notes?: string;
}): SessionObservation {
  assertObservedAt(input.observedAt);
  assertNonnegative(input.valueNumber, "valueNumber");
  if (
    input.valueText === undefined &&
    input.valueNumber === undefined &&
    (input.notes === undefined || input.notes.trim().length === 0)
  ) {
    throw new Error("A session observation requires a recorded value or note.");
  }
  return { ...input };
}

const amendmentFields: Readonly<Record<PerformedFactKind, readonly string[]>> =
  {
    "strength-set": [
      "observedAt",
      "repetitions",
      "loadKg",
      "rpe",
      "rir",
      "durationSeconds",
      "notes",
    ],
    "endurance-segment": [
      "observedAt",
      "modality",
      "durationSeconds",
      "distanceMeters",
      "averageSpeedMps",
      "averageHeartRateBpm",
      "averagePowerWatts",
      "rpe",
      "notes",
    ],
    "mobility-item": [
      "observedAt",
      "sets",
      "repetitions",
      "durationSeconds",
      "side",
      "rpe",
      "notes",
    ],
  };

export function createExecutionAmendment(input: {
  readonly id: UUID;
  readonly workspaceId: WorkspaceId;
  readonly sessionId?: UUID;
  readonly factKind?: PerformedFactKind;
  readonly factId: UUID;
  readonly actorId: UUID;
  readonly reason: string;
  readonly originalValues?: Readonly<Record<string, unknown>>;
  readonly correctedFields: Readonly<Record<string, unknown>>;
  readonly occurredAt: Instant;
}): ExecutionAmendment {
  const reason = input.reason.trim();
  if (reason.length === 0) {
    throw new Error("Execution amendments require a reason.");
  }
  const fields = Object.keys(input.correctedFields);
  if (fields.length === 0) {
    throw new Error(
      "Execution amendments require at least one corrected field.",
    );
  }
  if (input.factKind !== undefined) {
    const allowed = amendmentFields[input.factKind];
    if (fields.some((field) => !allowed.includes(field))) {
      throw new Error(
        "Execution amendment contains a field not valid for the fact kind.",
      );
    }
  }
  return {
    ...input,
    reason,
  };
}

export function advanceExecutedSession(
  session: ExecutedSession,
  updatedAt: Instant,
  updatedBy: UUID,
): ExecutedSession {
  return {
    ...session,
    updatedAt,
    updatedBy,
    version: session.version + 1,
  };
}

export function applyExecutionAmendmentsToFact(
  fact: PerformedFact,
  amendments: readonly ExecutionAmendment[],
): PerformedFact {
  let effective: PerformedFact = { ...fact };
  for (const amendment of amendments) {
    if (amendment.factId !== fact.id) continue;
    effective = {
      ...effective,
      ...amendment.correctedFields,
    } as PerformedFact;
  }
  return effective;
}
