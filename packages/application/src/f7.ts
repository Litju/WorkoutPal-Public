import { canAccessWorkspace, type WorkspaceAction } from "@workoutpal/accounts";
import type {
  AgentApprovalDecisionValue,
  AgentMutationCommand,
  AgentOperationKind,
  AgentProposal,
  AgentProposalDto,
  AgentProposalExecution,
  AgentProposalExecutionResultDto,
  AgentProposalProjection,
  AgentProposalStatus,
  ApprovalDecision,
} from "@workoutpal/agent-operations";
import {
  assertAgentProposalTransition,
  computeAgentCommandDigest,
  toAgentProposalDto,
} from "@workoutpal/agent-operations";
import type {
  ActorContext,
  Instant,
  LocalDate,
  UUID,
  WorkspaceId,
  WorkspaceScope,
} from "@workoutpal/shared-kernel";
import type {
  PrescriptionBlock,
  SessionPrescription,
} from "@workoutpal/training-design";
import { transactionContext } from "./application-shared.js";
import {
  ApplicationError,
  type AuditEvent,
  type CommandMetadata,
  type F7Persistence,
  type F7Repositories,
} from "./contracts.js";
import { F3Application } from "./f3.js";

function f7Now(): Instant {
  return new Date().toISOString() as Instant;
}

function f7Id(): UUID {
  return crypto.randomUUID() as UUID;
}

function f7Scope(workspaceId: WorkspaceId): WorkspaceScope {
  return { workspaceId };
}

function f7ErrorCode(error: unknown): string {
  return error instanceof ApplicationError ? error.code : "EXECUTION_FAILED";
}

function f7ErrorMessage(error: unknown): string {
  return error instanceof ApplicationError
    ? error.message
    : "The approved WorkoutPal command could not be executed.";
}

function findStrengthSet(
  session: SessionPrescription,
  strengthSetId: UUID,
): {
  readonly movementId: UUID;
  readonly ordinal: number;
  readonly targetLoadKg: number | null;
} | null {
  for (const block of session.blocks) {
    if (block.kind !== "strength") continue;
    for (const exercise of block.exercises) {
      for (const set of exercise.sets) {
        if (set.id === strengthSetId) {
          return {
            movementId: exercise.movementId,
            ordinal: set.ordinal,
            targetLoadKg: set.targetLoadKg ?? null,
          };
        }
      }
    }
  }
  return null;
}

function sameF7Command(
  left: AgentMutationCommand,
  right: AgentMutationCommand,
): boolean {
  if (left.kind !== right.kind) return false;
  switch (left.kind) {
    case "RESCHEDULE_SESSION_PRESCRIPTION":
      return (
        right.kind === "RESCHEDULE_SESSION_PRESCRIPTION" &&
        left.sessionPrescriptionId === right.sessionPrescriptionId &&
        left.scheduledLocalDate === right.scheduledLocalDate
      );
    case "SET_STRENGTH_SET_TARGET_LOAD":
      return (
        right.kind === "SET_STRENGTH_SET_TARGET_LOAD" &&
        left.sessionPrescriptionId === right.sessionPrescriptionId &&
        left.strengthSetId === right.strengthSetId &&
        left.targetLoadKg === right.targetLoadKg
      );
    default: {
      const exhaustive: never = left;
      return exhaustive;
    }
  }
}

function setStrengthTargetLoad(
  blocks: readonly PrescriptionBlock[],
  strengthSetId: UUID,
  targetLoadKg: number,
): readonly PrescriptionBlock[] {
  let found = false;
  const updated = blocks.map((block) => {
    if (block.kind !== "strength") return block;
    return {
      ...block,
      exercises: block.exercises.map((exercise) => ({
        ...exercise,
        sets: exercise.sets.map((set) => {
          if (set.id !== strengthSetId) return set;
          found = true;
          return { ...set, targetLoadKg };
        }),
      })),
    };
  });
  if (!found)
    throw new ApplicationError(
      "RESOURCE_NOT_FOUND",
      "Strength set prescription not found.",
    );
  return updated;
}

function f7CommandForProposal(proposal: AgentProposal): AgentMutationCommand {
  switch (proposal.normalizedCommand.kind) {
    case "RESCHEDULE_SESSION_PRESCRIPTION":
      return proposal.normalizedCommand;
    case "SET_STRENGTH_SET_TARGET_LOAD":
      return proposal.normalizedCommand;
    default: {
      const exhaustive: never = proposal.normalizedCommand;
      return exhaustive;
    }
  }
}

