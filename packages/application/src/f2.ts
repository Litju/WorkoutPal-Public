import type {
  DistanceDisplayUnit,
  MassDisplayUnit,
  PaceDisplayUnit,
  WorkspaceAction,
  WorkspaceMemberDetails,
  WorkspacePreferences,
  WorkspaceRole,
} from "@workoutpal/accounts";
import {
  canAccessAthlete,
  canAccessWorkspace,
  createWorkspace,
  createWorkspacePreferences,
  updateWorkspacePreferences as updateWorkspacePreferencesValue,
} from "@workoutpal/accounts";
import type {
  AthleteProfile,
  AthleteTrainingContext,
  CoachAssignment,
} from "@workoutpal/athletes";
import {
  archiveAthleteProfile,
  createAthleteProfile,
  createAthleteTrainingContext,
  createCoachAssignment,
  updateAthleteProfile,
  updateAthleteTrainingContext as updateAthleteTrainingContextValue,
} from "@workoutpal/athletes";
import type {
  ActorContext,
  AthleteId,
  Instant,
  UUID,
  WorkspaceId,
  WorkspaceScope,
} from "@workoutpal/shared-kernel";
import {
  ApplicationError,
  type AthleteListItem,
  type AuditEvent,
  type AuthorizedActor,
  type CommandMetadata,
  type F2Persistence,
  type F2Repositories,
  type PersistenceTransactionContext,
  type WorkspaceSummary,
} from "./contracts.js";

function now(): Instant {
  return new Date().toISOString() as Instant;
}

function newId(): UUID {
  return crypto.randomUUID() as UUID;
}

function scope(workspaceId: WorkspaceId): WorkspaceScope {
  return { workspaceId };
}

type TransactionAuthoritativeInput =
  | {
      readonly principalId: UUID;
      readonly workspaceId?: WorkspaceId;
    }
  | {
      readonly actor: Pick<ActorContext, "actorId" | "workspaceId">;
    };

function transactionContext(
  input: TransactionAuthoritativeInput,
): PersistenceTransactionContext {
  if ("actor" in input) {
    return {
      principalId: input.actor.actorId,
      workspaceId: input.actor.workspaceId,
    };
  }
  return {
    principalId: input.principalId,
    ...(input.workspaceId === undefined
      ? {}
      : { workspaceId: input.workspaceId }),
  };
}

function assertName(name: string): string {
  const normalized = name.trim();
  if (normalized.length < 2 || normalized.length > 120) {
    throw new ApplicationError(
      "VALIDATION_FAILED",
      "Name must be between 2 and 120 characters.",
    );
  }
  return normalized;
}

function assertExpectedVersion(
  expectedVersion: number,
  allowZero = false,
): void {
  if (
    !Number.isInteger(expectedVersion) ||
    (allowZero ? expectedVersion < 0 : expectedVersion < 1)
  ) {
    throw new ApplicationError(
      "VALIDATION_FAILED",
      `expectedVersion must be a ${allowZero ? "non-negative" : "positive"} integer.`,
    );
  }
}

function normalizePayload(payload: Readonly<Record<string, unknown>>): string {
  return JSON.stringify(payload, Object.keys(payload).sort());
}

