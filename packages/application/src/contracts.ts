import type {
  Workspace,
  WorkspaceMemberDetails,
  WorkspaceMembership,
  WorkspacePreferences,
  WorkspaceRole,
} from "@workoutpal/accounts";
import type {
  AgentProposalExecutionRepository,
  AgentProposalRepository,
  ApprovalDecisionRepository,
} from "@workoutpal/agent-operations";
import type {
  AcquisitionSource,
  Assessment,
  AssessmentAmendment,
  MetricDefinition,
  NeutralResult,
  Protocol,
  ProtocolRevision,
  RawObservation,
  Trial,
} from "@workoutpal/assessments";
import type {
  AthleteProfile,
  AthleteTrainingContext,
  CoachAssignment,
} from "@workoutpal/athletes";
import type { SourceArtifact } from "@workoutpal/provenance";
import type {
  ActorContext,
  AthleteId,
  Instant,
  UUID,
  WorkspaceId,
  WorkspaceScope,
} from "@workoutpal/shared-kernel";
import type {
  MovementDefinition,
  PlanPhase,
  SessionPrescription,
  SessionPrescriptionRevision,
  TrainingGoal,
  TrainingPlan,
  TrainingPlanRevision,
} from "@workoutpal/training-design";
import type {
  ExecutedSession,
  ExecutionAmendment,
  PerformedEnduranceSegment,
  PerformedFact,
  PerformedMobilityItem,
  PerformedStrengthSet,
  SessionObservation,
} from "@workoutpal/training-execution";

export type ApplicationErrorCode =
  | "AUTHENTICATION_REQUIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RESOURCE_NOT_FOUND"
  | "VALIDATION_FAILED"
  | "DOMAIN_RULE_VIOLATION"
  | "VERSION_CONFLICT"
  | "CONCURRENCY_CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "APPROVAL_REQUIRED"
  | "APPROVAL_EXPIRED"
  | "PROPOSAL_DIGEST_MISMATCH"
  | "PROPOSAL_STATE_CONFLICT"
  | "INTERNAL_ERROR";

export class ApplicationError extends Error {
  readonly code: ApplicationErrorCode;
  readonly details: Readonly<Record<string, unknown>> | undefined;

  constructor(
    code: ApplicationErrorCode,
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "ApplicationError";
    this.code = code;
    this.details = details;
  }
}

export interface AuthorizedActor {
  readonly actor: ActorContext;
  readonly principalId: UUID;
  readonly role: WorkspaceRole;
  readonly membership: WorkspaceMembership;
}

export interface WorkspaceRepository {
  get(scope: WorkspaceScope): Promise<Workspace | null>;
  insert(workspace: Workspace): Promise<void>;
}

export interface MembershipRepository {
  get(
    scope: WorkspaceScope,
    principalId: UUID,
  ): Promise<WorkspaceMembership | null>;
  listForPrincipal(principalId: UUID): Promise<readonly WorkspaceMembership[]>;
  insert(membership: WorkspaceMembership): Promise<void>;
}

export interface AthleteRepository {
  get(
    scope: WorkspaceScope,
    athleteId: AthleteId,
  ): Promise<AthleteProfile | null>;
  list(
    scope: WorkspaceScope,
    includeArchived: boolean,
  ): Promise<readonly AthleteProfile[]>;
  insert(profile: AthleteProfile): Promise<void>;
  updateExpected(
    scope: WorkspaceScope,
    profile: AthleteProfile,
    expectedVersion: number,
  ): Promise<AthleteProfile | null>;
}

export interface AthleteTrainingContextRepository {
  get(
    scope: WorkspaceScope,
    athleteId: AthleteId,
  ): Promise<AthleteTrainingContext | null>;
  insert(context: AthleteTrainingContext): Promise<void>;
  updateExpected(
    scope: WorkspaceScope,
    context: AthleteTrainingContext,
    expectedVersion: number,
  ): Promise<AthleteTrainingContext | null>;
}

export interface CoachAssignmentRepository {
  listForAthlete(
    scope: WorkspaceScope,
    athleteId: AthleteId,
  ): Promise<readonly CoachAssignment[]>;
  exists(
    scope: WorkspaceScope,
    athleteId: AthleteId,
    coachPrincipalId: UUID,
  ): Promise<boolean>;
  insert(assignment: CoachAssignment): Promise<void>;
  remove(
    scope: WorkspaceScope,
    athleteId: AthleteId,
    coachPrincipalId: UUID,
  ): Promise<boolean>;
}