export interface F7ProposalLookupInput extends CommandMetadata {
  readonly workspaceId: WorkspaceId;
  readonly proposalId: UUID;
}

export interface F7ApprovalDecisionInput extends CommandMetadata {
  readonly workspaceId: WorkspaceId;
  readonly proposalId: UUID;
  readonly decision: AgentApprovalDecisionValue;
  readonly proposalDigest: string;
  readonly approvalRequestId?: string;
  readonly agentSessionId: string;
}

export interface F7AgentContext {
  readonly actor: ActorContext;
  readonly agentSessionId: string;
  readonly callId: string;
  readonly toolName: string;
  readonly requestId: string;
}

export class F7Application {
  constructor(private readonly persistence: F7Persistence) {}

  private async authorizeAgentAction(
    repositories: F7Repositories,
    principalId: UUID,
    workspaceId: WorkspaceId,
    action: Extract<WorkspaceAction, `agent.${string}`>,
  ): Promise<void> {
    const membership = await repositories.memberships.get(
      f7Scope(workspaceId),
      principalId,
    );
    if (
      membership === null ||
      membership.status !== "active" ||
      !canAccessWorkspace(membership, action)
    ) {
      throw new ApplicationError(
        "FORBIDDEN",
        "You are not authorized for this Agent action in this workspace.",
      );
    }
  }

  createFacade(
    context: F7AgentContext,
  ): import("@workoutpal/agent-operations").AgentMutationFacade {
    return {
      proposeReschedule: (input) =>
        this.proposeReschedule({ ...context, ...input }),
      proposeSetStrengthTargetLoad: (input) =>
        this.proposeSetStrengthTargetLoad({ ...context, ...input }),
      executeProposal: (proposalId) =>
        this.executeProposal({ ...context, proposalId }),
    };
  }

  async getProposal(input: F7ProposalLookupInput): Promise<AgentProposalDto> {
    return this.persistence.transaction(async (repositories) => {
      const proposal = await repositories.agentProposals.get(
        f7Scope(input.workspaceId),
        input.proposalId,
      );
      if (proposal === null)
        throw new ApplicationError(
          "RESOURCE_NOT_FOUND",
          "Agent proposal not found.",
        );
      if (proposal.requestingActorId !== input.principalId)
        throw new ApplicationError(
          "RESOURCE_NOT_FOUND",
          "Agent proposal not found.",
        );
      await this.authorizeAgentAction(
        repositories,
        input.principalId,
        input.workspaceId,
        "agent.propose",
      );
      const trainingDesign = new F3Application({
        transaction: async (work) => work(repositories),
      });
      await trainingDesign.getSessionPrescriptionForMutationInTransaction(
        repositories,
        {
          principalId: input.principalId,
          requestId: input.requestId,
          workspaceId: input.workspaceId,
          sessionId: proposal.targetAggregateId,
        },
      );
      return toAgentProposalDto(proposal);
    }, transactionContext(input));
  }