async function fingerprint(
  payload: Readonly<Record<string, unknown>>,
): Promise<string> {
  const bytes = new TextEncoder().encode(normalizePayload(payload));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

function rethrowDomainError(error: unknown): never {
  if (error instanceof ApplicationError) throw error;
  if (error instanceof Error) {
    throw new ApplicationError("DOMAIN_RULE_VIOLATION", error.message);
  }
  throw error;
}

export class F2Application {
  constructor(private readonly persistence: F2Persistence) {}

  async createWorkspace(
    input: CommandMetadata & { readonly name: string },
  ): Promise<WorkspaceSummary> {
    const name = assertName(input.name);
    const occurredAt = input.occurredAt ?? now();
    const workspaceId = newId() as WorkspaceId;
    return this.persistence.transaction(
      async (repositories) => {
        const workspace = createWorkspace({
          id: workspaceId,
          name,
          createdAt: occurredAt,
          createdBy: input.principalId,
        });
        await repositories.workspaces.insert(workspace);
        await repositories.memberships.insert({
          id: newId(),
          workspaceId,
          principalId: input.principalId,
          role: "owner",
          status: "active",
        });
        await repositories.audit.append({
          id: newId(),
          occurredAt,
          workspaceId,
          actorId: input.principalId,
          actorType: "HUMAN",
          action: "workspace.created",
          aggregateType: "Workspace",
          aggregateId: workspaceId,
          versionBefore: null,
          versionAfter: workspace.version,
          requestId: input.requestId,
          payload: { name },
        });
        await repositories.audit.append({
          id: newId(),
          occurredAt,
          workspaceId,
          actorId: input.principalId,
          actorType: "HUMAN",
          action: "workspace.membership_created",
          aggregateType: "WorkspaceMembership",
          aggregateId: workspaceId,
          versionBefore: null,
          versionAfter: null,
          requestId: input.requestId,
          payload: { role: "owner" },
        });
        return {
          id: workspace.id,
          name: workspace.name,
          createdAt: workspace.createdAt,
        };
      },
      transactionContext({ ...input, workspaceId }),
    );
  }

  async listActorWorkspaces(
    input: CommandMetadata,
  ): Promise<readonly WorkspaceSummary[]> {
    return this.persistence.transaction(async (repositories) => {
      const memberships = await repositories.memberships.listForPrincipal(
        input.principalId,
      );
      const result: WorkspaceSummary[] = [];
      for (const membership of memberships) {
        if (membership.status !== "active") continue;
        const workspace = await repositories.workspaces.get(
          scope(membership.workspaceId),
        );
        if (workspace !== null) {
          result.push({
            id: workspace.id,
            name: workspace.name,
            createdAt: workspace.createdAt,
          });
        }
      }
      return result;
    }, transactionContext(input));
  }

  async getWorkspace(
    input: CommandMetadata & { readonly workspaceId: WorkspaceId },
  ): Promise<WorkspaceSummary> {
    return this.persistence.transaction(async (repositories) => {
      await this.authorize(
        repositories,
        input.principalId,
        input.workspaceId,
        "workspace.read",
      );
      const workspace = await repositories.workspaces.get(
        scope(input.workspaceId),
      );
      if (workspace === null)
        throw new ApplicationError("NOT_FOUND", "Workspace not found.");
      return {
        id: workspace.id,
        name: workspace.name,
        createdAt: workspace.createdAt,
      };
    }, transactionContext(input));
  }

  /**
   * Read-only authorization projection for server-owned integrations.  The
   * returned actor is derived from the membership repository, so callers do
   * not need to accept a role or workspace scope supplied by a model/client.
   */
  async getActorWorkspaceAccess(
    input: CommandMetadata & { readonly workspaceId: WorkspaceId },
  ): Promise<AuthorizedActor> {
    return this.persistence.transaction(
      (repositories) =>
        this.authorize(
          repositories,
          input.principalId,
          input.workspaceId,
          "workspace.read",
        ),
      transactionContext(input),
    );
  }

  async createAthlete(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly displayName: string;
      readonly linkedUserId?: UUID | null;
      readonly idempotencyKey?: string;
    },
  ): Promise<AthleteProfile> {
    const displayName = assertName(input.displayName);
    const normalized = {
      displayName,
      linkedUserId: input.linkedUserId ?? null,
    };
    const requestHash = await fingerprint(normalized);
    return this.persistence.transaction(async (repositories) => {
      const authorized = await this.authorize(
        repositories,
        input.principalId,
        input.workspaceId,
        "athlete.create",
      );
      if (input.idempotencyKey !== undefined) {
        const prior = await repositories.idempotency.find(
          input.workspaceId,
          input.principalId,
          "athlete.create",
          input.idempotencyKey,
        );
        if (prior !== null) {
          if (prior.requestHash !== requestHash) {
            throw new ApplicationError(
              "IDEMPOTENCY_CONFLICT",
              "Idempotency key was already used for a different request.",
            );
          }
          return prior.outcome as AthleteProfile;
        }
        const reserved = await repositories.idempotency.reserve({
          workspaceId: input.workspaceId,
          actorId: input.principalId,
          operation: "athlete.create",
          key: input.idempotencyKey,
          requestHash,
        });
        if (reserved !== null) {
          if (reserved.requestHash !== requestHash) {
            throw new ApplicationError(
              "IDEMPOTENCY_CONFLICT",
              "Idempotency key was already used for a different request.",
            );
          }
          if (reserved.outcome !== null)
            return reserved.outcome as AthleteProfile;
          throw new ApplicationError(
            "IDEMPOTENCY_CONFLICT",
            "Idempotency key is already being processed.",
          );
        }
      }

      const occurredAt = input.occurredAt ?? now();
      const profile = createAthleteProfile({
        id: newId() as AthleteId,
        workspaceId: input.workspaceId,
        displayName,
        ...(input.linkedUserId === undefined || input.linkedUserId === null
          ? {}
          : { linkedUserId: input.linkedUserId }),
        createdAt: occurredAt,
        createdBy: input.principalId,
      });
      await repositories.athletes.insert(profile);
      await repositories.audit.append(
        this.audit(
          input,
          "athlete.created",
          "AthleteProfile",
          profile.id,
          null,
          profile.version,
          {
            displayName: profile.displayName,
            linkedUserId: profile.linkedUserId,
          },
        ),
      );

      if (authorized.role === "coach") {
        const assignment = createCoachAssignment({
          id: newId(),
          workspaceId: input.workspaceId,
          athleteId: profile.id,
          coachPrincipalId: input.principalId,
          createdAt: occurredAt,
          createdBy: input.principalId,
        });
        await repositories.coachAssignments.insert(assignment);
        await repositories.audit.append(
          this.audit(
            input,
            "coach.assigned",
            "CoachAssignment",
            assignment.id,
            null,
            null,
            {
              athleteId: profile.id,
              coachPrincipalId: input.principalId,
            },
          ),
        );
      }
      if (input.idempotencyKey !== undefined) {
        await repositories.idempotency.complete(
          input.workspaceId,
          input.principalId,
          "athlete.create",
          input.idempotencyKey,
          profile,
        );
      }
      return profile;
    }, transactionContext(input));
  }

  async listAthletes(
    input: CommandMetadata & { readonly workspaceId: WorkspaceId },
  ): Promise<readonly AthleteListItem[]> {
    return this.persistence.transaction(async (repositories) => {
      const authorized = await this.authorize(
        repositories,
        input.principalId,
        input.workspaceId,
        "athlete.list",
      );
      const profiles = await repositories.athletes.list(
        scope(input.workspaceId),
        false,
      );
      const result: AthleteListItem[] = [];
      for (const profile of profiles) {
        const assignments = await repositories.coachAssignments.listForAthlete(
          scope(input.workspaceId),
          profile.id,
        );
        const subject = {
          workspaceId: profile.workspaceId,
          linkedUserId: profile.linkedUserId,
          assignedCoachIds: assignments.map(
            (assignment) => assignment.coachPrincipalId,
          ),
        };
        if (
          canAccessAthlete(
            authorized.membership,
            input.principalId,
            "athlete.list",
            subject,
          )
        ) {
          result.push({ ...profile, assignedCoachCount: assignments.length });
        }
      }
      return result;
    }, transactionContext(input));
  }

  async getAthlete(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly athleteId: AthleteId;
    },
  ): Promise<AthleteProfile> {
    return this.persistence.transaction(async (repositories) => {
      const authorized = await this.authorize(
        repositories,
        input.principalId,
        input.workspaceId,
        "athlete.read",
      );
      const profile = await repositories.athletes.get(
        scope(input.workspaceId),
        input.athleteId,
      );
      if (profile === null)
        throw new ApplicationError("NOT_FOUND", "Athlete not found.");
      const assignments = await repositories.coachAssignments.listForAthlete(
        scope(input.workspaceId),
        profile.id,
      );
      if (
        !canAccessAthlete(
          authorized.membership,
          input.principalId,
          "athlete.read",
          {
            workspaceId: profile.workspaceId,
            linkedUserId: profile.linkedUserId,
            assignedCoachIds: assignments.map(
              (assignment) => assignment.coachPrincipalId,
            ),
          },
        )
      ) {
        throw new ApplicationError("NOT_FOUND", "Athlete not found.");
      }
      return profile;
    }, transactionContext(input));
  }

  async updateAthlete(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly athleteId: AthleteId;
      readonly expectedVersion: number;
      readonly displayName?: string;
      readonly linkedUserId?: UUID | null;
    },
  ): Promise<AthleteProfile> {
    if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
      throw new ApplicationError(
        "VALIDATION_FAILED",
        "expectedVersion must be a positive integer.",
      );
    }
    return this.persistence.transaction(async (repositories) => {
      const authorized = await this.authorize(
        repositories,
        input.principalId,
        input.workspaceId,
        "athlete.update",
      );
      const profile = await repositories.athletes.get(
        scope(input.workspaceId),
        input.athleteId,
      );
      if (profile === null)
        throw new ApplicationError("NOT_FOUND", "Athlete not found.");
      const assignments = await repositories.coachAssignments.listForAthlete(
        scope(input.workspaceId),
        profile.id,
      );
      if (
        !canAccessAthlete(
          authorized.membership,
          input.principalId,
          "athlete.update",
          {
            workspaceId: profile.workspaceId,
            linkedUserId: profile.linkedUserId,
            assignedCoachIds: assignments.map(
              (assignment) => assignment.coachPrincipalId,
            ),
          },
        )
      ) {
        throw new ApplicationError(
          "FORBIDDEN",
          "You cannot update this athlete.",
        );
      }

      let updated: AthleteProfile;
      try {
        updated = updateAthleteProfile(profile, {
          ...(input.displayName === undefined
            ? {}
            : { displayName: assertName(input.displayName) }),
          ...(input.linkedUserId === undefined
            ? {}
            : { linkedUserId: input.linkedUserId }),
          updatedAt: input.occurredAt ?? now(),
          updatedBy: input.principalId,
        });
      } catch (error) {
        return rethrowDomainError(error);
      }
      const persisted = await repositories.athletes.updateExpected(
        scope(input.workspaceId),
        updated,
        input.expectedVersion,
      );
      if (persisted === null) {
        throw new ApplicationError(
          "VERSION_CONFLICT",
          "The athlete changed before this update could be applied.",
          {
            resourceId: input.athleteId,
            expectedVersion: input.expectedVersion,
          },
        );
      }
      await repositories.audit.append(
        this.audit(
          input,
          "athlete.updated",
          "AthleteProfile",
          updated.id,
          profile.version,
          updated.version,
          {
            displayName: updated.displayName,
            linkedUserId: updated.linkedUserId,
          },
        ),
      );
      return persisted;
    }, transactionContext(input));
  }

  async archiveAthlete(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly athleteId: AthleteId;
      readonly expectedVersion: number;
    },
  ): Promise<AthleteProfile> {
    if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
      throw new ApplicationError(
        "VALIDATION_FAILED",
        "expectedVersion must be a positive integer.",
      );
    }
    return this.persistence.transaction(async (repositories) => {
      const authorized = await this.authorize(
        repositories,
        input.principalId,
        input.workspaceId,
        "athlete.archive",
      );
      const profile = await repositories.athletes.get(
        scope(input.workspaceId),
        input.athleteId,
      );
      if (profile === null)
        throw new ApplicationError("NOT_FOUND", "Athlete not found.");
      const assignments = await repositories.coachAssignments.listForAthlete(
        scope(input.workspaceId),
        profile.id,
      );
      if (
        !canAccessAthlete(
          authorized.membership,
          input.principalId,
          "athlete.archive",
          {
            workspaceId: profile.workspaceId,
            linkedUserId: profile.linkedUserId,
            assignedCoachIds: assignments.map(
              (assignment) => assignment.coachPrincipalId,
            ),
          },
        )
      ) {
        throw new ApplicationError(
          "FORBIDDEN",
          "You cannot archive this athlete.",
        );
      }
      if (profile.archivedAt !== null) {
        if (profile.version !== input.expectedVersion) {
          throw new ApplicationError(
            "VERSION_CONFLICT",
            "The athlete changed before it could be archived.",
            {
              resourceId: input.athleteId,
              expectedVersion: input.expectedVersion,
            },
          );
        }
        return profile;
      }
      const archived = archiveAthleteProfile(
        profile,
        input.occurredAt ?? now(),
        input.principalId,
      );
      const persisted = await repositories.athletes.updateExpected(
        scope(input.workspaceId),
        archived,
        input.expectedVersion,
      );
      if (persisted === null) {
        throw new ApplicationError(
          "VERSION_CONFLICT",
          "The athlete changed before it could be archived.",
          {
            resourceId: input.athleteId,
            expectedVersion: input.expectedVersion,
          },
        );
      }
      await repositories.audit.append(
        this.audit(
          input,
          "athlete.archived",
          "AthleteProfile",
          archived.id,
          profile.version,
          archived.version,
          {},
        ),
      );
      return persisted;
    }, transactionContext(input));
  }

  async listCoachAssignments(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly athleteId: AthleteId;
    },
  ): Promise<readonly CoachAssignment[]> {
    return this.persistence.transaction(async (repositories) => {
      const authorized = await this.authorize(
        repositories,
        input.principalId,
        input.workspaceId,
        "athlete.read",
      );
      const profile = await repositories.athletes.get(
        scope(input.workspaceId),
        input.athleteId,
      );
      if (profile === null)
        throw new ApplicationError("NOT_FOUND", "Athlete not found.");
      const assignments = await repositories.coachAssignments.listForAthlete(
        scope(input.workspaceId),
        input.athleteId,
      );
      if (
        !canAccessAthlete(
          authorized.membership,
          input.principalId,
          "athlete.read",
          {
            workspaceId: profile.workspaceId,
            linkedUserId: profile.linkedUserId,
            assignedCoachIds: assignments.map(
              (assignment) => assignment.coachPrincipalId,
            ),
          },
        )
      ) {
        throw new ApplicationError("NOT_FOUND", "Athlete not found.");
      }
      return assignments;
    }, transactionContext(input));
  }

  async assignCoach(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly athleteId: AthleteId;
      readonly coachPrincipalId: UUID;
    },
  ): Promise<CoachAssignment> {
    return this.persistence.transaction(async (repositories) => {
      await this.authorize(
        repositories,
        input.principalId,
        input.workspaceId,
        "coach-assignment.manage",
      );
      const profile = await repositories.athletes.get(
        scope(input.workspaceId),
        input.athleteId,
      );
      if (profile === null)
        throw new ApplicationError("NOT_FOUND", "Athlete not found.");
      const coach = await repositories.memberships.get(
        scope(input.workspaceId),
        input.coachPrincipalId,
      );
      if (
        coach === null ||
        coach.status !== "active" ||
        coach.role !== "coach"
      ) {
        throw new ApplicationError(
          "VALIDATION_FAILED",
          "The selected principal is not an active coach in this workspace.",
        );
      }
      if (
        await repositories.coachAssignments.exists(
          scope(input.workspaceId),
          input.athleteId,
          input.coachPrincipalId,
        )
      ) {
        throw new ApplicationError(
          "DOMAIN_RULE_VIOLATION",
          "Coach is already assigned to this athlete.",
        );
      }
      const assignment = createCoachAssignment({
        id: newId(),
        workspaceId: input.workspaceId,
        athleteId: input.athleteId,
        coachPrincipalId: input.coachPrincipalId,
        createdAt: input.occurredAt ?? now(),
        createdBy: input.principalId,
      });
      await repositories.coachAssignments.insert(assignment);
      await repositories.audit.append(
        this.audit(
          input,
          "coach.assigned",
          "CoachAssignment",
          assignment.id,
          null,
          null,
          {
            athleteId: input.athleteId,
            coachPrincipalId: input.coachPrincipalId,
          },
        ),
      );
      return assignment;
    }, transactionContext(input));
  }

  async removeCoachAssignment(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly athleteId: AthleteId;
      readonly coachPrincipalId: UUID;
    },
  ): Promise<void> {
    return this.persistence.transaction(async (repositories) => {
      await this.authorize(
        repositories,
        input.principalId,
        input.workspaceId,
        "coach-assignment.manage",
      );
      const removed = await repositories.coachAssignments.remove(
        scope(input.workspaceId),
        input.athleteId,
        input.coachPrincipalId,
      );
      if (!removed)
        throw new ApplicationError("NOT_FOUND", "Coach assignment not found.");
      await repositories.audit.append(
        this.audit(
          input,
          "coach.removed",
          "CoachAssignment",
          input.athleteId,
          null,
          null,
          {
            athleteId: input.athleteId,
            coachPrincipalId: input.coachPrincipalId,
          },
        ),
      );
    }, transactionContext(input));
  }

  async getAthleteTrainingContext(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly athleteId: AthleteId;
    },
  ): Promise<AthleteTrainingContext | null> {
    return this.persistence.transaction(async (repositories) => {
      const authorized = await this.authorize(
        repositories,
        input.principalId,
        input.workspaceId,
        "athlete.read",
      );
      const profile = await repositories.athletes.get(
        scope(input.workspaceId),
        input.athleteId,
      );
      if (profile === null)
        throw new ApplicationError("NOT_FOUND", "Athlete not found.");
      const assignments = await repositories.coachAssignments.listForAthlete(
        scope(input.workspaceId),
        profile.id,
      );
      if (
        !canAccessAthlete(
          authorized.membership,
          input.principalId,
          "athlete.read",
          {
            workspaceId: profile.workspaceId,
            linkedUserId: profile.linkedUserId,
            assignedCoachIds: assignments.map(
              (assignment) => assignment.coachPrincipalId,
            ),
          },
        )
      ) {
        throw new ApplicationError("NOT_FOUND", "Athlete not found.");
      }
      return repositories.athleteTrainingContexts.get(
        scope(input.workspaceId),
        input.athleteId,
      );
    }, transactionContext(input));
  }

  async updateAthleteTrainingContext(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly athleteId: AthleteId;
      readonly expectedVersion: number;
      readonly trainingAgeMonths?: number | null;
      readonly availabilityNotes?: string | null;
      readonly operationalConstraints?: string | null;
      readonly equipmentAccess?: readonly string[];
      readonly trainingPreferences?: string | null;
      readonly practitionerNotes?: string | null;
      readonly idempotencyKey?: string;
    },
  ): Promise<AthleteTrainingContext> {
    assertExpectedVersion(input.expectedVersion, true);
    const requestHash = await fingerprint({
      workspaceId: input.workspaceId,
      athleteId: input.athleteId,
      expectedVersion: input.expectedVersion,
      trainingAgeMonths: input.trainingAgeMonths ?? null,
      availabilityNotes: input.availabilityNotes ?? null,
      operationalConstraints: input.operationalConstraints ?? null,
      equipmentAccess: input.equipmentAccess ?? null,
      trainingPreferences: input.trainingPreferences ?? null,
      practitionerNotes: input.practitionerNotes ?? null,
    });
    return this.persistence.transaction(async (repositories) => {
      const authorized = await this.authorize(
        repositories,
        input.principalId,
        input.workspaceId,
        "athlete.update",
      );
      const profile = await repositories.athletes.get(
        scope(input.workspaceId),
        input.athleteId,
      );
      if (profile === null)
        throw new ApplicationError("NOT_FOUND", "Athlete not found.");
      const assignments = await repositories.coachAssignments.listForAthlete(
        scope(input.workspaceId),
        profile.id,
      );
      if (
        !canAccessAthlete(
          authorized.membership,
          input.principalId,
          "athlete.update",
          {
            workspaceId: profile.workspaceId,
            linkedUserId: profile.linkedUserId,
            assignedCoachIds: assignments.map(
              (assignment) => assignment.coachPrincipalId,
            ),
          },
        )
      ) {
        throw new ApplicationError(
          "FORBIDDEN",
          "You cannot update this athlete's operational context.",
        );
      }
      if (input.idempotencyKey !== undefined) {
        const prior = await repositories.idempotency.find(
          input.workspaceId,
          input.principalId,
          "athlete.training_context.update",
          input.idempotencyKey,
        );
        if (prior !== null) {
          if (prior.requestHash !== requestHash)
            throw new ApplicationError(
              "IDEMPOTENCY_CONFLICT",
              "Idempotency key was already used for a different request.",
            );
          if (prior.outcome !== null)
            return prior.outcome as AthleteTrainingContext;
          throw new ApplicationError(
            "IDEMPOTENCY_CONFLICT",
            "Idempotency key is already being processed.",
          );
        }
        const reserved = await repositories.idempotency.reserve({
          workspaceId: input.workspaceId,
          actorId: input.principalId,
          operation: "athlete.training_context.update",
          key: input.idempotencyKey,
          requestHash,
        });
        if (reserved !== null) {
          if (reserved.requestHash !== requestHash)
            throw new ApplicationError(
              "IDEMPOTENCY_CONFLICT",
              "Idempotency key was already used for a different request.",
            );
          if (reserved.outcome !== null)
            return reserved.outcome as AthleteTrainingContext;
          throw new ApplicationError(
            "IDEMPOTENCY_CONFLICT",
            "Idempotency key is already being processed.",
          );
        }
      }

      const current = await repositories.athleteTrainingContexts.get(
        scope(input.workspaceId),
        input.athleteId,
      );
      const occurredAt = input.occurredAt ?? now();
      let persisted: AthleteTrainingContext;
      let action: string;
      let versionBefore: number | null;
      if (current === null) {
        if (input.expectedVersion !== 0) {
          throw new ApplicationError(
            "VERSION_CONFLICT",
            "The athlete has no operational context at the requested version.",
          );
        }
        const created = createAthleteTrainingContext({
          id: newId(),
          workspaceId: input.workspaceId,
          athleteId: input.athleteId,
          ...(input.trainingAgeMonths === undefined
            ? {}
            : { trainingAgeMonths: input.trainingAgeMonths }),
          ...(input.availabilityNotes === undefined
            ? {}
            : { availabilityNotes: input.availabilityNotes }),
          ...(input.operationalConstraints === undefined
            ? {}
            : { operationalConstraints: input.operationalConstraints }),
          ...(input.equipmentAccess === undefined
            ? {}
            : { equipmentAccess: input.equipmentAccess }),
          ...(input.trainingPreferences === undefined
            ? {}
            : { trainingPreferences: input.trainingPreferences }),
          ...(input.practitionerNotes === undefined
            ? {}
            : { practitionerNotes: input.practitionerNotes }),
          createdAt: occurredAt,
          createdBy: input.principalId,
        });
        await repositories.athleteTrainingContexts.insert(created);
        persisted = created;
        action = "athlete_training_context.created";
        versionBefore = null;
      } else {
        if (input.expectedVersion < 1) {
          throw new ApplicationError(
            "VERSION_CONFLICT",
            "The athlete operational context already exists.",
          );
        }
        let updated: AthleteTrainingContext;
        try {
          updated = updateAthleteTrainingContextValue(current, {
            ...(input.trainingAgeMonths === undefined
              ? {}
              : { trainingAgeMonths: input.trainingAgeMonths }),
            ...(input.availabilityNotes === undefined
              ? {}
              : { availabilityNotes: input.availabilityNotes }),
            ...(input.operationalConstraints === undefined
              ? {}
              : { operationalConstraints: input.operationalConstraints }),
            ...(input.equipmentAccess === undefined
              ? {}
              : { equipmentAccess: input.equipmentAccess }),
            ...(input.trainingPreferences === undefined
              ? {}
              : { trainingPreferences: input.trainingPreferences }),
            ...(input.practitionerNotes === undefined
              ? {}
              : { practitionerNotes: input.practitionerNotes }),
            updatedAt: occurredAt,
            updatedBy: input.principalId,
          });
        } catch (error) {
          return rethrowDomainError(error);
        }
        const updatedResult =
          await repositories.athleteTrainingContexts.updateExpected(
            scope(input.workspaceId),
            updated,
            input.expectedVersion,
          );
        if (updatedResult === null)
          throw new ApplicationError(
            "VERSION_CONFLICT",
            "The athlete operational context changed before this update.",
            {
              resourceId: input.athleteId,
              expectedVersion: input.expectedVersion,
            },
          );
        persisted = updatedResult;
        action = "athlete_training_context.updated";
        versionBefore = current.version;
      }
      await repositories.audit.append(
        this.audit(
          input,
          action,
          "AthleteTrainingContext",
          persisted.id,
          versionBefore,
          persisted.version,
          {
            athleteId: persisted.athleteId,
            trainingAgeMonths: persisted.trainingAgeMonths,
            equipmentAccess: persisted.equipmentAccess,
          },
        ),
      );
      if (input.idempotencyKey !== undefined) {
        await repositories.idempotency.complete(
          input.workspaceId,
          input.principalId,
          "athlete.training_context.update",
          input.idempotencyKey,
          persisted,
        );
      }
      return persisted;
    }, transactionContext(input));
  }

  async listWorkspaceMembers(
    input: CommandMetadata & { readonly workspaceId: WorkspaceId },
  ): Promise<readonly WorkspaceMemberDetails[]> {
    return this.persistence.transaction(async (repositories) => {
      await this.authorize(
        repositories,
        input.principalId,
        input.workspaceId,
        "workspace.read",
      );
      return repositories.workspaceSettings.listMembers(
        scope(input.workspaceId),
      );
    }, transactionContext(input));
  }

  async updateWorkspaceMemberRole(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly memberId: UUID;
      readonly role: WorkspaceRole;
      readonly idempotencyKey?: string;
    },
  ): Promise<WorkspaceMemberDetails> {
    const requestHash = await fingerprint({
      workspaceId: input.workspaceId,
      memberId: input.memberId,
      role: input.role,
    });
    return this.persistence.transaction(async (repositories) => {
      await this.authorize(
        repositories,
        input.principalId,
        input.workspaceId,
        "workspace.manage",
      );
      const members = await repositories.workspaceSettings.listMembers(
        scope(input.workspaceId),
      );
      const target = members.find((member) => member.id === input.memberId);
      if (target === undefined)
        throw new ApplicationError("NOT_FOUND", "Workspace member not found.");
      if (target.principalId === input.principalId && input.role !== "owner") {
        throw new ApplicationError(
          "FORBIDDEN",
          "You cannot remove your own owner access.",
        );
      }
      if (
        target.role === "owner" &&
        input.role !== "owner" &&
        members.filter(
          (member) => member.role === "owner" && member.status === "active",
        ).length <= 1
      ) {
        throw new ApplicationError(
          "DOMAIN_RULE_VIOLATION",
          "A workspace must retain at least one active owner.",
        );
      }
      if (input.idempotencyKey !== undefined) {
        const prior = await repositories.idempotency.find(
          input.workspaceId,
          input.principalId,
          "workspace.member.role.update",
          input.idempotencyKey,
        );
        if (prior !== null) {
          if (prior.requestHash !== requestHash)
            throw new ApplicationError(
              "IDEMPOTENCY_CONFLICT",
              "Idempotency key was already used for a different request.",
            );
          if (prior.outcome !== null)
            return prior.outcome as WorkspaceMemberDetails;
          throw new ApplicationError(
            "IDEMPOTENCY_CONFLICT",
            "Idempotency key is already being processed.",
          );
        }
        const reserved = await repositories.idempotency.reserve({
          workspaceId: input.workspaceId,
          actorId: input.principalId,
          operation: "workspace.member.role.update",
          key: input.idempotencyKey,
          requestHash,
        });
        if (reserved !== null) {
          if (reserved.requestHash !== requestHash)
            throw new ApplicationError(
              "IDEMPOTENCY_CONFLICT",
              "Idempotency key was already used for a different request.",
            );
          if (reserved.outcome !== null)
            return reserved.outcome as WorkspaceMemberDetails;
          throw new ApplicationError(
            "IDEMPOTENCY_CONFLICT",
            "Idempotency key is already being processed.",
          );
        }
      }
      const updated = await repositories.workspaceSettings.updateMemberRole(
        scope(input.workspaceId),
        input.memberId,
        input.role,
      );
      if (updated === null)
        throw new ApplicationError("NOT_FOUND", "Workspace member not found.");
      const result = {
        ...target,
        ...updated,
      } satisfies WorkspaceMemberDetails;
      if (target.role !== updated.role) {
        await repositories.audit.append(
          this.audit(
            input,
            "workspace.member_role_updated",
            "WorkspaceMembership",
            updated.id,
            null,
            null,
            { principalId: updated.principalId, role: updated.role },
          ),
        );
      }
      if (input.idempotencyKey !== undefined) {
        await repositories.idempotency.complete(
          input.workspaceId,
          input.principalId,
          "workspace.member.role.update",
          input.idempotencyKey,
          result,
        );
      }
      return result;
    }, transactionContext(input));
  }

  async suspendWorkspaceMember(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly memberId: UUID;
      readonly idempotencyKey?: string;
    },
  ): Promise<WorkspaceMemberDetails> {
    const requestHash = await fingerprint({
      workspaceId: input.workspaceId,
      memberId: input.memberId,
    });
    return this.persistence.transaction(async (repositories) => {
      await this.authorize(
        repositories,
        input.principalId,
        input.workspaceId,
        "workspace.manage",
      );
      const members = await repositories.workspaceSettings.listMembers(
        scope(input.workspaceId),
      );
      const target = members.find((member) => member.id === input.memberId);
      if (target === undefined)
        throw new ApplicationError("NOT_FOUND", "Workspace member not found.");
      if (target.principalId === input.principalId)
        throw new ApplicationError(
          "FORBIDDEN",
          "You cannot suspend your own workspace membership.",
        );
      if (
        target.status === "active" &&
        target.role === "owner" &&
        members.filter(
          (member) => member.role === "owner" && member.status === "active",
        ).length <= 1
      ) {
        throw new ApplicationError(
          "DOMAIN_RULE_VIOLATION",
          "A workspace must retain at least one active owner.",
        );
      }
      if (target.status === "suspended") return target;
      if (input.idempotencyKey !== undefined) {
        const prior = await repositories.idempotency.find(
          input.workspaceId,
          input.principalId,
          "workspace.member.suspend",
          input.idempotencyKey,
        );
        if (prior !== null) {
          if (prior.requestHash !== requestHash)
            throw new ApplicationError(
              "IDEMPOTENCY_CONFLICT",
              "Idempotency key was already used for a different request.",
            );
          if (prior.outcome !== null)
            return prior.outcome as WorkspaceMemberDetails;
          throw new ApplicationError(
            "IDEMPOTENCY_CONFLICT",
            "Idempotency key is already being processed.",
          );
        }
        const reserved = await repositories.idempotency.reserve({
          workspaceId: input.workspaceId,
          actorId: input.principalId,
          operation: "workspace.member.suspend",
          key: input.idempotencyKey,
          requestHash,
        });
        if (reserved !== null) {
          if (reserved.requestHash !== requestHash)
            throw new ApplicationError(
              "IDEMPOTENCY_CONFLICT",
              "Idempotency key was already used for a different request.",
            );
          if (reserved.outcome !== null)
            return reserved.outcome as WorkspaceMemberDetails;
          throw new ApplicationError(
            "IDEMPOTENCY_CONFLICT",
            "Idempotency key is already being processed.",
          );
        }
      }
      const suspended = await repositories.workspaceSettings.suspendMember(
        scope(input.workspaceId),
        input.memberId,
      );
      if (suspended === null)
        throw new ApplicationError("NOT_FOUND", "Workspace member not found.");
      const result = {
        ...target,
        ...suspended,
      } satisfies WorkspaceMemberDetails;
      await repositories.audit.append(
        this.audit(
          input,
          "workspace.member_suspended",
          "WorkspaceMembership",
          suspended.id,
          null,
          null,
          { principalId: suspended.principalId },
        ),
      );
      if (input.idempotencyKey !== undefined) {
        await repositories.idempotency.complete(
          input.workspaceId,
          input.principalId,
          "workspace.member.suspend",
          input.idempotencyKey,
          result,
        );
      }
      return result;
    }, transactionContext(input));
  }

  async getWorkspacePreferences(
    input: CommandMetadata & { readonly workspaceId: WorkspaceId },
  ): Promise<WorkspacePreferences | null> {
    return this.persistence.transaction(async (repositories) => {
      await this.authorize(
        repositories,
        input.principalId,
        input.workspaceId,
        "workspace.read",
      );
      return repositories.workspaceSettings.getPreferences(
        scope(input.workspaceId),
      );
    }, transactionContext(input));
  }

  async updateWorkspacePreferences(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly expectedVersion: number;
      readonly massUnit?: MassDisplayUnit;
      readonly distanceUnit?: DistanceDisplayUnit;
      readonly paceUnit?: PaceDisplayUnit;
      readonly idempotencyKey?: string;
    },
  ): Promise<WorkspacePreferences> {
    assertExpectedVersion(input.expectedVersion, true);
    const requestHash = await fingerprint({
      workspaceId: input.workspaceId,
      expectedVersion: input.expectedVersion,
      massUnit: input.massUnit ?? null,
      distanceUnit: input.distanceUnit ?? null,
      paceUnit: input.paceUnit ?? null,
    });
    return this.persistence.transaction(async (repositories) => {
      await this.authorize(
        repositories,
        input.principalId,
        input.workspaceId,
        "workspace.manage",
      );
      if (input.idempotencyKey !== undefined) {
        const prior = await repositories.idempotency.find(
          input.workspaceId,
          input.principalId,
          "workspace.preferences.update",
          input.idempotencyKey,
        );
        if (prior !== null) {
          if (prior.requestHash !== requestHash)
            throw new ApplicationError(
              "IDEMPOTENCY_CONFLICT",
              "Idempotency key was already used for a different request.",
            );
          if (prior.outcome !== null)
            return prior.outcome as WorkspacePreferences;
          throw new ApplicationError(
            "IDEMPOTENCY_CONFLICT",
            "Idempotency key is already being processed.",
          );
        }
        const reserved = await repositories.idempotency.reserve({
          workspaceId: input.workspaceId,
          actorId: input.principalId,
          operation: "workspace.preferences.update",
          key: input.idempotencyKey,
          requestHash,
        });
        if (reserved !== null) {
          if (reserved.requestHash !== requestHash)
            throw new ApplicationError(
              "IDEMPOTENCY_CONFLICT",
              "Idempotency key was already used for a different request.",
            );
          if (reserved.outcome !== null)
            return reserved.outcome as WorkspacePreferences;
          throw new ApplicationError(
            "IDEMPOTENCY_CONFLICT",
            "Idempotency key is already being processed.",
          );
        }
      }
      const current = await repositories.workspaceSettings.getPreferences(
        scope(input.workspaceId),
      );
      const occurredAt = input.occurredAt ?? now();
      let persisted: WorkspacePreferences;
      let versionBefore: number | null;
      if (current === null) {
        if (input.expectedVersion !== 0)
          throw new ApplicationError(
            "VERSION_CONFLICT",
            "Workspace preferences do not exist at the requested version.",
          );
        persisted = createWorkspacePreferences({
          id: newId(),
          workspaceId: input.workspaceId,
          ...(input.massUnit === undefined ? {} : { massUnit: input.massUnit }),
          ...(input.distanceUnit === undefined
            ? {}
            : { distanceUnit: input.distanceUnit }),
          ...(input.paceUnit === undefined ? {} : { paceUnit: input.paceUnit }),
          createdAt: occurredAt,
          createdBy: input.principalId,
        });
        await repositories.workspaceSettings.insertPreferences(persisted);
        versionBefore = null;
      } else {
        if (input.expectedVersion < 1)
          throw new ApplicationError(
            "VERSION_CONFLICT",
            "Workspace preferences already exist.",
          );
        const updated = updateWorkspacePreferencesValue(current, {
          ...(input.massUnit === undefined ? {} : { massUnit: input.massUnit }),
          ...(input.distanceUnit === undefined
            ? {}
            : { distanceUnit: input.distanceUnit }),
          ...(input.paceUnit === undefined ? {} : { paceUnit: input.paceUnit }),
          updatedAt: occurredAt,
          updatedBy: input.principalId,
        });
        const updatedResult =
          await repositories.workspaceSettings.updatePreferencesExpected(
            scope(input.workspaceId),
            updated,
            input.expectedVersion,
          );
        if (updatedResult === null)
          throw new ApplicationError(
            "VERSION_CONFLICT",
            "Workspace preferences changed before this update.",
            { expectedVersion: input.expectedVersion },
          );
        persisted = updatedResult;
        versionBefore = current.version;
      }
      await repositories.audit.append(
        this.audit(
          input,
          "workspace.preferences.updated",
          "WorkspacePreferences",
          persisted.id,
          versionBefore,
          persisted.version,
          {
            massUnit: persisted.massUnit,
            distanceUnit: persisted.distanceUnit,
            paceUnit: persisted.paceUnit,
          },
        ),
      );
      if (input.idempotencyKey !== undefined) {
        await repositories.idempotency.complete(
          input.workspaceId,
          input.principalId,
          "workspace.preferences.update",
          input.idempotencyKey,
          persisted,
        );
      }
      return persisted;
    }, transactionContext(input));
  }

  async listAudit(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly aggregateId?: UUID;
    },
  ): Promise<readonly AuditEvent[]> {
    return this.persistence.transaction(async (repositories) => {
      await this.authorize(
        repositories,
        input.principalId,
        input.workspaceId,
        "workspace.read",
      );
      return repositories.audit.list(
        scope(input.workspaceId),
        input.aggregateId,
      );
    }, transactionContext(input));
  }

  private async authorize(
    repositories: F2Repositories,
    principalId: UUID,
    workspaceId: WorkspaceId,
    action: WorkspaceAction,
  ): Promise<AuthorizedActor> {
    const membership = await repositories.memberships.get(
      scope(workspaceId),
      principalId,
    );
    if (membership === null || membership.status !== "active") {
      throw new ApplicationError(
        "FORBIDDEN",
        "You are not an active member of this workspace.",
      );
    }
    if (!canAccessWorkspace(membership, action)) {
      throw new ApplicationError(
        "FORBIDDEN",
        "Your workspace role cannot perform this action.",
      );
    }
    return {
      principalId,
      role: membership.role,
      membership,
      actor: { actorId: principalId, workspaceId, actorType: "HUMAN" },
    };
  }

  private audit(
    input: CommandMetadata & { readonly workspaceId: WorkspaceId },
    action: string,
    aggregateType: string,
    aggregateId: UUID,
    versionBefore: number | null,
    versionAfter: number | null,
    payload: Readonly<Record<string, unknown>>,
  ): AuditEvent {
    return {
      id: newId(),
      occurredAt: input.occurredAt ?? now(),
      workspaceId: input.workspaceId,
      actorId: input.principalId,
      actorType: "HUMAN",
      action,
      aggregateType,
      aggregateId,
      versionBefore,
      versionAfter,
      requestId: input.requestId,
      payload:
        input.agentAudit === undefined
          ? payload
          : {
              ...payload,
              origin: "AGENT_APPROVED_PROPOSAL",
              proposalId: input.agentAudit.proposalId,
              approvalId: input.agentAudit.approvalId,
              agentSessionId: input.agentAudit.agentSessionId,
              requestedBy: input.principalId,
              approvedBy: input.agentAudit.approvedBy,
              executedBy: input.principalId,
            },
    };
  }
}

export function createF2Application(persistence: F2Persistence): F2Application {
  return new F2Application(persistence);
}
