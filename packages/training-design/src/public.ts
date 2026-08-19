import type {
  AthleteId,
  IanaTimeZone,
  Instant,
  LocalDate,
  UUID,
  Versioned,
  WorkspaceId,
} from "@workoutpal/shared-kernel";

export type PlanStatus = "draft" | "published" | "archived";
export type PhaseClassification =
  | "macrocycle"
  | "mesocycle"
  | "microcycle"
  | "custom";
export type MovementScope = "global" | "workspace";
export type MovementModality =
  | "strength"
  | "endurance"
  | "mobility"
  | "general";
export type EnduranceSegmentKind =
  | "warmup"
  | "work"
  | "recovery"
  | "cooldown"
  | "free";
export type MobilitySide = "left" | "right" | "bilateral" | "alternating";

export interface MovementDefinition extends Versioned {
  readonly id: UUID;
  readonly workspaceId: WorkspaceId | null;
  readonly scope: MovementScope;
  readonly canonicalName: string;
  readonly modality: MovementModality;
  readonly movementPattern: string | null;
  readonly laterality: string | null;
  readonly equipmentTags: readonly string[];
  readonly archivedAt: Instant | null;
  readonly createdAt: Instant;
  readonly createdBy: UUID | null;
  readonly updatedAt: Instant;
  readonly updatedBy: UUID | null;
}

export interface TrainingGoal extends Versioned {
  readonly id: UUID;
  readonly workspaceId: WorkspaceId;
  readonly athleteId: AthleteId;
  readonly title: string;
  readonly description: string | null;
  readonly targetDate: LocalDate | null;
  readonly startsOn: LocalDate | null;
  readonly endsOn: LocalDate | null;
  readonly archivedAt: Instant | null;
  readonly createdAt: Instant;
  readonly createdBy: UUID;
  readonly updatedAt: Instant;
  readonly updatedBy: UUID;
}

export interface PlanPhase extends Versioned {
  readonly id: UUID;
  readonly workspaceId: WorkspaceId;
  readonly planId: UUID;
  readonly parentPhaseId: UUID | null;
  readonly ordinal: number;
  readonly name: string;
  readonly classification: PhaseClassification;
  readonly startsOn: LocalDate;
  readonly endsOn: LocalDate;
  readonly archivedAt: Instant | null;
  readonly createdAt: Instant;
  readonly createdBy: UUID;
  readonly updatedAt: Instant;
  readonly updatedBy: UUID;
}

export interface StrengthSetPrescription {
  readonly id: UUID;
  readonly ordinal: number;
  readonly targetRepMin?: number;
  readonly targetRepMax?: number;
  readonly targetLoadKg?: number;
  readonly targetRpe?: number;
  readonly targetRpeScale?: "0-10";
  readonly targetRir?: number;
  readonly targetRirScale?: "0-10";
  readonly targetRestSeconds?: number;
  readonly targetDurationSeconds?: number;
  readonly targetVelocityMps?: number;
  readonly tempoDescriptor?: string;
  readonly notes?: string;
}

export interface StrengthExercisePrescription {
  readonly id: UUID;
  readonly movementId: UUID;
  readonly ordinal: number;
  readonly notes?: string;
  readonly sets: readonly StrengthSetPrescription[];
}

export interface StrengthBlock {
  readonly id: UUID;
  readonly kind: "strength";
  readonly ordinal: number;
  readonly exercises: readonly StrengthExercisePrescription[];
}

export interface EnduranceSegment {
  readonly id: UUID;
  readonly parentSegmentId: UUID | null;
  readonly ordinal: number;
  readonly kind: EnduranceSegmentKind;
  readonly repeatCount: number;
  readonly durationSeconds?: number;
  readonly distanceMeters?: number;
  readonly targetHrMin?: number;
  readonly targetHrMax?: number;
  readonly targetSpeedMpsMin?: number;
  readonly targetSpeedMpsMax?: number;
  readonly targetPowerWattsMin?: number;
  readonly targetPowerWattsMax?: number;
  readonly targetRpe?: number;
  readonly notes?: string;
}

export interface EnduranceBlock {
  readonly id: UUID;
  readonly kind: "endurance";
  readonly ordinal: number;
  readonly segments: readonly EnduranceSegment[];
}

export interface MobilityItem {
  readonly id: UUID;
  readonly movementId: UUID;
  readonly ordinal: number;
  readonly sets?: number;
  readonly reps?: number;
  readonly holdSeconds?: number;
  readonly side?: MobilitySide;
  readonly targetRpe?: number;
  readonly notes?: string;
}