  async decideProposal(
    input: F7ApprovalDecisionInput,
  ): Promise<AgentProposalDto> {
    return this.persistence.transaction(async (repositories) => {
      const scope = f7Scope(input.workspaceId);
      const proposal = await repositories.agentProposals.get(
        scope,
        input.proposalId,
      );
      if (proposal === null || proposal.requestingActorId !== input.principalId)
        throw new ApplicationError(
          "RESOURCE_NOT_FOUND",
          "Agent proposal not found.",
        );
      await this.authorizeAgentAction(
        repositories,
        input.principalId,
        input.workspaceId,
        "agent.approve",
      );
      if (proposal.agentSessionId !== input.agentSessionId)
        throw new ApplicationError(
          "FORBIDDEN",
          "The approval is not bound to the proposal's agent session.",
        );
      if (proposal.commandDigest !== input.proposalDigest)
        throw new ApplicationError(
          "PROPOSAL_DIGEST_MISMATCH",
          "The proposal preview no longer matches the approval request.",
        );

      const trainingDesign = new F3Application({
        transaction: async (work) => work(repositories),
      });
      await trainingDesign.getSessionPrescriptionForMutationInTransaction(
        repositories,
        {
          principalId: input.principalId,
          requestId: input.requestId,
          workspaceId: input.workspaceId,
          sessionId: proposal.targetAggregateId,
        },
      );

      const existing = await repositories.approvalDecisions.getForProposal(
        scope,
        proposal.proposalId,
      );
      if (existing !== null) {
        if (
          existing.decision !== input.decision ||
          existing.proposalDigest !== input.proposalDigest ||
          existing.approvingActorId !== input.principalId ||
          existing.agentSessionId !== input.agentSessionId
        ) {
          throw new ApplicationError(
            "PROPOSAL_STATE_CONFLICT",
            "This proposal already has a different approval decision.",
          );
        }
        return toAgentProposalDto(proposal);
      }
      if (proposal.status !== "PENDING_APPROVAL")
        throw new ApplicationError(
          "PROPOSAL_STATE_CONFLICT",
          "Only a pending proposal can receive an approval decision.",
        );

      const decidedAt = f7Now();
      const decision: ApprovalDecision = {
        approvalId: f7Id(),
        workspaceId: input.workspaceId,
        proposalId: proposal.proposalId,
        proposalDigest: input.proposalDigest,
        approvingActorId: input.principalId,
        agentSessionId: input.agentSessionId,
        approvalRequestId: input.approvalRequestId ?? null,
        decision: input.decision,
        decidedAt,
      };
      await repositories.approvalDecisions.insert(decision);
      const persistedDecision =
        await repositories.approvalDecisions.getForProposal(
          scope,
          proposal.proposalId,
        );
      if (persistedDecision === null)
        throw new ApplicationError(
          "INTERNAL_ERROR",
          "The approval decision could not be persisted.",
        );
      if (persistedDecision.approvalId !== decision.approvalId) {
        const current = await repositories.agentProposals.get(
          scope,
          proposal.proposalId,
        );
        if (current === null)
          throw new ApplicationError(
            "RESOURCE_NOT_FOUND",
            "Agent proposal not found.",
          );
        if (
          persistedDecision.decision === input.decision &&
          persistedDecision.proposalDigest === input.proposalDigest &&
          persistedDecision.approvingActorId === input.principalId &&
          persistedDecision.agentSessionId === input.agentSessionId
        )
          return toAgentProposalDto(current);
        throw new ApplicationError(
          "PROPOSAL_STATE_CONFLICT",
          "This proposal already has a different approval decision.",
        );
      }
      const nextStatus: AgentProposalStatus =
        input.decision === "APPROVE" ? "APPROVED" : "REJECTED";
      assertAgentProposalTransition(proposal.status, nextStatus);
      const updated = await repositories.agentProposals.updateState({
        scope,
        proposalId: proposal.proposalId,
        expectedStatus: proposal.status,
        status: nextStatus,
        updatedAt: decidedAt,
        ...(input.decision === "APPROVE"
          ? { approvedAt: decidedAt }
          : { rejectedAt: decidedAt }),
      });
      if (updated === null)
        throw new ApplicationError(
          "PROPOSAL_STATE_CONFLICT",
          "The proposal changed before the approval decision was recorded.",
        );
      await repositories.audit.append(
        this.agentAudit(
          input,
          input.decision === "APPROVE"
            ? "agent_proposal.approved"
            : "agent_proposal.rejected",
          proposal.proposalId,
          proposal.version,
          updated.version,
          {
            approvalId: decision.approvalId,
            proposalDigest: decision.proposalDigest,
            decision: decision.decision,
            approvalRequestId: decision.approvalRequestId,
          },
        ),
      );
      return toAgentProposalDto(updated);
    }, transactionContext(input));
  }

  async proposeReschedule(
    input: F7AgentContext & {
      readonly sessionPrescriptionId: UUID;
      readonly scheduledLocalDate: LocalDate;
    },
  ): Promise<AgentProposalDto> {
    return this.createProposal({
      ...input,
      operationKind: "RESCHEDULE_SESSION_PRESCRIPTION",
      command: {
        kind: "RESCHEDULE_SESSION_PRESCRIPTION",
        sessionPrescriptionId: input.sessionPrescriptionId,
        scheduledLocalDate: input.scheduledLocalDate,
      },
      toolName: "propose_reschedule_session",
    });
  }

