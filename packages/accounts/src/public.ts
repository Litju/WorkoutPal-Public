import type {
  ActorContext,
  Instant,
  UUID,
  Versioned,
  WorkspaceId,
} from "@workoutpal/shared-kernel";

export type WorkspaceRole = "owner" | "coach" | "athlete" | "viewer";

export type WorkspaceAction =
  | "workspace.read"
  | "workspace.manage"
  | "athlete.list"
  | "athlete.read"
  | "athlete.create"
  | "athlete.update"
  | "athlete.archive"
  | "coach-assignment.manage"
  | "training.read"
  | "training.design"
  | "training.execute"
  | "assessment.read"
  | "assessment.write"
  | "agent.propose"
  | "agent.approve"
  | "agent.execute";

export interface Workspace extends Versioned {
  readonly id: WorkspaceId;
  readonly name: string;
  readonly createdAt: Instant;
  readonly createdBy: UUID;
  readonly updatedAt: Instant;
  readonly archivedAt: Instant | null;
}

export interface WorkspaceMembership {
  readonly id: UUID;
  readonly workspaceId: WorkspaceId;
  readonly principalId: UUID;
  readonly role: WorkspaceRole;
  readonly status: "active" | "suspended";
}

export interface WorkspaceMemberDetails extends WorkspaceMembership {
  readonly displayName: string | null;
  readonly email: string | null;
}

export type MassDisplayUnit = "kg" | "lb";
export type DistanceDisplayUnit = "m" | "km" | "mi";
export type PaceDisplayUnit = "per-km" | "per-mi";

/** Display preferences only; stored facts remain canonical SI values. */
export interface WorkspacePreferences extends Versioned {
  readonly id: UUID;
  readonly workspaceId: WorkspaceId;
  readonly massUnit: MassDisplayUnit;
  readonly distanceUnit: DistanceDisplayUnit;
  readonly paceUnit: PaceDisplayUnit;
  readonly createdAt: Instant;
  readonly createdBy: UUID;
  readonly updatedAt: Instant;
  readonly updatedBy: UUID;
}

export function createWorkspacePreferences(input: {
  readonly id: UUID;
  readonly workspaceId: WorkspaceId;
  readonly massUnit?: MassDisplayUnit;
  readonly distanceUnit?: DistanceDisplayUnit;
  readonly paceUnit?: PaceDisplayUnit;
  readonly createdAt: Instant;
  readonly createdBy: UUID;
}): WorkspacePreferences {
  return {
    id: input.id,
    workspaceId: input.workspaceId,
    massUnit: input.massUnit ?? "kg",
    distanceUnit: input.distanceUnit ?? "km",
    paceUnit: input.paceUnit ?? "per-km",
    createdAt: input.createdAt,
    createdBy: input.createdBy,
    updatedAt: input.createdAt,
    updatedBy: input.createdBy,
    version: 1,
  };
}

export function updateWorkspacePreferences(
  preferences: WorkspacePreferences,
  input: {
    readonly massUnit?: MassDisplayUnit;
    readonly distanceUnit?: DistanceDisplayUnit;
    readonly paceUnit?: PaceDisplayUnit;
    readonly updatedAt: Instant;
    readonly updatedBy: UUID;
  },
): WorkspacePreferences {
  return {
    ...preferences,
    massUnit: input.massUnit ?? preferences.massUnit,
    distanceUnit: input.distanceUnit ?? preferences.distanceUnit,
    paceUnit: input.paceUnit ?? preferences.paceUnit,
    updatedAt: input.updatedAt,
    updatedBy: input.updatedBy,
    version: preferences.version + 1,
  };
}

export interface AuthorizationPort {
  can(
    actor: ActorContext,
    action: WorkspaceAction,
    workspaceId: WorkspaceId,
  ): boolean;
}

export interface AthleteAuthorizationSubject {
  readonly workspaceId: WorkspaceId;
  readonly linkedUserId: UUID | null;
  readonly assignedCoachIds: readonly UUID[];
}

export function createWorkspace(input: {
  readonly id: WorkspaceId;
  readonly name: string;
  readonly createdAt: Instant;
  readonly createdBy: UUID;
}): Workspace {
  const name = input.name.trim();
  if (name.length === 0) {
    throw new Error("Workspace name cannot be empty.");
  }

  return {
    id: input.id,
    name,
    createdAt: input.createdAt,
    createdBy: input.createdBy,
    updatedAt: input.createdAt,
    archivedAt: null,
    version: 1,
  };
}

export function canAccessWorkspace(
  membership: WorkspaceMembership | null,
  action: WorkspaceAction,
): boolean {
  if (membership === null || membership.status !== "active") return false;

  if (membership.role === "owner") {
    return (
      action.startsWith("workspace.") ||
      action.startsWith("athlete.") ||
      action === "coach-assignment.manage" ||
      action.startsWith("training.") ||
      action.startsWith("assessment.") ||
      action.startsWith("agent.")
    );
  }

  if (membership.role === "coach") {
    return (
      action === "workspace.read" ||
      action === "athlete.list" ||
      action === "athlete.read" ||
      action === "athlete.create" ||
      action === "athlete.update" ||
      action === "athlete.archive" ||
      action === "training.read" ||
      action === "training.design" ||
      action === "training.execute" ||
      action === "assessment.read" ||
      action === "assessment.write" ||
      action === "agent.propose" ||
      action === "agent.approve" ||
      action === "agent.execute"
    );
  }

  if (membership.role === "viewer") {
    return (
      action === "workspace.read" ||
      action === "athlete.list" ||
      action === "athlete.read" ||
      action === "training.read" ||
      action === "assessment.read"
    );
  }

  return (
    action === "workspace.read" ||
    action === "athlete.list" ||
    action === "athlete.read" ||
    action === "athlete.update" ||
    action === "training.read" ||
    action === "training.execute" ||
    action === "assessment.read"
  );
}

export function canAccessAthlete(
  membership: WorkspaceMembership | null,
  actorId: UUID,
  action: WorkspaceAction,
  subject: AthleteAuthorizationSubject,
): boolean {
  if (
    membership === null ||
    membership.status !== "active" ||
    membership.workspaceId !== subject.workspaceId
  ) {
    return false;
  }

  if (membership.role === "owner") {
    return [
      "athlete.list",
      "athlete.read",
      "athlete.create",
      "athlete.update",
      "athlete.archive",
      "coach-assignment.manage",
      "assessment.read",
      "assessment.write",
    ].includes(action);
  }

  if (membership.role === "coach") {
    const assigned = subject.assignedCoachIds.includes(actorId);
    if (
      action === "athlete.list" ||
      action === "athlete.read" ||
      action === "assessment.read" ||
      action === "assessment.write"
    )
      return assigned;
    return (
      assigned && (action === "athlete.update" || action === "athlete.archive")
    );
  }

  if (membership.role === "athlete") {
    const isLinked = subject.linkedUserId === actorId;
    return (
      isLinked &&
      (action === "athlete.list" ||
        action === "athlete.read" ||
        action === "athlete.update" ||
        action === "assessment.read")
    );
  }

  return action === "athlete.list" || action === "athlete.read";
}

export function isActiveWorkspaceMember(
  membership: WorkspaceMembership,
  workspaceId: WorkspaceId,
  principalId: UUID,
): boolean {
  return (
    membership.workspaceId === workspaceId &&
    membership.principalId === principalId &&
    membership.status === "active"
  );
}
