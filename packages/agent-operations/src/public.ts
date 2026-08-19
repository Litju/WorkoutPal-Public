import type { WorkspaceRole } from "@workoutpal/accounts";
import type { AthleteProfile } from "@workoutpal/athletes";
import type {
  AmendmentProvenance,
  EnduranceSegmentComparison,
  MetricDefinition,
  MobilityItemComparison,
  MonitoringFactProvenance,
  MonitoringOverview,
  ObservationView,
  SessionMonitoringView,
  StrengthSetComparison,
} from "@workoutpal/monitoring";
import type {
  ActorContext,
  AthleteId,
  IanaTimeZone,
  Instant,
  LocalDate,
  UUID,
  WorkspaceId,
  WorkspaceScope,
} from "@workoutpal/shared-kernel";
import type {
  SessionPrescription,
  TrainingPlan,
} from "@workoutpal/training-design";
import type { ExecutedSession } from "@workoutpal/training-execution";

export type AgentAuthorityClass =
  | "READ"
  | "ANALYZE"
  | "PROPOSE"
  | "MUTATE"
  | "HIGH_IMPACT";

export interface AgentToolDefinition {
  readonly name: string;
  readonly authorityClass: AgentAuthorityClass;
  readonly description: string;
}

/**
 * F6 intentionally exposes only product-owned, read-only verbs.  This list is
 * also used by the architecture and mutation-sentinel tests; adding a tool is
 * therefore an explicit security review rather than an incidental Eve file.
 */
export const F6_AGENT_TOOL_CATALOG = [
  {
    name: "list_athletes",
    authorityClass: "READ",
    description: "List athletes visible to the authenticated workspace actor.",
  },
  {
    name: "get_athlete",
    authorityClass: "READ",
    description: "Read one authorized athlete profile.",
  },
  {
    name: "get_training_plan",
    authorityClass: "READ",
    description: "Read one authorized training plan and its published content.",
  },
  {
    name: "list_published_training_window",
    authorityClass: "READ",
    description:
      "Read published prescriptions in an explicit local-date window.",
  },
  {
    name: "get_session_prescription",
    authorityClass: "READ",
    description: "Read one authorized session prescription.",
  },
  {
    name: "list_executed_sessions",
    authorityClass: "READ",
    description: "List executed sessions for one authorized athlete.",
  },
  {
    name: "get_execution_review",
    authorityClass: "READ",
    description:
      "Read immutable performed facts, observations, and amendments.",
  },
  {
    name: "get_monitoring_overview",
    authorityClass: "READ",
    description:
      "Read governed plan-versus-execution monitoring facts for a window.",
  },
  {
    name: "get_session_monitoring",
    authorityClass: "READ",
    description: "Read one governed plan-versus-execution monitoring view.",
  },
] as const satisfies readonly AgentToolDefinition[];

export type F6AgentToolName = (typeof F6_AGENT_TOOL_CATALOG)[number]["name"];

export const F6_AGENT_TOOL_COUNT = F6_AGENT_TOOL_CATALOG.length;
export const F6_AGENT_WRITE_TOOL_COUNT = F6_AGENT_TOOL_CATALOG.filter(
  (tool) => tool.authorityClass !== "READ",
).length;

export const F7_AGENT_TOOL_CATALOG = [
  ...F6_AGENT_TOOL_CATALOG,
  {
    name: "propose_reschedule_session",
    authorityClass: "PROPOSE",
    description:
      "Create a version-bound proposal to move one session prescription to an explicitly requested local date.",
  },
  {
    name: "propose_set_strength_target_load",
    authorityClass: "PROPOSE",
    description:
      "Create a version-bound proposal to set one explicitly identified strength set target load.",
  },
  {
    name: "execute_agent_proposal",
    authorityClass: "MUTATE",
    description:
      "Execute one already approved WorkoutPal proposal after the server rechecks authorization, digest, and aggregate version.",
  },
] as const satisfies readonly AgentToolDefinition[];

/** The complete authored model-facing catalog for the current F7 surface. */
export const AGENT_TOOL_CATALOG = F7_AGENT_TOOL_CATALOG;

export type F7AgentToolName = (typeof F7_AGENT_TOOL_CATALOG)[number]["name"];

export const F7_AGENT_TOOL_COUNT = F7_AGENT_TOOL_CATALOG.length;
export const F7_AGENT_PROPOSAL_TOOL_COUNT = F7_AGENT_TOOL_CATALOG.filter(
  (tool) => tool.authorityClass === "PROPOSE",
).length;
export const F7_AGENT_DOMAIN_EXECUTION_TOOL_COUNT =
  F7_AGENT_TOOL_CATALOG.filter(
    (tool) => tool.name === "execute_agent_proposal",
  ).length;
export const F7_AGENT_UNAPPROVED_DOMAIN_WRITE_TOOL_COUNT =
  F7_AGENT_TOOL_CATALOG.filter(
    (tool) =>
      tool.authorityClass === "MUTATE" &&
      tool.name !== "execute_agent_proposal",
  ).length;

export type AgentOperationKind =
  | "RESCHEDULE_SESSION_PRESCRIPTION"
  | "SET_STRENGTH_SET_TARGET_LOAD";

export interface RescheduleSessionPrescriptionCommand {
  readonly kind: "RESCHEDULE_SESSION_PRESCRIPTION";
  readonly sessionPrescriptionId: UUID;
  readonly scheduledLocalDate: LocalDate;
}

export interface SetStrengthSetTargetLoadCommand {
  readonly kind: "SET_STRENGTH_SET_TARGET_LOAD";
  readonly sessionPrescriptionId: UUID;
  readonly strengthSetId: UUID;
  readonly targetLoadKg: number;
}

export type AgentMutationCommand =
  | RescheduleSessionPrescriptionCommand
  | SetStrengthSetTargetLoadCommand;

export interface AgentSessionScheduleProjection {
  readonly kind: "SESSION_SCHEDULE";
  readonly sessionPrescriptionId: UUID;
  readonly scheduledLocalDate: LocalDate;
  readonly timeZone: IanaTimeZone;
  readonly version: number;
}

export interface AgentStrengthSetLoadProjection {
  readonly kind: "STRENGTH_SET_LOAD";
  readonly sessionPrescriptionId: UUID;
  readonly strengthSetId: UUID;
  readonly movementId: UUID;
  readonly ordinal: number;
  readonly targetLoadKg: number | null;
  readonly version: number;
}

export type AgentProposalProjection =
  | AgentSessionScheduleProjection
  | AgentStrengthSetLoadProjection;

export interface AgentProposalProvenance {
  readonly source: "WORKOUTPAL_AGENT";
  readonly toolName:
    | "propose_reschedule_session"
    | "propose_set_strength_target_load";
  readonly agentSessionId: string;
  readonly callId: string;
  readonly requestId: string;
  readonly explicitIntent: true;
  readonly createdAt: Instant;
}