  async proposeSetStrengthTargetLoad(
    input: F7AgentContext & {
      readonly sessionPrescriptionId: UUID;
      readonly strengthSetId: UUID;
      readonly targetLoadKg: number;
    },
  ): Promise<AgentProposalDto> {
    if (!Number.isFinite(input.targetLoadKg) || input.targetLoadKg < 0)
      throw new ApplicationError(
        "VALIDATION_FAILED",
        "targetLoadKg must be a finite non-negative number.",
      );
    return this.createProposal({
      ...input,
      operationKind: "SET_STRENGTH_SET_TARGET_LOAD",
      command: {
        kind: "SET_STRENGTH_SET_TARGET_LOAD",
        sessionPrescriptionId: input.sessionPrescriptionId,
        strengthSetId: input.strengthSetId,
        targetLoadKg: input.targetLoadKg,
      },
      toolName: "propose_set_strength_target_load",
    });
  }

  private async createProposal(
    input: F7AgentContext & {
      readonly operationKind: AgentOperationKind;
      readonly command: AgentMutationCommand;
      readonly toolName:
        | "propose_reschedule_session"
        | "propose_set_strength_target_load";
      readonly sessionPrescriptionId: UUID;
    },
  ): Promise<AgentProposalDto> {
    if (input.callId.trim().length === 0)
      throw new ApplicationError(
        "VALIDATION_FAILED",
        "The Eve tool call identity is required for proposal idempotency.",
      );
    const expectedToolName =
      input.operationKind === "RESCHEDULE_SESSION_PRESCRIPTION"
        ? "propose_reschedule_session"
        : "propose_set_strength_target_load";
    if (
      input.toolName !== expectedToolName ||
      input.operationKind !== input.command.kind
    )
      throw new ApplicationError(
        "VALIDATION_FAILED",
        "The proposal operation is invalid.",
      );
    return this.persistence.transaction(async (repositories) => {
      const scope = f7Scope(input.actor.workspaceId);
      await this.authorizeAgentAction(
        repositories,
        input.actor.actorId,
        input.actor.workspaceId,
        "agent.propose",
      );
      const prior = await repositories.agentProposals.findByCreationKey({
        scope,
        requestingActorId: input.actor.actorId,
        agentSessionId: input.agentSessionId,
        creationKey: input.callId,
      });
      if (prior !== null) {
        if (
          prior.operationKind !== input.operationKind ||
          prior.targetAggregateId !== input.sessionPrescriptionId ||
          !sameF7Command(prior.normalizedCommand, input.command)
        )
          throw new ApplicationError(
            "IDEMPOTENCY_CONFLICT",
            "The Eve tool call identity was already used for a different proposal.",
          );
        return toAgentProposalDto(prior);
      }

      const trainingDesign = new F3Application({
        transaction: async (work) => work(repositories),
      });
      const current =
        await trainingDesign.getSessionPrescriptionForMutationInTransaction(
          repositories,
          {
            principalId: input.actor.actorId,
            requestId: input.requestId,
            workspaceId: input.actor.workspaceId,
            sessionId: input.sessionPrescriptionId,
          },
        );
      await this.validateProposalTarget(repositories, current, input.command);
      const beforeProjection = this.beforeProjection(current, input.command);
      const afterProjection = this.afterProjection(
        current,
        input.command,
        beforeProjection,
      );
      const commandDigest = await computeAgentCommandDigest({
        workspaceId: input.actor.workspaceId,
        targetAggregateId: current.id,
        targetExpectedVersion: current.version,
        command: input.command,
      });
      const now = f7Now();
      const proposal: AgentProposal = {
        proposalId: f7Id(),
        workspaceId: input.actor.workspaceId,
        requestingActorId: input.actor.actorId,
        agentSessionId: input.agentSessionId,
        creationKey: input.callId,
        operationKind: input.operationKind,
        targetAggregateId: current.id,
        targetExpectedVersion: current.version,
        normalizedCommand: input.command,
        commandDigest,
        beforeProjection,
        afterProjection,
        status: "PENDING_APPROVAL",
        provenance: {
          source: "WORKOUTPAL_AGENT",
          toolName: input.toolName,
          agentSessionId: input.agentSessionId,
          callId: input.callId,
          requestId: input.requestId,
          explicitIntent: true,
          createdAt: now,
        },
        createdAt: now,
        updatedAt: now,
        version: 1,
      };
      await repositories.agentProposals.insert(proposal);
      const persisted = await repositories.agentProposals.findByCreationKey({
        scope,
        requestingActorId: input.actor.actorId,
        agentSessionId: input.agentSessionId,
        creationKey: input.callId,
      });
      if (persisted === null)
        throw new ApplicationError(
          "INTERNAL_ERROR",
          "The agent proposal could not be persisted.",
        );
      if (persisted.proposalId !== proposal.proposalId)
        return toAgentProposalDto(persisted);
      await repositories.audit.append(
        this.agentAudit(
          {
            principalId: input.actor.actorId,
            requestId: input.requestId,
            workspaceId: input.actor.workspaceId,
          },
          "agent_proposal.created",
          proposal.proposalId,
          null,
          proposal.version,
          {
            operationKind: proposal.operationKind,
            targetAggregateId: proposal.targetAggregateId,
            targetExpectedVersion: proposal.targetExpectedVersion,
            commandDigest: proposal.commandDigest,
            agentSessionId: proposal.agentSessionId,
          },
        ),
      );
      return toAgentProposalDto(proposal);
    }, transactionContext(input));
  }

