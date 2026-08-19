import type {
  Workspace,
  WorkspaceMemberDetails,
  WorkspaceMembership,
  WorkspacePreferences,
} from "@workoutpal/accounts";
import type {
  AgentProposal,
  AgentProposalExecution,
  AgentProposalStatus,
  ApprovalDecision,
} from "@workoutpal/agent-operations";
import type { AuditEvent, IdempotencyRecord } from "@workoutpal/application";
import type {
  AthleteProfile,
  AthleteTrainingContext,
  CoachAssignment,
} from "@workoutpal/athletes";
import type {
  AthleteId,
  Instant,
  UUID,
  WorkspaceId,
} from "@workoutpal/shared-kernel";
import type {
  EnduranceSegment,
  MobilityItem,
  MovementDefinition,
  PlanPhase,
  PrescriptionBlock,
  SessionPrescription,
  StrengthSetPrescription,
  TrainingGoal,
  TrainingPlan,
} from "@workoutpal/training-design";

export function instant(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function localDate(value: unknown): string {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
}

export function mapAgentProposal(row: Record<string, unknown>): AgentProposal {
  const failureCode = row.failure_code;
  const failureMessage = row.failure_message;
  const executionId = row.execution_id;
  const approvedAt = row.approved_at;
  const rejectedAt = row.rejected_at;
  const executedAt = row.executed_at;
  return {
    proposalId: row.id as AgentProposal["proposalId"],
    workspaceId: row.workspace_id as AgentProposal["workspaceId"],
    requestingActorId:
      row.requesting_actor_id as AgentProposal["requestingActorId"],
    agentSessionId: String(row.agent_session_id),
    creationKey: String(row.creation_key),
    operationKind: row.operation_kind as AgentProposal["operationKind"],
    targetAggregateId:
      row.target_aggregate_id as AgentProposal["targetAggregateId"],
    targetExpectedVersion: Number(row.target_expected_version),
    normalizedCommand:
      row.normalized_command as AgentProposal["normalizedCommand"],
    commandDigest: String(row.command_digest),
    beforeProjection:
      row.before_projection as AgentProposal["beforeProjection"],
    afterProjection: row.after_projection as AgentProposal["afterProjection"],
    status: row.status as AgentProposalStatus,
    provenance: row.provenance as AgentProposal["provenance"],
    createdAt: instant(row.created_at) as AgentProposal["createdAt"],
    updatedAt: instant(row.updated_at) as AgentProposal["updatedAt"],
    version: Number(row.version),
    ...(failureCode === null || failureCode === undefined
      ? {}
      : { failureCode: String(failureCode) }),
    ...(failureMessage === null || failureMessage === undefined
      ? {}
      : { failureMessage: String(failureMessage) }),
    ...(executionId === null || executionId === undefined
      ? {}
      : { executionId: executionId as UUID }),
    ...(approvedAt === null || approvedAt === undefined
      ? {}
      : { approvedAt: instant(approvedAt) as Instant }),
    ...(rejectedAt === null || rejectedAt === undefined
      ? {}
      : { rejectedAt: instant(rejectedAt) as Instant }),
    ...(executedAt === null || executedAt === undefined
      ? {}
      : { executedAt: instant(executedAt) as Instant }),
  };
}

export function mapApprovalDecision(
  row: Record<string, unknown>,
): ApprovalDecision {
  return {
    approvalId: row.id as ApprovalDecision["approvalId"],
    workspaceId: row.workspace_id as ApprovalDecision["workspaceId"],
    proposalId: row.proposal_id as ApprovalDecision["proposalId"],
    proposalDigest: String(row.proposal_digest),
    approvingActorId:
      row.approving_actor_id as ApprovalDecision["approvingActorId"],
    agentSessionId: String(row.agent_session_id),
    approvalRequestId:
      row.approval_request_id === null ? null : String(row.approval_request_id),
    decision: row.decision as ApprovalDecision["decision"],
    decidedAt: instant(row.decided_at) as ApprovalDecision["decidedAt"],
  };
}

export function mapProposalExecution(
  row: Record<string, unknown>,
): AgentProposalExecution {
  return {
    executionId: row.id as AgentProposalExecution["executionId"],
    workspaceId: row.workspace_id as AgentProposalExecution["workspaceId"],
    proposalId: row.proposal_id as AgentProposalExecution["proposalId"],
    approvalId: row.approval_id as AgentProposalExecution["approvalId"],
    proposalDigest: String(row.proposal_digest),
    status: row.status as AgentProposalExecution["status"],
    resultingAggregateVersion:
      row.resulting_aggregate_version === null
        ? null
        : Number(row.resulting_aggregate_version),
    errorCode: row.error_code === null ? null : String(row.error_code),
    errorMessage: row.error_message === null ? null : String(row.error_message),
    executedAt: instant(
      row.executed_at,
    ) as AgentProposalExecution["executedAt"],
    requestId: String(row.request_id),
  };
}

export function mapWorkspace(row: Record<string, unknown>): Workspace {
  return {
    id: row.id as WorkspaceId,
    name: row.name as string,
    createdAt: instant(row.created_at) as Workspace["createdAt"],
    createdBy: row.created_by as UUID,
    updatedAt: instant(row.updated_at) as Workspace["updatedAt"],
    archivedAt:
      row.archived_at === null
        ? null
        : (instant(row.archived_at) as Workspace["archivedAt"]),
    version: Number(row.version),
  };
}

export function mapMembership(
  row: Record<string, unknown>,
): WorkspaceMembership {
  return {
    id: row.id as UUID,
    workspaceId: row.workspace_id as WorkspaceId,
    principalId: row.principal_id as UUID,
    role: row.role as WorkspaceMembership["role"],
    status: row.status as WorkspaceMembership["status"],
  };
}

export function mapAthlete(row: Record<string, unknown>): AthleteProfile {
  return {
    id: row.id as AthleteId,
    workspaceId: row.workspace_id as WorkspaceId,
    displayName: row.display_name as string,
    linkedUserId: row.linked_user_id as UUID | null,
    archivedAt:
      row.archived_at === null
        ? null
        : (instant(row.archived_at) as AthleteProfile["archivedAt"]),
    createdAt: instant(row.created_at) as AthleteProfile["createdAt"],
    createdBy: row.created_by as UUID,
    updatedAt: instant(row.updated_at) as AthleteProfile["updatedAt"],
    updatedBy: row.updated_by as UUID,
    version: Number(row.version),
  };
}

export function mapAthleteTrainingContext(
  row: Record<string, unknown>,
): AthleteTrainingContext {
  return {
    id: row.id as UUID,
    workspaceId: row.workspace_id as WorkspaceId,
    athleteId: row.athlete_id as AthleteId,
    trainingAgeMonths:
      row.training_age_months === null ? null : Number(row.training_age_months),
    availabilityNotes:
      row.availability_notes === null ? null : String(row.availability_notes),
    operationalConstraints:
      row.operational_constraints === null
        ? null
        : String(row.operational_constraints),
    equipmentAccess: arrayValue<string>(row.equipment_access),
    trainingPreferences:
      row.training_preferences === null
        ? null
        : String(row.training_preferences),
    practitionerNotes:
      row.practitioner_notes === null ? null : String(row.practitioner_notes),
    createdAt: instant(row.created_at) as AthleteTrainingContext["createdAt"],
    createdBy: row.created_by as UUID,
    updatedAt: instant(row.updated_at) as AthleteTrainingContext["updatedAt"],
    updatedBy: row.updated_by as UUID,
    version: Number(row.version),
  };
}

export function mapWorkspaceMemberDetails(
  row: Record<string, unknown>,
): WorkspaceMemberDetails {
  return {
    ...mapMembership(row),
    displayName:
      row.display_name === null || row.display_name === undefined
        ? null
        : String(row.display_name),
    email:
      row.email === null || row.email === undefined ? null : String(row.email),
  };
}

export function mapWorkspacePreferences(
  row: Record<string, unknown>,
): WorkspacePreferences {
  return {
    id: row.id as UUID,
    workspaceId: row.workspace_id as WorkspaceId,
    massUnit: row.mass_unit as WorkspacePreferences["massUnit"],
    distanceUnit: row.distance_unit as WorkspacePreferences["distanceUnit"],
    paceUnit: row.pace_unit as WorkspacePreferences["paceUnit"],
    createdAt: instant(row.created_at) as WorkspacePreferences["createdAt"],
    createdBy: row.created_by as UUID,
    updatedAt: instant(row.updated_at) as WorkspacePreferences["updatedAt"],
    updatedBy: row.updated_by as UUID,
    version: Number(row.version),
  };
}

export function mapAssignment(row: Record<string, unknown>): CoachAssignment {
  return {
    id: row.id as UUID,
    workspaceId: row.workspace_id as WorkspaceId,
    athleteId: row.athlete_id as AthleteId,
    coachPrincipalId: row.coach_principal_id as UUID,
    createdAt: instant(row.created_at) as CoachAssignment["createdAt"],
    createdBy: row.created_by as UUID,
  };
}

export function mapAudit(row: Record<string, unknown>): AuditEvent {
  return {
    id: row.id as UUID,
    occurredAt: instant(row.occurred_at) as AuditEvent["occurredAt"],
    workspaceId: row.workspace_id as WorkspaceId,
    actorId: row.actor_id as UUID,
    actorType: row.actor_type as AuditEvent["actorType"],
    action: row.action as string,
    aggregateType: row.aggregate_type as string,
    aggregateId: row.aggregate_id as UUID,
    versionBefore:
      row.version_before === null ? null : Number(row.version_before),
    versionAfter: row.version_after === null ? null : Number(row.version_after),
    requestId: row.request_id as string,
    payload: row.payload as Readonly<Record<string, unknown>>,
  };
}

export function mapIdempotency(
  row: Record<string, unknown>,
): IdempotencyRecord {
  return {
    workspaceId: row.workspace_id as WorkspaceId,
    actorId: row.actor_id as UUID,
    operation: row.operation as string,
    key: row.idempotency_key as string,
    requestHash: row.request_hash as string,
    outcome: row.outcome,
  };
}

function arrayValue<T>(value: unknown): readonly T[] {
  return Array.isArray(value) ? (value as readonly T[]) : [];
}

function optionalNumber(
  row: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = row[key];
  return value === null || value === undefined ? undefined : Number(value);
}

export function optionalString(
  row: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = row[key];
  return value === null || value === undefined ? undefined : String(value);
}

export function mapMovement(row: Record<string, unknown>): MovementDefinition {
  return {
    id: row.id as UUID,
    workspaceId:
      row.workspace_id === null ? null : (row.workspace_id as WorkspaceId),
    scope: row.scope as MovementDefinition["scope"],
    canonicalName: row.canonical_name as string,
    modality: row.modality as MovementDefinition["modality"],
    movementPattern:
      row.movement_pattern === null ? null : String(row.movement_pattern),
    laterality: row.laterality === null ? null : String(row.laterality),
    equipmentTags: arrayValue<string>(row.equipment_tags),
    archivedAt:
      row.archived_at === null
        ? null
        : (instant(row.archived_at) as MovementDefinition["archivedAt"]),
    createdAt: instant(row.created_at) as MovementDefinition["createdAt"],
    createdBy: row.created_by === null ? null : (row.created_by as UUID),
    updatedAt: instant(row.updated_at) as MovementDefinition["updatedAt"],
    updatedBy: row.updated_by === null ? null : (row.updated_by as UUID),
    version: Number(row.version),
  };
}

export function mapTrainingGoal(row: Record<string, unknown>): TrainingGoal {
  return {
    id: row.id as UUID,
    workspaceId: row.workspace_id as WorkspaceId,
    athleteId: row.athlete_id as AthleteId,
    title: row.title as string,
    description: row.description === null ? null : String(row.description),
    targetDate:
      row.target_date === null
        ? null
        : (localDate(row.target_date) as TrainingGoal["targetDate"]),
    startsOn:
      row.starts_on === null
        ? null
        : (localDate(row.starts_on) as TrainingGoal["startsOn"]),
    endsOn:
      row.ends_on === null
        ? null
        : (localDate(row.ends_on) as TrainingGoal["endsOn"]),
    archivedAt:
      row.archived_at === null
        ? null
        : (instant(row.archived_at) as TrainingGoal["archivedAt"]),
    createdAt: instant(row.created_at) as TrainingGoal["createdAt"],
    createdBy: row.created_by as UUID,
    updatedAt: instant(row.updated_at) as TrainingGoal["updatedAt"],
    updatedBy: row.updated_by as UUID,
    version: Number(row.version),
  };
}

export function mapTrainingPlan(
  row: Record<string, unknown>,
  fallbackGoalIds: readonly UUID[] = [],
): TrainingPlan {
  return {
    id: row.id as UUID,
    workspaceId: row.workspace_id as WorkspaceId,
    athleteId: row.athlete_id as AthleteId,
    title: row.title as string,
    description: row.description === null ? null : String(row.description),
    startsOn: localDate(row.starts_on) as TrainingPlan["startsOn"],
    endsOn: localDate(row.ends_on) as TrainingPlan["endsOn"],
    timeZone: row.time_zone as TrainingPlan["timeZone"],
    status: row.status as TrainingPlan["status"],
    goalIds:
      arrayValue<UUID>(row.goal_ids).length === 0
        ? fallbackGoalIds
        : arrayValue<UUID>(row.goal_ids),
    phases: [],
    publishedRevision:
      row.published_revision === null ? null : Number(row.published_revision),
    publishedAt:
      row.published_at === null
        ? null
        : (instant(row.published_at) as TrainingPlan["publishedAt"]),
    publishedBy: row.published_by === null ? null : (row.published_by as UUID),
    archivedAt:
      row.archived_at === null
        ? null
        : (instant(row.archived_at) as TrainingPlan["archivedAt"]),
    createdAt: instant(row.created_at) as TrainingPlan["createdAt"],
    createdBy: row.created_by as UUID,
    updatedAt: instant(row.updated_at) as TrainingPlan["updatedAt"],
    updatedBy: row.updated_by as UUID,
    version: Number(row.version),
  };
}

export function mapPlanPhase(row: Record<string, unknown>): PlanPhase {
  return {
    id: row.id as UUID,
    workspaceId: row.workspace_id as WorkspaceId,
    planId: row.plan_id as UUID,
    parentPhaseId:
      row.parent_phase_id === null ? null : (row.parent_phase_id as UUID),
    ordinal: Number(row.ordinal),
    name: row.name as string,
    classification: row.classification as PlanPhase["classification"],
    startsOn: localDate(row.starts_on) as PlanPhase["startsOn"],
    endsOn: localDate(row.ends_on) as PlanPhase["endsOn"],
    archivedAt:
      row.archived_at === null
        ? null
        : (instant(row.archived_at) as PlanPhase["archivedAt"]),
    createdAt: instant(row.created_at) as PlanPhase["createdAt"],
    createdBy: row.created_by as UUID,
    updatedAt: instant(row.updated_at) as PlanPhase["updatedAt"],
    updatedBy: row.updated_by as UUID,
    version: Number(row.version),
  };
}

export function mapStrengthSet(
  row: Record<string, unknown>,
): StrengthSetPrescription {
  const targetRepMin = optionalNumber(row, "target_rep_min");
  const targetRepMax = optionalNumber(row, "target_rep_max");
  const targetLoadKg = optionalNumber(row, "target_load_kg");
  const targetRpe = optionalNumber(row, "target_rpe");
  const targetRir = optionalNumber(row, "target_rir");
  const targetRestSeconds = optionalNumber(row, "target_rest_seconds");
  const targetDurationSeconds = optionalNumber(row, "target_duration_seconds");
  const targetVelocityMps = optionalNumber(row, "target_velocity_mps");
  const tempoDescriptor = optionalString(row, "tempo_descriptor");
  const notes = optionalString(row, "notes");
  return {
    id: row.id as UUID,
    ordinal: Number(row.ordinal),
    ...(targetRepMin === undefined ? {} : { targetRepMin }),
    ...(targetRepMax === undefined ? {} : { targetRepMax }),
    ...(targetLoadKg === undefined ? {} : { targetLoadKg }),
    ...(targetRpe === undefined ? {} : { targetRpe }),
    ...(targetRir === undefined ? {} : { targetRir }),
    ...(targetRestSeconds === undefined ? {} : { targetRestSeconds }),
    ...(targetDurationSeconds === undefined ? {} : { targetDurationSeconds }),
    ...(targetVelocityMps === undefined ? {} : { targetVelocityMps }),
    ...(row.target_rpe_scale === null || row.target_rpe_scale === undefined
      ? {}
      : { targetRpeScale: row.target_rpe_scale as "0-10" }),
    ...(row.target_rir_scale === null || row.target_rir_scale === undefined
      ? {}
      : { targetRirScale: row.target_rir_scale as "0-10" }),
    ...(tempoDescriptor === undefined ? {} : { tempoDescriptor }),
    ...(notes === undefined ? {} : { notes }),
  };
}

export function mapEnduranceSegment(
  row: Record<string, unknown>,
): EnduranceSegment {
  const durationSeconds = optionalNumber(row, "duration_seconds");
  const distanceMeters = optionalNumber(row, "distance_meters");
  const targetHrMin = optionalNumber(row, "target_hr_min");
  const targetHrMax = optionalNumber(row, "target_hr_max");
  const targetSpeedMpsMin = optionalNumber(row, "target_speed_mps_min");
  const targetSpeedMpsMax = optionalNumber(row, "target_speed_mps_max");
  const targetPowerWattsMin = optionalNumber(row, "target_power_watts_min");
  const targetPowerWattsMax = optionalNumber(row, "target_power_watts_max");
  const targetRpe = optionalNumber(row, "target_rpe");
  const notes = optionalString(row, "notes");
  return {
    id: row.id as UUID,
    parentSegmentId:
      row.parent_segment_id === null ? null : (row.parent_segment_id as UUID),
    ordinal: Number(row.ordinal),
    kind: row.kind as EnduranceSegment["kind"],
    repeatCount: Number(row.repeat_count),
    ...(durationSeconds === undefined ? {} : { durationSeconds }),
    ...(distanceMeters === undefined ? {} : { distanceMeters }),
    ...(targetHrMin === undefined ? {} : { targetHrMin }),
    ...(targetHrMax === undefined ? {} : { targetHrMax }),
    ...(targetSpeedMpsMin === undefined ? {} : { targetSpeedMpsMin }),
    ...(targetSpeedMpsMax === undefined ? {} : { targetSpeedMpsMax }),
    ...(targetPowerWattsMin === undefined ? {} : { targetPowerWattsMin }),
    ...(targetPowerWattsMax === undefined ? {} : { targetPowerWattsMax }),
    ...(targetRpe === undefined ? {} : { targetRpe }),
    ...(notes === undefined ? {} : { notes }),
  };
}

export function mapMobilityItem(row: Record<string, unknown>): MobilityItem {
  const sets = optionalNumber(row, "sets");
  const reps = optionalNumber(row, "reps");
  const holdSeconds = optionalNumber(row, "hold_seconds");
  const targetRpe = optionalNumber(row, "target_rpe");
  const notes = optionalString(row, "notes");
  const side =
    row.side === null || row.side === undefined
      ? undefined
      : (row.side as MobilityItem["side"]);
  return {
    id: row.id as UUID,
    movementId: row.movement_id as UUID,
    ordinal: Number(row.ordinal),
    ...(sets === undefined ? {} : { sets }),
    ...(reps === undefined ? {} : { reps }),
    ...(holdSeconds === undefined ? {} : { holdSeconds }),
    ...(side === undefined ? {} : { side }),
    ...(targetRpe === undefined ? {} : { targetRpe }),
    ...(notes === undefined ? {} : { notes }),
  };
}

export function mapSession(
  row: Record<string, unknown>,
  blocks: readonly PrescriptionBlock[],
): SessionPrescription {
  return {
    id: row.id as UUID,
    workspaceId: row.workspace_id as WorkspaceId,
    athleteId: row.athlete_id as AthleteId,
    planId: row.plan_id as UUID,
    phaseId: row.phase_id === null ? null : (row.phase_id as UUID),
    scheduledLocalDate: localDate(
      row.scheduled_local_date,
    ) as SessionPrescription["scheduledLocalDate"],
    timeZone: row.time_zone as SessionPrescription["timeZone"],
    title: row.title as string,
    status: row.status as SessionPrescription["status"],
    revision: Number(row.revision),
    publishedRevision:
      row.published_revision === null ? null : Number(row.published_revision),
    publishedAt:
      row.published_at === null
        ? null
        : (instant(row.published_at) as SessionPrescription["publishedAt"]),
    publishedBy: row.published_by === null ? null : (row.published_by as UUID),
    blocks,
    archivedAt:
      row.archived_at === null
        ? null
        : (instant(row.archived_at) as SessionPrescription["archivedAt"]),
    createdAt: instant(row.created_at) as SessionPrescription["createdAt"],
    createdBy: row.created_by as UUID,
    updatedAt: instant(row.updated_at) as SessionPrescription["updatedAt"],
    updatedBy: row.updated_by as UUID,
    version: Number(row.version),
  };
}