export type AgentProposalStatus =
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "STALE"
  | "EXECUTING"
  | "EXECUTED"
  | "FAILED";

export interface AgentProposal {
  readonly proposalId: UUID;
  readonly workspaceId: WorkspaceId;
  readonly requestingActorId: UUID;
  readonly agentSessionId: string;
  readonly creationKey: string;
  readonly operationKind: AgentOperationKind;
  readonly targetAggregateId: UUID;
  readonly targetExpectedVersion: number;
  readonly normalizedCommand: AgentMutationCommand;
  readonly commandDigest: string;
  readonly beforeProjection: AgentProposalProjection;
  readonly afterProjection: AgentProposalProjection;
  readonly status: AgentProposalStatus;
  readonly provenance: AgentProposalProvenance;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
  readonly version: number;
  readonly failureCode?: string;
  readonly failureMessage?: string;
  readonly executionId?: UUID;
  readonly approvedAt?: Instant;
  readonly rejectedAt?: Instant;
  readonly executedAt?: Instant;
}

/** Safe browser/model projection. Actor and workspace identity stay server-side. */
export interface AgentProposalDto {
  readonly proposalId: UUID;
  readonly operationKind: AgentOperationKind;
  readonly targetExpectedVersion: number;
  readonly normalizedCommand: AgentMutationCommand;
  readonly commandDigest: string;
  readonly beforeProjection: AgentProposalProjection;
  readonly afterProjection: AgentProposalProjection;
  readonly status: AgentProposalStatus;
  readonly provenance: Pick<
    AgentProposalProvenance,
    "source" | "toolName" | "explicitIntent"
  >;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
  readonly version: number;
  readonly failureCode?: string;
  readonly failureMessage?: string;
  readonly executionId?: UUID;
}

export type AgentApprovalDecisionValue = "APPROVE" | "REJECT";

export interface ApprovalDecision {
  readonly approvalId: UUID;
  readonly workspaceId: WorkspaceId;
  readonly proposalId: UUID;
  readonly proposalDigest: string;
  readonly approvingActorId: UUID;
  readonly agentSessionId: string;
  readonly approvalRequestId: string | null;
  readonly decision: AgentApprovalDecisionValue;
  readonly decidedAt: Instant;
}

export interface AgentProposalExecution {
  readonly executionId: UUID;
  readonly workspaceId: WorkspaceId;
  readonly proposalId: UUID;
  readonly approvalId: UUID;
  readonly proposalDigest: string;
  readonly status: "EXECUTED" | "FAILED";
  readonly resultingAggregateVersion: number | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly executedAt: Instant;
  readonly requestId: string;
}

export interface AgentProposalRepository {
  get(scope: WorkspaceScope, proposalId: UUID): Promise<AgentProposal | null>;
  findByCreationKey(input: {
    readonly scope: WorkspaceScope;
    readonly requestingActorId: UUID;
    readonly agentSessionId: string;
    readonly creationKey: string;
  }): Promise<AgentProposal | null>;
  insert(proposal: AgentProposal): Promise<void>;
  updateState(input: {
    readonly scope: WorkspaceScope;
    readonly proposalId: UUID;
    readonly expectedStatus: AgentProposalStatus;
    readonly status: AgentProposalStatus;
    readonly updatedAt: Instant;
    readonly failureCode?: string | null;
    readonly failureMessage?: string | null;
    readonly executionId?: UUID | null;
    readonly approvedAt?: Instant | null;
    readonly rejectedAt?: Instant | null;
    readonly executedAt?: Instant | null;
  }): Promise<AgentProposal | null>;
}

export interface ApprovalDecisionRepository {
  getForProposal(
    scope: WorkspaceScope,
    proposalId: UUID,
  ): Promise<ApprovalDecision | null>;
  insert(decision: ApprovalDecision): Promise<void>;
}

export interface AgentProposalExecutionRepository {
  getForProposal(
    scope: WorkspaceScope,
    proposalId: UUID,
  ): Promise<AgentProposalExecution | null>;
  insert(execution: AgentProposalExecution): Promise<void>;
}

export interface AgentMutationContext {
  readonly actor: ActorContext;
  readonly agentSessionId: string;
  readonly callId: string;
  readonly toolName: string;
  readonly requestId: string;
}

export interface AgentMutationFacade {
  proposeReschedule(input: {
    readonly sessionPrescriptionId: UUID;
    readonly scheduledLocalDate: LocalDate;
  }): Promise<AgentProposalDto>;
  proposeSetStrengthTargetLoad(input: {
    readonly sessionPrescriptionId: UUID;
    readonly strengthSetId: UUID;
    readonly targetLoadKg: number;
  }): Promise<AgentProposalDto>;
  executeProposal(proposalId: UUID): Promise<AgentProposalExecutionResultDto>;
}

export interface AgentProposalExecutionResultDto {
  readonly ok: boolean;
  readonly proposal: AgentProposalDto;
  readonly execution: AgentProposalExecution | null;
}