  private async validateProposalTarget(
    repositories: F7Repositories,
    current: SessionPrescription,
    command: AgentMutationCommand,
  ): Promise<void> {
    if (command.sessionPrescriptionId !== current.id)
      throw new ApplicationError(
        "PROPOSAL_DIGEST_MISMATCH",
        "The proposal command targets a different session prescription.",
      );
    if (current.status === "archived" || current.archivedAt !== null)
      throw new ApplicationError(
        "DOMAIN_RULE_VIOLATION",
        "Archived session prescriptions cannot receive agent proposals.",
      );

    const scope = f7Scope(current.workspaceId);
    const plan = await repositories.trainingPlans.get(scope, current.planId);
    if (plan === null)
      throw new ApplicationError(
        "RESOURCE_NOT_FOUND",
        "Training plan not found.",
      );
    if (plan.status === "archived" || plan.archivedAt !== null)
      throw new ApplicationError(
        "DOMAIN_RULE_VIOLATION",
        "Archived training plans cannot receive agent proposals.",
      );

    const proposedDate =
      command.kind === "RESCHEDULE_SESSION_PRESCRIPTION"
        ? command.scheduledLocalDate
        : current.scheduledLocalDate;
    if (proposedDate < plan.startsOn || proposedDate > plan.endsOn)
      throw new ApplicationError(
        "DOMAIN_RULE_VIOLATION",
        "Session date must remain inside the plan dates.",
      );

    if (current.phaseId !== null) {
      const phase = await repositories.planPhases.get(scope, current.phaseId);
      if (
        phase === null ||
        phase.planId !== plan.id ||
        phase.archivedAt !== null
      )
        throw new ApplicationError(
          "RESOURCE_NOT_FOUND",
          "The session's active plan phase was not found.",
        );
      if (proposedDate < phase.startsOn || proposedDate > phase.endsOn)
        throw new ApplicationError(
          "DOMAIN_RULE_VIOLATION",
          "Session date must remain inside the phase dates.",
        );
    }

    switch (command.kind) {
      case "RESCHEDULE_SESSION_PRESCRIPTION":
        if (command.scheduledLocalDate === current.scheduledLocalDate)
          throw new ApplicationError(
            "VALIDATION_FAILED",
            "The proposed session date is already current; no change is needed.",
          );
        return;
      case "SET_STRENGTH_SET_TARGET_LOAD": {
        const set = findStrengthSet(current, command.strengthSetId);
        if (set === null)
          throw new ApplicationError(
            "RESOURCE_NOT_FOUND",
            "Strength set prescription not found.",
          );
        if (set.targetLoadKg === command.targetLoadKg)
          throw new ApplicationError(
            "VALIDATION_FAILED",
            "The proposed target load is already current; no change is needed.",
          );
        return;
      }
      default: {
        const exhaustive: never = command;
        return exhaustive;
      }
    }
  }

