import type { WorkspaceMembership } from "@workoutpal/accounts";
import { canAccessWorkspace } from "@workoutpal/accounts";
import type {
  AthleteId,
  Instant,
  UUID,
  WorkspaceId,
  WorkspaceScope,
} from "@workoutpal/shared-kernel";
import type {
  ExecutedSession,
  ExecutionAmendment,
  ExecutionJsonObject,
  PerformedEnduranceSegment,
  PerformedFact,
  PerformedFactKind,
  PerformedMobilityItem,
  PerformedStrengthSet,
  SessionObservation,
} from "@workoutpal/training-execution";
import {
  advanceExecutedSession,
  applyExecutionAmendmentsToFact,
  completeExecutedSession,
  createExecutionAmendment,
  createPerformedEnduranceSegment,
  createPerformedMobilityItem,
  createPerformedStrengthSet,
  createSessionObservation,
  startExecutedSession,
} from "@workoutpal/training-execution";
import { transactionContext } from "./application-shared.js";
import {
  ApplicationError,
  type AuditEvent,
  type CommandMetadata,
  type ExecutionReview,
  type F4Persistence,
  type F4Repositories,
} from "./contracts.js";

function f4Now(): Instant {
  return new Date().toISOString() as Instant;
}

function f4Id(): UUID {
  return crypto.randomUUID() as UUID;
}

function f4Scope(workspaceId: WorkspaceId): WorkspaceScope {
  return { workspaceId };
}

function f4ExpectedVersion(expectedVersion: number): void {
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw new ApplicationError(
      "VALIDATION_FAILED",
      "expectedVersion must be a positive integer.",
    );
  }
}