function canonicalAgentSerialize(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map(canonicalAgentSerialize).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map(
      (key) => `${JSON.stringify(key)}:${canonicalAgentSerialize(object[key])}`,
    )
    .join(",")}}`;
}

/** F4-compatible canonical SHA-256 over authoritative structured command data. */
export async function computeAgentCommandDigest(input: {
  readonly workspaceId: WorkspaceId;
  readonly targetAggregateId: UUID;
  readonly targetExpectedVersion: number;
  readonly command: AgentMutationCommand;
}): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      canonicalAgentSerialize({
        workspaceId: input.workspaceId,
        targetAggregateId: input.targetAggregateId,
        targetExpectedVersion: input.targetExpectedVersion,
        command: input.command,
      }),
    ),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

const agentProposalTransitions: Readonly<
  Record<AgentProposalStatus, readonly AgentProposalStatus[]>
> = {
  PENDING_APPROVAL: ["APPROVED", "REJECTED"],
  APPROVED: ["EXECUTING", "STALE", "FAILED"],
  REJECTED: [],
  STALE: [],
  EXECUTING: ["EXECUTED", "FAILED"],
  EXECUTED: [],
  FAILED: [],
};

export function canTransitionAgentProposal(
  from: AgentProposalStatus,
  to: AgentProposalStatus,
): boolean {
  return agentProposalTransitions[from].includes(to);
}

export function assertAgentProposalTransition(
  from: AgentProposalStatus,
  to: AgentProposalStatus,
): void {
  if (!canTransitionAgentProposal(from, to)) {
    throw new Error(`Illegal agent proposal transition: ${from} -> ${to}.`);
  }
}

export function toAgentProposalDto(proposal: AgentProposal): AgentProposalDto {
  return {
    proposalId: proposal.proposalId,
    operationKind: proposal.operationKind,
    targetExpectedVersion: proposal.targetExpectedVersion,
    normalizedCommand: proposal.normalizedCommand,
    commandDigest: proposal.commandDigest,
    beforeProjection: proposal.beforeProjection,
    afterProjection: proposal.afterProjection,
    status: proposal.status,
    provenance: {
      source: proposal.provenance.source,
      toolName: proposal.provenance.toolName,
      explicitIntent: proposal.provenance.explicitIntent,
    },
    createdAt: proposal.createdAt,
    updatedAt: proposal.updatedAt,
    version: proposal.version,
    ...(proposal.failureCode === undefined
      ? {}
      : { failureCode: proposal.failureCode }),
    ...(proposal.failureMessage === undefined
      ? {}
      : { failureMessage: proposal.failureMessage }),
    ...(proposal.executionId === undefined
      ? {}
      : { executionId: proposal.executionId }),
  };
}

export type AgentEvidenceSource =
  | "athlete"
  | "training_plan"
  | "session_prescription"
  | "executed_session"
  | "performed_fact"
  | "monitoring_session"
  | "monitoring_window"
  | "amendment";

/** Stable source-record references exposed alongside every grounded DTO. */
export interface AgentEvidence {
  readonly source: AgentEvidenceSource;
  readonly recordId: UUID;
  readonly aggregateId: UUID;
  readonly aggregateVersion: number | null;
  readonly revision: number | null;
  readonly snapshotFingerprint: string | null;
  readonly sourceTimestamp: Instant | null;
  readonly amendmentIds: readonly UUID[];
}

export interface AgentGrounded<TData> {
  readonly data: TData;
  readonly evidence: readonly AgentEvidence[];
}

export interface AgentAthleteDto {
  readonly id: AthleteId;
  readonly displayName: string;
  readonly archivedAt: Instant | null;
  readonly version: number;
  readonly createdAt: Instant;
  readonly assignedCoachCount?: number;
}

export interface AgentPrescriptionBlockDto {
  readonly id: UUID;
  readonly kind: "strength" | "endurance" | "mobility" | "generic";
  readonly ordinal: number;
  readonly content: Readonly<Record<string, unknown>>;
}

export interface AgentSessionPrescriptionDto {
  readonly id: UUID;
  readonly planId: UUID;
  readonly athleteId: AthleteId;
  readonly phaseId: UUID | null;
  readonly scheduledLocalDate: LocalDate;
  readonly timeZone: IanaTimeZone;
  readonly title: string;
  readonly status: "draft" | "published" | "archived";
  readonly version: number;
  readonly revision: number;
  readonly publishedRevision: number | null;
  readonly publishedAt: Instant | null;
  readonly archivedAt: Instant | null;
  readonly blocks: readonly AgentPrescriptionBlockDto[];
}

export interface AgentTrainingPlanDto {
  readonly id: UUID;
  readonly athleteId: AthleteId;
  readonly title: string;
  readonly description: string | null;
  readonly startsOn: LocalDate;
  readonly endsOn: LocalDate;
  readonly timeZone: IanaTimeZone;
  readonly status: "draft" | "published" | "archived";
  readonly version: number;
  readonly publishedRevision: number | null;
  readonly publishedAt: Instant | null;
  readonly phases: readonly {
    readonly id: UUID;
    readonly ordinal: number;
    readonly name: string;
    readonly classification: string;
    readonly startsOn: LocalDate;
    readonly endsOn: LocalDate;
  }[];
  readonly goals: readonly {
    readonly id: UUID;
    readonly title: string;
    readonly description: string | null;
    readonly targetDate: LocalDate | null;
  }[];
  readonly sessions: readonly AgentSessionPrescriptionDto[];
}

export type AgentPerformedFactDto = Readonly<{
  readonly id: UUID;
  readonly kind: "strength-set" | "endurance-segment" | "mobility-item";
  readonly sessionId: UUID;
  readonly observedAt: Instant;
  readonly values: Readonly<Record<string, string | number | null>>;
}>;

export interface AgentExecutionReviewDto {
  readonly session: Readonly<{
    readonly id: UUID;
    readonly athleteId: AthleteId;
    readonly status: "started" | "completed" | "cancelled";
    readonly startedAt: Instant;
    readonly completedAt: Instant | null;
    readonly timeZone: IanaTimeZone;
    readonly version: number;
    readonly prescription: AgentPrescriptionReferenceDto | null;
  }>;
  readonly performedFacts: readonly AgentPerformedFactDto[];
  readonly observations: readonly {
    readonly id: UUID;
    readonly observedAt: Instant;
    readonly kind: string;
    readonly valueText: string | null;
    readonly valueNumber: number | null;
    readonly unit: string | null;
    readonly notes: string | null;
  }[];
  readonly amendments: readonly {
    readonly id: UUID;
    readonly factId: UUID;
    readonly factKind: string | null;
    readonly reason: string;
    readonly correctedFields: Readonly<Record<string, unknown>>;
    readonly occurredAt: Instant;
  }[];
}

export interface AgentExecutedSessionDto {
  readonly id: UUID;
  readonly athleteId: AthleteId;
  readonly status: "started" | "completed" | "cancelled";
  readonly startedAt: Instant;
  readonly completedAt: Instant | null;
  readonly timeZone: IanaTimeZone;
  readonly version: number;
  readonly prescription: AgentPrescriptionReferenceDto | null;
}

export interface AgentPrescriptionReferenceDto {
  readonly prescriptionId: UUID;
  readonly prescriptionVersion: number;
  readonly prescriptionRevision: number;
  readonly snapshotFingerprint: string;
}

export type AgentMonitoringProvenance = Omit<
  MonitoringFactProvenance,
  "workspaceId"
>;

export type AgentMonitoringAmendmentDto = Omit<AmendmentProvenance, "actorId">;

export type AgentMonitoringObservationDto = Omit<
  ObservationView,
  "workspaceId" | "provenance"
> & {
  readonly provenance: AgentMonitoringProvenance;
};

export type AgentStrengthComparisonDto = Omit<
  StrengthSetComparison,
  "provenance" | "amendments"
> & {
  readonly provenance: AgentMonitoringProvenance;
  readonly amendments: readonly AgentMonitoringAmendmentDto[];
};

export type AgentEnduranceComparisonDto = Omit<
  EnduranceSegmentComparison,
  "provenance" | "amendments"
> & {
  readonly provenance: AgentMonitoringProvenance;
  readonly amendments: readonly AgentMonitoringAmendmentDto[];
};

export type AgentMobilityComparisonDto = Omit<
  MobilityItemComparison,
  "provenance" | "amendments"
> & {
  readonly provenance: AgentMonitoringProvenance;
  readonly amendments: readonly AgentMonitoringAmendmentDto[];
};

export type AgentMonitoringSessionDto = Omit<
  SessionMonitoringView,
  | "workspaceId"
  | "athleteId"
  | "strength"
  | "endurance"
  | "mobility"
  | "observations"
  | "provenance"
  | "amendments"
> & {
  readonly strength: readonly AgentStrengthComparisonDto[];
  readonly endurance: readonly AgentEnduranceComparisonDto[];
  readonly mobility: readonly AgentMobilityComparisonDto[];
  readonly observations: readonly AgentMonitoringObservationDto[];
  readonly provenance: AgentMonitoringProvenance;
  readonly amendments: readonly AgentMonitoringAmendmentDto[];
};

export interface AgentMonitoringOverviewDto {
  readonly window: MonitoringOverview["window"];
  readonly prescribedSessionCount: number;
  readonly executedSessionCount: number;
  readonly linkedExecutedSessionCount: number;
  readonly completedSessionCount: number;
  readonly unplannedSessionCount: number;
  readonly amendedPerformedFactCount: number;
  readonly counts: MonitoringOverview["counts"];
  readonly sessions: readonly Pick<
    MonitoringOverview["sessions"][number],
    | "id"
    | "title"
    | "scheduledLocalDate"
    | "classification"
    | "prescriptionId"
    | "executionId"
    | "executionStatus"
    | "counts"
  >[];
}

export interface AgentTrustedSession {
  readonly actor: ActorContext;
  readonly workspaceScope: WorkspaceScope;
  readonly role: WorkspaceRole;
}

export interface AgentAuthPrincipalSnapshot {
  readonly principalId: string;
  readonly principalType: string;
  readonly attributes: Readonly<Record<string, string | readonly string[]>>;
}

export class AgentSessionSecurityError extends Error {
  readonly code:
    | "AGENT_AUTH_REQUIRED"
    | "AGENT_SESSION_SCOPE_MISMATCH"
    | "AGENT_SCOPE_INVALID";

  constructor(code: AgentSessionSecurityError["code"], message: string) {
    super(message);
    this.name = "AgentSessionSecurityError";
    this.code = code;
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function attributeValue(
  principal: AgentAuthPrincipalSnapshot,
  key: string,
): string | null {
  const value = principal.attributes[key];
  return typeof value === "string" ? value : null;
}

/**
 * Converts Eve's route-auth projection into the only actor scope the read
 * facade accepts.  The model never supplies any of these values; both the
 * current caller and the original session initiator must be present and
 * identical before a tool can read data.
 */
export function createTrustedAgentSession(input: {
  readonly current: AgentAuthPrincipalSnapshot | null;
  readonly initiator: AgentAuthPrincipalSnapshot | null;
}): AgentTrustedSession {
  const current = input.current;
  const initiator = input.initiator;
  if (current === null || initiator === null) {
    throw new AgentSessionSecurityError(
      "AGENT_AUTH_REQUIRED",
      "An authenticated session is required for WorkoutPal agent reads.",
    );
  }
  if (
    current.principalType !== "user" ||
    initiator.principalType !== "user" ||
    current.principalId !== initiator.principalId
  ) {
    throw new AgentSessionSecurityError(
      "AGENT_SESSION_SCOPE_MISMATCH",
      "This agent session is bound to a different authenticated actor.",
    );
  }

  const workspaceId = attributeValue(current, "workspaceId");
  const initiatorWorkspaceId = attributeValue(initiator, "workspaceId");
  const role = attributeValue(current, "role");
  if (
    workspaceId === null ||
    initiatorWorkspaceId !== workspaceId ||
    role === null ||
    !isUuid(current.principalId) ||
    !isUuid(workspaceId) ||
    !["owner", "coach", "athlete", "viewer"].includes(role)
  ) {
    throw new AgentSessionSecurityError(
      "AGENT_SCOPE_INVALID",
      "The authenticated agent scope is invalid or incomplete.",
    );
  }

  return {
    actor: {
      actorId: current.principalId as UUID,
      workspaceId: workspaceId as WorkspaceId,
      actorType: "HUMAN",
    },
    workspaceScope: { workspaceId: workspaceId as WorkspaceId },
    role: role as WorkspaceRole,
  };
}

export interface AgentReadQueryPort {
  listAthletes(input: {
    readonly principalId: UUID;
    readonly workspaceId: WorkspaceId;
    readonly requestId: string;
  }): Promise<
    readonly (AthleteProfile & { readonly assignedCoachCount: number })[]
  >;
  getAthlete(input: {
    readonly principalId: UUID;
    readonly workspaceId: WorkspaceId;
    readonly athleteId: AthleteId;
    readonly requestId: string;
  }): Promise<AthleteProfile>;
  listTrainingPlans(input: {
    readonly principalId: UUID;
    readonly workspaceId: WorkspaceId;
    readonly athleteId: AthleteId;
    readonly requestId: string;
  }): Promise<readonly TrainingPlan[]>;
  getTrainingPlan(input: {
    readonly principalId: UUID;
    readonly workspaceId: WorkspaceId;
    readonly planId: UUID;
    readonly requestId: string;
  }): Promise<import("@workoutpal/training-design").TrainingPlanDetails>;
  listSessionPrescriptions(input: {
    readonly principalId: UUID;
    readonly workspaceId: WorkspaceId;
    readonly planId: UUID;
    readonly requestId: string;
  }): Promise<readonly SessionPrescription[]>;
  getSessionPrescription(input: {
    readonly principalId: UUID;
    readonly workspaceId: WorkspaceId;
    readonly sessionId: UUID;
    readonly requestId: string;
  }): Promise<SessionPrescription>;
  listExecutedSessions(input: {
    readonly principalId: UUID;
    readonly workspaceId: WorkspaceId;
    readonly athleteId: AthleteId;
    readonly requestId: string;
  }): Promise<readonly ExecutedSession[]>;
  getExecutionReview(input: {
    readonly principalId: UUID;
    readonly workspaceId: WorkspaceId;
    readonly executionId: UUID;
    readonly requestId: string;
  }): Promise<{
    readonly session: ExecutedSession;
    readonly observations: readonly import("@workoutpal/training-execution").SessionObservation[];
    readonly amendments: readonly import("@workoutpal/training-execution").ExecutionAmendment[];
    readonly effectiveFacts: readonly import("@workoutpal/training-execution").PerformedFact[];
  }>;
  getMonitoringOverview(input: {
    readonly principalId: UUID;
    readonly workspaceId: WorkspaceId;
    readonly athleteId: AthleteId;
    readonly startDate: LocalDate;
    readonly endDate: LocalDate;
    readonly timeZone: IanaTimeZone;
    readonly requestId: string;
  }): Promise<MonitoringOverview>;
  getSessionMonitoring(input: {
    readonly principalId: UUID;
    readonly workspaceId: WorkspaceId;
    readonly executionId: UUID;
    readonly requestId: string;
  }): Promise<SessionMonitoringView>;
}

function evidence(input: AgentEvidence): AgentEvidence {
  return input;
}

function uniqueEvidence(
  items: readonly AgentEvidence[],
): readonly AgentEvidence[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.source}:${item.recordId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function planEvidence(plan: TrainingPlan): AgentEvidence {
  return evidence({
    source: "training_plan",
    recordId: plan.id,
    aggregateId: plan.id,
    aggregateVersion: plan.version,
    revision: plan.publishedRevision,
    snapshotFingerprint: null,
    sourceTimestamp: plan.publishedAt ?? plan.updatedAt,
    amendmentIds: [],
  });
}

function prescriptionEvidence(session: SessionPrescription): AgentEvidence {
  return evidence({
    source: "session_prescription",
    recordId: session.id,
    aggregateId: session.id,
    aggregateVersion: session.version,
    revision: session.publishedRevision ?? session.revision,
    snapshotFingerprint: null,
    sourceTimestamp: session.publishedAt ?? session.updatedAt,
    amendmentIds: [],
  });
}

function athleteEvidence(athlete: AthleteProfile): AgentEvidence {
  return evidence({
    source: "athlete",
    recordId: athlete.id,
    aggregateId: athlete.id,
    aggregateVersion: athlete.version,
    revision: null,
    snapshotFingerprint: null,
    sourceTimestamp: athlete.updatedAt,
    amendmentIds: [],
  });
}

function executionEvidence(session: ExecutedSession): AgentEvidence {
  return evidence({
    source: "executed_session",
    recordId: session.id,
    aggregateId: session.id,
    aggregateVersion: session.version,
    revision: session.prescription?.prescriptionRevision ?? null,
    snapshotFingerprint: session.prescription?.snapshotFingerprint ?? null,
    sourceTimestamp: session.completedAt ?? session.startedAt,
    amendmentIds: [],
  });
}

function prescriptionBlockDto(
  block: SessionPrescription["blocks"][number],
): AgentPrescriptionBlockDto {
  if (block.kind === "strength") {
    return {
      id: block.id,
      kind: block.kind,
      ordinal: block.ordinal,
      content: {
        exercises: block.exercises.map((exercise) => ({
          id: exercise.id,
          movementId: exercise.movementId,
          ordinal: exercise.ordinal,
          notes: exercise.notes ?? null,
          sets: exercise.sets,
        })),
      },
    };
  }
  if (block.kind === "endurance") {
    return {
      id: block.id,
      kind: block.kind,
      ordinal: block.ordinal,
      content: { segments: block.segments },
    };
  }
  if (block.kind === "mobility") {
    return {
      id: block.id,
      kind: block.kind,
      ordinal: block.ordinal,
      content: { items: block.items },
    };
  }
  return {
    id: block.id,
    kind: block.kind,
    ordinal: block.ordinal,
    content: { description: block.description },
  };
}

function sessionPrescriptionDto(
  session: SessionPrescription,
): AgentSessionPrescriptionDto {
  return {
    id: session.id,
    planId: session.planId,
    athleteId: session.athleteId,
    phaseId: session.phaseId,
    scheduledLocalDate: session.scheduledLocalDate,
    timeZone: session.timeZone,
    title: session.title,
    status: session.status,
    version: session.version,
    revision: session.revision,
    publishedRevision: session.publishedRevision,
    publishedAt: session.publishedAt,
    archivedAt: session.archivedAt,
    blocks: session.blocks.map(prescriptionBlockDto),
  };
}

function trainingPlanDto(
  details: import("@workoutpal/training-design").TrainingPlanDetails,
): AgentTrainingPlanDto {
  return {
    id: details.plan.id,
    athleteId: details.plan.athleteId,
    title: details.plan.title,
    description: details.plan.description,
    startsOn: details.plan.startsOn,
    endsOn: details.plan.endsOn,
    timeZone: details.plan.timeZone,
    status: details.plan.status,
    version: details.plan.version,
    publishedRevision: details.plan.publishedRevision,
    publishedAt: details.plan.publishedAt,
    phases: details.phases.map((phase) => ({
      id: phase.id,
      ordinal: phase.ordinal,
      name: phase.name,
      classification: phase.classification,
      startsOn: phase.startsOn,
      endsOn: phase.endsOn,
    })),
    goals: details.goals.map((goal) => ({
      id: goal.id,
      title: goal.title,
      description: goal.description,
      targetDate: goal.targetDate,
    })),
    sessions: details.sessions.map(sessionPrescriptionDto),
  };
}

function performedFactDto(
  fact: import("@workoutpal/training-execution").PerformedFact,
): AgentPerformedFactDto {
  if (fact.kind === "strength-set") {
    return {
      id: fact.id,
      kind: fact.kind,
      sessionId: fact.sessionId,
      observedAt: fact.observedAt,
      values: {
        movementId: fact.movementId,
        repetitions: fact.repetitions ?? null,
        loadKg: fact.loadKg ?? null,
        rpe: fact.rpe ?? null,
        rir: fact.rir ?? null,
        durationSeconds: fact.durationSeconds ?? null,
        notes: fact.notes ?? null,
      },
    };
  }
  if (fact.kind === "endurance-segment") {
    return {
      id: fact.id,
      kind: fact.kind,
      sessionId: fact.sessionId,
      observedAt: fact.observedAt,
      values: {
        modality: fact.modality ?? null,
        durationSeconds: fact.durationSeconds ?? null,
        distanceMeters: fact.distanceMeters ?? null,
        averageHeartRateBpm: fact.averageHeartRateBpm ?? null,
        averagePowerWatts: fact.averagePowerWatts ?? null,
        rpe: fact.rpe ?? null,
        notes: fact.notes ?? null,
      },
    };
  }
  return {
    id: fact.id,
    kind: fact.kind,
    sessionId: fact.sessionId,
    observedAt: fact.observedAt,
    values: {
      movementId: fact.movementId,
      sets: fact.sets ?? null,
      repetitions: fact.repetitions ?? null,
      durationSeconds: fact.durationSeconds ?? null,
      side: fact.side ?? null,
      rpe: fact.rpe ?? null,
      notes: fact.notes ?? null,
    },
  };
}

function prescriptionReferenceDto(
  prescription: ExecutedSession["prescription"],
): AgentPrescriptionReferenceDto | null {
  if (prescription === null) {
    return null;
  }
  return {
    prescriptionId: prescription.prescriptionId,
    prescriptionVersion: prescription.prescriptionVersion,
    prescriptionRevision: prescription.prescriptionRevision,
    snapshotFingerprint: prescription.snapshotFingerprint,
  };
}

function executionReviewDto(input: {
  readonly session: ExecutedSession;
  readonly observations: readonly import("@workoutpal/training-execution").SessionObservation[];
  readonly amendments: readonly import("@workoutpal/training-execution").ExecutionAmendment[];
  readonly effectiveFacts: readonly import("@workoutpal/training-execution").PerformedFact[];
}): AgentExecutionReviewDto {
  return {
    session: {
      id: input.session.id,
      athleteId: input.session.athleteId,
      status: input.session.status,
      startedAt: input.session.startedAt,
      completedAt: input.session.completedAt,
      timeZone: input.session.timeZone,
      version: input.session.version,
      prescription: prescriptionReferenceDto(input.session.prescription),
    },
    performedFacts: input.effectiveFacts.map(performedFactDto),
    observations: input.observations.map((observation) => ({
      id: observation.id,
      observedAt: observation.observedAt,
      kind: observation.kind,
      valueText: observation.valueText ?? null,
      valueNumber: observation.valueNumber ?? null,
      unit: observation.unit ?? null,
      notes: observation.notes ?? null,
    })),
    amendments: input.amendments.map((amendment) => ({
      id: amendment.id,
      factId: amendment.factId,
      factKind: amendment.factKind ?? null,
      reason: amendment.reason,
      correctedFields: amendment.correctedFields,
      occurredAt: amendment.occurredAt,
    })),
  };
}

function monitoringProvenanceDto(
  provenance: MonitoringFactProvenance,
): AgentMonitoringProvenance {
  return {
    prescriptionId: provenance.prescriptionId,
    prescriptionVersion: provenance.prescriptionVersion,
    prescriptionRevision: provenance.prescriptionRevision,
    prescriptionSnapshotFingerprint: provenance.prescriptionSnapshotFingerprint,
    executionId: provenance.executionId,
    performedFactId: provenance.performedFactId,
    sourceTimestamp: provenance.sourceTimestamp,
    amendmentIds: provenance.amendmentIds,
  };
}

function monitoringAmendmentDto(
  amendment: AmendmentProvenance,
): AgentMonitoringAmendmentDto {
  return {
    amendmentId: amendment.amendmentId,
    factId: amendment.factId,
    factKind: amendment.factKind,
    reason: amendment.reason,
    originalValues: amendment.originalValues,
    correctedFields: amendment.correctedFields,
    occurredAt: amendment.occurredAt,
  };
}

function monitoringObservationDto(
  observation: ObservationView,
): AgentMonitoringObservationDto {
  return {
    id: observation.id,
    executionId: observation.executionId,
    observedAt: observation.observedAt,
    kind: observation.kind,
    valueText: observation.valueText,
    valueNumber: observation.valueNumber,
    unit: observation.unit,
    notes: observation.notes,
    provenance: monitoringProvenanceDto(observation.provenance),
  };
}

function monitoringStrengthDto(
  comparison: StrengthSetComparison,
): AgentStrengthComparisonDto {
  return {
    movementId: comparison.movementId,
    movementName: comparison.movementName,
    performedMovementId: comparison.performedMovementId,
    performedMovementName: comparison.performedMovementName,
    prescribedSetId: comparison.prescribedSetId,
    prescribedSetOrdinal: comparison.prescribedSetOrdinal,
    performedSetOrdinal: comparison.performedSetOrdinal,
    prescribedRepMin: comparison.prescribedRepMin,
    prescribedRepMax: comparison.prescribedRepMax,
    performedRepetitions: comparison.performedRepetitions,
    prescribedLoadKg: comparison.prescribedLoadKg,
    performedLoadKg: comparison.performedLoadKg,
    prescribedRpe: comparison.prescribedRpe,
    observedRpe: comparison.observedRpe,
    prescribedRir: comparison.prescribedRir,
    observedRir: comparison.observedRir,
    prescribedRestSeconds: comparison.prescribedRestSeconds,
    observedDurationSeconds: comparison.observedDurationSeconds,
    prescribedDurationSeconds: comparison.prescribedDurationSeconds,
    prescribedVelocityMps: comparison.prescribedVelocityMps,
    observedAt: comparison.observedAt,
    performedFactId: comparison.performedFactId,
    status: comparison.status,
    provenance: monitoringProvenanceDto(comparison.provenance),
    amendments: comparison.amendments.map(monitoringAmendmentDto),
  };
}

function monitoringEnduranceDto(
  comparison: EnduranceSegmentComparison,
): AgentEnduranceComparisonDto {
  return {
    segmentKind: comparison.segmentKind,
    prescribedSegmentId: comparison.prescribedSegmentId,
    prescribedOrdinal: comparison.prescribedOrdinal,
    prescribedTreePosition: comparison.prescribedTreePosition,
    repeatCount: comparison.repeatCount,
    performedFactId: comparison.performedFactId,
    prescribedDurationSeconds: comparison.prescribedDurationSeconds,
    performedDurationSeconds: comparison.performedDurationSeconds,
    prescribedDistanceMeters: comparison.prescribedDistanceMeters,
    performedDistanceMeters: comparison.performedDistanceMeters,
    prescribedHrMin: comparison.prescribedHrMin,
    prescribedHrMax: comparison.prescribedHrMax,
    observedAverageHeartRateBpm: comparison.observedAverageHeartRateBpm,
    prescribedSpeedMpsMin: comparison.prescribedSpeedMpsMin,
    prescribedSpeedMpsMax: comparison.prescribedSpeedMpsMax,
    observedSpeedMps: comparison.observedSpeedMps,
    prescribedPowerWattsMin: comparison.prescribedPowerWattsMin,
    prescribedPowerWattsMax: comparison.prescribedPowerWattsMax,
    observedAveragePowerWatts: comparison.observedAveragePowerWatts,
    prescribedRpe: comparison.prescribedRpe,
    observedRpe: comparison.observedRpe,
    modality: comparison.modality,
    observedAt: comparison.observedAt,
    status: comparison.status,
    provenance: monitoringProvenanceDto(comparison.provenance),
    amendments: comparison.amendments.map(monitoringAmendmentDto),
  };
}

function monitoringMobilityDto(
  comparison: MobilityItemComparison,
): AgentMobilityComparisonDto {
  return {
    movementId: comparison.movementId,
    movementName: comparison.movementName,
    performedMovementId: comparison.performedMovementId,
    performedMovementName: comparison.performedMovementName,
    side: comparison.side,
    performedSide: comparison.performedSide,
    prescribedItemId: comparison.prescribedItemId,
    prescribedOrdinal: comparison.prescribedOrdinal,
    performedFactId: comparison.performedFactId,
    prescribedSets: comparison.prescribedSets,
    performedSets: comparison.performedSets,
    prescribedRepetitions: comparison.prescribedRepetitions,
    performedRepetitions: comparison.performedRepetitions,
    prescribedHoldSeconds: comparison.prescribedHoldSeconds,
    performedHoldSeconds: comparison.performedHoldSeconds,
    prescribedRpe: comparison.prescribedRpe,
    observedRpe: comparison.observedRpe,
    observedAt: comparison.observedAt,
    status: comparison.status,
    provenance: monitoringProvenanceDto(comparison.provenance),
    amendments: comparison.amendments.map(monitoringAmendmentDto),
  };
}

function monitoringSessionDto(
  view: SessionMonitoringView,
): AgentMonitoringSessionDto {
  return {
    id: view.id,
    title: view.title,
    scheduledLocalDate: view.scheduledLocalDate,
    classification: view.classification,
    prescriptionId: view.prescriptionId,
    executionId: view.executionId,
    executionStatus: view.executionStatus,
    counts: view.counts,
    timeZone: view.timeZone,
    prescription: view.prescription,
    execution: view.execution,
    strength: view.strength.map(monitoringStrengthDto),
    endurance: view.endurance.map(monitoringEnduranceDto),
    mobility: view.mobility.map(monitoringMobilityDto),
    observations: view.observations.map(monitoringObservationDto),
    provenance: monitoringProvenanceDto(
      view.strength[0]?.provenance ??
        view.endurance[0]?.provenance ??
        view.mobility[0]?.provenance ?? {
          workspaceId: view.workspaceId,
          prescriptionId: view.prescriptionId,
          prescriptionVersion: view.prescription?.prescriptionVersion ?? null,
          prescriptionRevision: view.prescription?.prescriptionRevision ?? null,
          prescriptionSnapshotFingerprint:
            view.prescription?.snapshotFingerprint ?? null,
          executionId: view.executionId,
          performedFactId: null,
          sourceTimestamp:
            view.execution?.completedAt ?? view.execution?.startedAt ?? null,
          amendmentIds: view.amendments.map(
            (amendment) => amendment.amendmentId,
          ),
        },
    ),
    amendments: view.amendments.map(monitoringAmendmentDto),
  };
}

function monitoringEvidence(view: SessionMonitoringView): AgentEvidence[] {
  const items: AgentEvidence[] = [
    evidence({
      source: "monitoring_session",
      recordId: view.id,
      aggregateId: view.executionId ?? view.prescriptionId ?? view.id,
      aggregateVersion: view.prescription?.prescriptionVersion ?? null,
      revision: view.prescription?.prescriptionRevision ?? null,
      snapshotFingerprint: view.prescription?.snapshotFingerprint ?? null,
      sourceTimestamp:
        view.execution?.completedAt ?? view.execution?.startedAt ?? null,
      amendmentIds: view.amendments.map((amendment) => amendment.amendmentId),
    }),
  ];
  const rows = [...view.strength, ...view.endurance, ...view.mobility];
  for (const row of rows) {
    const provenance = row.provenance;
    if (provenance.performedFactId !== null) {
      items.push(
        evidence({
          source: "performed_fact",
          recordId: provenance.performedFactId,
          aggregateId: provenance.executionId ?? view.id,
          aggregateVersion: provenance.prescriptionVersion,
          revision: provenance.prescriptionRevision,
          snapshotFingerprint: provenance.prescriptionSnapshotFingerprint,
          sourceTimestamp: provenance.sourceTimestamp,
          amendmentIds: provenance.amendmentIds,
        }),
      );
    }
  }
  return items;
}

function monitoringOverviewDto(
  overview: MonitoringOverview,
): AgentMonitoringOverviewDto {
  return {
    window: overview.window,
    prescribedSessionCount: overview.prescribedSessionCount,
    executedSessionCount: overview.executedSessionCount,
    linkedExecutedSessionCount: overview.linkedExecutedSessionCount,
    completedSessionCount: overview.completedSessionCount,
    unplannedSessionCount: overview.unplannedSessionCount,
    amendedPerformedFactCount: overview.amendedPerformedFactCount,
    counts: overview.counts,
    sessions: overview.sessions.map((session) => ({
      id: session.id,
      title: session.title,
      scheduledLocalDate: session.scheduledLocalDate,
      classification: session.classification,
      prescriptionId: session.prescriptionId,
      executionId: session.executionId,
      executionStatus: session.executionStatus,
      counts: session.counts,
    })),
  };
}

export class AgentReadFacade {
  constructor(
    private readonly queries: AgentReadQueryPort,
    private readonly trustedSession: AgentTrustedSession,
    private readonly requestId: string,
  ) {
    if (
      trustedSession.actor.workspaceId !==
      trustedSession.workspaceScope.workspaceId
    ) {
      throw new Error("Agent actor and workspace scope must match.");
    }
  }

  private base() {
    return {
      principalId: this.trustedSession.actor.actorId,
      workspaceId: this.trustedSession.workspaceScope.workspaceId,
      requestId: this.requestId,
    };
  }

  listAthletes(): Promise<AgentGrounded<readonly AgentAthleteDto[]>> {
    return this.queries.listAthletes(this.base()).then((athletes) => ({
      data: athletes.map((athlete) => ({
        id: athlete.id,
        displayName: athlete.displayName,
        archivedAt: athlete.archivedAt,
        version: athlete.version,
        createdAt: athlete.createdAt,
        assignedCoachCount: athlete.assignedCoachCount,
      })),
      evidence: uniqueEvidence(athletes.map(athleteEvidence)),
    }));
  }

  getAthlete(athleteId: AthleteId): Promise<AgentGrounded<AgentAthleteDto>> {
    return this.queries
      .getAthlete({ ...this.base(), athleteId })
      .then((athlete) => ({
        data: {
          id: athlete.id,
          displayName: athlete.displayName,
          archivedAt: athlete.archivedAt,
          version: athlete.version,
          createdAt: athlete.createdAt,
        },
        evidence: [athleteEvidence(athlete)],
      }));
  }

  getTrainingPlan(planId: UUID): Promise<AgentGrounded<AgentTrainingPlanDto>> {
    return this.queries
      .getTrainingPlan({ ...this.base(), planId })
      .then((details) => ({
        data: trainingPlanDto(details),
        evidence: uniqueEvidence([
          planEvidence(details.plan),
          ...details.sessions.map(prescriptionEvidence),
        ]),
      }));
  }

  async listPublishedTrainingWindow(input: {
    readonly athleteId: AthleteId;
    readonly startDate: LocalDate;
    readonly endDate: LocalDate;
  }): Promise<AgentGrounded<readonly AgentSessionPrescriptionDto[]>> {
    if (input.startDate > input.endDate) {
      throw new Error("Training window start must not be after its end.");
    }
    const plans = await this.queries.listTrainingPlans({
      ...this.base(),
      athleteId: input.athleteId,
    });
    const publishedPlans = plans.filter((plan) => plan.status === "published");
    const sessionLists = await Promise.all(
      publishedPlans.map((plan) =>
        this.queries.listSessionPrescriptions({
          ...this.base(),
          planId: plan.id,
        }),
      ),
    );
    const sessions = sessionLists
      .flat()
      .filter(
        (session) =>
          session.status === "published" &&
          session.scheduledLocalDate >= input.startDate &&
          session.scheduledLocalDate <= input.endDate,
      )
      .sort((left, right) =>
        left.scheduledLocalDate.localeCompare(right.scheduledLocalDate),
      );
    return {
      data: sessions.map(sessionPrescriptionDto),
      evidence: uniqueEvidence([
        ...publishedPlans.map(planEvidence),
        ...sessions.map(prescriptionEvidence),
      ]),
    };
  }

  getSessionPrescription(
    sessionId: UUID,
  ): Promise<AgentGrounded<AgentSessionPrescriptionDto>> {
    return this.queries
      .getSessionPrescription({ ...this.base(), sessionId })
      .then((session) => ({
        data: sessionPrescriptionDto(session),
        evidence: [prescriptionEvidence(session)],
      }));
  }

  listExecutedSessions(
    athleteId: AthleteId,
  ): Promise<AgentGrounded<readonly AgentExecutedSessionDto[]>> {
    return this.queries
      .listExecutedSessions({ ...this.base(), athleteId })
      .then((sessions) => ({
        data: sessions.map((session) => ({
          id: session.id,
          athleteId: session.athleteId,
          status: session.status,
          startedAt: session.startedAt,
          completedAt: session.completedAt,
          timeZone: session.timeZone,
          version: session.version,
          prescription: prescriptionReferenceDto(session.prescription),
        })),
        evidence: uniqueEvidence(sessions.map(executionEvidence)),
      }));
  }

  getExecutionReview(
    executionId: UUID,
  ): Promise<AgentGrounded<AgentExecutionReviewDto>> {
    return this.queries
      .getExecutionReview({ ...this.base(), executionId })
      .then((review) => {
        const facts = review.effectiveFacts.map((fact) =>
          evidence({
            source: "performed_fact",
            recordId: fact.id,
            aggregateId: review.session.id,
            aggregateVersion: review.session.version,
            revision: review.session.prescription?.prescriptionRevision ?? null,
            snapshotFingerprint:
              review.session.prescription?.snapshotFingerprint ?? null,
            sourceTimestamp: fact.observedAt,
            amendmentIds: review.amendments
              .filter((amendment) => amendment.factId === fact.id)
              .map((amendment) => amendment.id),
          }),
        );
        return {
          data: executionReviewDto(review),
          evidence: uniqueEvidence([
            executionEvidence(review.session),
            ...facts,
            ...review.amendments.map((amendment) =>
              evidence({
                source: "amendment",
                recordId: amendment.id,
                aggregateId: amendment.factId,
                aggregateVersion: review.session.version,
                revision:
                  review.session.prescription?.prescriptionRevision ?? null,
                snapshotFingerprint:
                  review.session.prescription?.snapshotFingerprint ?? null,
                sourceTimestamp: amendment.occurredAt,
                amendmentIds: [amendment.id],
              }),
            ),
          ]),
        };
      });
  }

  getMonitoringOverview(input: {
    readonly athleteId: AthleteId;
    readonly startDate: LocalDate;
    readonly endDate: LocalDate;
    readonly timeZone: IanaTimeZone;
  }): Promise<AgentGrounded<AgentMonitoringOverviewDto>> {
    return this.queries
      .getMonitoringOverview({ ...this.base(), ...input })
      .then((overview) => ({
        data: monitoringOverviewDto(overview),
        evidence: uniqueEvidence([
          ...overview.sessions.map((session) =>
            evidence({
              source: "monitoring_session",
              recordId: session.id,
              aggregateId:
                session.executionId ?? session.prescriptionId ?? session.id,
              aggregateVersion: null,
              revision: null,
              snapshotFingerprint: null,
              sourceTimestamp: null,
              amendmentIds: [],
            }),
          ),
          evidence({
            source: "monitoring_window",
            recordId: overview.athleteId,
            aggregateId: overview.athleteId,
            aggregateVersion: null,
            revision: null,
            snapshotFingerprint: null,
            sourceTimestamp: null,
            amendmentIds: [],
          }),
        ]),
      }));
  }

  getSessionMonitoring(
    executionId: UUID,
  ): Promise<AgentGrounded<AgentMonitoringSessionDto>> {
    return this.queries
      .getSessionMonitoring({ ...this.base(), executionId })
      .then((view) => ({
        data: monitoringSessionDto(view),
        evidence: uniqueEvidence(monitoringEvidence(view)),
      }));
  }
}

export interface AgentSessionStart {
  readonly sessionId: string;
  readonly actor: ActorContext;
  readonly workspaceScope: WorkspaceScope;
  readonly prompt: string;
}

export interface AgentSessionHandle {
  readonly sessionId: string;
  readonly status: "started" | "unavailable";
}

export interface AgentTurnInput {
  readonly sessionId: string;
  readonly actor: ActorContext;
  readonly message: string;
}

export interface AgentTurnResult {
  readonly sessionId: string;
  readonly status: "completed" | "unavailable";
  readonly text?: string;
}

export interface AgentRuntime {
  start(input: AgentSessionStart): Promise<AgentSessionHandle>;
  continue(input: AgentTurnInput): Promise<AgentTurnResult>;
  cancel(sessionId: string): Promise<void>;
}

export interface AgentReadContext {
  readonly actor: ActorContext;
  readonly workspaceScope: WorkspaceScope;
  readonly role: WorkspaceRole;
  readonly athlete: AthleteProfile;
  readonly plan?: TrainingPlan;
  readonly prescription?: SessionPrescription;
  readonly execution?: ExecutedSession;
  readonly metricDefinitions?: readonly MetricDefinition[];
}

export type ChangeProposalStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | "EXECUTED"
  | "FAILED";

export interface ChangeProposal {
  readonly id: UUID;
  readonly actorId: UUID;
  readonly workspaceId: WorkspaceId;
  readonly sessionId: string;
  readonly commandType: string;
  readonly commandSchemaVersion: string;
  readonly payload: unknown;
  readonly expectedVersions: Readonly<Record<string, number>>;
  readonly rationale: string;
  readonly status: ChangeProposalStatus;
  readonly createdAt: Instant;
  readonly expiresAt: Instant;
  readonly approvedBy?: UUID;
  readonly approvedAt?: Instant;
}

export function createChangeProposal(input: {
  readonly id: UUID;
  readonly actor: ActorContext;
  readonly sessionId: string;
  readonly commandType: string;
  readonly commandSchemaVersion: string;
  readonly payload: unknown;
  readonly expectedVersions: Readonly<Record<string, number>>;
  readonly rationale: string;
  readonly createdAt: Instant;
  readonly expiresAt: Instant;
}): ChangeProposal {
  if (
    input.commandType.trim().length === 0 ||
    input.rationale.trim().length === 0
  ) {
    throw new Error("Change proposals require a command type and rationale.");
  }

  return {
    id: input.id,
    actorId: input.actor.actorId,
    workspaceId: input.actor.workspaceId,
    sessionId: input.sessionId,
    commandType: input.commandType,
    commandSchemaVersion: input.commandSchemaVersion,
    payload: input.payload,
    expectedVersions: input.expectedVersions,
    rationale: input.rationale,
    status: "PENDING",
    createdAt: input.createdAt,
    expiresAt: input.expiresAt,
  };
}

export function approveChangeProposal(
  proposal: ChangeProposal,
  approver: ActorContext,
  approvedAt: Instant,
): ChangeProposal {
  if (proposal.status !== "PENDING") {
    throw new Error("Only pending change proposals can be approved.");
  }
  if (proposal.workspaceId !== approver.workspaceId) {
    throw new Error(
      "Approval workspace does not match the proposal workspace.",
    );
  }

  return {
    ...proposal,
    status: "APPROVED",
    approvedBy: approver.actorId,
    approvedAt,
  };
}
