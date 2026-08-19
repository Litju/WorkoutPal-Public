import type {
  AthleteId,
  Instant,
  UUID,
  Versioned,
  WorkspaceId,
} from "@workoutpal/shared-kernel";

export interface AthleteProfile extends Versioned {
  readonly id: AthleteId;
  readonly workspaceId: WorkspaceId;
  readonly displayName: string;
  readonly linkedUserId: UUID | null;
  readonly archivedAt: Instant | null;
  readonly createdAt: Instant;
  readonly createdBy: UUID;
  readonly updatedAt: Instant;
  readonly updatedBy: UUID;
}

/**
 * Operational context only. This aggregate intentionally excludes medical,
 * readiness, fatigue, recovery, load, and other scientific interpretation.
 */
export interface AthleteTrainingContext extends Versioned {
  readonly id: UUID;
  readonly workspaceId: WorkspaceId;
  readonly athleteId: AthleteId;
  readonly trainingAgeMonths: number | null;
  readonly availabilityNotes: string | null;
  readonly operationalConstraints: string | null;
  readonly equipmentAccess: readonly string[];
  readonly trainingPreferences: string | null;
  readonly practitionerNotes: string | null;
  readonly createdAt: Instant;
  readonly createdBy: UUID;
  readonly updatedAt: Instant;
  readonly updatedBy: UUID;
}

export interface CoachAssignment {
  readonly id: UUID;
  readonly workspaceId: WorkspaceId;
  readonly athleteId: AthleteId;
  readonly coachPrincipalId: UUID;
  readonly createdAt: Instant;
  readonly createdBy: UUID;
}

export interface AthleteReader {
  getById(
    workspaceId: WorkspaceId,
    athleteId: AthleteId,
  ): Promise<AthleteProfile | null>;
}

function normalizeOptionalText(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null) return null;
  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}

function normalizeEquipmentAccess(
  values: readonly string[] | undefined,
): readonly string[] {
  return [
    ...new Set(
      (values ?? [])
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  ];
}

function assertTrainingAgeMonths(value: number | null | undefined): void {
  if (
    value !== undefined &&
    value !== null &&
    (!Number.isInteger(value) || value < 0)
  ) {
    throw new Error(
      "Training age must be a non-negative whole number of months.",
    );
  }
}

export function createAthleteTrainingContext(input: {
  readonly id: UUID;
  readonly workspaceId: WorkspaceId;
  readonly athleteId: AthleteId;
  readonly trainingAgeMonths?: number | null;
  readonly availabilityNotes?: string | null;
  readonly operationalConstraints?: string | null;
  readonly equipmentAccess?: readonly string[];
  readonly trainingPreferences?: string | null;
  readonly practitionerNotes?: string | null;
  readonly createdAt: Instant;
  readonly createdBy: UUID;
}): AthleteTrainingContext {
  assertTrainingAgeMonths(input.trainingAgeMonths);
  return {
    id: input.id,
    workspaceId: input.workspaceId,
    athleteId: input.athleteId,
    trainingAgeMonths: input.trainingAgeMonths ?? null,
    availabilityNotes: normalizeOptionalText(input.availabilityNotes),
    operationalConstraints: normalizeOptionalText(input.operationalConstraints),
    equipmentAccess: normalizeEquipmentAccess(input.equipmentAccess),
    trainingPreferences: normalizeOptionalText(input.trainingPreferences),
    practitionerNotes: normalizeOptionalText(input.practitionerNotes),
    createdAt: input.createdAt,
    createdBy: input.createdBy,
    updatedAt: input.createdAt,
    updatedBy: input.createdBy,
    version: 1,
  };
}

export function updateAthleteTrainingContext(
  context: AthleteTrainingContext,
  input: {
    readonly trainingAgeMonths?: number | null;
    readonly availabilityNotes?: string | null;
    readonly operationalConstraints?: string | null;
    readonly equipmentAccess?: readonly string[];
    readonly trainingPreferences?: string | null;
    readonly practitionerNotes?: string | null;
    readonly updatedAt: Instant;
    readonly updatedBy: UUID;
  },
): AthleteTrainingContext {
  assertTrainingAgeMonths(input.trainingAgeMonths);
  return {
    ...context,
    trainingAgeMonths:
      input.trainingAgeMonths === undefined
        ? context.trainingAgeMonths
        : input.trainingAgeMonths,
    availabilityNotes:
      input.availabilityNotes === undefined
        ? context.availabilityNotes
        : normalizeOptionalText(input.availabilityNotes),
    operationalConstraints:
      input.operationalConstraints === undefined
        ? context.operationalConstraints
        : normalizeOptionalText(input.operationalConstraints),
    equipmentAccess:
      input.equipmentAccess === undefined
        ? context.equipmentAccess
        : normalizeEquipmentAccess(input.equipmentAccess),
    trainingPreferences:
      input.trainingPreferences === undefined
        ? context.trainingPreferences
        : normalizeOptionalText(input.trainingPreferences),
    practitionerNotes:
      input.practitionerNotes === undefined
        ? context.practitionerNotes
        : normalizeOptionalText(input.practitionerNotes),
    updatedAt: input.updatedAt,
    updatedBy: input.updatedBy,
    version: context.version + 1,
  };
}

export function createAthleteProfile(input: {
  readonly id: AthleteId;
  readonly workspaceId: WorkspaceId;
  readonly displayName: string;
  readonly createdAt: Instant;
  readonly createdBy?: UUID;
  readonly linkedUserId?: UUID;
}): AthleteProfile {
  const displayName = input.displayName.trim();
  if (displayName.length === 0) {
    throw new Error("Athlete display name cannot be empty.");
  }

  const profile: AthleteProfile = {
    id: input.id,
    workspaceId: input.workspaceId,
    displayName,
    linkedUserId: input.linkedUserId ?? null,
    archivedAt: null,
    createdAt: input.createdAt,
    createdBy: input.createdBy ?? input.id,
    updatedAt: input.createdAt,
    updatedBy: input.createdBy ?? input.id,
    version: 1,
  };

  return profile;
}

export function updateAthleteProfile(
  profile: AthleteProfile,
  input: {
    readonly displayName?: string;
    readonly linkedUserId?: UUID | null;
    readonly updatedAt: Instant;
    readonly updatedBy: UUID;
  },
): AthleteProfile {
  const displayName = input.displayName?.trim() ?? profile.displayName;
  if (displayName.length === 0) {
    throw new Error("Athlete display name cannot be empty.");
  }

  return {
    ...profile,
    displayName,
    linkedUserId:
      "linkedUserId" in input
        ? (input.linkedUserId ?? null)
        : profile.linkedUserId,
    updatedAt: input.updatedAt,
    updatedBy: input.updatedBy,
    version: profile.version + 1,
  };
}

export function archiveAthleteProfile(
  profile: AthleteProfile,
  archivedAt: Instant,
  archivedBy?: UUID,
): AthleteProfile {
  if (profile.archivedAt !== null) {
    return profile;
  }

  return {
    ...profile,
    archivedAt,
    updatedAt: archivedAt,
    updatedBy: archivedBy ?? profile.updatedBy,
    version: profile.version + 1,
  };
}

export function createCoachAssignment(input: {
  readonly id: UUID;
  readonly workspaceId: WorkspaceId;
  readonly athleteId: AthleteId;
  readonly coachPrincipalId: UUID;
  readonly createdAt: Instant;
  readonly createdBy: UUID;
}): CoachAssignment {
  return { ...input };
}
