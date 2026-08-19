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
  MovementDefinition,
  PlanPhase,
  PrescriptionBlock,
  SessionPrescription,
  SessionPrescriptionRevision,
  TrainingGoal,
  TrainingPlan,
  TrainingPlanDetails,
  TrainingPlanRevision,
} from "@workoutpal/training-design";
import {
  archiveMovementDefinition,
  archivePlanPhase,
  archiveSessionPrescription,
  archiveTrainingGoal,
  archiveTrainingPlan,
  beginTrainingPlanRevision,
  createMovementDefinition,
  createPlanPhase,
  createSessionPrescription,
  createTrainingGoal,
  createTrainingPlan,
  publishSessionPrescription,
  publishTrainingPlan,
  updateMovementDefinition,
  updatePlanPhase,
  updateSessionPrescription,
  updateTrainingGoal,
  updateTrainingPlan,
  validatePlanPhaseHierarchy,
  validatePrescriptionBlocks,
} from "@workoutpal/training-design";
import { transactionContext } from "./application-shared.js";
import {
  ApplicationError,
  type AuditEvent,
  type CommandMetadata,
  type F3Persistence,
  type F3Repositories,
} from "./contracts.js";

function f3Now(): Instant {
  return new Date().toISOString() as Instant;
}

function f3Id(): UUID {
  return crypto.randomUUID() as UUID;
}

function f3Scope(workspaceId: WorkspaceId): WorkspaceScope {
  return { workspaceId };
}

function f3ExpectedVersion(expectedVersion: number): void {
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw new ApplicationError(
      "VALIDATION_FAILED",
      "expectedVersion must be a positive integer.",
    );
  }
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(object[key])}`)
    .join(",")}}`;
}

