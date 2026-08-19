import { canAccessWorkspace } from "@workoutpal/accounts";
import type {
  EnduranceSegmentComparison,
  MobilityItemComparison,
  MonitoringOverview,
  MonitoringProjectionInput,
  MonitoringWindow,
  SessionMonitoringView,
  StrengthSetComparison,
} from "@workoutpal/monitoring";
import {
  projectSessionMonitoring,
  summarizeMonitoringViews,
} from "@workoutpal/monitoring";
import type {
  AthleteId,
  Instant,
  LocalDate,
  UUID,
  WorkspaceId,
  WorkspaceScope,
} from "@workoutpal/shared-kernel";
import type { SessionPrescription } from "@workoutpal/training-design";
import type {
  ExecutedSession,
  ExecutionAmendment,
  PerformedEnduranceSegment,
  PerformedMobilityItem,
  PerformedStrengthSet,
  SessionObservation,
} from "@workoutpal/training-execution";
import { transactionContext } from "./application-shared.js";
import {
  ApplicationError,
  type CommandMetadata,
  type F4Persistence,
  type F4Repositories,
} from "./contracts.js";

export interface MonitoringAthleteQuery extends CommandMetadata {
  readonly workspaceId: WorkspaceId;
  readonly athleteId: AthleteId;
  readonly startDate: LocalDate;
  readonly endDate: LocalDate;
  readonly timeZone: import("@workoutpal/shared-kernel").IanaTimeZone;
}

export interface MonitoringSessionQuery extends CommandMetadata {
  readonly workspaceId: WorkspaceId;
  readonly executionId: UUID;
}

interface F5ExecutionFacts {
  readonly strengthSets: ReadonlyMap<UUID, readonly PerformedStrengthSet[]>;
  readonly enduranceSegments: ReadonlyMap<
    UUID,
    readonly PerformedEnduranceSegment[]
  >;
  readonly mobilityItems: ReadonlyMap<UUID, readonly PerformedMobilityItem[]>;
  readonly observations: ReadonlyMap<UUID, readonly SessionObservation[]>;
  readonly amendments: ReadonlyMap<UUID, readonly ExecutionAmendment[]>;
}

function f5Scope(workspaceId: WorkspaceId): WorkspaceScope {
  return { workspaceId };
}