function f4StableSerialize(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((entry) => f4StableSerialize(entry)).join(",")}]`;
  }
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${f4StableSerialize(object[key])}`)
    .join(",")}}`;
}

async function f4Fingerprint(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(f4StableSerialize(value)),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function f4JsonObject(value: unknown): ExecutionJsonObject {
  const copy = JSON.parse(JSON.stringify(value)) as unknown;
  if (copy === null || typeof copy !== "object" || Array.isArray(copy)) {
    throw new ApplicationError(
      "DOMAIN_RULE_VIOLATION",
      "A prescription snapshot must be a JSON object.",
    );
  }
  return copy as ExecutionJsonObject;
}

function f4DomainError(error: unknown): never {
  if (error instanceof ApplicationError) throw error;
  if (error instanceof Error) {
    throw new ApplicationError("DOMAIN_RULE_VIOLATION", error.message);
  }
  throw error;
}

export class F4Application {
  constructor(private readonly persistence: F4Persistence) {}

  async startExecutedSession(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly prescriptionId?: UUID;
      readonly athleteId?: AthleteId;
      readonly prescriptionRevision?: number;
      readonly timeZone?: import("@workoutpal/shared-kernel").IanaTimeZone;
      readonly idempotencyKey?: string;
    },
  ): Promise<ExecutedSession> {
    const requestHash = await f4Fingerprint({
      workspaceId: input.workspaceId,
      prescriptionId: input.prescriptionId,
      athleteId: input.athleteId ?? null,
      prescriptionRevision: input.prescriptionRevision ?? null,
      timeZone: input.timeZone ?? null,
    });
    return this.persistence.transaction(async (repositories) => {
      if (input.prescriptionId === undefined) {
        if (input.athleteId === undefined) {
          throw new ApplicationError(
            "VALIDATION_FAILED",
            "athleteId is required when an execution has no prescription.",
          );
        }
        await this.authorizeExecution(repositories, input, input.athleteId);
        const idempotencyOutcome = await this.reserveIdempotency(
          repositories,
          input,
          "execution.session.start.unplanned",
          requestHash,
        );
        if (idempotencyOutcome !== undefined) {
          return idempotencyOutcome as ExecutedSession;
        }
        const startedAt = input.occurredAt ?? f4Now();
        const execution = startExecutedSession({
          id: f4Id(),
          workspaceId: input.workspaceId,
          athleteId: input.athleteId,
          startedAt,
          timeZone:
            input.timeZone ??
            ("UTC" as import("@workoutpal/shared-kernel").IanaTimeZone),
          createdBy: input.principalId,
        });
        await repositories.executedSessions.insert(execution);
        await repositories.audit.append(
          this.f4Audit(
            input,
            "executed_session.started_unplanned",
            "ExecutedSession",
            execution.id,
            null,
            execution.version,
            { athleteId: input.athleteId },
          ),
        );
        await this.completeIdempotency(
          repositories,
          input,
          "execution.session.start.unplanned",
          execution,
        );
        return execution;
      }
      const prescription = await repositories.sessionPrescriptions.get(
        f4Scope(input.workspaceId),
        input.prescriptionId,
      );
      if (
        prescription === null ||
        prescription.status === "archived" ||
        prescription.publishedRevision === null
      ) {
        throw new ApplicationError(
          "RESOURCE_NOT_FOUND",
          "A published session prescription is required to start execution.",
        );
      }
      await this.authorizeExecution(
        repositories,
        input,
        prescription.athleteId,
      );
      const revisionNumber =
        input.prescriptionRevision ?? prescription.publishedRevision;
      if (!Number.isInteger(revisionNumber) || revisionNumber < 1) {
        throw new ApplicationError(
          "VALIDATION_FAILED",
          "prescriptionRevision must be a positive integer.",
        );
      }
      const revision = (
        await repositories.trainingDesignRevisions.listForSession(
          f4Scope(input.workspaceId),
          prescription.id,
        )
      ).find((candidate) => candidate.revision === revisionNumber);
      if (revision === undefined) {
        throw new ApplicationError(
          "RESOURCE_NOT_FOUND",
          "The requested published prescription revision was not found.",
        );
      }
      const snapshot = f4JsonObject(revision.snapshot);
      const snapshotFingerprint = await f4Fingerprint(snapshot);
      const idempotencyOutcome = await this.reserveIdempotency(
        repositories,
        input,
        "execution.session.start",
        requestHash,
      );
      if (idempotencyOutcome !== undefined) {
        return idempotencyOutcome as ExecutedSession;
      }

      const existing = await repositories.executedSessions.findForPrescription(
        f4Scope(input.workspaceId),
        prescription.id,
        revisionNumber,
      );
      if (existing !== null) {
        await this.completeIdempotency(
          repositories,
          input,
          "execution.session.start",
          existing,
        );
        return existing;
      }

      const startedAt = input.occurredAt ?? f4Now();
      const execution = startExecutedSession({
        id: f4Id(),
        workspaceId: input.workspaceId,
        athleteId: prescription.athleteId,
        startedAt,
        timeZone: input.timeZone ?? prescription.timeZone,
        createdBy: input.principalId,
        prescription: {
          prescriptionId: prescription.id,
          prescriptionVersion: prescription.version,
          prescriptionRevision: revisionNumber,
          snapshotFingerprint,
          snapshot,
        },
      });
      await repositories.executedSessions.insert(execution);
      await repositories.audit.append(
        this.f4Audit(
          input,
          "executed_session.started",
          "ExecutedSession",
          execution.id,
          null,
          execution.version,
          {
            prescriptionId: prescription.id,
            prescriptionVersion: prescription.version,
            prescriptionRevision: revisionNumber,
            snapshotFingerprint,
          },
        ),
      );
      await this.completeIdempotency(
        repositories,
        input,
        "execution.session.start",
        execution,
      );
      return execution;
    }, transactionContext(input));
  }

  async listExecutedSessions(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly athleteId: AthleteId;
    },
  ): Promise<readonly ExecutedSession[]> {
    return this.persistence.transaction(async (repositories) => {
      await this.authorizeExecution(repositories, input, input.athleteId);
      return repositories.executedSessions.listForAthlete(
        f4Scope(input.workspaceId),
        input.athleteId,
      );
    }, transactionContext(input));
  }

  async getExecutionReview(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly executionId: UUID;
    },
  ): Promise<ExecutionReview> {
    return this.persistence.transaction(async (repositories) => {
      const session = await this.requireExecution(
        repositories,
        input.workspaceId,
        input.executionId,
      );
      await this.authorizeExecution(repositories, input, session.athleteId);
      return this.review(repositories, session);
    }, transactionContext(input));
  }

  async recordPerformedStrengthSet(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly executionId: UUID;
      readonly expectedVersion: number;
      readonly movementId: UUID;
      readonly prescriptionExerciseId?: UUID;
      readonly prescriptionSetId?: UUID;
      readonly observedAt?: Instant;
      readonly repetitions?: number;
      readonly loadKg?: number;
      readonly rpe?: number;
      readonly rir?: number;
      readonly durationSeconds?: number;
      readonly notes?: string;
      readonly idempotencyKey?: string;
    },
  ): Promise<ExecutionReview> {
    return this.recordFact(input, "strength-set");
  }

  async recordPerformedEnduranceSegment(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly executionId: UUID;
      readonly expectedVersion: number;
      readonly prescriptionSegmentId?: UUID;
      readonly observedAt?: Instant;
      readonly modality?: string;
      readonly durationSeconds?: number;
      readonly distanceMeters?: number;
      readonly averageSpeedMps?: number;
      readonly averageHeartRateBpm?: number;
      readonly averagePowerWatts?: number;
      readonly rpe?: number;
      readonly notes?: string;
      readonly idempotencyKey?: string;
    },
  ): Promise<ExecutionReview> {
    return this.recordFact(input, "endurance-segment");
  }

  async recordPerformedMobilityItem(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly executionId: UUID;
      readonly expectedVersion: number;
      readonly movementId: UUID;
      readonly prescriptionItemId?: UUID;
      readonly observedAt?: Instant;
      readonly sets?: number;
      readonly repetitions?: number;
      readonly durationSeconds?: number;
      readonly side?: PerformedMobilityItem["side"];
      readonly rpe?: number;
      readonly notes?: string;
      readonly idempotencyKey?: string;
    },
  ): Promise<ExecutionReview> {
    return this.recordFact(input, "mobility-item");
  }

  async recordSessionObservation(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly executionId: UUID;
      readonly expectedVersion: number;
      readonly observedAt?: Instant;
      readonly kind: SessionObservation["kind"];
      readonly valueText?: string;
      readonly valueNumber?: number;
      readonly unit?: string;
      readonly notes?: string;
      readonly idempotencyKey?: string;
    },
  ): Promise<ExecutionReview> {
    f4ExpectedVersion(input.expectedVersion);
    const requestHash = await f4Fingerprint({
      workspaceId: input.workspaceId,
      executionId: input.executionId,
      expectedVersion: input.expectedVersion,
      observedAt: input.observedAt ?? null,
      kind: input.kind,
      valueText: input.valueText ?? null,
      valueNumber: input.valueNumber ?? null,
      unit: input.unit ?? null,
      notes: input.notes ?? null,
    });
    return this.persistence.transaction(async (repositories) => {
      const current = await this.requireExecution(
        repositories,
        input.workspaceId,
        input.executionId,
      );
      await this.authorizeExecution(repositories, input, current.athleteId);
      const idempotencyOutcome = await this.reserveIdempotency(
        repositories,
        input,
        "execution.observation.record",
        requestHash,
      );
      if (idempotencyOutcome !== undefined)
        return idempotencyOutcome as ExecutionReview;
      this.assertWritable(current, input.expectedVersion);
      const observedAt = input.observedAt ?? input.occurredAt ?? f4Now();
      let observation: SessionObservation;
      try {
        observation = createSessionObservation({
          id: f4Id(),
          workspaceId: input.workspaceId,
          sessionId: current.id,
          observedAt,
          kind: input.kind,
          ...(input.valueText === undefined
            ? {}
            : { valueText: input.valueText }),
          ...(input.valueNumber === undefined
            ? {}
            : { valueNumber: input.valueNumber }),
          ...(input.unit === undefined ? {} : { unit: input.unit }),
          ...(input.notes === undefined ? {} : { notes: input.notes }),
        });
      } catch (error) {
        return f4DomainError(error);
      }
      await repositories.sessionObservations.insert(observation);
      const updated = advanceExecutedSession(
        current,
        input.occurredAt ?? f4Now(),
        input.principalId,
      );
      const persisted = await this.updateExecution(
        repositories,
        input,
        current,
        updated,
        "session_observation.recorded",
        { observationId: observation.id, kind: observation.kind },
      );
      const review = await this.review(repositories, persisted);
      await this.completeIdempotency(
        repositories,
        input,
        "execution.observation.record",
        review,
      );
      return review;
    }, transactionContext(input));
  }

  async completeExecutedSession(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly executionId: UUID;
      readonly expectedVersion: number;
      readonly idempotencyKey?: string;
    },
  ): Promise<ExecutionReview> {
    f4ExpectedVersion(input.expectedVersion);
    const requestHash = await f4Fingerprint({
      workspaceId: input.workspaceId,
      executionId: input.executionId,
      expectedVersion: input.expectedVersion,
    });
    return this.persistence.transaction(async (repositories) => {
      const current = await this.requireExecution(
        repositories,
        input.workspaceId,
        input.executionId,
      );
      await this.authorizeExecution(repositories, input, current.athleteId);
      const idempotencyOutcome = await this.reserveIdempotency(
        repositories,
        input,
        "execution.session.complete",
        requestHash,
      );
      if (idempotencyOutcome !== undefined)
        return idempotencyOutcome as ExecutionReview;
      this.assertWritable(current, input.expectedVersion);
      let completed: ExecutedSession;
      try {
        completed = completeExecutedSession(
          current,
          input.occurredAt ?? f4Now(),
        );
      } catch (error) {
        return f4DomainError(error);
      }
      const persisted = await this.updateExecution(
        repositories,
        input,
        current,
        completed,
        "executed_session.completed",
        {},
      );
      const review = await this.review(repositories, persisted);
      await this.completeIdempotency(
        repositories,
        input,
        "execution.session.complete",
        review,
      );
      return review;
    }, transactionContext(input));
  }

  async amendPerformedFact(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly executionId: UUID;
      readonly expectedVersion: number;
      readonly factKind: PerformedFactKind;
      readonly factId: UUID;
      readonly reason: string;
      readonly correctedFields: Readonly<Record<string, unknown>>;
      readonly idempotencyKey?: string;
    },
  ): Promise<ExecutionReview> {
    f4ExpectedVersion(input.expectedVersion);
    const requestHash = await f4Fingerprint({
      workspaceId: input.workspaceId,
      executionId: input.executionId,
      expectedVersion: input.expectedVersion,
      factKind: input.factKind,
      factId: input.factId,
      reason: input.reason,
      correctedFields: input.correctedFields,
    });
    return this.persistence.transaction(async (repositories) => {
      const current = await this.requireExecution(
        repositories,
        input.workspaceId,
        input.executionId,
      );
      await this.authorizeExecution(repositories, input, current.athleteId);
      const idempotencyOutcome = await this.reserveIdempotency(
        repositories,
        input,
        "execution.amendment.create",
        requestHash,
      );
      if (idempotencyOutcome !== undefined)
        return idempotencyOutcome as ExecutionReview;
      if (current.status !== "completed") {
        throw new ApplicationError(
          "DOMAIN_RULE_VIOLATION",
          "Only completed sessions can receive amendments.",
        );
      }
      this.assertVersion(current, input.expectedVersion);
      const fact = await this.findFact(
        repositories,
        input.workspaceId,
        input.factKind,
        input.factId,
      );
      if (fact === null || fact.sessionId !== current.id) {
        throw new ApplicationError(
          "RESOURCE_NOT_FOUND",
          "Performed fact not found.",
        );
      }
      const priorAmendments =
        await repositories.executionAmendments.listForSession(
          f4Scope(input.workspaceId),
          current.id,
        );
      const effective = applyExecutionAmendmentsToFact(
        fact,
        priorAmendments.filter((amendment) => amendment.factId === fact.id),
      );
      const originalValues: Record<string, unknown> = {};
      for (const field of Object.keys(input.correctedFields)) {
        originalValues[field] = effective[field as keyof PerformedFact];
      }
      let amendment: ExecutionAmendment;
      try {
        amendment = createExecutionAmendment({
          id: f4Id(),
          workspaceId: input.workspaceId,
          sessionId: current.id,
          factKind: input.factKind,
          factId: input.factId,
          actorId: input.principalId,
          reason: input.reason,
          originalValues,
          correctedFields: input.correctedFields,
          occurredAt: input.occurredAt ?? f4Now(),
        });
      } catch (error) {
        return f4DomainError(error);
      }
      await repositories.executionAmendments.insert(amendment);
      const updated = advanceExecutedSession(
        current,
        input.occurredAt ?? f4Now(),
        input.principalId,
      );
      const persisted = await this.updateExecution(
        repositories,
        input,
        current,
        updated,
        "execution_amendment.created",
        {
          factId: fact.id,
          factKind: input.factKind,
          originalValues,
          correctedFields: input.correctedFields,
        },
      );
      const review = await this.review(repositories, persisted);
      await this.completeIdempotency(
        repositories,
        input,
        "execution.amendment.create",
        review,
      );
      return review;
    }, transactionContext(input));
  }

  private async recordFact(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly executionId: UUID;
      readonly expectedVersion: number;
      readonly idempotencyKey?: string;
      readonly observedAt?: Instant;
      readonly notes?: string;
      readonly movementId?: UUID;
      readonly prescriptionExerciseId?: UUID;
      readonly prescriptionSetId?: UUID;
      readonly prescriptionSegmentId?: UUID;
      readonly prescriptionItemId?: UUID;
      readonly repetitions?: number;
      readonly loadKg?: number;
      readonly rpe?: number;
      readonly rir?: number;
      readonly durationSeconds?: number;
      readonly modality?: string;
      readonly distanceMeters?: number;
      readonly averageSpeedMps?: number;
      readonly averageHeartRateBpm?: number;
      readonly averagePowerWatts?: number;
      readonly sets?: number;
      readonly side?: PerformedMobilityItem["side"];
    },
    kind: PerformedFactKind,
  ): Promise<ExecutionReview> {
    f4ExpectedVersion(input.expectedVersion);
    const requestHash = await f4Fingerprint({
      workspaceId: input.workspaceId,
      executionId: input.executionId,
      expectedVersion: input.expectedVersion,
      kind,
      observedAt: input.observedAt ?? null,
      movementId: input.movementId ?? null,
      prescriptionExerciseId: input.prescriptionExerciseId ?? null,
      prescriptionSetId: input.prescriptionSetId ?? null,
      prescriptionSegmentId: input.prescriptionSegmentId ?? null,
      prescriptionItemId: input.prescriptionItemId ?? null,
      repetitions: input.repetitions ?? null,
      loadKg: input.loadKg ?? null,
      rpe: input.rpe ?? null,
      rir: input.rir ?? null,
      durationSeconds: input.durationSeconds ?? null,
      modality: input.modality ?? null,
      distanceMeters: input.distanceMeters ?? null,
      averageSpeedMps: input.averageSpeedMps ?? null,
      averageHeartRateBpm: input.averageHeartRateBpm ?? null,
      averagePowerWatts: input.averagePowerWatts ?? null,
      sets: input.sets ?? null,
      side: input.side ?? null,
      notes: input.notes ?? null,
    });
    const operation = `execution.${kind}.record`;
    return this.persistence.transaction(async (repositories) => {
      const current = await this.requireExecution(
        repositories,
        input.workspaceId,
        input.executionId,
      );
      await this.authorizeExecution(repositories, input, current.athleteId);
      const idempotencyOutcome = await this.reserveIdempotency(
        repositories,
        input,
        operation,
        requestHash,
      );
      if (idempotencyOutcome !== undefined)
        return idempotencyOutcome as ExecutionReview;
      this.assertWritable(current, input.expectedVersion);
      if (input.movementId !== undefined) {
        const movement = await repositories.movements.get(
          f4Scope(input.workspaceId),
          input.movementId,
        );
        if (movement === null) {
          throw new ApplicationError(
            "RESOURCE_NOT_FOUND",
            "Movement is not visible in this workspace.",
          );
        }
      }
      const observedAt = input.observedAt ?? input.occurredAt ?? f4Now();
      let fact: PerformedFact;
      try {
        if (kind === "strength-set") {
          if (input.movementId === undefined)
            throw new Error("Strength facts require movementId.");
          fact = createPerformedStrengthSet({
            id: f4Id(),
            workspaceId: input.workspaceId,
            sessionId: current.id,
            movementId: input.movementId,
            ...(input.prescriptionExerciseId === undefined
              ? {}
              : { prescriptionExerciseId: input.prescriptionExerciseId }),
            ...(input.prescriptionSetId === undefined
              ? {}
              : { prescriptionSetId: input.prescriptionSetId }),
            observedAt,
            ...(input.repetitions === undefined
              ? {}
              : { repetitions: input.repetitions }),
            ...(input.loadKg === undefined ? {} : { loadKg: input.loadKg }),
            ...(input.rpe === undefined ? {} : { rpe: input.rpe }),
            ...(input.rir === undefined ? {} : { rir: input.rir }),
            ...(input.durationSeconds === undefined
              ? {}
              : { durationSeconds: input.durationSeconds }),
            ...(input.notes === undefined ? {} : { notes: input.notes }),
          });
        } else if (kind === "endurance-segment") {
          fact = createPerformedEnduranceSegment({
            id: f4Id(),
            workspaceId: input.workspaceId,
            sessionId: current.id,
            ...(input.prescriptionSegmentId === undefined
              ? {}
              : { prescriptionSegmentId: input.prescriptionSegmentId }),
            observedAt,
            ...(input.modality === undefined
              ? {}
              : { modality: input.modality }),
            ...(input.durationSeconds === undefined
              ? {}
              : { durationSeconds: input.durationSeconds }),
            ...(input.distanceMeters === undefined
              ? {}
              : { distanceMeters: input.distanceMeters }),
            ...(input.averageSpeedMps === undefined
              ? {}
              : { averageSpeedMps: input.averageSpeedMps }),
            ...(input.averageHeartRateBpm === undefined
              ? {}
              : { averageHeartRateBpm: input.averageHeartRateBpm }),
            ...(input.averagePowerWatts === undefined
              ? {}
              : { averagePowerWatts: input.averagePowerWatts }),
            ...(input.rpe === undefined ? {} : { rpe: input.rpe }),
            ...(input.notes === undefined ? {} : { notes: input.notes }),
          });
        } else {
          if (input.movementId === undefined)
            throw new Error("Mobility facts require movementId.");
          fact = createPerformedMobilityItem({
            id: f4Id(),
            workspaceId: input.workspaceId,
            sessionId: current.id,
            movementId: input.movementId,
            ...(input.prescriptionItemId === undefined
              ? {}
              : { prescriptionItemId: input.prescriptionItemId }),
            observedAt,
            ...(input.sets === undefined ? {} : { sets: input.sets }),
            ...(input.repetitions === undefined
              ? {}
              : { repetitions: input.repetitions }),
            ...(input.durationSeconds === undefined
              ? {}
              : { durationSeconds: input.durationSeconds }),
            ...(input.side === undefined ? {} : { side: input.side }),
            ...(input.rpe === undefined ? {} : { rpe: input.rpe }),
            ...(input.notes === undefined ? {} : { notes: input.notes }),
          });
        }
      } catch (error) {
        return f4DomainError(error);
      }
      if (kind === "strength-set") {
        await repositories.performedStrengthSets.insert(
          fact as PerformedStrengthSet,
        );
      } else if (kind === "endurance-segment") {
        await repositories.performedEnduranceSegments.insert(
          fact as PerformedEnduranceSegment,
        );
      } else {
        await repositories.performedMobilityItems.insert(
          fact as PerformedMobilityItem,
        );
      }
      const updated = advanceExecutedSession(
        current,
        input.occurredAt ?? f4Now(),
        input.principalId,
      );
      const persisted = await this.updateExecution(
        repositories,
        input,
        current,
        updated,
        `performed_${kind.replace("-", "_")}.recorded`,
        { factId: fact.id, factKind: kind },
      );
      const review = await this.review(repositories, persisted);
      await this.completeIdempotency(repositories, input, operation, review);
      return review;
    }, transactionContext(input));
  }

  private async requireExecution(
    repositories: F4Repositories,
    workspaceId: WorkspaceId,
    executionId: UUID,
  ): Promise<ExecutedSession> {
    const session = await repositories.executedSessions.get(
      f4Scope(workspaceId),
      executionId,
    );
    if (session === null)
      throw new ApplicationError(
        "RESOURCE_NOT_FOUND",
        "Executed session not found.",
      );
    return session;
  }

  private async findFact(
    repositories: F4Repositories,
    workspaceId: WorkspaceId,
    kind: PerformedFactKind,
    factId: UUID,
  ): Promise<PerformedFact | null> {
    const scopeValue = f4Scope(workspaceId);
    if (kind === "strength-set")
      return repositories.performedStrengthSets.get(scopeValue, factId);
    if (kind === "endurance-segment")
      return repositories.performedEnduranceSegments.get(scopeValue, factId);
    return repositories.performedMobilityItems.get(scopeValue, factId);
  }

  private async review(
    repositories: F4Repositories,
    session: ExecutedSession,
  ): Promise<ExecutionReview> {
    const scopeValue = f4Scope(session.workspaceId);
    const [
      strengthSets,
      enduranceSegments,
      mobilityItems,
      observations,
      amendments,
    ] = await Promise.all([
      repositories.performedStrengthSets.listForSession(scopeValue, session.id),
      repositories.performedEnduranceSegments.listForSession(
        scopeValue,
        session.id,
      ),
      repositories.performedMobilityItems.listForSession(
        scopeValue,
        session.id,
      ),
      repositories.sessionObservations.listForSession(scopeValue, session.id),
      repositories.executionAmendments.listForSession(scopeValue, session.id),
    ]);
    const facts: PerformedFact[] = [
      ...strengthSets,
      ...enduranceSegments,
      ...mobilityItems,
    ];
    return {
      session,
      strengthSets,
      enduranceSegments,
      mobilityItems,
      observations,
      amendments,
      effectiveFacts: facts.map((fact) =>
        applyExecutionAmendmentsToFact(
          fact,
          amendments.filter((amendment) => amendment.factId === fact.id),
        ),
      ),
    };
  }

  private assertWritable(
    session: ExecutedSession,
    expectedVersion: number,
  ): void {
    this.assertVersion(session, expectedVersion);
    if (session.status !== "started") {
      throw new ApplicationError(
        "DOMAIN_RULE_VIOLATION",
        "Only started sessions accept new performed facts.",
      );
    }
  }

  private assertVersion(
    session: ExecutedSession,
    expectedVersion: number,
  ): void {
    if (session.version !== expectedVersion) {
      throw new ApplicationError(
        "CONCURRENCY_CONFLICT",
        "The executed session changed before this mutation could be applied.",
        { resourceId: session.id, expectedVersion },
      );
    }
  }

  private async updateExecution(
    repositories: F4Repositories,
    input: CommandMetadata & { readonly workspaceId: WorkspaceId },
    current: ExecutedSession,
    updated: ExecutedSession,
    action: string,
    payload: Readonly<Record<string, unknown>>,
  ): Promise<ExecutedSession> {
    const persisted = await repositories.executedSessions.updateExpected(
      f4Scope(input.workspaceId),
      updated,
      current.version,
    );
    if (persisted === null) {
      throw new ApplicationError(
        "CONCURRENCY_CONFLICT",
        "The executed session changed before this mutation could be applied.",
        { resourceId: current.id, expectedVersion: current.version },
      );
    }
    await repositories.audit.append(
      this.f4Audit(
        input,
        action,
        "ExecutedSession",
        current.id,
        current.version,
        persisted.version,
        payload,
      ),
    );
    return persisted;
  }

  private async authorizeExecution(
    repositories: F4Repositories,
    input: CommandMetadata & { readonly workspaceId: WorkspaceId },
    athleteId: AthleteId,
  ): Promise<WorkspaceMembership> {
    const membership = await repositories.memberships.get(
      f4Scope(input.workspaceId),
      input.principalId,
    );
    if (
      membership === null ||
      membership.status !== "active" ||
      !canAccessWorkspace(membership, "training.execute")
    ) {
      throw new ApplicationError(
        "FORBIDDEN",
        "You are not authorized to execute training in this workspace.",
      );
    }
    const athlete = await repositories.athletes.get(
      f4Scope(input.workspaceId),
      athleteId,
    );
    if (athlete === null)
      throw new ApplicationError("RESOURCE_NOT_FOUND", "Athlete not found.");
    const assignments = await repositories.coachAssignments.listForAthlete(
      f4Scope(input.workspaceId),
      athleteId,
    );
    const allowed =
      membership.role === "owner" ||
      (membership.role === "coach" &&
        assignments.some(
          (assignment) => assignment.coachPrincipalId === input.principalId,
        )) ||
      (membership.role === "athlete" &&
        athlete.linkedUserId === input.principalId);
    if (!allowed) {
      throw new ApplicationError(
        "FORBIDDEN",
        "You are not authorized to execute this athlete's session.",
      );
    }
    return membership;
  }

  private async reserveIdempotency(
    repositories: F4Repositories,
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly idempotencyKey?: string;
    },
    operation: string,
    requestHash: string,
  ): Promise<unknown | undefined> {
    if (input.idempotencyKey === undefined) return undefined;
    const prior = await repositories.idempotency.find(
      input.workspaceId,
      input.principalId,
      operation,
      input.idempotencyKey,
    );
    if (prior !== null) {
      if (prior.requestHash !== requestHash)
        throw new ApplicationError(
          "IDEMPOTENCY_CONFLICT",
          "Idempotency key was already used for a different command.",
        );
      if (prior.outcome !== null) return prior.outcome;
      throw new ApplicationError(
        "IDEMPOTENCY_CONFLICT",
        "Idempotency key is already being processed.",
      );
    }
    const reserved = await repositories.idempotency.reserve({
      workspaceId: input.workspaceId,
      actorId: input.principalId,
      operation,
      key: input.idempotencyKey,
      requestHash,
    });
    if (reserved !== null) {
      if (reserved.requestHash !== requestHash)
        throw new ApplicationError(
          "IDEMPOTENCY_CONFLICT",
          "Idempotency key was already used for a different command.",
        );
      if (reserved.outcome !== null) return reserved.outcome;
      throw new ApplicationError(
        "IDEMPOTENCY_CONFLICT",
        "Idempotency key is already being processed.",
      );
    }
    return undefined;
  }

  private async completeIdempotency(
    repositories: F4Repositories,
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly idempotencyKey?: string;
    },
    operation: string,
    outcome: unknown,
  ): Promise<void> {
    if (input.idempotencyKey !== undefined) {
      await repositories.idempotency.complete(
        input.workspaceId,
        input.principalId,
        operation,
        input.idempotencyKey,
        outcome,
      );
    }
  }

  private f4Audit(
    input: CommandMetadata & { readonly workspaceId: WorkspaceId },
    action: string,
    aggregateType: string,
    aggregateId: UUID,
    versionBefore: number | null,
    versionAfter: number | null,
    payload: Readonly<Record<string, unknown>>,
  ): AuditEvent {
    return {
      id: f4Id(),
      occurredAt: input.occurredAt ?? f4Now(),
      workspaceId: input.workspaceId,
      actorId: input.principalId,
      actorType: "HUMAN",
      action,
      aggregateType,
      aggregateId,
      versionBefore,
      versionAfter,
      requestId: input.requestId,
      payload,
    };
  }
}

export function createF4Application(persistence: F4Persistence): F4Application {
  return new F4Application(persistence);
}