export interface AuditEvent {
  readonly id: UUID;
  readonly occurredAt: Instant;
  readonly workspaceId: WorkspaceId;
  readonly actorId: UUID;
  readonly actorType: ActorContext["actorType"];
  readonly action: string;
  readonly aggregateType: string;
  readonly aggregateId: UUID;
  readonly versionBefore: number | null;
  readonly versionAfter: number | null;
  readonly requestId: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface AuditRepository {
  append(event: AuditEvent): Promise<void>;
  list(
    scope: WorkspaceScope,
    aggregateId?: UUID,
  ): Promise<readonly AuditEvent[]>;
}

export interface IdempotencyRecord {
  readonly workspaceId: WorkspaceId;
  readonly actorId: UUID;
  readonly operation: string;
  readonly key: string;
  readonly requestHash: string;
  readonly outcome: unknown;
}

export interface IdempotencyRepository {
  find(
    workspaceId: WorkspaceId,
    actorId: UUID,
    operation: string,
    key: string,
  ): Promise<IdempotencyRecord | null>;
  reserve(
    record: Omit<IdempotencyRecord, "outcome">,
  ): Promise<IdempotencyRecord | null>;
  complete(
    workspaceId: WorkspaceId,
    actorId: UUID,
    operation: string,
    key: string,
    outcome: unknown,
  ): Promise<void>;
}

export interface WorkspaceSettingsRepository {
  listMembers(
    scope: WorkspaceScope,
  ): Promise<readonly WorkspaceMemberDetails[]>;
  updateMemberRole(
    scope: WorkspaceScope,
    memberId: UUID,
    role: WorkspaceRole,
  ): Promise<WorkspaceMembership | null>;
  suspendMember(
    scope: WorkspaceScope,
    memberId: UUID,
  ): Promise<WorkspaceMembership | null>;
  getPreferences(scope: WorkspaceScope): Promise<WorkspacePreferences | null>;
  insertPreferences(preferences: WorkspacePreferences): Promise<void>;
  updatePreferencesExpected(
    scope: WorkspaceScope,
    preferences: WorkspacePreferences,
    expectedVersion: number,
  ): Promise<WorkspacePreferences | null>;
}

export type WorkspaceSearchResultKind =
  | "athlete"
  | "goal"
  | "movement"
  | "plan"
  | "session"
  | "execution";

export interface WorkspaceSearchResult {
  readonly kind: WorkspaceSearchResultKind;
  readonly id: UUID;
  readonly title: string;
  readonly subtitle: string | null;
  readonly athleteId: AthleteId | null;
  readonly parentId: UUID | null;
  readonly archivedAt: Instant | null;
}

export interface WorkspaceSearchRepository {
  search(
    scope: WorkspaceScope,
    query: string,
    limit: number,
  ): Promise<readonly WorkspaceSearchResult[]>;
}

export interface F2Repositories {
  readonly workspaces: WorkspaceRepository;
  readonly memberships: MembershipRepository;
  readonly athletes: AthleteRepository;
  readonly athleteTrainingContexts: AthleteTrainingContextRepository;
  readonly coachAssignments: CoachAssignmentRepository;
  readonly audit: AuditRepository;
  readonly idempotency: IdempotencyRepository;
  readonly workspaceSettings: WorkspaceSettingsRepository;
  readonly search: WorkspaceSearchRepository;
}

export interface F2Persistence {
  transaction<T>(
    work: (repositories: F2Repositories) => Promise<T>,
    context: PersistenceTransactionContext,
  ): Promise<T>;
}

export interface PersistenceTransactionContext {
  readonly principalId: UUID;
  readonly workspaceId?: WorkspaceId;
}

export interface MovementRepository {
  get(
    scope: WorkspaceScope,
    movementId: UUID,
  ): Promise<MovementDefinition | null>;
  listVisible(
    scope: WorkspaceScope,
    includeArchived: boolean,
  ): Promise<readonly MovementDefinition[]>;
  insert(movement: MovementDefinition): Promise<void>;
  updateExpected(
    scope: WorkspaceScope,
    movement: MovementDefinition,
    expectedVersion: number,
  ): Promise<MovementDefinition | null>;
}

export interface TrainingGoalRepository {
  get(scope: WorkspaceScope, goalId: UUID): Promise<TrainingGoal | null>;
  listForAthlete(
    scope: WorkspaceScope,
    athleteId: AthleteId,
    includeArchived: boolean,
  ): Promise<readonly TrainingGoal[]>;
  insert(goal: TrainingGoal): Promise<void>;
  updateExpected(
    scope: WorkspaceScope,
    goal: TrainingGoal,
    expectedVersion: number,
  ): Promise<TrainingGoal | null>;
}

export interface TrainingPlanRepository {
  get(scope: WorkspaceScope, planId: UUID): Promise<TrainingPlan | null>;
  listForAthlete(
    scope: WorkspaceScope,
    athleteId: AthleteId,
    includeArchived: boolean,
  ): Promise<readonly TrainingPlan[]>;
  insert(plan: TrainingPlan): Promise<void>;
  updateExpected(
    scope: WorkspaceScope,
    plan: TrainingPlan,
    expectedVersion: number,
  ): Promise<TrainingPlan | null>;
}

export interface PlanPhaseRepository {
  get(scope: WorkspaceScope, phaseId: UUID): Promise<PlanPhase | null>;
  listForPlan(
    scope: WorkspaceScope,
    planId: UUID,
    includeArchived: boolean,
  ): Promise<readonly PlanPhase[]>;
  insert(phase: PlanPhase): Promise<void>;
  updateExpected(
    scope: WorkspaceScope,
    phase: PlanPhase,
    expectedVersion: number,
  ): Promise<PlanPhase | null>;
}

export interface SessionPrescriptionRepository {
  get(
    scope: WorkspaceScope,
    sessionId: UUID,
  ): Promise<SessionPrescription | null>;
  listPublishedForAthlete(
    scope: WorkspaceScope,
    athleteId: AthleteId,
  ): Promise<readonly SessionPrescription[]>;
  listForPlan(
    scope: WorkspaceScope,
    planId: UUID,
    includeArchived: boolean,
  ): Promise<readonly SessionPrescription[]>;
  insert(session: SessionPrescription): Promise<void>;
  updateExpected(
    scope: WorkspaceScope,
    session: SessionPrescription,
    expectedVersion: number,
  ): Promise<SessionPrescription | null>;
}

export interface TrainingDesignRevisionRepository {
  listForPlan(
    scope: WorkspaceScope,
    planId: UUID,
  ): Promise<readonly TrainingPlanRevision[]>;
  listForSession(
    scope: WorkspaceScope,
    sessionId: UUID,
  ): Promise<readonly SessionPrescriptionRevision[]>;
  insertPlanRevision(revision: TrainingPlanRevision): Promise<void>;
  insertSessionRevision(revision: SessionPrescriptionRevision): Promise<void>;
}

export interface F3Repositories extends F2Repositories {
  readonly movements: MovementRepository;
  readonly trainingGoals: TrainingGoalRepository;
  readonly trainingPlans: TrainingPlanRepository;
  readonly planPhases: PlanPhaseRepository;
  readonly sessionPrescriptions: SessionPrescriptionRepository;
  readonly trainingDesignRevisions: TrainingDesignRevisionRepository;
}

export interface F3Persistence {
  transaction<T>(
    work: (repositories: F3Repositories) => Promise<T>,
    context: PersistenceTransactionContext,
  ): Promise<T>;
}

export interface ExecutedSessionRepository {
  get(scope: WorkspaceScope, sessionId: UUID): Promise<ExecutedSession | null>;
  listForAthlete(
    scope: WorkspaceScope,
    athleteId: AthleteId,
  ): Promise<readonly ExecutedSession[]>;
  findForPrescription(
    scope: WorkspaceScope,
    prescriptionId: UUID,
    prescriptionRevision: number,
  ): Promise<ExecutedSession | null>;
  insert(session: ExecutedSession): Promise<void>;
  updateExpected(
    scope: WorkspaceScope,
    session: ExecutedSession,
    expectedVersion: number,
  ): Promise<ExecutedSession | null>;
}

export interface PerformedStrengthSetRepository {
  get(
    scope: WorkspaceScope,
    factId: UUID,
  ): Promise<PerformedStrengthSet | null>;
  listForSession(
    scope: WorkspaceScope,
    sessionId: UUID,
  ): Promise<readonly PerformedStrengthSet[]>;
  listForSessions(
    scope: WorkspaceScope,
    sessionIds: readonly UUID[],
  ): Promise<readonly PerformedStrengthSet[]>;
  insert(fact: PerformedStrengthSet): Promise<void>;
}

export interface PerformedEnduranceSegmentRepository {
  get(
    scope: WorkspaceScope,
    factId: UUID,
  ): Promise<PerformedEnduranceSegment | null>;
  listForSession(
    scope: WorkspaceScope,
    sessionId: UUID,
  ): Promise<readonly PerformedEnduranceSegment[]>;
  listForSessions(
    scope: WorkspaceScope,
    sessionIds: readonly UUID[],
  ): Promise<readonly PerformedEnduranceSegment[]>;
  insert(fact: PerformedEnduranceSegment): Promise<void>;
}

export interface PerformedMobilityItemRepository {
  get(
    scope: WorkspaceScope,
    factId: UUID,
  ): Promise<PerformedMobilityItem | null>;
  listForSession(
    scope: WorkspaceScope,
    sessionId: UUID,
  ): Promise<readonly PerformedMobilityItem[]>;
  listForSessions(
    scope: WorkspaceScope,
    sessionIds: readonly UUID[],
  ): Promise<readonly PerformedMobilityItem[]>;
  insert(fact: PerformedMobilityItem): Promise<void>;
}

export interface SessionObservationRepository {
  listForSession(
    scope: WorkspaceScope,
    sessionId: UUID,
  ): Promise<readonly SessionObservation[]>;
  listForSessions(
    scope: WorkspaceScope,
    sessionIds: readonly UUID[],
  ): Promise<readonly SessionObservation[]>;
  insert(observation: SessionObservation): Promise<void>;
}

export interface ExecutionAmendmentRepository {
  listForSession(
    scope: WorkspaceScope,
    sessionId: UUID,
  ): Promise<readonly ExecutionAmendment[]>;
  listForSessions(
    scope: WorkspaceScope,
    sessionIds: readonly UUID[],
  ): Promise<readonly ExecutionAmendment[]>;
  insert(amendment: ExecutionAmendment): Promise<void>;
}

export interface F4Repositories extends F3Repositories {
  readonly executedSessions: ExecutedSessionRepository;
  readonly performedStrengthSets: PerformedStrengthSetRepository;
  readonly performedEnduranceSegments: PerformedEnduranceSegmentRepository;
  readonly performedMobilityItems: PerformedMobilityItemRepository;
  readonly sessionObservations: SessionObservationRepository;
  readonly executionAmendments: ExecutionAmendmentRepository;
}

export interface F4Persistence {
  transaction<T>(
    work: (repositories: F4Repositories) => Promise<T>,
    context: PersistenceTransactionContext,
  ): Promise<T>;
}

export interface F7Repositories extends F4Repositories {
  readonly agentProposals: AgentProposalRepository;
  readonly approvalDecisions: ApprovalDecisionRepository;
  readonly proposalExecutions: AgentProposalExecutionRepository;
}

export interface F7Persistence {
  transaction<T>(
    work: (repositories: F7Repositories) => Promise<T>,
    context: PersistenceTransactionContext,
  ): Promise<T>;
}

export interface ProtocolRepository {
  get(scope: WorkspaceScope, protocolId: UUID): Promise<Protocol | null>;
  list(scope: WorkspaceScope): Promise<readonly Protocol[]>;
  insert(protocol: Protocol): Promise<void>;
  updateExpected(
    scope: WorkspaceScope,
    protocol: Protocol,
    expectedVersion: number,
  ): Promise<Protocol | null>;
}

export interface ProtocolRevisionRepository {
  get(
    scope: WorkspaceScope,
    revisionId: UUID,
  ): Promise<ProtocolRevision | null>;
  listForProtocol(
    scope: WorkspaceScope,
    protocolId: UUID,
  ): Promise<readonly ProtocolRevision[]>;
  insert(revision: ProtocolRevision): Promise<void>;
}

export interface AcquisitionSourceRepository {
  get(scope: WorkspaceScope, sourceId: UUID): Promise<AcquisitionSource | null>;
  list(scope: WorkspaceScope): Promise<readonly AcquisitionSource[]>;
  insert(source: AcquisitionSource): Promise<void>;
  updateExpected(
    scope: WorkspaceScope,
    source: AcquisitionSource,
    expectedVersion: number,
  ): Promise<AcquisitionSource | null>;
}

export interface SourceArtifactRepository {
  get(scope: WorkspaceScope, artifactId: UUID): Promise<SourceArtifact | null>;
  insert(artifact: SourceArtifact): Promise<void>;
}

export interface AssessmentRepository {
  get(scope: WorkspaceScope, assessmentId: UUID): Promise<Assessment | null>;
  listForAthlete(
    scope: WorkspaceScope,
    athleteId: AthleteId,
  ): Promise<readonly Assessment[]>;
  insert(assessment: Assessment): Promise<void>;
  updateExpected(
    scope: WorkspaceScope,
    assessment: Assessment,
    expectedVersion: number,
  ): Promise<Assessment | null>;
}

export interface TrialRepository {
  get(scope: WorkspaceScope, trialId: UUID): Promise<Trial | null>;
  listForAssessment(
    scope: WorkspaceScope,
    assessmentId: UUID,
  ): Promise<readonly Trial[]>;
  insert(trial: Trial): Promise<void>;
  updateExpected(
    scope: WorkspaceScope,
    trial: Trial,
    expectedVersion: number,
  ): Promise<Trial | null>;
}

export interface RawObservationRepository {
  get(
    scope: WorkspaceScope,
    observationId: UUID,
  ): Promise<RawObservation | null>;
  listForAssessment(
    scope: WorkspaceScope,
    assessmentId: UUID,
  ): Promise<readonly RawObservation[]>;
  insert(observation: RawObservation): Promise<void>;
}

export interface MetricDefinitionRepository {
  get(
    scope: WorkspaceScope,
    metricDefinitionId: UUID,
  ): Promise<MetricDefinition | null>;
  list(scope: WorkspaceScope): Promise<readonly MetricDefinition[]>;
  insert(metricDefinition: MetricDefinition): Promise<void>;
}

export interface NeutralResultRepository {
  get(scope: WorkspaceScope, resultId: UUID): Promise<NeutralResult | null>;
  listForAssessment(
    scope: WorkspaceScope,
    assessmentId: UUID,
  ): Promise<readonly NeutralResult[]>;
  insert(result: NeutralResult): Promise<void>;
}

export interface AssessmentAmendmentRepository {
  listForAssessment(
    scope: WorkspaceScope,
    assessmentId: UUID,
  ): Promise<readonly AssessmentAmendment[]>;
  insert(amendment: AssessmentAmendment): Promise<void>;
}

export interface Psc4Repositories extends F7Repositories {
  readonly protocols: ProtocolRepository;
  readonly protocolRevisions: ProtocolRevisionRepository;
  readonly acquisitionSources: AcquisitionSourceRepository;
  readonly sourceArtifacts: SourceArtifactRepository;
  readonly assessments: AssessmentRepository;
  readonly trials: TrialRepository;
  readonly rawObservations: RawObservationRepository;
  readonly metricDefinitions: MetricDefinitionRepository;
  readonly neutralResults: NeutralResultRepository;
  readonly assessmentAmendments: AssessmentAmendmentRepository;
}

export interface Psc4Persistence {
  transaction<T>(
    work: (repositories: Psc4Repositories) => Promise<T>,
    context: PersistenceTransactionContext,
  ): Promise<T>;
}

export interface ExecutionReview {
  readonly session: ExecutedSession;
  readonly strengthSets: readonly PerformedStrengthSet[];
  readonly enduranceSegments: readonly PerformedEnduranceSegment[];
  readonly mobilityItems: readonly PerformedMobilityItem[];
  readonly observations: readonly SessionObservation[];
  readonly amendments: readonly ExecutionAmendment[];
  readonly effectiveFacts: readonly PerformedFact[];
}

export interface CommandMetadata {
  readonly principalId: UUID;
  readonly requestId: string;
  readonly occurredAt?: Instant;
  readonly agentAudit?: {
    readonly proposalId: UUID;
    readonly approvalId: UUID;
    readonly agentSessionId: string;
    readonly approvedBy: UUID;
  };
}

export interface WorkspaceSummary {
  readonly id: WorkspaceId;
  readonly name: string;
  readonly createdAt: Instant;
}

export interface AthleteListItem extends AthleteProfile {
  readonly assignedCoachCount: number;
}