function f5LocalDateForInstant(
  instant: Instant,
  timeZone: import("@workoutpal/shared-kernel").IanaTimeZone,
): LocalDate {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(instant));
  const values = new Map(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}` as LocalDate;
}

function f5AddDays(value: LocalDate, days: number): LocalDate {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10) as LocalDate;
}

function f5InWindow(value: LocalDate, query: MonitoringAthleteQuery): boolean {
  return value >= query.startDate && value <= query.endDate;
}

export class F5Application {
  constructor(private readonly persistence: F4Persistence) {}

  async getAthleteMonitoringOverview(
    input: MonitoringAthleteQuery,
  ): Promise<MonitoringOverview> {
    return this.persistence.transaction(async (repositories) => {
      await this.authorizeAthlete(repositories, input, input.athleteId);
      const scope = f5Scope(input.workspaceId);
      const movementNames = new Map(
        (await repositories.movements.listVisible(scope, false)).map(
          (movement) => [movement.id, movement.canonicalName],
        ),
      );
      const allPrescriptions = await this.listPublishedPrescriptions(
        repositories,
        input,
      );
      const selectedPrescriptions = allPrescriptions.filter((prescription) =>
        f5InWindow(prescription.scheduledLocalDate, input),
      );
      const executions = await repositories.executedSessions.listForAthlete(
        scope,
        input.athleteId,
      );
      const selectedPrescriptionIds = new Set(
        selectedPrescriptions.map((prescription) => prescription.id),
      );
      const candidateExecutionIds = executions
        .filter((execution) => {
          if (
            execution.prescription !== null &&
            selectedPrescriptionIds.has(execution.prescription.prescriptionId)
          ) {
            return true;
          }
          return f5InWindow(
            f5LocalDateForInstant(execution.startedAt, execution.timeZone),
            input,
          );
        })
        .map((execution) => execution.id);
      const executionFacts = await this.loadExecutionFacts(
        repositories,
        scope,
        candidateExecutionIds,
      );
      const views: SessionMonitoringView[] = [];
      const matchedExecutionIds = new Set<UUID>();

      for (const prescription of selectedPrescriptions) {
        const execution =
          executions.find(
            (candidate) =>
              candidate.prescription?.prescriptionId === prescription.id,
          ) ?? null;
        if (execution !== null) matchedExecutionIds.add(execution.id);
        views.push(
          await this.buildSessionView(
            repositories,
            input.workspaceId,
            input.athleteId,
            prescription,
            execution,
            movementNames,
            prescription.scheduledLocalDate,
            executionFacts,
          ),
        );
      }

      for (const execution of executions) {
        if (matchedExecutionIds.has(execution.id)) continue;
        const executionDate = f5LocalDateForInstant(
          execution.startedAt,
          execution.timeZone,
        );
        if (!f5InWindow(executionDate, input)) continue;
        const currentPrescription =
          execution.prescription === null
            ? null
            : (allPrescriptions.find(
                (candidate) =>
                  candidate.id === execution.prescription?.prescriptionId,
              ) ?? null);
        views.push(
          await this.buildSessionView(
            repositories,
            input.workspaceId,
            input.athleteId,
            currentPrescription,
            execution,
            movementNames,
            executionDate,
            executionFacts,
          ),
        );
      }

      const window: MonitoringWindow = {
        kind: input.startDate === input.endDate ? "day" : "week",
        startDate: input.startDate,
        endDate: input.endDate,
        timeZone: input.timeZone,
      };
      return summarizeMonitoringViews(
        input.workspaceId,
        input.athleteId,
        window,
        views,
      );
    }, transactionContext(input));
  }

  async getAthleteDayMonitoring(
    input: MonitoringAthleteQuery & { readonly date?: LocalDate },
  ): Promise<MonitoringOverview> {
    const date = input.date ?? input.startDate;
    return this.getAthleteMonitoringOverview({
      ...input,
      startDate: date,
      endDate: date,
    });
  }

  async getAthleteWeekMonitoring(
    input: MonitoringAthleteQuery & { readonly weekStart?: LocalDate },
  ): Promise<MonitoringOverview> {
    const weekStart = input.weekStart ?? input.startDate;
    return this.getAthleteMonitoringOverview({
      ...input,
      startDate: weekStart,
      endDate: f5AddDays(weekStart, 6),
    });
  }

  async getSessionMonitoring(
    input: MonitoringSessionQuery,
  ): Promise<SessionMonitoringView> {
    return this.persistence.transaction(async (repositories) => {
      const scope = f5Scope(input.workspaceId);
      const execution = await repositories.executedSessions.get(
        scope,
        input.executionId,
      );
      if (execution === null) {
        throw new ApplicationError(
          "RESOURCE_NOT_FOUND",
          "Executed session not found.",
        );
      }
      await this.authorizeAthlete(repositories, input, execution.athleteId);
      const prescription =
        execution.prescription === null
          ? null
          : await repositories.sessionPrescriptions.get(
              scope,
              execution.prescription.prescriptionId,
            );
      const movementNames = new Map(
        (await repositories.movements.listVisible(scope, false)).map(
          (movement) => [movement.id, movement.canonicalName],
        ),
      );
      const executionFacts = await this.loadExecutionFacts(
        repositories,
        scope,
        [execution.id],
      );
      return this.buildSessionView(
        repositories,
        input.workspaceId,
        execution.athleteId,
        prescription,
        execution,
        movementNames,
        f5LocalDateForInstant(execution.startedAt, execution.timeZone),
        executionFacts,
      );
    }, transactionContext(input));
  }

  async getStrengthExecutionComparison(
    input: MonitoringSessionQuery,
  ): Promise<readonly StrengthSetComparison[]> {
    return (await this.getSessionMonitoring(input)).strength;
  }

  async getEnduranceExecutionComparison(
    input: MonitoringSessionQuery,
  ): Promise<readonly EnduranceSegmentComparison[]> {
    return (await this.getSessionMonitoring(input)).endurance;
  }

  async getMobilityExecutionComparison(
    input: MonitoringSessionQuery,
  ): Promise<readonly MobilityItemComparison[]> {
    return (await this.getSessionMonitoring(input)).mobility;
  }

  private async authorizeAthlete(
    repositories: F4Repositories,
    input: CommandMetadata & { readonly workspaceId: WorkspaceId },
    athleteId: AthleteId,
  ): Promise<void> {
    const scope = f5Scope(input.workspaceId);
    const membership = await repositories.memberships.get(
      scope,
      input.principalId,
    );
    if (
      membership === null ||
      membership.status !== "active" ||
      !canAccessWorkspace(membership, "training.read")
    ) {
      throw new ApplicationError(
        "FORBIDDEN",
        "You are not authorized to view monitoring in this workspace.",
      );
    }
    const athlete = await repositories.athletes.get(scope, athleteId);
    if (athlete === null) {
      throw new ApplicationError("RESOURCE_NOT_FOUND", "Athlete not found.");
    }
    const assignments = await repositories.coachAssignments.listForAthlete(
      scope,
      athleteId,
    );
    const allowed =
      membership.role === "owner" ||
      membership.role === "viewer" ||
      (membership.role === "coach" &&
        assignments.some(
          (assignment) => assignment.coachPrincipalId === input.principalId,
        )) ||
      (membership.role === "athlete" &&
        athlete.linkedUserId === input.principalId);
    if (!allowed) {
      throw new ApplicationError("RESOURCE_NOT_FOUND", "Athlete not found.");
    }
  }

  private async listPublishedPrescriptions(
    repositories: F4Repositories,
    input: MonitoringAthleteQuery,
  ): Promise<readonly SessionPrescription[]> {
    const scope = f5Scope(input.workspaceId);
    const sessions =
      await repositories.sessionPrescriptions.listPublishedForAthlete(
        scope,
        input.athleteId,
      );
    return sessions
      .slice()
      .sort(
        (left, right) =>
          left.scheduledLocalDate.localeCompare(right.scheduledLocalDate) ||
          left.id.localeCompare(right.id),
      );
  }

  private async buildSessionView(
    repositories: F4Repositories,
    workspaceId: WorkspaceId,
    athleteId: AthleteId,
    prescription: SessionPrescription | null,
    execution: ExecutedSession | null,
    movementNames: ReadonlyMap<UUID, string>,
    sessionDate: LocalDate,
    executionFacts?: F5ExecutionFacts,
  ): Promise<SessionMonitoringView> {
    const scope = f5Scope(workspaceId);
    const emptyFacts: MonitoringProjectionInput = {
      workspaceId,
      athleteId,
      prescription,
      execution,
      strengthSets: [],
      enduranceSegments: [],
      mobilityItems: [],
      observations: [],
      amendments: [],
      movementNames,
      sessionDate,
    };
    if (execution === null) return projectSessionMonitoring(emptyFacts);
    if (executionFacts !== undefined) {
      return projectSessionMonitoring({
        ...emptyFacts,
        strengthSets: executionFacts.strengthSets.get(execution.id) ?? [],
        enduranceSegments:
          executionFacts.enduranceSegments.get(execution.id) ?? [],
        mobilityItems: executionFacts.mobilityItems.get(execution.id) ?? [],
        observations: executionFacts.observations.get(execution.id) ?? [],
        amendments: executionFacts.amendments.get(execution.id) ?? [],
      });
    }
    const [
      strengthSets,
      enduranceSegments,
      mobilityItems,
      observations,
      amendments,
    ] = await Promise.all([
      repositories.performedStrengthSets.listForSession(scope, execution.id),
      repositories.performedEnduranceSegments.listForSession(
        scope,
        execution.id,
      ),
      repositories.performedMobilityItems.listForSession(scope, execution.id),
      repositories.sessionObservations.listForSession(scope, execution.id),
      repositories.executionAmendments.listForSession(scope, execution.id),
    ]);
    return projectSessionMonitoring({
      ...emptyFacts,
      strengthSets,
      enduranceSegments,
      mobilityItems,
      observations,
      amendments,
    });
  }

  private async loadExecutionFacts(
    repositories: F4Repositories,
    scope: WorkspaceScope,
    executionIds: readonly UUID[],
  ): Promise<F5ExecutionFacts> {
    const [
      strengthSets,
      enduranceSegments,
      mobilityItems,
      observations,
      amendments,
    ] = await Promise.all([
      repositories.performedStrengthSets.listForSessions(scope, executionIds),
      repositories.performedEnduranceSegments.listForSessions(
        scope,
        executionIds,
      ),
      repositories.performedMobilityItems.listForSessions(scope, executionIds),
      repositories.sessionObservations.listForSessions(scope, executionIds),
      repositories.executionAmendments.listForSessions(scope, executionIds),
    ]);
    const group = <T extends { readonly sessionId?: UUID }>(
      values: readonly T[],
    ): ReadonlyMap<UUID, readonly T[]> => {
      const grouped = new Map<UUID, T[]>();
      for (const value of values) {
        if (value.sessionId === undefined) {
          throw new Error("F5 execution facts must identify their execution.");
        }
        const current = grouped.get(value.sessionId) ?? [];
        current.push(value);
        grouped.set(value.sessionId, current);
      }
      return grouped;
    };
    return {
      strengthSets: group(strengthSets),
      enduranceSegments: group(enduranceSegments),
      mobilityItems: group(mobilityItems),
      observations: group(observations),
      amendments: group(amendments),
    };
  }
}

export function createF5Application(persistence: F4Persistence): F5Application {
  return new F5Application(persistence);
}