async function f3Fingerprint(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(stableSerialize(value)),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function f3DomainError(error: unknown): never {
  if (error instanceof ApplicationError) throw error;
  if (error instanceof Error) {
    throw new ApplicationError("DOMAIN_RULE_VIOLATION", error.message);
  }
  throw error;
}

async function reserveF3Idempotency(
  repositories: F3Repositories,
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
        "Idempotency key was already used for a different request.",
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
  if (reserved === null) return undefined;
  if (reserved.requestHash !== requestHash)
    throw new ApplicationError(
      "IDEMPOTENCY_CONFLICT",
      "Idempotency key was already used for a different request.",
    );
  if (reserved.outcome !== null) return reserved.outcome;
  throw new ApplicationError(
    "IDEMPOTENCY_CONFLICT",
    "Idempotency key is already being processed.",
  );
}

async function completeF3Idempotency(
  repositories: F3Repositories,
  input: CommandMetadata & {
    readonly workspaceId: WorkspaceId;
    readonly idempotencyKey?: string;
  },
  operation: string,
  outcome: unknown,
): Promise<void> {
  if (input.idempotencyKey === undefined) return;
  await repositories.idempotency.complete(
    input.workspaceId,
    input.principalId,
    operation,
    input.idempotencyKey,
    outcome,
  );
}

export class F3Application {
  constructor(private readonly persistence: F3Persistence) {}

  async createWorkspaceMovement(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly canonicalName: string;
      readonly modality: MovementDefinition["modality"];
      readonly movementPattern?: string;
      readonly laterality?: string;
      readonly equipmentTags?: readonly string[];
      readonly idempotencyKey?: string;
    },
  ): Promise<MovementDefinition> {
    const requestHash = await f3Fingerprint({
      workspaceId: input.workspaceId,
      canonicalName: input.canonicalName,
      modality: input.modality,
      movementPattern: input.movementPattern ?? null,
      laterality: input.laterality ?? null,
      equipmentTags: input.equipmentTags ?? null,
    });
    return this.persistence.transaction(async (repositories) => {
      await this.authorizeWorkspace(
        repositories,
        input.principalId,
        input.workspaceId,
        "training.design",
      );
      const prior = await reserveF3Idempotency(
        repositories,
        input,
        "movement.create",
        requestHash,
      );
      if (prior !== undefined) return prior as MovementDefinition;
      let movement: MovementDefinition;
      try {
        movement = createMovementDefinition({
          id: f3Id(),
          workspaceId: input.workspaceId,
          scope: "workspace",
          canonicalName: input.canonicalName,
          modality: input.modality,
          ...(input.movementPattern === undefined
            ? {}
            : { movementPattern: input.movementPattern }),
          ...(input.laterality === undefined
            ? {}
            : { laterality: input.laterality }),
          ...(input.equipmentTags === undefined
            ? {}
            : { equipmentTags: input.equipmentTags }),
          createdAt: input.occurredAt ?? f3Now(),
          createdBy: input.principalId,
        });
      } catch (error) {
        return f3DomainError(error);
      }
      await repositories.movements.insert(movement);
      await repositories.audit.append(
        this.f3Audit(
          input,
          "movement.created",
          "MovementDefinition",
          movement.id,
          null,
          movement.version,
          {
            canonicalName: movement.canonicalName,
            modality: movement.modality,
            scope: movement.scope,
          },
        ),
      );
      await completeF3Idempotency(
        repositories,
        input,
        "movement.create",
        movement,
      );
      return movement;
    }, transactionContext(input));
  }

  async updateWorkspaceMovement(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly movementId: UUID;
      readonly expectedVersion: number;
      readonly canonicalName?: string;
      readonly modality?: MovementDefinition["modality"];
      readonly movementPattern?: string | null;
      readonly laterality?: string | null;
      readonly equipmentTags?: readonly string[];
      readonly idempotencyKey?: string;
    },
  ): Promise<MovementDefinition> {
    f3ExpectedVersion(input.expectedVersion);
    const requestHash = await f3Fingerprint({
      workspaceId: input.workspaceId,
      movementId: input.movementId,
      expectedVersion: input.expectedVersion,
      canonicalName: input.canonicalName ?? null,
      modality: input.modality ?? null,
      movementPattern: input.movementPattern ?? null,
      laterality: input.laterality ?? null,
      equipmentTags: input.equipmentTags ?? null,
    });
    return this.persistence.transaction(async (repositories) => {
      await this.authorizeWorkspace(
        repositories,
        input.principalId,
        input.workspaceId,
        "training.design",
      );
      const prior = await reserveF3Idempotency(
        repositories,
        input,
        "movement.update",
        requestHash,
      );
      if (prior !== undefined) return prior as MovementDefinition;
      const current = await repositories.movements.get(
        f3Scope(input.workspaceId),
        input.movementId,
      );
      if (current === null || current.scope !== "workspace") {
        throw new ApplicationError(
          "RESOURCE_NOT_FOUND",
          "Movement definition not found.",
        );
      }
      let updated: MovementDefinition;
      try {
        updated = updateMovementDefinition(current, {
          ...(input.canonicalName === undefined
            ? {}
            : { canonicalName: input.canonicalName }),
          ...(input.modality === undefined ? {} : { modality: input.modality }),
          ...(input.movementPattern === undefined
            ? {}
            : { movementPattern: input.movementPattern }),
          ...(input.laterality === undefined
            ? {}
            : { laterality: input.laterality }),
          ...(input.equipmentTags === undefined
            ? {}
            : { equipmentTags: input.equipmentTags }),
          updatedAt: input.occurredAt ?? f3Now(),
          updatedBy: input.principalId,
        });
      } catch (error) {
        return f3DomainError(error);
      }
      const persisted = await repositories.movements.updateExpected(
        f3Scope(input.workspaceId),
        updated,
        input.expectedVersion,
      );
      if (persisted === null)
        throw this.f3Conflict(
          input.movementId,
          input.expectedVersion,
          "movement",
        );
      await repositories.audit.append(
        this.f3Audit(
          input,
          "movement.updated",
          "MovementDefinition",
          updated.id,
          current.version,
          updated.version,
          {
            canonicalName: updated.canonicalName,
            modality: updated.modality,
          },
        ),
      );
      await completeF3Idempotency(
        repositories,
        input,
        "movement.update",
        persisted,
      );
      return persisted;
    }, transactionContext(input));
  }

  async archiveWorkspaceMovement(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly movementId: UUID;
      readonly expectedVersion: number;
      readonly idempotencyKey?: string;
    },
  ): Promise<MovementDefinition> {
    f3ExpectedVersion(input.expectedVersion);
    const requestHash = await f3Fingerprint({
      workspaceId: input.workspaceId,
      movementId: input.movementId,
      expectedVersion: input.expectedVersion,
    });
    return this.persistence.transaction(async (repositories) => {
      await this.authorizeWorkspace(
        repositories,
        input.principalId,
        input.workspaceId,
        "training.design",
      );
      const prior = await reserveF3Idempotency(
        repositories,
        input,
        "movement.archive",
        requestHash,
      );
      if (prior !== undefined) return prior as MovementDefinition;
      const current = await repositories.movements.get(
        f3Scope(input.workspaceId),
        input.movementId,
      );
      if (current === null || current.scope !== "workspace") {
        throw new ApplicationError(
          "RESOURCE_NOT_FOUND",
          "Movement definition not found.",
        );
      }
      let archived: MovementDefinition;
      try {
        archived = archiveMovementDefinition(
          current,
          input.occurredAt ?? f3Now(),
          input.principalId,
        );
      } catch (error) {
        return f3DomainError(error);
      }
      const persisted = await repositories.movements.updateExpected(
        f3Scope(input.workspaceId),
        archived,
        input.expectedVersion,
      );
      if (persisted === null)
        throw this.f3Conflict(
          input.movementId,
          input.expectedVersion,
          "movement",
        );
      if (persisted.version !== current.version) {
        await repositories.audit.append(
          this.f3Audit(
            input,
            "movement.archived",
            "MovementDefinition",
            current.id,
            current.version,
            persisted.version,
            {},
          ),
        );
      }
      await completeF3Idempotency(
        repositories,
        input,
        "movement.archive",
        persisted,
      );
      return persisted;
    }, transactionContext(input));
  }

  async listVisibleMovements(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly includeArchived?: boolean;
    },
  ): Promise<readonly MovementDefinition[]> {
    return this.persistence.transaction(async (repositories) => {
      await this.authorizeWorkspace(
        repositories,
        input.principalId,
        input.workspaceId,
        "training.read",
      );
      return repositories.movements.listVisible(
        f3Scope(input.workspaceId),
        input.includeArchived ?? false,
      );
    }, transactionContext(input));
  }

  async getMovement(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly movementId: UUID;
    },
  ): Promise<MovementDefinition> {
    return this.persistence.transaction(async (repositories) => {
      await this.authorizeWorkspace(
        repositories,
        input.principalId,
        input.workspaceId,
        "training.read",
      );
      const movement = await repositories.movements.get(
        f3Scope(input.workspaceId),
        input.movementId,
      );
      if (movement === null)
        throw new ApplicationError(
          "RESOURCE_NOT_FOUND",
          "Movement definition not found.",
        );
      return movement;
    }, transactionContext(input));
  }

  async createTrainingGoal(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly athleteId: AthleteId;
      readonly title: string;
      readonly description?: string;
      readonly targetDate?: import("@workoutpal/shared-kernel").LocalDate;
      readonly startsOn?: import("@workoutpal/shared-kernel").LocalDate;
      readonly endsOn?: import("@workoutpal/shared-kernel").LocalDate;
      readonly idempotencyKey?: string;
    },
  ): Promise<TrainingGoal> {
    const requestHash = await f3Fingerprint({
      workspaceId: input.workspaceId,
      athleteId: input.athleteId,
      title: input.title,
      description: input.description ?? null,
      targetDate: input.targetDate ?? null,
      startsOn: input.startsOn ?? null,
      endsOn: input.endsOn ?? null,
    });
    return this.persistence.transaction(async (repositories) => {
      await this.authorizeAthlete(
        repositories,
        input,
        input.athleteId,
        "mutate",
      );
      const prior = await reserveF3Idempotency(
        repositories,
        input,
        "training_goal.create",
        requestHash,
      );
      if (prior !== undefined) return prior as TrainingGoal;
      let goal: TrainingGoal;
      try {
        goal = createTrainingGoal({
          id: f3Id(),
          workspaceId: input.workspaceId,
          athleteId: input.athleteId,
          title: input.title,
          ...(input.description === undefined
            ? {}
            : { description: input.description }),
          ...(input.targetDate === undefined
            ? {}
            : { targetDate: input.targetDate }),
          ...(input.startsOn === undefined ? {} : { startsOn: input.startsOn }),
          ...(input.endsOn === undefined ? {} : { endsOn: input.endsOn }),
          createdAt: input.occurredAt ?? f3Now(),
          createdBy: input.principalId,
        });
      } catch (error) {
        return f3DomainError(error);
      }
      await repositories.trainingGoals.insert(goal);
      await repositories.audit.append(
        this.f3Audit(
          input,
          "training_goal.created",
          "TrainingGoal",
          goal.id,
          null,
          goal.version,
          {
            athleteId: goal.athleteId,
            title: goal.title,
          },
        ),
      );
      await completeF3Idempotency(
        repositories,
        input,
        "training_goal.create",
        goal,
      );
      return goal;
    }, transactionContext(input));
  }

  async listAthleteGoals(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly athleteId: AthleteId;
      readonly includeArchived?: boolean;
    },
  ): Promise<readonly TrainingGoal[]> {
    return this.persistence.transaction(async (repositories) => {
      await this.authorizeAthlete(repositories, input, input.athleteId, "read");
      return repositories.trainingGoals.listForAthlete(
        f3Scope(input.workspaceId),
        input.athleteId,
        input.includeArchived ?? false,
      );
    }, transactionContext(input));
  }

  async getTrainingGoal(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly goalId: UUID;
    },
  ): Promise<TrainingGoal> {
    return this.persistence.transaction(async (repositories) => {
      const goal = await repositories.trainingGoals.get(
        f3Scope(input.workspaceId),
        input.goalId,
      );
      if (goal === null)
        throw new ApplicationError(
          "RESOURCE_NOT_FOUND",
          "Training goal not found.",
        );
      await this.authorizeAthlete(repositories, input, goal.athleteId, "read");
      return goal;
    }, transactionContext(input));
  }

  async updateTrainingGoal(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly goalId: UUID;
      readonly expectedVersion: number;
      readonly title?: string;
      readonly description?: string | null;
      readonly targetDate?:
        | import("@workoutpal/shared-kernel").LocalDate
        | null;
      readonly startsOn?: import("@workoutpal/shared-kernel").LocalDate | null;
      readonly endsOn?: import("@workoutpal/shared-kernel").LocalDate | null;
      readonly idempotencyKey?: string;
    },
  ): Promise<TrainingGoal> {
    f3ExpectedVersion(input.expectedVersion);
    const requestHash = await f3Fingerprint({
      workspaceId: input.workspaceId,
      goalId: input.goalId,
      expectedVersion: input.expectedVersion,
      title: input.title ?? null,
      description: input.description ?? null,
      targetDate: input.targetDate ?? null,
      startsOn: input.startsOn ?? null,
      endsOn: input.endsOn ?? null,
    });
    return this.persistence.transaction(async (repositories) => {
      const current = await repositories.trainingGoals.get(
        f3Scope(input.workspaceId),
        input.goalId,
      );
      if (current === null)
        throw new ApplicationError(
          "RESOURCE_NOT_FOUND",
          "Training goal not found.",
        );
      await this.authorizeAthlete(
        repositories,
        input,
        current.athleteId,
        "mutate",
      );
      const prior = await reserveF3Idempotency(
        repositories,
        input,
        "training_goal.update",
        requestHash,
      );
      if (prior !== undefined) return prior as TrainingGoal;
      let updated: TrainingGoal;
      try {
        updated = updateTrainingGoal(current, {
          ...(input.title === undefined ? {} : { title: input.title }),
          ...(input.description === undefined
            ? {}
            : { description: input.description }),
          ...(input.targetDate === undefined
            ? {}
            : { targetDate: input.targetDate }),
          ...(input.startsOn === undefined ? {} : { startsOn: input.startsOn }),
          ...(input.endsOn === undefined ? {} : { endsOn: input.endsOn }),
          updatedAt: input.occurredAt ?? f3Now(),
          updatedBy: input.principalId,
        });
      } catch (error) {
        return f3DomainError(error);
      }
      const persisted = await repositories.trainingGoals.updateExpected(
        f3Scope(input.workspaceId),
        updated,
        input.expectedVersion,
      );
      if (persisted === null)
        throw this.f3Conflict(
          input.goalId,
          input.expectedVersion,
          "training goal",
        );
      await repositories.audit.append(
        this.f3Audit(
          input,
          "training_goal.updated",
          "TrainingGoal",
          current.id,
          current.version,
          updated.version,
          {
            title: updated.title,
            targetDate: updated.targetDate,
          },
        ),
      );
      await completeF3Idempotency(
        repositories,
        input,
        "training_goal.update",
        persisted,
      );
      return persisted;
    }, transactionContext(input));
  }

  async archiveTrainingGoal(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly goalId: UUID;
      readonly expectedVersion: number;
      readonly idempotencyKey?: string;
    },
  ): Promise<TrainingGoal> {
    f3ExpectedVersion(input.expectedVersion);
    const requestHash = await f3Fingerprint({
      workspaceId: input.workspaceId,
      goalId: input.goalId,
      expectedVersion: input.expectedVersion,
    });
    return this.persistence.transaction(async (repositories) => {
      const current = await repositories.trainingGoals.get(
        f3Scope(input.workspaceId),
        input.goalId,
      );
      if (current === null)
        throw new ApplicationError(
          "RESOURCE_NOT_FOUND",
          "Training goal not found.",
        );
      await this.authorizeAthlete(
        repositories,
        input,
        current.athleteId,
        "mutate",
      );
      const prior = await reserveF3Idempotency(
        repositories,
        input,
        "training_goal.archive",
        requestHash,
      );
      if (prior !== undefined) return prior as TrainingGoal;
      const archived = archiveTrainingGoal(
        current,
        input.occurredAt ?? f3Now(),
        input.principalId,
      );
      const persisted = await repositories.trainingGoals.updateExpected(
        f3Scope(input.workspaceId),
        archived,
        input.expectedVersion,
      );
      if (persisted === null)
        throw this.f3Conflict(
          input.goalId,
          input.expectedVersion,
          "training goal",
        );
      if (persisted.version !== current.version) {
        await repositories.audit.append(
          this.f3Audit(
            input,
            "training_goal.archived",
            "TrainingGoal",
            current.id,
            current.version,
            persisted.version,
            {},
          ),
        );
      }
      await completeF3Idempotency(
        repositories,
        input,
        "training_goal.archive",
        persisted,
      );
      return persisted;
    }, transactionContext(input));
  }

  async createTrainingPlan(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly athleteId: AthleteId;
      readonly title: string;
      readonly description?: string;
      readonly startsOn: import("@workoutpal/shared-kernel").LocalDate;
      readonly endsOn: import("@workoutpal/shared-kernel").LocalDate;
      readonly timeZone: import("@workoutpal/shared-kernel").IanaTimeZone;
      readonly goalIds?: readonly UUID[];
    },
  ): Promise<TrainingPlan> {
    return this.persistence.transaction(async (repositories) => {
      await this.authorizeAthlete(
        repositories,
        input,
        input.athleteId,
        "mutate",
      );
      await this.assertGoalReferences(
        repositories,
        input.workspaceId,
        input.athleteId,
        input.goalIds ?? [],
      );
      let plan: TrainingPlan;
      try {
        plan = createTrainingPlan({
          id: f3Id(),
          workspaceId: input.workspaceId,
          athleteId: input.athleteId,
          title: input.title,
          ...(input.description === undefined
            ? {}
            : { description: input.description }),
          startsOn: input.startsOn,
          endsOn: input.endsOn,
          timeZone: input.timeZone,
          ...(input.goalIds === undefined ? {} : { goalIds: input.goalIds }),
          createdAt: input.occurredAt ?? f3Now(),
          createdBy: input.principalId,
        });
      } catch (error) {
        return f3DomainError(error);
      }
      await repositories.trainingPlans.insert(plan);
      await repositories.audit.append(
        this.f3Audit(
          input,
          "training_plan.created",
          "TrainingPlan",
          plan.id,
          null,
          plan.version,
          {
            athleteId: plan.athleteId,
            title: plan.title,
            startsOn: plan.startsOn,
            endsOn: plan.endsOn,
          },
        ),
      );
      return plan;
    }, transactionContext(input));
  }

  async listAthleteTrainingPlans(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly athleteId: AthleteId;
      readonly includeArchived?: boolean;
    },
  ): Promise<readonly TrainingPlan[]> {
    return this.persistence.transaction(async (repositories) => {
      await this.authorizeAthlete(repositories, input, input.athleteId, "read");
      const plans = await repositories.trainingPlans.listForAthlete(
        f3Scope(input.workspaceId),
        input.athleteId,
        input.includeArchived ?? false,
      );
      const membership = await repositories.memberships.get(
        f3Scope(input.workspaceId),
        input.principalId,
      );
      if (membership?.role === "athlete")
        return plans.filter((plan) => plan.status === "published");
      return plans;
    }, transactionContext(input));
  }

  async getTrainingPlan(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly planId: UUID;
    },
  ): Promise<TrainingPlanDetails> {
    return this.persistence.transaction(async (repositories) => {
      const plan = await repositories.trainingPlans.get(
        f3Scope(input.workspaceId),
        input.planId,
      );
      if (plan === null)
        throw new ApplicationError(
          "RESOURCE_NOT_FOUND",
          "Training plan not found.",
        );
      const membership = await this.authorizeAthlete(
        repositories,
        input,
        plan.athleteId,
        "read",
      );
      if (membership.role === "athlete" && plan.status !== "published") {
        throw new ApplicationError(
          "RESOURCE_NOT_FOUND",
          "Training plan not found.",
        );
      }
      const details = await this.loadPlanDetails(repositories, plan);
      return details;
    }, transactionContext(input));
  }

  async updateTrainingPlan(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly planId: UUID;
      readonly expectedVersion: number;
      readonly title?: string;
      readonly description?: string | null;
      readonly startsOn?: import("@workoutpal/shared-kernel").LocalDate;
      readonly endsOn?: import("@workoutpal/shared-kernel").LocalDate;
      readonly timeZone?: import("@workoutpal/shared-kernel").IanaTimeZone;
      readonly goalIds?: readonly UUID[];
      readonly createRevision?: boolean;
    },
  ): Promise<TrainingPlan> {
    f3ExpectedVersion(input.expectedVersion);
    return this.persistence.transaction(async (repositories) => {
      const current = await repositories.trainingPlans.get(
        f3Scope(input.workspaceId),
        input.planId,
      );
      if (current === null)
        throw new ApplicationError(
          "RESOURCE_NOT_FOUND",
          "Training plan not found.",
        );
      await this.authorizeAthlete(
        repositories,
        input,
        current.athleteId,
        "mutate",
      );
      if (input.goalIds !== undefined)
        await this.assertGoalReferences(
          repositories,
          input.workspaceId,
          current.athleteId,
          input.goalIds,
        );
      let updated: TrainingPlan;
      try {
        updated = updateTrainingPlan(current, {
          ...(input.title === undefined ? {} : { title: input.title }),
          ...(input.description === undefined
            ? {}
            : { description: input.description }),
          ...(input.startsOn === undefined ? {} : { startsOn: input.startsOn }),
          ...(input.endsOn === undefined ? {} : { endsOn: input.endsOn }),
          ...(input.timeZone === undefined ? {} : { timeZone: input.timeZone }),
          ...(input.goalIds === undefined ? {} : { goalIds: input.goalIds }),
          ...(input.createRevision === undefined
            ? {}
            : { createRevision: input.createRevision }),
          updatedAt: input.occurredAt ?? f3Now(),
          updatedBy: input.principalId,
        });
      } catch (error) {
        return f3DomainError(error);
      }
      const phases = await repositories.planPhases.listForPlan(
        f3Scope(input.workspaceId),
        current.id,
        true,
      );
      const sessions = await repositories.sessionPrescriptions.listForPlan(
        f3Scope(input.workspaceId),
        current.id,
        false,
      );
      try {
        validatePlanPhaseHierarchy(phases, updated);
        for (const session of sessions) {
          if (
            session.scheduledLocalDate < updated.startsOn ||
            session.scheduledLocalDate > updated.endsOn
          )
            throw new Error("Session date must remain inside the plan dates.");
          if (session.phaseId !== null) {
            const phase = phases.find(
              (candidate) => candidate.id === session.phaseId,
            );
            if (
              phase === undefined ||
              phase.archivedAt !== null ||
              session.scheduledLocalDate < phase.startsOn ||
              session.scheduledLocalDate > phase.endsOn
            )
              throw new Error(
                "Session date must remain inside its active phase dates.",
              );
          }
        }
      } catch (error) {
        return f3DomainError(error);
      }
      const persisted = await repositories.trainingPlans.updateExpected(
        f3Scope(input.workspaceId),
        updated,
        input.expectedVersion,
      );
      if (persisted === null)
        throw this.f3Conflict(
          input.planId,
          input.expectedVersion,
          "training plan",
        );
      await repositories.audit.append(
        this.f3Audit(
          input,
          "training_plan.updated",
          "TrainingPlan",
          current.id,
          current.version,
          updated.version,
          {
            title: updated.title,
            status: updated.status,
            createRevision: input.createRevision === true,
          },
        ),
      );
      return persisted;
    }, transactionContext(input));
  }

  async archiveTrainingPlan(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly planId: UUID;
      readonly expectedVersion: number;
    },
  ): Promise<TrainingPlan> {
    f3ExpectedVersion(input.expectedVersion);
    return this.persistence.transaction(async (repositories) => {
      const current = await repositories.trainingPlans.get(
        f3Scope(input.workspaceId),
        input.planId,
      );
      if (current === null)
        throw new ApplicationError(
          "RESOURCE_NOT_FOUND",
          "Training plan not found.",
        );
      await this.authorizeAthlete(
        repositories,
        input,
        current.athleteId,
        "mutate",
      );
      const archived = archiveTrainingPlan(
        current,
        input.occurredAt ?? f3Now(),
        input.principalId,
      );
      const persisted = await repositories.trainingPlans.updateExpected(
        f3Scope(input.workspaceId),
        archived,
        input.expectedVersion,
      );
      if (persisted === null)
        throw this.f3Conflict(
          input.planId,
          input.expectedVersion,
          "training plan",
        );
      if (persisted.version !== current.version)
        await repositories.audit.append(
          this.f3Audit(
            input,
            "training_plan.archived",
            "TrainingPlan",
            current.id,
            current.version,
            persisted.version,
            {},
          ),
        );
      return persisted;
    }, transactionContext(input));
  }

  async createPlanRevision(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly planId: UUID;
      readonly expectedVersion: number;
    },
  ): Promise<TrainingPlan> {
    f3ExpectedVersion(input.expectedVersion);
    return this.persistence.transaction(async (repositories) => {
      const current = await repositories.trainingPlans.get(
        f3Scope(input.workspaceId),
        input.planId,
      );
      if (current === null)
        throw new ApplicationError(
          "RESOURCE_NOT_FOUND",
          "Training plan not found.",
        );
      await this.authorizeAthlete(
        repositories,
        input,
        current.athleteId,
        "mutate",
      );
      let draft: TrainingPlan;
      try {
        draft = beginTrainingPlanRevision(
          current,
          input.occurredAt ?? f3Now(),
          input.principalId,
        );
      } catch (error) {
        return f3DomainError(error);
      }
      const persisted = await repositories.trainingPlans.updateExpected(
        f3Scope(input.workspaceId),
        draft,
        input.expectedVersion,
      );
      if (persisted === null)
        throw this.f3Conflict(
          input.planId,
          input.expectedVersion,
          "training plan",
        );
      const sessions = await repositories.sessionPrescriptions.listForPlan(
        f3Scope(input.workspaceId),
        current.id,
        false,
      );
      for (const session of sessions) {
        if (session.status !== "published") continue;
        const sessionDraft = updateSessionPrescription(session, {
          createRevision: true,
          updatedAt: input.occurredAt ?? f3Now(),
          updatedBy: input.principalId,
        });
        const sessionPersisted =
          await repositories.sessionPrescriptions.updateExpected(
            f3Scope(input.workspaceId),
            sessionDraft,
            session.version,
          );
        if (sessionPersisted === null)
          throw this.f3Conflict(
            session.id,
            session.version,
            "session prescription",
          );
        await repositories.audit.append(
          this.f3Audit(
            input,
            "session_prescription.revision_started",
            "SessionPrescription",
            session.id,
            session.version,
            sessionDraft.version,
            {
              planId: current.id,
              revision: sessionDraft.revision,
            },
          ),
        );
      }
      await repositories.audit.append(
        this.f3Audit(
          input,
          "training_plan.revision_started",
          "TrainingPlan",
          current.id,
          current.version,
          draft.version,
          {
            publishedRevision: current.publishedRevision,
          },
        ),
      );
      return persisted;
    }, transactionContext(input));
  }

  async createPlanPhase(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly planId: UUID;
      readonly parentPhaseId?: UUID;
      readonly ordinal: number;
      readonly name: string;
      readonly classification?: PlanPhase["classification"];
      readonly startsOn: import("@workoutpal/shared-kernel").LocalDate;
      readonly endsOn: import("@workoutpal/shared-kernel").LocalDate;
    },
  ): Promise<PlanPhase> {
    return this.persistence.transaction(async (repositories) => {
      const plan = await this.requirePlanForMutation(
        repositories,
        input,
        input.planId,
      );
      const phases = await repositories.planPhases.listForPlan(
        f3Scope(input.workspaceId),
        plan.id,
        true,
      );
      let phase: PlanPhase;
      try {
        phase = createPlanPhase({
          id: f3Id(),
          workspaceId: input.workspaceId,
          planId: plan.id,
          ...(input.parentPhaseId === undefined
            ? {}
            : { parentPhaseId: input.parentPhaseId }),
          ordinal: input.ordinal,
          name: input.name,
          ...(input.classification === undefined
            ? {}
            : { classification: input.classification }),
          startsOn: input.startsOn,
          endsOn: input.endsOn,
          createdAt: input.occurredAt ?? f3Now(),
          createdBy: input.principalId,
        });
        validatePlanPhaseHierarchy([...phases, phase], plan);
      } catch (error) {
        return f3DomainError(error);
      }
      await repositories.planPhases.insert(phase);
      await repositories.audit.append(
        this.f3Audit(
          input,
          "plan_phase.created",
          "PlanPhase",
          phase.id,
          null,
          phase.version,
          {
            planId: plan.id,
            parentPhaseId: phase.parentPhaseId,
            ordinal: phase.ordinal,
          },
        ),
      );
      return phase;
    }, transactionContext(input));
  }

  async listPlanPhases(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly planId: UUID;
      readonly includeArchived?: boolean;
    },
  ): Promise<readonly PlanPhase[]> {
    return this.persistence.transaction(async (repositories) => {
      const plan = await this.requirePlanForRead(
        repositories,
        input,
        input.planId,
      );
      return repositories.planPhases.listForPlan(
        f3Scope(input.workspaceId),
        plan.id,
        input.includeArchived ?? false,
      );
    }, transactionContext(input));
  }

  async updatePlanPhase(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly phaseId: UUID;
      readonly expectedVersion: number;
      readonly parentPhaseId?: UUID | null;
      readonly ordinal?: number;
      readonly name?: string;
      readonly classification?: PlanPhase["classification"];
      readonly startsOn?: import("@workoutpal/shared-kernel").LocalDate;
      readonly endsOn?: import("@workoutpal/shared-kernel").LocalDate;
    },
  ): Promise<PlanPhase> {
    f3ExpectedVersion(input.expectedVersion);
    return this.persistence.transaction(async (repositories) => {
      const current = await repositories.planPhases.get(
        f3Scope(input.workspaceId),
        input.phaseId,
      );
      if (current === null)
        throw new ApplicationError(
          "RESOURCE_NOT_FOUND",
          "Plan phase not found.",
        );
      const plan = await this.requirePlanForMutation(
        repositories,
        input,
        current.planId,
      );
      const phases = await repositories.planPhases.listForPlan(
        f3Scope(input.workspaceId),
        current.planId,
        true,
      );
      let updated: PlanPhase;
      try {
        updated = updatePlanPhase(current, {
          ...(input.parentPhaseId === undefined
            ? {}
            : { parentPhaseId: input.parentPhaseId }),
          ...(input.ordinal === undefined ? {} : { ordinal: input.ordinal }),
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.classification === undefined
            ? {}
            : { classification: input.classification }),
          ...(input.startsOn === undefined ? {} : { startsOn: input.startsOn }),
          ...(input.endsOn === undefined ? {} : { endsOn: input.endsOn }),
          updatedAt: input.occurredAt ?? f3Now(),
          updatedBy: input.principalId,
        });
        validatePlanPhaseHierarchy(
          phases.map((phase) => (phase.id === current.id ? updated : phase)),
          plan,
        );
      } catch (error) {
        return f3DomainError(error);
      }
      const persisted = await repositories.planPhases.updateExpected(
        f3Scope(input.workspaceId),
        updated,
        input.expectedVersion,
      );
      if (persisted === null)
        throw this.f3Conflict(
          input.phaseId,
          input.expectedVersion,
          "plan phase",
        );
      await repositories.audit.append(
        this.f3Audit(
          input,
          input.parentPhaseId === undefined
            ? "plan_phase.updated"
            : "plan_phase.moved",
          "PlanPhase",
          current.id,
          current.version,
          updated.version,
          {
            planId: current.planId,
            parentPhaseId: updated.parentPhaseId,
            ordinal: updated.ordinal,
          },
        ),
      );
      return persisted;
    }, transactionContext(input));
  }

  async movePlanPhase(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly phaseId: UUID;
      readonly expectedVersion: number;
      readonly parentPhaseId: UUID | null;
      readonly ordinal: number;
    },
  ): Promise<PlanPhase> {
    return this.updatePlanPhase(input);
  }

  async archivePlanPhase(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly phaseId: UUID;
      readonly expectedVersion: number;
    },
  ): Promise<PlanPhase> {
    f3ExpectedVersion(input.expectedVersion);
    return this.persistence.transaction(async (repositories) => {
      const current = await repositories.planPhases.get(
        f3Scope(input.workspaceId),
        input.phaseId,
      );
      if (current === null)
        throw new ApplicationError(
          "RESOURCE_NOT_FOUND",
          "Plan phase not found.",
        );
      await this.requirePlanForMutation(repositories, input, current.planId);
      const children = await repositories.planPhases.listForPlan(
        f3Scope(input.workspaceId),
        current.planId,
        false,
      );
      if (
        children.some(
          (phase) =>
            phase.parentPhaseId === current.id && phase.archivedAt === null,
        )
      ) {
        throw new ApplicationError(
          "DOMAIN_RULE_VIOLATION",
          "A phase with active child phases cannot be archived.",
        );
      }
      const sessions = await repositories.sessionPrescriptions.listForPlan(
        f3Scope(input.workspaceId),
        current.planId,
        false,
      );
      if (sessions.some((session) => session.phaseId === current.id)) {
        throw new ApplicationError(
          "DOMAIN_RULE_VIOLATION",
          "A phase with active session prescriptions cannot be archived.",
        );
      }
      const archived = archivePlanPhase(
        current,
        input.occurredAt ?? f3Now(),
        input.principalId,
      );
      const persisted = await repositories.planPhases.updateExpected(
        f3Scope(input.workspaceId),
        archived,
        input.expectedVersion,
      );
      if (persisted === null)
        throw this.f3Conflict(
          input.phaseId,
          input.expectedVersion,
          "plan phase",
        );
      if (persisted.version !== current.version)
        await repositories.audit.append(
          this.f3Audit(
            input,
            "plan_phase.archived",
            "PlanPhase",
            current.id,
            current.version,
            persisted.version,
            {},
          ),
        );
      return persisted;
    }, transactionContext(input));
  }

  async createSessionPrescription(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly planId: UUID;
      readonly phaseId?: UUID;
      readonly scheduledLocalDate: import("@workoutpal/shared-kernel").LocalDate;
      readonly timeZone: import("@workoutpal/shared-kernel").IanaTimeZone;
      readonly title: string;
      readonly blocks?: readonly PrescriptionBlock[];
    },
  ): Promise<SessionPrescription> {
    return this.persistence.transaction(async (repositories) => {
      const plan = await this.requirePlanForMutation(
        repositories,
        input,
        input.planId,
      );
      if (
        input.scheduledLocalDate < plan.startsOn ||
        input.scheduledLocalDate > plan.endsOn
      ) {
        throw new ApplicationError(
          "DOMAIN_RULE_VIOLATION",
          "Session date must remain inside the plan dates.",
        );
      }
      let phase: PlanPhase | null = null;
      if (input.phaseId !== undefined) {
        phase = await repositories.planPhases.get(
          f3Scope(input.workspaceId),
          input.phaseId,
        );
        if (
          phase === null ||
          phase.planId !== plan.id ||
          phase.archivedAt !== null
        )
          throw new ApplicationError(
            "RESOURCE_NOT_FOUND",
            "Plan phase not found.",
          );
        if (
          input.scheduledLocalDate < phase.startsOn ||
          input.scheduledLocalDate > phase.endsOn
        )
          throw new ApplicationError(
            "DOMAIN_RULE_VIOLATION",
            "Session date must remain inside the phase dates.",
          );
      }
      let session: SessionPrescription;
      try {
        session = createSessionPrescription({
          id: f3Id(),
          workspaceId: input.workspaceId,
          athleteId: plan.athleteId,
          planId: plan.id,
          ...(phase === null ? {} : { phaseId: phase.id }),
          scheduledLocalDate: input.scheduledLocalDate,
          timeZone: input.timeZone,
          title: input.title,
          ...(input.blocks === undefined ? {} : { blocks: input.blocks }),
          createdAt: input.occurredAt ?? f3Now(),
          createdBy: input.principalId,
        });
      } catch (error) {
        return f3DomainError(error);
      }
      await this.assertSessionMovementReferences(
        repositories,
        input.workspaceId,
        session.blocks,
      );
      await repositories.sessionPrescriptions.insert(session);
      await repositories.audit.append(
        this.f3Audit(
          input,
          "session_prescription.created",
          "SessionPrescription",
          session.id,
          null,
          session.version,
          {
            planId: session.planId,
            scheduledLocalDate: session.scheduledLocalDate,
          },
        ),
      );
      await this.appendSessionContentAudits(
        repositories,
        input,
        session.id,
        session.planId,
        [],
        session.blocks,
        null,
        session.version,
      );
      return session;
    }, transactionContext(input));
  }

  async listSessionPrescriptions(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly planId: UUID;
      readonly includeArchived?: boolean;
    },
  ): Promise<readonly SessionPrescription[]> {
    return this.persistence.transaction(async (repositories) => {
      const plan = await this.requirePlanForRead(
        repositories,
        input,
        input.planId,
      );
      return repositories.sessionPrescriptions.listForPlan(
        f3Scope(input.workspaceId),
        plan.id,
        input.includeArchived ?? false,
      );
    }, transactionContext(input));
  }

  async getSessionPrescription(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly sessionId: UUID;
    },
  ): Promise<SessionPrescription> {
    return this.persistence.transaction(async (repositories) => {
      const session = await repositories.sessionPrescriptions.get(
        f3Scope(input.workspaceId),
        input.sessionId,
      );
      if (session === null)
        throw new ApplicationError(
          "RESOURCE_NOT_FOUND",
          "Session prescription not found.",
        );
      const membership = await this.authorizeAthlete(
        repositories,
        input,
        session.athleteId,
        "read",
      );
      if (membership.role === "athlete" && session.status !== "published")
        throw new ApplicationError(
          "RESOURCE_NOT_FOUND",
          "Session prescription not found.",
        );
      return session;
    }, transactionContext(input));
  }

  async updateSessionPrescription(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly sessionId: UUID;
      readonly expectedVersion: number;
      readonly phaseId?: UUID | null;
      readonly scheduledLocalDate?: import("@workoutpal/shared-kernel").LocalDate;
      readonly timeZone?: import("@workoutpal/shared-kernel").IanaTimeZone;
      readonly title?: string;
      readonly blocks?: readonly PrescriptionBlock[];
      readonly createRevision?: boolean;
    },
  ): Promise<SessionPrescription> {
    f3ExpectedVersion(input.expectedVersion);
    return this.persistence.transaction(
      (repositories) =>
        this.updateSessionPrescriptionInTransaction(repositories, input),
      transactionContext(input),
    );
  }

  async getSessionPrescriptionForMutationInTransaction(
    repositories: F3Repositories,
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly sessionId: UUID;
    },
  ): Promise<SessionPrescription> {
    const current = await repositories.sessionPrescriptions.get(
      f3Scope(input.workspaceId),
      input.sessionId,
    );
    if (current === null)
      throw new ApplicationError(
        "RESOURCE_NOT_FOUND",
        "Session prescription not found.",
      );
    await this.authorizeAthlete(
      repositories,
      input,
      current.athleteId,
      "mutate",
    );
    return current;
  }

  async updateSessionPrescriptionInTransaction(
    repositories: F3Repositories,
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly sessionId: UUID;
      readonly expectedVersion: number;
      readonly phaseId?: UUID | null;
      readonly scheduledLocalDate?: import("@workoutpal/shared-kernel").LocalDate;
      readonly timeZone?: import("@workoutpal/shared-kernel").IanaTimeZone;
      readonly title?: string;
      readonly blocks?: readonly PrescriptionBlock[];
      readonly createRevision?: boolean;
    },
  ): Promise<SessionPrescription> {
    f3ExpectedVersion(input.expectedVersion);
    const current = await repositories.sessionPrescriptions.get(
      f3Scope(input.workspaceId),
      input.sessionId,
    );
    if (current === null)
      throw new ApplicationError(
        "RESOURCE_NOT_FOUND",
        "Session prescription not found.",
      );
    await this.authorizeAthlete(
      repositories,
      input,
      current.athleteId,
      "mutate",
    );
    const plan = await repositories.trainingPlans.get(
      f3Scope(input.workspaceId),
      current.planId,
    );
    if (plan === null)
      throw new ApplicationError(
        "RESOURCE_NOT_FOUND",
        "Training plan not found.",
      );
    const phaseId =
      input.phaseId === undefined ? current.phaseId : input.phaseId;
    if (phaseId !== null) {
      const phase = await repositories.planPhases.get(
        f3Scope(input.workspaceId),
        phaseId,
      );
      if (
        phase === null ||
        phase.planId !== plan.id ||
        phase.archivedAt !== null
      )
        throw new ApplicationError(
          "RESOURCE_NOT_FOUND",
          "Plan phase not found.",
        );
      const scheduled = input.scheduledLocalDate ?? current.scheduledLocalDate;
      if (scheduled < phase.startsOn || scheduled > phase.endsOn)
        throw new ApplicationError(
          "DOMAIN_RULE_VIOLATION",
          "Session date must remain inside the phase dates.",
        );
    }
    const scheduled = input.scheduledLocalDate ?? current.scheduledLocalDate;
    if (scheduled < plan.startsOn || scheduled > plan.endsOn)
      throw new ApplicationError(
        "DOMAIN_RULE_VIOLATION",
        "Session date must remain inside the plan dates.",
      );
    let updated: SessionPrescription;
    try {
      updated = updateSessionPrescription(current, {
        ...(input.phaseId === undefined ? {} : { phaseId: input.phaseId }),
        ...(input.scheduledLocalDate === undefined
          ? {}
          : { scheduledLocalDate: input.scheduledLocalDate }),
        ...(input.timeZone === undefined ? {} : { timeZone: input.timeZone }),
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.blocks === undefined ? {} : { blocks: input.blocks }),
        ...(input.createRevision === undefined
          ? {}
          : { createRevision: input.createRevision }),
        updatedAt: input.occurredAt ?? f3Now(),
        updatedBy: input.principalId,
      });
    } catch (error) {
      return f3DomainError(error);
    }
    await this.assertSessionMovementReferences(
      repositories,
      input.workspaceId,
      updated.blocks,
    );
    const persisted = await repositories.sessionPrescriptions.updateExpected(
      f3Scope(input.workspaceId),
      updated,
      input.expectedVersion,
    );
    if (persisted === null)
      throw this.f3Conflict(
        input.sessionId,
        input.expectedVersion,
        "session prescription",
      );
    await repositories.audit.append(
      this.f3Audit(
        input,
        "session_prescription.updated",
        "SessionPrescription",
        current.id,
        current.version,
        updated.version,
        {
          planId: current.planId,
          status: updated.status,
          revision: updated.revision,
        },
      ),
    );
    await this.appendSessionContentAudits(
      repositories,
      input,
      current.id,
      current.planId,
      current.blocks,
      updated.blocks,
      current.version,
      updated.version,
    );
    return persisted;
  }

  async archiveSessionPrescription(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly sessionId: UUID;
      readonly expectedVersion: number;
    },
  ): Promise<SessionPrescription> {
    f3ExpectedVersion(input.expectedVersion);
    return this.persistence.transaction(async (repositories) => {
      const current = await repositories.sessionPrescriptions.get(
        f3Scope(input.workspaceId),
        input.sessionId,
      );
      if (current === null)
        throw new ApplicationError(
          "RESOURCE_NOT_FOUND",
          "Session prescription not found.",
        );
      await this.authorizeAthlete(
        repositories,
        input,
        current.athleteId,
        "mutate",
      );
      const archived = archiveSessionPrescription(
        current,
        input.occurredAt ?? f3Now(),
        input.principalId,
      );
      const persisted = await repositories.sessionPrescriptions.updateExpected(
        f3Scope(input.workspaceId),
        archived,
        input.expectedVersion,
      );
      if (persisted === null)
        throw this.f3Conflict(
          input.sessionId,
          input.expectedVersion,
          "session prescription",
        );
      if (persisted.version !== current.version)
        await repositories.audit.append(
          this.f3Audit(
            input,
            "session_prescription.archived",
            "SessionPrescription",
            current.id,
            current.version,
            persisted.version,
            {},
          ),
        );
      return persisted;
    }, transactionContext(input));
  }

  async publishTrainingPlan(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly planId: UUID;
      readonly expectedVersion: number;
      readonly idempotencyKey?: string;
    },
  ): Promise<TrainingPlan> {
    f3ExpectedVersion(input.expectedVersion);
    const requestHash = await f3Fingerprint({
      planId: input.planId,
      expectedVersion: input.expectedVersion,
    });
    return this.persistence.transaction(async (repositories) => {
      const current = await repositories.trainingPlans.get(
        f3Scope(input.workspaceId),
        input.planId,
      );
      if (current === null)
        throw new ApplicationError(
          "RESOURCE_NOT_FOUND",
          "Training plan not found.",
        );
      await this.authorizeAthlete(
        repositories,
        input,
        current.athleteId,
        "mutate",
      );
      if (input.idempotencyKey !== undefined) {
        const prior = await repositories.idempotency.find(
          input.workspaceId,
          input.principalId,
          "training-plan.publish",
          input.idempotencyKey,
        );
        if (prior !== null) {
          if (prior.requestHash !== requestHash)
            throw new ApplicationError(
              "IDEMPOTENCY_CONFLICT",
              "Idempotency key was already used for a different publication command.",
            );
          if (prior.outcome !== null) return prior.outcome as TrainingPlan;
          throw new ApplicationError(
            "IDEMPOTENCY_CONFLICT",
            "Idempotency key is already being processed.",
          );
        }
        const reserved = await repositories.idempotency.reserve({
          workspaceId: input.workspaceId,
          actorId: input.principalId,
          operation: "training-plan.publish",
          key: input.idempotencyKey,
          requestHash,
        });
        if (reserved !== null) {
          if (reserved.requestHash !== requestHash)
            throw new ApplicationError(
              "IDEMPOTENCY_CONFLICT",
              "Idempotency key was already used for a different publication command.",
            );
          if (reserved.outcome !== null)
            return reserved.outcome as TrainingPlan;
          throw new ApplicationError(
            "IDEMPOTENCY_CONFLICT",
            "Idempotency key is already being processed.",
          );
        }
      }
      const phases = await repositories.planPhases.listForPlan(
        f3Scope(input.workspaceId),
        current.id,
        false,
      );
      try {
        validatePlanPhaseHierarchy(phases, current);
      } catch (error) {
        return f3DomainError(error);
      }
      const sessions = await repositories.sessionPrescriptions.listForPlan(
        f3Scope(input.workspaceId),
        current.id,
        false,
      );
      for (const session of sessions) {
        try {
          validatePrescriptionBlocks(session.blocks);
          await this.assertSessionMovementReferences(
            repositories,
            input.workspaceId,
            session.blocks,
          );
          if (
            session.scheduledLocalDate < current.startsOn ||
            session.scheduledLocalDate > current.endsOn
          )
            throw new Error("Session date must remain inside the plan dates.");
          if (session.phaseId !== null) {
            const phase = phases.find(
              (candidate) => candidate.id === session.phaseId,
            );
            if (
              phase === undefined ||
              session.scheduledLocalDate < phase.startsOn ||
              session.scheduledLocalDate > phase.endsOn
            )
              throw new Error(
                "Session date must remain inside its phase dates.",
              );
          }
        } catch (error) {
          return f3DomainError(error);
        }
      }
      let publishedPlan: TrainingPlan;
      try {
        publishedPlan = publishTrainingPlan(
          current,
          input.occurredAt ?? f3Now(),
          input.principalId,
        );
      } catch (error) {
        return f3DomainError(error);
      }
      const persistedPlan = await repositories.trainingPlans.updateExpected(
        f3Scope(input.workspaceId),
        publishedPlan,
        input.expectedVersion,
      );
      if (persistedPlan === null)
        throw this.f3Conflict(
          input.planId,
          input.expectedVersion,
          "training plan",
        );
      const publishedSessions: SessionPrescription[] = [];
      for (const session of sessions) {
        if (session.status === "archived") continue;
        if (session.status === "published") {
          publishedSessions.push(session);
          continue;
        }
        const publishedSession = publishSessionPrescription(
          session,
          input.occurredAt ?? f3Now(),
          input.principalId,
        );
        const persistedSession =
          await repositories.sessionPrescriptions.updateExpected(
            f3Scope(input.workspaceId),
            publishedSession,
            session.version,
          );
        if (persistedSession === null)
          throw this.f3Conflict(
            session.id,
            session.version,
            "session prescription",
          );
        publishedSessions.push(persistedSession);
        await repositories.trainingDesignRevisions.insertSessionRevision({
          id: f3Id(),
          workspaceId: input.workspaceId,
          sessionId: persistedSession.id,
          revision: persistedSession.publishedRevision ?? 1,
          publishedAt:
            persistedSession.publishedAt ?? input.occurredAt ?? f3Now(),
          publishedBy: input.principalId,
          snapshot: persistedSession,
        });
        await repositories.audit.append(
          this.f3Audit(
            input,
            "session_prescription.published",
            "SessionPrescription",
            session.id,
            session.version,
            persistedSession.version,
            {
              planId: current.id,
              publishedRevision: persistedSession.publishedRevision,
            },
          ),
        );
        await repositories.audit.append(
          this.f3Audit(
            input,
            "published_revision.created",
            "SessionPrescriptionRevision",
            persistedSession.id,
            null,
            persistedSession.publishedRevision,
            {
              planId: current.id,
              revision: persistedSession.publishedRevision,
            },
          ),
        );
      }
      const publishedPlanWithPhases = { ...persistedPlan, phases };
      await repositories.trainingDesignRevisions.insertPlanRevision({
        id: f3Id(),
        workspaceId: input.workspaceId,
        planId: persistedPlan.id,
        revision: persistedPlan.publishedRevision ?? 1,
        publishedAt: persistedPlan.publishedAt ?? input.occurredAt ?? f3Now(),
        publishedBy: input.principalId,
        snapshot: {
          plan: publishedPlanWithPhases,
          goals: await this.goalsForPlan(
            repositories,
            input.workspaceId,
            persistedPlan,
          ),
          phases,
          sessions: publishedSessions,
        },
      });
      await repositories.audit.append(
        this.f3Audit(
          input,
          "training_plan.published",
          "TrainingPlan",
          current.id,
          current.version,
          persistedPlan.version,
          {
            publishedRevision: persistedPlan.publishedRevision,
            sessionCount: publishedSessions.length,
          },
        ),
      );
      await repositories.audit.append(
        this.f3Audit(
          input,
          "published_revision.created",
          "TrainingPlanRevision",
          persistedPlan.id,
          null,
          persistedPlan.publishedRevision,
          {
            revision: persistedPlan.publishedRevision,
          },
        ),
      );
      if (input.idempotencyKey !== undefined)
        await repositories.idempotency.complete(
          input.workspaceId,
          input.principalId,
          "training-plan.publish",
          input.idempotencyKey,
          persistedPlan,
        );
      return persistedPlan;
    }, transactionContext(input));
  }

  async listTrainingPlanRevisions(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly planId: UUID;
    },
  ): Promise<readonly TrainingPlanRevision[]> {
    return this.persistence.transaction(async (repositories) => {
      const plan = await this.requirePlanForRead(
        repositories,
        input,
        input.planId,
      );
      return repositories.trainingDesignRevisions.listForPlan(
        f3Scope(input.workspaceId),
        plan.id,
      );
    }, transactionContext(input));
  }

  async listSessionPrescriptionRevisions(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly sessionId: UUID;
    },
  ): Promise<readonly SessionPrescriptionRevision[]> {
    return this.persistence.transaction(async (repositories) => {
      const session = await repositories.sessionPrescriptions.get(
        f3Scope(input.workspaceId),
        input.sessionId,
      );
      if (session === null)
        throw new ApplicationError(
          "RESOURCE_NOT_FOUND",
          "Session prescription not found.",
        );
      await this.authorizeAthlete(
        repositories,
        input,
        session.athleteId,
        "read",
      );
      return repositories.trainingDesignRevisions.listForSession(
        f3Scope(input.workspaceId),
        session.id,
      );
    }, transactionContext(input));
  }

  private async requirePlanForRead(
    repositories: F3Repositories,
    input: CommandMetadata & { readonly workspaceId: WorkspaceId },
    planId: UUID,
  ): Promise<TrainingPlan> {
    const plan = await repositories.trainingPlans.get(
      f3Scope(input.workspaceId),
      planId,
    );
    if (plan === null)
      throw new ApplicationError(
        "RESOURCE_NOT_FOUND",
        "Training plan not found.",
      );
    const membership = await this.authorizeAthlete(
      repositories,
      input,
      plan.athleteId,
      "read",
    );
    if (membership.role === "athlete" && plan.status !== "published")
      throw new ApplicationError(
        "RESOURCE_NOT_FOUND",
        "Training plan not found.",
      );
    return plan;
  }

  private async requirePlanForMutation(
    repositories: F3Repositories,
    input: CommandMetadata & { readonly workspaceId: WorkspaceId },
    planId: UUID,
  ): Promise<TrainingPlan> {
    const plan = await repositories.trainingPlans.get(
      f3Scope(input.workspaceId),
      planId,
    );
    if (plan === null)
      throw new ApplicationError(
        "RESOURCE_NOT_FOUND",
        "Training plan not found.",
      );
    await this.authorizeAthlete(repositories, input, plan.athleteId, "mutate");
    return plan;
  }

  private async loadPlanDetails(
    repositories: F3Repositories,
    plan: TrainingPlan,
  ): Promise<TrainingPlanDetails> {
    const scope = f3Scope(plan.workspaceId);
    const goals = await this.goalsForPlan(repositories, plan.workspaceId, plan);
    const phases = await repositories.planPhases.listForPlan(
      scope,
      plan.id,
      true,
    );
    const sessions = await repositories.sessionPrescriptions.listForPlan(
      scope,
      plan.id,
      true,
    );
    const revisions = await repositories.trainingDesignRevisions.listForPlan(
      scope,
      plan.id,
    );
    validatePlanPhaseHierarchy(phases, plan);
    return { plan: { ...plan, phases }, goals, phases, sessions, revisions };
  }

  private async goalsForPlan(
    repositories: F3Repositories,
    workspaceId: WorkspaceId,
    plan: TrainingPlan,
  ): Promise<readonly TrainingGoal[]> {
    const goals: TrainingGoal[] = [];
    for (const goalId of plan.goalIds) {
      const goal = await repositories.trainingGoals.get(
        f3Scope(workspaceId),
        goalId,
      );
      if (goal !== null) goals.push(goal);
    }
    return goals;
  }

  private async assertGoalReferences(
    repositories: F3Repositories,
    workspaceId: WorkspaceId,
    athleteId: AthleteId,
    goalIds: readonly UUID[],
  ): Promise<void> {
    for (const goalId of new Set(goalIds)) {
      const goal = await repositories.trainingGoals.get(
        f3Scope(workspaceId),
        goalId,
      );
      if (
        goal === null ||
        goal.athleteId !== athleteId ||
        goal.workspaceId !== workspaceId
      ) {
        throw new ApplicationError(
          "DOMAIN_RULE_VIOLATION",
          "All training goal references must belong to the plan athlete and workspace.",
        );
      }
    }
  }

  private async assertSessionMovementReferences(
    repositories: F3Repositories,
    workspaceId: WorkspaceId,
    blocks: readonly PrescriptionBlock[],
  ): Promise<void> {
    const movementIds = new Set<UUID>();
    for (const block of blocks) {
      if (block.kind === "strength") {
        for (const exercise of block.exercises)
          movementIds.add(exercise.movementId);
      } else if (block.kind === "mobility") {
        for (const item of block.items) movementIds.add(item.movementId);
      }
    }
    for (const movementId of movementIds) {
      const movement = await repositories.movements.get(
        f3Scope(workspaceId),
        movementId,
      );
      if (movement === null)
        throw new ApplicationError(
          "RESOURCE_NOT_FOUND",
          "Movement definition not found in this workspace scope.",
        );
    }
  }

  private async appendSessionContentAudits(
    repositories: F3Repositories,
    input: CommandMetadata & { readonly workspaceId: WorkspaceId },
    sessionId: UUID,
    planId: UUID,
    beforeBlocks: readonly PrescriptionBlock[],
    afterBlocks: readonly PrescriptionBlock[],
    versionBefore: number | null,
    versionAfter: number | null,
  ): Promise<void> {
    const beforeHash = await f3Fingerprint(beforeBlocks);
    const afterHash = await f3Fingerprint(afterBlocks);
    if (beforeHash !== afterHash) {
      await repositories.audit.append(
        this.f3Audit(
          input,
          "block.composition_changed",
          "SessionPrescription",
          sessionId,
          versionBefore,
          versionAfter,
          { planId, beforeHash, afterHash },
        ),
      );
    }
    for (const kind of ["strength", "endurance", "mobility"] as const) {
      const beforeKind = beforeBlocks.filter((block) => block.kind === kind);
      const afterKind = afterBlocks.filter((block) => block.kind === kind);
      const kindBeforeHash = await f3Fingerprint(beforeKind);
      const kindAfterHash = await f3Fingerprint(afterKind);
      if (kindBeforeHash === kindAfterHash) continue;
      await repositories.audit.append(
        this.f3Audit(
          input,
          `${kind}_prescription.changed`,
          "SessionPrescription",
          sessionId,
          versionBefore,
          versionAfter,
          {
            planId,
            kind,
            beforeHash: kindBeforeHash,
            afterHash: kindAfterHash,
          },
        ),
      );
    }
  }

  private async authorizeWorkspace(
    repositories: F3Repositories,
    principalId: UUID,
    workspaceId: WorkspaceId,
    action: "training.read" | "training.design",
  ): Promise<WorkspaceMembership> {
    const membership = await repositories.memberships.get(
      f3Scope(workspaceId),
      principalId,
    );
    if (
      membership === null ||
      membership.status !== "active" ||
      !canAccessWorkspace(membership, action)
    ) {
      throw new ApplicationError(
        "FORBIDDEN",
        "You are not authorized for Training Design in this workspace.",
      );
    }
    return membership;
  }

  private async authorizeAthlete(
    repositories: F3Repositories,
    input: CommandMetadata & { readonly workspaceId: WorkspaceId },
    athleteId: AthleteId,
    operation: "read" | "mutate",
  ): Promise<WorkspaceMembership> {
    const membership = await this.authorizeWorkspace(
      repositories,
      input.principalId,
      input.workspaceId,
      operation === "mutate" ? "training.design" : "training.read",
    );
    const athlete = await repositories.athletes.get(
      f3Scope(input.workspaceId),
      athleteId,
    );
    if (athlete === null)
      throw new ApplicationError("RESOURCE_NOT_FOUND", "Athlete not found.");
    const assignments = await repositories.coachAssignments.listForAthlete(
      f3Scope(input.workspaceId),
      athleteId,
    );
    const assignedCoach = assignments.some(
      (assignment) => assignment.coachPrincipalId === input.principalId,
    );
    const allowed =
      membership.role === "owner" ||
      (membership.role === "coach" && assignedCoach) ||
      (operation === "read" && membership.role === "viewer") ||
      (operation === "read" &&
        membership.role === "athlete" &&
        athlete.linkedUserId === input.principalId);
    if (!allowed) {
      throw new ApplicationError(
        operation === "read" ? "RESOURCE_NOT_FOUND" : "FORBIDDEN",
        operation === "read"
          ? "Athlete not found."
          : "You are not authorized to author this athlete's training intent.",
      );
    }
    return membership;
  }

  private f3Conflict(
    resourceId: UUID,
    expectedVersion: number,
    resource: string,
  ): ApplicationError {
    return new ApplicationError(
      "CONCURRENCY_CONFLICT",
      `The ${resource} changed before this mutation could be applied.`,
      {
        resourceId,
        expectedVersion,
      },
    );
  }

  private f3Audit(
    input: CommandMetadata & { readonly workspaceId: WorkspaceId },
    action: string,
    aggregateType: string,
    aggregateId: UUID,
    versionBefore: number | null,
    versionAfter: number | null,
    payload: Readonly<Record<string, unknown>>,
  ): AuditEvent {
    return {
      id: f3Id(),
      occurredAt: input.occurredAt ?? f3Now(),
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

export function createF3Application(persistence: F3Persistence): F3Application {
  return new F3Application(persistence);
}
