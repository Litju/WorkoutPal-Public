import type {
  AgentProposal,
  AgentProposalExecution,
  AgentProposalStatus,
  ApprovalDecision,
} from "@workoutpal/agent-operations";
import type { F7Repositories } from "@workoutpal/application";
import type { Instant, UUID, WorkspaceScope } from "@workoutpal/shared-kernel";
import type { PoolClient } from "pg";
import {
  mapAgentProposal,
  mapApprovalDecision,
  mapProposalExecution,
} from "./mappers.js";

export function createAgentRepositories(
  client: PoolClient,
): Pick<
  F7Repositories,
  "agentProposals" | "approvalDecisions" | "proposalExecutions"
> {
  return {
    agentProposals: {
      async get(scope: WorkspaceScope, proposalId: UUID) {
        const result = await client.query(
          `SELECT id, workspace_id, requesting_actor_id, agent_session_id,
                  creation_key, operation_kind, target_aggregate_id,
                  target_expected_version, normalized_command, command_digest,
                  before_projection, after_projection, status, provenance,
                  created_at, updated_at, version, failure_code, failure_message,
                  execution_id, approved_at, rejected_at, executed_at
             FROM agent.proposal
            WHERE workspace_id = $1 AND id = $2`,
          [scope.workspaceId, proposalId],
        );
        const row = result.rows[0] as Record<string, unknown> | undefined;
        return row === undefined ? null : mapAgentProposal(row);
      },
      async findByCreationKey(input: {
        readonly scope: WorkspaceScope;
        readonly requestingActorId: UUID;
        readonly agentSessionId: string;
        readonly creationKey: string;
      }) {
        const result = await client.query(
          `SELECT id, workspace_id, requesting_actor_id, agent_session_id,
                  creation_key, operation_kind, target_aggregate_id,
                  target_expected_version, normalized_command, command_digest,
                  before_projection, after_projection, status, provenance,
                  created_at, updated_at, version, failure_code, failure_message,
                  execution_id, approved_at, rejected_at, executed_at
             FROM agent.proposal
            WHERE workspace_id = $1 AND requesting_actor_id = $2
              AND agent_session_id = $3 AND creation_key = $4`,
          [
            input.scope.workspaceId,
            input.requestingActorId,
            input.agentSessionId,
            input.creationKey,
          ],
        );
        const row = result.rows[0] as Record<string, unknown> | undefined;
        return row === undefined ? null : mapAgentProposal(row);
      },
      async insert(proposal: AgentProposal) {
        await client.query(
          `INSERT INTO agent.proposal
             (id, workspace_id, requesting_actor_id, agent_session_id,
              creation_key, operation_kind, target_aggregate_id,
              target_expected_version, normalized_command, command_digest,
              before_projection, after_projection, status, provenance,
              created_at, updated_at, version, failure_code, failure_message,
              execution_id, approved_at, rejected_at, executed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11::jsonb,
                   $12::jsonb, $13, $14::jsonb, $15, $16, $17, $18, $19, $20,
                   $21, $22, $23)
           ON CONFLICT (workspace_id, requesting_actor_id, agent_session_id, creation_key)
           DO NOTHING`,
          [
            proposal.proposalId,
            proposal.workspaceId,
            proposal.requestingActorId,
            proposal.agentSessionId,
            proposal.creationKey,
            proposal.operationKind,
            proposal.targetAggregateId,
            proposal.targetExpectedVersion,
            JSON.stringify(proposal.normalizedCommand),
            proposal.commandDigest,
            JSON.stringify(proposal.beforeProjection),
            JSON.stringify(proposal.afterProjection),
            proposal.status,
            JSON.stringify(proposal.provenance),
            proposal.createdAt,
            proposal.updatedAt,
            proposal.version,
            proposal.failureCode ?? null,
            proposal.failureMessage ?? null,
            proposal.executionId ?? null,
            proposal.approvedAt ?? null,
            proposal.rejectedAt ?? null,
            proposal.executedAt ?? null,
          ],
        );
      },
      async updateState(input: {
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
      }) {
        const result = await client.query(
          `UPDATE agent.proposal
              SET status = $3, updated_at = $4, version = version + 1,
                  failure_code = $5, failure_message = $6,
                  execution_id = COALESCE($7, execution_id),
                  approved_at = COALESCE($8, approved_at),
                  rejected_at = COALESCE($9, rejected_at),
                  executed_at = COALESCE($10, executed_at)
            WHERE workspace_id = $1 AND id = $2 AND status = $11
            RETURNING id, workspace_id, requesting_actor_id, agent_session_id,
                      creation_key, operation_kind, target_aggregate_id,
                      target_expected_version, normalized_command, command_digest,
                      before_projection, after_projection, status, provenance,
                      created_at, updated_at, version, failure_code, failure_message,
                      execution_id, approved_at, rejected_at, executed_at`,
          [
            input.scope.workspaceId,
            input.proposalId,
            input.status,
            input.updatedAt,
            input.failureCode ?? null,
            input.failureMessage ?? null,
            input.executionId ?? null,
            input.approvedAt ?? null,
            input.rejectedAt ?? null,
            input.executedAt ?? null,
            input.expectedStatus,
          ],
        );
        const row = result.rows[0] as Record<string, unknown> | undefined;
        return row === undefined ? null : mapAgentProposal(row);
      },
    },
    approvalDecisions: {
      async getForProposal(scope: WorkspaceScope, proposalId: UUID) {
        const result = await client.query(
          `SELECT id, workspace_id, proposal_id, proposal_digest,
                  approving_actor_id, agent_session_id, approval_request_id,
                  decision, decided_at
             FROM agent.approval_decision
            WHERE workspace_id = $1 AND proposal_id = $2`,
          [scope.workspaceId, proposalId],
        );
        const row = result.rows[0] as Record<string, unknown> | undefined;
        return row === undefined ? null : mapApprovalDecision(row);
      },
      async insert(decision: ApprovalDecision) {
        await client.query(
          `INSERT INTO agent.approval_decision
           (id, workspace_id, proposal_id, proposal_digest,
              approving_actor_id, agent_session_id, approval_request_id,
              decision, decided_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (workspace_id, proposal_id) DO NOTHING`,
          [
            decision.approvalId,
            decision.workspaceId,
            decision.proposalId,
            decision.proposalDigest,
            decision.approvingActorId,
            decision.agentSessionId,
            decision.approvalRequestId,
            decision.decision,
            decision.decidedAt,
          ],
        );
      },
    },
    proposalExecutions: {
      async getForProposal(scope: WorkspaceScope, proposalId: UUID) {
        const result = await client.query(
          `SELECT id, workspace_id, proposal_id, approval_id,
                  proposal_digest, status, resulting_aggregate_version,
                  error_code, error_message, executed_at, request_id
             FROM agent.proposal_execution
            WHERE workspace_id = $1 AND proposal_id = $2`,
          [scope.workspaceId, proposalId],
        );
        const row = result.rows[0] as Record<string, unknown> | undefined;
        return row === undefined ? null : mapProposalExecution(row);
      },
      async insert(execution: AgentProposalExecution) {
        await client.query(
          `INSERT INTO agent.proposal_execution
             (id, workspace_id, proposal_id, approval_id, proposal_digest,
              status, resulting_aggregate_version, error_code, error_message,
              executed_at, request_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            execution.executionId,
            execution.workspaceId,
            execution.proposalId,
            execution.approvalId,
            execution.proposalDigest,
            execution.status,
            execution.resultingAggregateVersion,
            execution.errorCode,
            execution.errorMessage,
            execution.executedAt,
            execution.requestId,
          ],
        );
      },
    },
  };
}