export interface MobilityBlock {
  readonly id: UUID;
  readonly kind: "mobility";
  readonly ordinal: number;
  readonly items: readonly MobilityItem[];
}

export interface GenericBlock {
  readonly id: UUID;
  readonly kind: "generic";
  readonly ordinal: number;
  readonly description: string;
}

export type PrescriptionBlock =
  | StrengthBlock
  | EnduranceBlock
  | MobilityBlock
  | GenericBlock;

export interface SessionPrescription extends Versioned {
  readonly id: UUID;
  readonly workspaceId: WorkspaceId;
  readonly athleteId: AthleteId;
  readonly planId: UUID;
  readonly phaseId: UUID | null;
  readonly scheduledLocalDate: LocalDate;
  readonly timeZone: IanaTimeZone;
  readonly title: string;
  readonly status: PlanStatus;
  readonly revision: number;
  readonly publishedRevision: number | null;
  readonly publishedAt: Instant | null;
  readonly publishedBy: UUID | null;
  readonly blocks: readonly PrescriptionBlock[];
  readonly archivedAt: Instant | null;
  readonly createdAt: Instant;
  readonly createdBy: UUID;
  readonly updatedAt: Instant;
  readonly updatedBy: UUID;
}

export interface TrainingPlan extends Versioned {
  readonly id: UUID;
  readonly workspaceId: WorkspaceId;
  readonly athleteId: AthleteId;
  readonly title: string;
  readonly description: string | null;
  readonly startsOn: LocalDate;
  readonly endsOn: LocalDate;
  readonly timeZone: IanaTimeZone;
  readonly status: PlanStatus;
  readonly goalIds: readonly UUID[];
  readonly phases: readonly PlanPhase[];
  readonly publishedRevision: number | null;
  readonly publishedAt: Instant | null;
  readonly publishedBy: UUID | null;
  readonly archivedAt: Instant | null;
  readonly createdAt: Instant;
  readonly createdBy: UUID;
  readonly updatedAt: Instant;
  readonly updatedBy: UUID;
}

export interface SessionPrescriptionRevision {
  readonly id: UUID;
  readonly workspaceId: WorkspaceId;
  readonly sessionId: UUID;
  readonly revision: number;
  readonly publishedAt: Instant;
  readonly publishedBy: UUID;
  readonly snapshot: SessionPrescription;
}

export interface TrainingPlanRevision {
  readonly id: UUID;
  readonly workspaceId: WorkspaceId;
  readonly planId: UUID;
  readonly revision: number;
  readonly publishedAt: Instant;
  readonly publishedBy: UUID;
  readonly snapshot: {
    readonly plan: TrainingPlan;
    readonly goals: readonly TrainingGoal[];
    readonly phases: readonly PlanPhase[];
    readonly sessions: readonly SessionPrescription[];
  };
}

export interface TrainingPlanDetails {
  readonly plan: TrainingPlan;
  readonly goals: readonly TrainingGoal[];
  readonly phases: readonly PlanPhase[];
  readonly sessions: readonly SessionPrescription[];
  readonly revisions: readonly TrainingPlanRevision[];
}

function assertFiniteNonnegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number.`);
  }
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
}

function assertNonnegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
}

function assertRange(
  min: number | undefined,
  max: number | undefined,
  label: string,
): void {
  if (min !== undefined) assertFiniteNonnegative(min, `${label} minimum`);
  if (max !== undefined) assertFiniteNonnegative(max, `${label} maximum`);
  if (min !== undefined && max !== undefined && min > max) {
    throw new Error(`${label} minimum must not exceed its maximum.`);
  }
}

function assertLocalDate(value: LocalDate, label: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must use YYYY-MM-DD local-date semantics.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.valueOf()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`${label} must be a valid calendar date.`);
  }
}

function assertDateRange(
  startsOn: LocalDate,
  endsOn: LocalDate,
  label: string,
): void {
  assertLocalDate(startsOn, `${label} start`);
  assertLocalDate(endsOn, `${label} end`);
  if (startsOn > endsOn) {
    throw new Error(`${label} start must not be after its end.`);
  }
}

function assertText(value: string, label: string, maxLength = 240): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new Error(
      `${label} must contain between 1 and ${maxLength} characters.`,
    );
  }
  return normalized;
}

function assertUniqueOrdinals(
  items: readonly { readonly ordinal: number }[],
  label: string,
): void {
  const ordinals = new Set<number>();
  for (const item of items) {
    assertPositiveInteger(item.ordinal, `${label} ordinal`);
    if (ordinals.has(item.ordinal)) {
      throw new Error(`${label} ordinals must be unique.`);
    }
    ordinals.add(item.ordinal);
  }
}

export function validateStrengthSetPrescription(
  set: StrengthSetPrescription,
): void {
  assertPositiveInteger(set.ordinal, "Strength set");
  if (set.targetRepMin !== undefined) {
    assertNonnegativeInteger(set.targetRepMin, "Target minimum repetitions");
  }
  if (set.targetRepMax !== undefined) {
    assertNonnegativeInteger(set.targetRepMax, "Target maximum repetitions");
  }
  assertRange(set.targetRepMin, set.targetRepMax, "Repetition target");
  if (set.targetLoadKg !== undefined)
    assertFiniteNonnegative(set.targetLoadKg, "Target load kg");
  if (set.targetRpe !== undefined) {
    if (set.targetRpeScale !== "0-10")
      throw new Error("Target RPE must declare the explicit 0-10 scale.");
    if (
      !Number.isFinite(set.targetRpe) ||
      set.targetRpe < 0 ||
      set.targetRpe > 10
    )
      throw new Error("Target RPE must be between 0 and 10.");
  }
  if (set.targetRir !== undefined) {
    if (set.targetRirScale !== "0-10")
      throw new Error("Target RIR must declare the explicit 0-10 scale.");
    if (
      !Number.isFinite(set.targetRir) ||
      set.targetRir < 0 ||
      set.targetRir > 10
    )
      throw new Error("Target RIR must be between 0 and 10.");
  }
  if (set.targetRpeScale !== undefined && set.targetRpe === undefined)
    throw new Error("Target RPE scale requires a target RPE value.");
  if (set.targetRirScale !== undefined && set.targetRir === undefined)
    throw new Error("Target RIR scale requires a target RIR value.");
  if (set.targetRestSeconds !== undefined)
    assertFiniteNonnegative(set.targetRestSeconds, "Target rest seconds");
  if (set.targetDurationSeconds !== undefined)
    assertFiniteNonnegative(
      set.targetDurationSeconds,
      "Target duration seconds",
    );
  if (set.targetVelocityMps !== undefined)
    assertFiniteNonnegative(set.targetVelocityMps, "Target velocity m/s");
}

export function validateEnduranceSegmentTree(
  segments: readonly EnduranceSegment[],
): void {
  const ids = new Set<UUID>();
  for (const segment of segments) {
    if (ids.has(segment.id))
      throw new Error("Endurance segment IDs must be unique.");
    ids.add(segment.id);
    assertPositiveInteger(segment.ordinal, "Endurance segment");
    assertPositiveInteger(segment.repeatCount, "Endurance segment repeatCount");
    if (segment.durationSeconds !== undefined)
      assertFiniteNonnegative(
        segment.durationSeconds,
        "Endurance duration seconds",
      );
    if (segment.distanceMeters !== undefined)
      assertFiniteNonnegative(
        segment.distanceMeters,
        "Endurance distance meters",
      );
    assertRange(segment.targetHrMin, segment.targetHrMax, "Heart-rate target");
    assertRange(
      segment.targetSpeedMpsMin,
      segment.targetSpeedMpsMax,
      "Speed target",
    );
    assertRange(
      segment.targetPowerWattsMin,
      segment.targetPowerWattsMax,
      "Power target",
    );
    if (segment.targetRpe !== undefined) {
      if (
        !Number.isFinite(segment.targetRpe) ||
        segment.targetRpe < 0 ||
        segment.targetRpe > 10
      )
        throw new Error("Endurance target RPE must be between 0 and 10.");
    }
    if (segment.parentSegmentId === segment.id)
      throw new Error("An endurance segment cannot parent itself.");
  }

  const siblingOrdinals = new Map<string, Set<number>>();
  for (const segment of segments) {
    if (segment.parentSegmentId !== null && !ids.has(segment.parentSegmentId)) {
      throw new Error(
        "An endurance segment parent must belong to the same block.",
      );
    }
    const parentKey = segment.parentSegmentId ?? "root";
    const ordinals = siblingOrdinals.get(parentKey) ?? new Set<number>();
    if (ordinals.has(segment.ordinal)) {
      throw new Error("Endurance sibling ordinals must be unique.");
    }
    ordinals.add(segment.ordinal);
    siblingOrdinals.set(parentKey, ordinals);
  }

  const visiting = new Set<UUID>();
  const visited = new Set<UUID>();
  const children = new Map<UUID | null, UUID[]>();
  for (const segment of segments) {
    const list = children.get(segment.parentSegmentId) ?? [];
    list.push(segment.id);
    children.set(segment.parentSegmentId, list);
  }
  const visit = (id: UUID): void => {
    if (visiting.has(id))
      throw new Error("Endurance segment tree cannot contain a cycle.");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const child of children.get(id) ?? []) visit(child);
    visiting.delete(id);
    visited.add(id);
  };
  for (const root of children.get(null) ?? []) visit(root);
  for (const segment of segments) visit(segment.id);
  if (visited.size !== segments.length) {
    throw new Error(
      "All endurance segments must be reachable from a tree root.",
    );
  }
}

export function validatePrescriptionBlocks(
  blocks: readonly PrescriptionBlock[],
): void {
  assertUniqueOrdinals(blocks, "Prescription block");
  const ids = new Set<UUID>();
  for (const block of blocks) {
    if (ids.has(block.id))
      throw new Error("Prescription block IDs must be unique.");
    ids.add(block.id);
    if (block.kind === "strength") {
      assertUniqueOrdinals(block.exercises, "Strength exercise");
      const exerciseIds = new Set<UUID>();
      for (const exercise of block.exercises) {
        if (exerciseIds.has(exercise.id))
          throw new Error("Strength exercise IDs must be unique.");
        exerciseIds.add(exercise.id);
        assertUniqueOrdinals(exercise.sets, "Strength set");
        for (const set of exercise.sets) validateStrengthSetPrescription(set);
      }
    } else if (block.kind === "endurance") {
      validateEnduranceSegmentTree(block.segments);
    } else if (block.kind === "mobility") {
      assertUniqueOrdinals(block.items, "Mobility item");
      const itemIds = new Set<UUID>();
      for (const item of block.items) {
        if (itemIds.has(item.id))
          throw new Error("Mobility item IDs must be unique.");
        itemIds.add(item.id);
        if (item.sets !== undefined)
          assertNonnegativeInteger(item.sets, "Mobility sets");
        if (item.reps !== undefined)
          assertNonnegativeInteger(item.reps, "Mobility repetitions");
        if (item.holdSeconds !== undefined)
          assertFiniteNonnegative(item.holdSeconds, "Mobility hold seconds");
        if (
          item.targetRpe !== undefined &&
          (!Number.isFinite(item.targetRpe) ||
            item.targetRpe < 0 ||
            item.targetRpe > 10)
        )
          throw new Error("Mobility target RPE must be between 0 and 10.");
      }
    } else {
      assertText(block.description, "Generic block description");
    }
  }
}

export function validatePlanPhaseHierarchy(
  phases: readonly PlanPhase[],
  plan: Pick<TrainingPlan, "id" | "workspaceId" | "startsOn" | "endsOn">,
): void {
  assertDateRange(plan.startsOn, plan.endsOn, "Training plan");
  const byId = new Map<UUID, PlanPhase>();
  for (const phase of phases) {
    if (byId.has(phase.id)) throw new Error("Plan phase IDs must be unique.");
    byId.set(phase.id, phase);
    if (phase.planId !== plan.id || phase.workspaceId !== plan.workspaceId)
      throw new Error("Plan phase must belong to the same plan and workspace.");
    assertText(phase.name, "Plan phase name");
    assertDateRange(phase.startsOn, phase.endsOn, "Plan phase");
    if (phase.startsOn < plan.startsOn || phase.endsOn > plan.endsOn)
      throw new Error("Plan phase dates must remain inside the plan dates.");
    if (phase.parentPhaseId === phase.id)
      throw new Error("A plan phase cannot be its own parent.");
    if (phase.parentPhaseId !== null && !byId.has(phase.parentPhaseId)) {
      const parent = phases.find(
        (candidate) => candidate.id === phase.parentPhaseId,
      );
      if (parent === undefined)
        throw new Error("Plan phase parent must belong to the same plan.");
    }
  }
  const siblingOrdinals = new Map<string, Set<number>>();
  for (const phase of phases) {
    const key = phase.parentPhaseId ?? "root";
    const ordinals = siblingOrdinals.get(key) ?? new Set<number>();
    assertPositiveInteger(phase.ordinal, "Plan phase");
    if (ordinals.has(phase.ordinal))
      throw new Error("Sibling plan phase ordinals must be unique.");
    ordinals.add(phase.ordinal);
    siblingOrdinals.set(key, ordinals);
    if (phase.parentPhaseId !== null) {
      const parent = byId.get(phase.parentPhaseId);
      if (parent === undefined)
        throw new Error("Plan phase parent must belong to the same plan.");
      if (phase.startsOn < parent.startsOn || phase.endsOn > parent.endsOn)
        throw new Error(
          "Child phase dates must remain inside the parent phase dates.",
        );
      if (parent.archivedAt !== null && phase.archivedAt === null)
        throw new Error(
          "An active phase cannot remain under an archived parent.",
        );
    }
  }
  const visiting = new Set<UUID>();
  const visited = new Set<UUID>();
  const visit = (phaseId: UUID): void => {
    if (visiting.has(phaseId))
      throw new Error("Plan phase hierarchy cannot contain a cycle.");
    if (visited.has(phaseId)) return;
    const phase = byId.get(phaseId);
    if (phase === undefined)
      throw new Error("Plan phase parent must belong to the same plan.");
    visiting.add(phaseId);
    if (phase.parentPhaseId !== null) visit(phase.parentPhaseId);
    visiting.delete(phaseId);
    visited.add(phaseId);
  };
  for (const phase of phases) visit(phase.id);
}

export function createMovementDefinition(input: {
  readonly id: UUID;
  readonly workspaceId?: WorkspaceId;
  readonly scope: MovementScope;
  readonly canonicalName: string;
  readonly modality: MovementModality;
  readonly movementPattern?: string;
  readonly laterality?: string;
  readonly equipmentTags?: readonly string[];
  readonly createdAt: Instant;
  readonly createdBy?: UUID;
}): MovementDefinition {
  if (input.scope === "global" && input.workspaceId !== undefined)
    throw new Error(
      "Global movement definitions cannot belong to a workspace.",
    );
  if (input.scope === "workspace" && input.workspaceId === undefined)
    throw new Error("Workspace movement definitions require a workspace.");
  const canonicalName = assertText(
    input.canonicalName,
    "Movement canonical name",
  );
  const equipmentTags = [
    ...new Set(
      (input.equipmentTags ?? []).map((tag) =>
        assertText(tag, "Equipment tag", 80),
      ),
    ),
  ];
  return {
    id: input.id,
    workspaceId: input.workspaceId ?? null,
    scope: input.scope,
    canonicalName,
    modality: input.modality,
    movementPattern: input.movementPattern?.trim() || null,
    laterality: input.laterality?.trim() || null,
    equipmentTags,
    archivedAt: null,
    createdAt: input.createdAt,
    createdBy: input.createdBy ?? null,
    updatedAt: input.createdAt,
    updatedBy: input.createdBy ?? null,
    version: 1,
  };
}

export function updateMovementDefinition(
  movement: MovementDefinition,
  input: {
    readonly canonicalName?: string;
    readonly modality?: MovementModality;
    readonly movementPattern?: string | null;
    readonly laterality?: string | null;
    readonly equipmentTags?: readonly string[];
    readonly updatedAt: Instant;
    readonly updatedBy: UUID;
  },
): MovementDefinition {
  if (movement.scope === "global")
    throw new Error("Global movement definitions are read-only.");
  return {
    ...movement,
    canonicalName:
      input.canonicalName === undefined
        ? movement.canonicalName
        : assertText(input.canonicalName, "Movement canonical name"),
    modality: input.modality ?? movement.modality,
    movementPattern:
      input.movementPattern === undefined
        ? movement.movementPattern
        : input.movementPattern?.trim() || null,
    laterality:
      input.laterality === undefined
        ? movement.laterality
        : input.laterality?.trim() || null,
    equipmentTags:
      input.equipmentTags === undefined
        ? movement.equipmentTags
        : [
            ...new Set(
              input.equipmentTags.map((tag) =>
                assertText(tag, "Equipment tag", 80),
              ),
            ),
          ],
    updatedAt: input.updatedAt,
    updatedBy: input.updatedBy,
    version: movement.version + 1,
  };
}

export function archiveMovementDefinition(
  movement: MovementDefinition,
  archivedAt: Instant,
  archivedBy: UUID,
): MovementDefinition {
  if (movement.scope === "global")
    throw new Error("Global movement definitions are read-only.");
  if (movement.archivedAt !== null) return movement;
  return {
    ...movement,
    archivedAt,
    updatedAt: archivedAt,
    updatedBy: archivedBy,
    version: movement.version + 1,
  };
}

export function createTrainingGoal(input: {
  readonly id: UUID;
  readonly workspaceId: WorkspaceId;
  readonly athleteId: AthleteId;
  readonly title: string;
  readonly description?: string;
  readonly targetDate?: LocalDate;
  readonly startsOn?: LocalDate;
  readonly endsOn?: LocalDate;
  readonly createdAt: Instant;
  readonly createdBy: UUID;
}): TrainingGoal {
  const title = assertText(input.title, "Training goal title");
  const startsOn = input.startsOn ?? null;
  const endsOn = input.endsOn ?? null;
  if ((startsOn === null) !== (endsOn === null))
    throw new Error("Goal start and end dates must be supplied together.");
  if (startsOn !== null && endsOn !== null)
    assertDateRange(startsOn, endsOn, "Training goal");
  if (input.targetDate !== undefined)
    assertLocalDate(input.targetDate, "Goal target date");
  return {
    id: input.id,
    workspaceId: input.workspaceId,
    athleteId: input.athleteId,
    title,
    description: input.description?.trim() || null,
    targetDate: input.targetDate ?? null,
    startsOn,
    endsOn,
    archivedAt: null,
    createdAt: input.createdAt,
    createdBy: input.createdBy,
    updatedAt: input.createdAt,
    updatedBy: input.createdBy,
    version: 1,
  };
}

export function updateTrainingGoal(
  goal: TrainingGoal,
  input: {
    readonly title?: string;
    readonly description?: string | null;
    readonly targetDate?: LocalDate | null;
    readonly startsOn?: LocalDate | null;
    readonly endsOn?: LocalDate | null;
    readonly updatedAt: Instant;
    readonly updatedBy: UUID;
  },
): TrainingGoal {
  const startsOn =
    input.startsOn === undefined ? goal.startsOn : input.startsOn;
  const endsOn = input.endsOn === undefined ? goal.endsOn : input.endsOn;
  if ((startsOn === null) !== (endsOn === null))
    throw new Error("Goal start and end dates must be supplied together.");
  if (startsOn !== null && endsOn !== null)
    assertDateRange(startsOn, endsOn, "Training goal");
  if (input.targetDate !== undefined && input.targetDate !== null)
    assertLocalDate(input.targetDate, "Goal target date");
  return {
    ...goal,
    title:
      input.title === undefined
        ? goal.title
        : assertText(input.title, "Training goal title"),
    description:
      input.description === undefined
        ? goal.description
        : input.description?.trim() || null,
    targetDate:
      input.targetDate === undefined ? goal.targetDate : input.targetDate,
    startsOn,
    endsOn,
    updatedAt: input.updatedAt,
    updatedBy: input.updatedBy,
    version: goal.version + 1,
  };
}

export function archiveTrainingGoal(
  goal: TrainingGoal,
  archivedAt: Instant,
  archivedBy: UUID,
): TrainingGoal {
  if (goal.archivedAt !== null) return goal;
  return {
    ...goal,
    archivedAt,
    updatedAt: archivedAt,
    updatedBy: archivedBy,
    version: goal.version + 1,
  };
}

export function createTrainingPlan(input: {
  readonly id: UUID;
  readonly workspaceId: WorkspaceId;
  readonly athleteId: AthleteId;
  readonly title: string;
  readonly description?: string;
  readonly startsOn: LocalDate;
  readonly endsOn: LocalDate;
  readonly timeZone: IanaTimeZone;
  readonly goalIds?: readonly UUID[];
  readonly createdAt: Instant;
  readonly createdBy: UUID;
}): TrainingPlan {
  const title = assertText(input.title, "Training plan title");
  assertDateRange(input.startsOn, input.endsOn, "Training plan");
  const goalIds = [...new Set(input.goalIds ?? [])];
  return {
    id: input.id,
    workspaceId: input.workspaceId,
    athleteId: input.athleteId,
    title,
    description: input.description?.trim() || null,
    startsOn: input.startsOn,
    endsOn: input.endsOn,
    timeZone: input.timeZone,
    status: "draft",
    goalIds,
    phases: [],
    publishedRevision: null,
    publishedAt: null,
    publishedBy: null,
    archivedAt: null,
    createdAt: input.createdAt,
    createdBy: input.createdBy,
    updatedAt: input.createdAt,
    updatedBy: input.createdBy,
    version: 1,
  };
}

export function updateTrainingPlan(
  plan: TrainingPlan,
  input: {
    readonly title?: string;
    readonly description?: string | null;
    readonly startsOn?: LocalDate;
    readonly endsOn?: LocalDate;
    readonly timeZone?: IanaTimeZone;
    readonly goalIds?: readonly UUID[];
    readonly createRevision?: boolean;
    readonly updatedAt: Instant;
    readonly updatedBy: UUID;
  },
): TrainingPlan {
  if (plan.status === "archived")
    throw new Error("Archived training plans cannot be edited.");
  if (plan.status === "published" && input.createRevision !== true)
    throw new Error(
      "Published training plans require an explicit revision before editing.",
    );
  const startsOn = input.startsOn ?? plan.startsOn;
  const endsOn = input.endsOn ?? plan.endsOn;
  assertDateRange(startsOn, endsOn, "Training plan");
  return {
    ...plan,
    title:
      input.title === undefined
        ? plan.title
        : assertText(input.title, "Training plan title"),
    description:
      input.description === undefined
        ? plan.description
        : input.description?.trim() || null,
    startsOn,
    endsOn,
    timeZone: input.timeZone ?? plan.timeZone,
    goalIds:
      input.goalIds === undefined ? plan.goalIds : [...new Set(input.goalIds)],
    status: input.createRevision === true ? "draft" : plan.status,
    updatedAt: input.updatedAt,
    updatedBy: input.updatedBy,
    version: plan.version + 1,
  };
}

export function beginTrainingPlanRevision(
  plan: TrainingPlan,
  updatedAt: Instant,
  updatedBy: UUID,
): TrainingPlan {
  if (plan.status !== "published")
    throw new Error("Only a published training plan can start a revision.");
  return {
    ...plan,
    status: "draft",
    updatedAt,
    updatedBy,
    version: plan.version + 1,
  };
}

export function publishTrainingPlan(
  plan: TrainingPlan,
  publishedAt: Instant = new Date().toISOString() as Instant,
  publishedBy: UUID | null = null,
): TrainingPlan {
  if (plan.status !== "draft")
    throw new Error("Only draft training plans can be published.");
  return {
    ...plan,
    status: "published",
    publishedRevision: (plan.publishedRevision ?? 0) + 1,
    publishedAt,
    publishedBy,
    updatedAt: publishedAt,
    updatedBy: publishedBy ?? plan.updatedBy,
    version: plan.version + 1,
  };
}

export function archiveTrainingPlan(
  plan: TrainingPlan,
  archivedAt: Instant,
  archivedBy: UUID,
): TrainingPlan {
  if (plan.archivedAt !== null) return plan;
  return {
    ...plan,
    status: "archived",
    archivedAt,
    updatedAt: archivedAt,
    updatedBy: archivedBy,
    version: plan.version + 1,
  };
}

export function createPlanPhase(input: {
  readonly id: UUID;
  readonly workspaceId: WorkspaceId;
  readonly planId: UUID;
  readonly parentPhaseId?: UUID;
  readonly ordinal: number;
  readonly name: string;
  readonly classification?: PhaseClassification;
  readonly startsOn: LocalDate;
  readonly endsOn: LocalDate;
  readonly createdAt: Instant;
  readonly createdBy: UUID;
}): PlanPhase {
  assertPositiveInteger(input.ordinal, "Plan phase");
  const name = assertText(input.name, "Plan phase name");
  assertDateRange(input.startsOn, input.endsOn, "Plan phase");
  return {
    id: input.id,
    workspaceId: input.workspaceId,
    planId: input.planId,
    parentPhaseId: input.parentPhaseId ?? null,
    ordinal: input.ordinal,
    name,
    classification: input.classification ?? "custom",
    startsOn: input.startsOn,
    endsOn: input.endsOn,
    archivedAt: null,
    createdAt: input.createdAt,
    createdBy: input.createdBy,
    updatedAt: input.createdAt,
    updatedBy: input.createdBy,
    version: 1,
  };
}

export function updatePlanPhase(
  phase: PlanPhase,
  input: {
    readonly parentPhaseId?: UUID | null;
    readonly ordinal?: number;
    readonly name?: string;
    readonly classification?: PhaseClassification;
    readonly startsOn?: LocalDate;
    readonly endsOn?: LocalDate;
    readonly updatedAt: Instant;
    readonly updatedBy: UUID;
  },
): PlanPhase {
  const startsOn = input.startsOn ?? phase.startsOn;
  const endsOn = input.endsOn ?? phase.endsOn;
  assertDateRange(startsOn, endsOn, "Plan phase");
  if (input.ordinal !== undefined)
    assertPositiveInteger(input.ordinal, "Plan phase");
  return {
    ...phase,
    parentPhaseId:
      input.parentPhaseId === undefined
        ? phase.parentPhaseId
        : input.parentPhaseId,
    ordinal: input.ordinal ?? phase.ordinal,
    name:
      input.name === undefined
        ? phase.name
        : assertText(input.name, "Plan phase name"),
    classification: input.classification ?? phase.classification,
    startsOn,
    endsOn,
    updatedAt: input.updatedAt,
    updatedBy: input.updatedBy,
    version: phase.version + 1,
  };
}

export function archivePlanPhase(
  phase: PlanPhase,
  archivedAt: Instant,
  archivedBy: UUID,
): PlanPhase {
  if (phase.archivedAt !== null) return phase;
  return {
    ...phase,
    archivedAt,
    updatedAt: archivedAt,
    updatedBy: archivedBy,
    version: phase.version + 1,
  };
}

export function createStrengthSetPrescription(
  input: Omit<StrengthSetPrescription, "id"> & { readonly id: UUID },
): StrengthSetPrescription {
  validateStrengthSetPrescription(input);
  return { ...input };
}

export function createSessionPrescription(input: {
  readonly id: UUID;
  readonly workspaceId: WorkspaceId;
  readonly athleteId: AthleteId;
  readonly planId: UUID;
  readonly phaseId?: UUID;
  readonly scheduledLocalDate: LocalDate;
  readonly timeZone: IanaTimeZone;
  readonly title: string;
  readonly blocks?: readonly PrescriptionBlock[];
  readonly createdAt: Instant;
  readonly createdBy: UUID;
}): SessionPrescription {
  assertLocalDate(input.scheduledLocalDate, "Session scheduled date");
  validatePrescriptionBlocks(input.blocks ?? []);
  return {
    id: input.id,
    workspaceId: input.workspaceId,
    athleteId: input.athleteId,
    planId: input.planId,
    phaseId: input.phaseId ?? null,
    scheduledLocalDate: input.scheduledLocalDate,
    timeZone: input.timeZone,
    title: assertText(input.title, "Session title"),
    status: "draft",
    revision: 1,
    publishedRevision: null,
    publishedAt: null,
    publishedBy: null,
    blocks: [...(input.blocks ?? [])],
    archivedAt: null,
    createdAt: input.createdAt,
    createdBy: input.createdBy,
    updatedAt: input.createdAt,
    updatedBy: input.createdBy,
    version: 1,
  };
}

export function updateSessionPrescription(
  session: SessionPrescription,
  input: {
    readonly phaseId?: UUID | null;
    readonly scheduledLocalDate?: LocalDate;
    readonly timeZone?: IanaTimeZone;
    readonly title?: string;
    readonly blocks?: readonly PrescriptionBlock[];
    readonly createRevision?: boolean;
    readonly updatedAt: Instant;
    readonly updatedBy: UUID;
  },
): SessionPrescription {
  if (session.status === "archived")
    throw new Error("Archived session prescriptions cannot be edited.");
  if (session.status === "published" && input.createRevision !== true)
    throw new Error(
      "Published session prescriptions require an explicit revision before editing.",
    );
  const scheduledLocalDate =
    input.scheduledLocalDate ?? session.scheduledLocalDate;
  assertLocalDate(scheduledLocalDate, "Session scheduled date");
  const blocks = input.blocks ?? session.blocks;
  validatePrescriptionBlocks(blocks);
  return {
    ...session,
    phaseId: input.phaseId === undefined ? session.phaseId : input.phaseId,
    scheduledLocalDate,
    timeZone: input.timeZone ?? session.timeZone,
    title:
      input.title === undefined
        ? session.title
        : assertText(input.title, "Session title"),
    status: input.createRevision === true ? "draft" : session.status,
    blocks: [...blocks],
    revision:
      input.createRevision === true ? session.revision + 1 : session.revision,
    updatedAt: input.updatedAt,
    updatedBy: input.updatedBy,
    version: session.version + 1,
  };
}

export function publishSessionPrescription(
  session: SessionPrescription,
  publishedAt: Instant,
  publishedBy: UUID,
): SessionPrescription {
  if (session.status !== "draft")
    throw new Error("Only draft session prescriptions can be published.");
  return {
    ...session,
    status: "published",
    publishedRevision: (session.publishedRevision ?? 0) + 1,
    publishedAt,
    publishedBy,
    updatedAt: publishedAt,
    updatedBy: publishedBy,
    version: session.version + 1,
  };
}

export function archiveSessionPrescription(
  session: SessionPrescription,
  archivedAt: Instant,
  archivedBy: UUID,
): SessionPrescription {
  if (session.archivedAt !== null) return session;
  return {
    ...session,
    status: "archived",
    archivedAt,
    updatedAt: archivedAt,
    updatedBy: archivedBy,
    version: session.version + 1,
  };
}