  async executeProposal(
    input: F7AgentContext & { readonly proposalId: UUID },
  ): Promise<AgentProposalExecutionResultDto> {
    let executionStarted = false;
    try {
      return await this.persistence.transaction(async (repositories) => {
        const scope = f7Scope(input.actor.workspaceId);
        const proposal = await repositories.agentProposals.get(
          scope,
          input.proposalId,
        );
        if (
          proposal === null ||
          proposal.requestingActorId !== input.actor.actorId
        )
          throw new ApplicationError(
            "RESOURCE_NOT_FOUND",
            "Agent proposal not found.",
          );
        await this.authorizeAgentAction(
          repositories,
          input.actor.actorId,
          input.actor.workspaceId,
          "agent.execute",
        );
        if (proposal.agentSessionId !== input.agentSessionId)
          throw new ApplicationError(
            "FORBIDDEN",
            "The proposal is not bound to this agent session.",
          );
        const trainingDesign = new F3Application({
          transaction: async (work) => work(repositories),
        });
        await trainingDesign.getSessionPrescriptionForMutationInTransaction(
          repositories,
          {
            principalId: input.actor.actorId,
            requestId: input.requestId,
            workspaceId: input.actor.workspaceId,
            sessionId: proposal.targetAggregateId,
          },
        );
        const existingExecution =
          await repositories.proposalExecutions.getForProposal(
            scope,
            input.proposalId,
          );
        if (existingExecution !== null) {
          return {
            ok: existingExecution.status === "EXECUTED",
            proposal: toAgentProposalDto(proposal),
            execution: existingExecution,
          };
        }
        if (
          proposal.status !== "PENDING_APPROVAL" &&
          proposal.status !== "APPROVED"
        )
          throw new ApplicationError(
            "PROPOSAL_STATE_CONFLICT",
            "This proposal is no longer executable; create a new proposal.",
          );
        const approval = await repositories.approvalDecisions.getForProposal(
          scope,
          proposal.proposalId,
        );
        if (
          approval === null ||
          approval.decision !== "APPROVE" ||
          approval.proposalDigest !== proposal.commandDigest ||
          approval.approvingActorId !== input.actor.actorId ||
          approval.agentSessionId !== input.agentSessionId
        )
          throw new ApplicationError(
            "APPROVAL_REQUIRED",
            "An authenticated WorkoutPal approval record is required before execution.",
          );
        if (proposal.status !== "APPROVED")
          throw new ApplicationError(
            "PROPOSAL_STATE_CONFLICT",
            "Only an approved proposal can be executed.",
          );

        const current =
          await trainingDesign.getSessionPrescriptionForMutationInTransaction(
            repositories,
            {
              principalId: input.actor.actorId,
              requestId: input.requestId,
              workspaceId: input.actor.workspaceId,
              sessionId: proposal.targetAggregateId,
            },
          );
        if (current.version !== proposal.targetExpectedVersion) {
          return this.finishNonExecutingFailure(
            repositories,
            proposal,
            approval,
            "STALE",
            "STALE_PROPOSAL",
            "The target changed after this proposal was created.",
            input.requestId,
          );
        }
        const command = f7CommandForProposal(proposal);
        try {
          await this.validateProposalTarget(repositories, current, command);
        } catch (error) {
          return this.finishNonExecutingFailure(
            repositories,
            proposal,
            approval,
            "FAILED",
            f7ErrorCode(error),
            f7ErrorMessage(error),
            input.requestId,
          );
        }
        const expectedDigest = await computeAgentCommandDigest({
          workspaceId: proposal.workspaceId,
          targetAggregateId: proposal.targetAggregateId,
          targetExpectedVersion: proposal.targetExpectedVersion,
          command,
        });
        if (expectedDigest !== proposal.commandDigest) {
          return this.finishNonExecutingFailure(
            repositories,
            proposal,
            approval,
            "FAILED",
            "PROPOSAL_DIGEST_MISMATCH",
            "The immutable proposal digest does not match its command.",
            input.requestId,
          );
        }
        const executing = await repositories.agentProposals.updateState({
          scope,
          proposalId: proposal.proposalId,
          expectedStatus: "APPROVED",
          status: "EXECUTING",
          updatedAt: f7Now(),
        });
        if (executing === null)
          throw new ApplicationError(
            "PROPOSAL_STATE_CONFLICT",
            "The proposal changed before execution began.",
          );
        executionStarted = true;
        const persisted = await this.dispatchApprovedCommand(
          trainingDesign,
          repositories,
          input,
          proposal,
          approval,
          current,
          command,
        );
        const executedAt = f7Now();
        const execution: AgentProposalExecution = {
          executionId: f7Id(),
          workspaceId: proposal.workspaceId,
          proposalId: proposal.proposalId,
          approvalId: approval.approvalId,
          proposalDigest: proposal.commandDigest,
          status: "EXECUTED",
          resultingAggregateVersion: persisted.version,
          errorCode: null,
          errorMessage: null,
          executedAt,
          requestId: input.requestId,
        };
        await repositories.proposalExecutions.insert(execution);
        const completed = await repositories.agentProposals.updateState({
          scope,
          proposalId: proposal.proposalId,
          expectedStatus: "EXECUTING",
          status: "EXECUTED",
          updatedAt: executedAt,
          executionId: execution.executionId,
          executedAt,
        });
        if (completed === null)
          throw new ApplicationError(
            "PROPOSAL_STATE_CONFLICT",
            "The executing proposal could not be finalized.",
          );
        await repositories.audit.append(
          this.agentAudit(
            {
              principalId: input.actor.actorId,
              requestId: input.requestId,
              workspaceId: input.actor.workspaceId,
            },
            "agent_proposal.executed",
            proposal.proposalId,
            proposal.version,
            completed.version,
            {
              approvalId: approval.approvalId,
              executionId: execution.executionId,
              operationKind: proposal.operationKind,
              resultingAggregateVersion: persisted.version,
            },
          ),
        );
        return { ok: true, proposal: toAgentProposalDto(completed), execution };
      }, transactionContext(input));
    } catch (error) {
      if (!executionStarted) throw error;
      return this.recordFailedExecutionAfterRollback(input, error);
    }
  }

  private async dispatchApprovedCommand(
    trainingDesign: F3Application,
    repositories: F7Repositories,
    input: F7AgentContext,
    proposal: AgentProposal,
    approval: ApprovalDecision,
    current: SessionPrescription,
    command: AgentMutationCommand,
  ): Promise<SessionPrescription> {
    const metadata: CommandMetadata & { readonly workspaceId: WorkspaceId } = {
      principalId: input.actor.actorId,
      requestId: input.requestId,
      workspaceId: input.actor.workspaceId,
      agentAudit: {
        proposalId: proposal.proposalId,
        approvalId: approval.approvalId,
        agentSessionId: proposal.agentSessionId,
        approvedBy: approval.approvingActorId,
      },
    };
    switch (command.kind) {
      case "RESCHEDULE_SESSION_PRESCRIPTION":
        return trainingDesign.updateSessionPrescriptionInTransaction(
          repositories,
          {
            ...metadata,
            sessionId: current.id,
            expectedVersion: proposal.targetExpectedVersion,
            scheduledLocalDate: command.scheduledLocalDate,
            createRevision: true,
          },
        );
      case "SET_STRENGTH_SET_TARGET_LOAD":
        return trainingDesign.updateSessionPrescriptionInTransaction(
          repositories,
          {
            ...metadata,
            sessionId: current.id,
            expectedVersion: proposal.targetExpectedVersion,
            blocks: setStrengthTargetLoad(
              current.blocks,
              command.strengthSetId,
              command.targetLoadKg,
            ),
            createRevision: true,
          },
        );
      default: {
        const exhaustive: never = command;
        return exhaustive;
      }
    }
  }

  private beforeProjection(
    current: SessionPrescription,
    command: AgentMutationCommand,
  ): AgentProposalProjection {
    switch (command.kind) {
      case "RESCHEDULE_SESSION_PRESCRIPTION":
        return {
          kind: "SESSION_SCHEDULE",
          sessionPrescriptionId: current.id,
          scheduledLocalDate: current.scheduledLocalDate,
          timeZone: current.timeZone,
          version: current.version,
        };
      case "SET_STRENGTH_SET_TARGET_LOAD": {
        const set = findStrengthSet(current, command.strengthSetId);
        if (set === null)
          throw new ApplicationError(
            "RESOURCE_NOT_FOUND",
            "Strength set prescription not found.",
          );
        return {
          kind: "STRENGTH_SET_LOAD",
          sessionPrescriptionId: current.id,
          strengthSetId: command.strengthSetId,
          movementId: set.movementId,
          ordinal: set.ordinal,
          targetLoadKg: set.targetLoadKg,
          version: current.version,
        };
      }
      default: {
        const exhaustive: never = command;
        return exhaustive;
      }
    }
  }

  private afterProjection(
    current: SessionPrescription,
    command: AgentMutationCommand,
    before: AgentProposalProjection,
  ): AgentProposalProjection {
    switch (command.kind) {
      case "RESCHEDULE_SESSION_PRESCRIPTION":
        return {
          kind: "SESSION_SCHEDULE",
          sessionPrescriptionId: current.id,
          scheduledLocalDate: command.scheduledLocalDate,
          timeZone: current.timeZone,
          version: current.version + 1,
        };
      case "SET_STRENGTH_SET_TARGET_LOAD":
        if (before.kind !== "STRENGTH_SET_LOAD")
          throw new ApplicationError(
            "INTERNAL_ERROR",
            "The strength proposal projection is inconsistent.",
          );
        return {
          ...before,
          targetLoadKg: command.targetLoadKg,
          version: current.version + 1,
        };
      default: {
        const exhaustive: never = command;
        return exhaustive;
      }
    }
  }

  private async finishNonExecutingFailure(
    repositories: F7Repositories,
    proposal: AgentProposal,
    approval: ApprovalDecision,
    status: "STALE" | "FAILED",
    errorCode: string,
    errorMessage: string,
    requestId: string,
  ): Promise<AgentProposalExecutionResultDto> {
    const now = f7Now();
    assertAgentProposalTransition(proposal.status, status);
    const updated = await repositories.agentProposals.updateState({
      scope: f7Scope(proposal.workspaceId),
      proposalId: proposal.proposalId,
      expectedStatus: "APPROVED",
      status,
      updatedAt: now,
      failureCode: errorCode,
      failureMessage: errorMessage,
    });
    if (updated === null)
      throw new ApplicationError(
        "PROPOSAL_STATE_CONFLICT",
        "The proposal changed before the execution check completed.",
      );
    const execution: AgentProposalExecution = {
      executionId: f7Id(),
      workspaceId: proposal.workspaceId,
      proposalId: proposal.proposalId,
      approvalId: approval.approvalId,
      proposalDigest: proposal.commandDigest,
      status: "FAILED",
      resultingAggregateVersion: null,
      errorCode,
      errorMessage,
      executedAt: now,
      requestId,
    };
    await repositories.proposalExecutions.insert(execution);
    await repositories.audit.append(
      this.agentAudit(
        {
          principalId: approval.approvingActorId,
          requestId,
          workspaceId: proposal.workspaceId,
        },
        status === "STALE" ? "agent_proposal.stale" : "agent_proposal.failed",
        proposal.proposalId,
        proposal.version,
        updated.version,
        { approvalId: approval.approvalId, errorCode },
      ),
    );
    return { ok: false, proposal: toAgentProposalDto(updated), execution };
  }

  private async recordFailedExecutionAfterRollback(
    input: F7AgentContext & { readonly proposalId: UUID },
    error: unknown,
  ): Promise<AgentProposalExecutionResultDto> {
    return this.persistence.transaction(async (repositories) => {
      const scope = f7Scope(input.actor.workspaceId);
      const proposal = await repositories.agentProposals.get(
        scope,
        input.proposalId,
      );
      if (proposal === null)
        throw new ApplicationError(
          "RESOURCE_NOT_FOUND",
          "Agent proposal not found.",
        );
      const approval = await repositories.approvalDecisions.getForProposal(
        scope,
        proposal.proposalId,
      );
      if (approval === null)
        throw new ApplicationError(
          "APPROVAL_REQUIRED",
          "An authenticated WorkoutPal approval record is required before execution.",
        );
      return this.finishNonExecutingFailure(
        repositories,
        proposal,
        approval,
        "FAILED",
        f7ErrorCode(error),
        f7ErrorMessage(error),
        input.requestId,
      );
    }, transactionContext(input));
  }

  private agentAudit(
    input: CommandMetadata & { readonly workspaceId: WorkspaceId },
    action: string,
    aggregateId: UUID,
    versionBefore: number | null,
    versionAfter: number | null,
    payload: Readonly<Record<string, unknown>>,
  ): AuditEvent {
    return {
      id: f7Id(),
      occurredAt: f7Now(),
      workspaceId: input.workspaceId,
      actorId: input.principalId,
      actorType: "HUMAN",
      action,
      aggregateType: "AgentProposal",
      aggregateId,
      versionBefore,
      versionAfter,
      requestId: input.requestId,
      payload,
    };
  }
}

export function createF7Application(persistence: F7Persistence): F7Application {
  return new F7Application(persistence);
}
