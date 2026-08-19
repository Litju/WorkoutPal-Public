import {
  createF2Application,
  createF3Application,
  createF7Application,
  type F7AgentContext,
} from "@workoutpal/application";
import { createPostgresF2Persistence } from "@workoutpal/persistence-postgres";
import type { ActorContext, UUID } from "@workoutpal/shared-kernel";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined)
  throw new Error(
    "DATABASE_URL must be supplied by the F7 integration test environment.",
  );

const canonicalTrainingDesignTables = [
  { name: "design.movement_definition", scopeColumn: "workspace_id" },
  { name: "design.training_goal", scopeColumn: "workspace_id" },
  { name: "design.training_plan", scopeColumn: "workspace_id" },
  { name: "design.training_plan_goal", scopeColumn: "workspace_id" },
  { name: "design.plan_phase", scopeColumn: "workspace_id" },
  { name: "design.session_prescription", scopeColumn: "workspace_id" },
  { name: "design.session_block", scopeColumn: "workspace_id" },
  {
    name: "design.strength_exercise_prescription",
    scopeColumn: "workspace_id",
  },
  { name: "design.strength_set_prescription", scopeColumn: "workspace_id" },
  {
    name: "design.endurance_segment_prescription",
    scopeColumn: "workspace_id",
  },
  { name: "design.mobility_item_prescription", scopeColumn: "workspace_id" },
  { name: "design.training_plan_revision", scopeColumn: "workspace_id" },
  {
    name: "design.session_prescription_revision",
    scopeColumn: "workspace_id",
  },
] as const;

const agentOperationalTables = [
  { name: "agent.proposal", scopeColumn: "workspace_id" },
  { name: "agent.approval_decision", scopeColumn: "workspace_id" },
  { name: "agent.proposal_execution", scopeColumn: "workspace_id" },
] as const;

type ScopedTableSnapshot = Readonly<{
  readonly count: string;
  readonly fingerprint: string;
}>;

type ScopedState = Readonly<Record<string, ScopedTableSnapshot>>;

let sentinelPrincipalId: UUID | undefined;

async function scopedState(
  client: Client,
  workspaceId: UUID,
  tables: readonly {
    readonly name: string;
    readonly scopeColumn: string;
  }[],
): Promise<ScopedState> {
  const state: Record<string, ScopedTableSnapshot> = {};
  if (sentinelPrincipalId === undefined)
    throw new Error("The sentinel transaction requires a principal context.");
  await client.query("BEGIN");
  try {
    await client.query(
      `SELECT
         set_config('workoutpal.principal_id', $1, true),
         set_config('workoutpal.workspace_id', $2, true)`,
      [sentinelPrincipalId, workspaceId],
    );
    for (const table of tables) {
      const result = await client.query<ScopedTableSnapshot>(
        `SELECT count(*)::text AS count,
                md5(COALESCE(string_agg(row_to_json(t)::text, '|' ORDER BY row_to_json(t)::text), '')) AS fingerprint
           FROM ${table.name} AS t
          WHERE t.${table.scopeColumn} = $1`,
        [workspaceId],
      );
      const row = result.rows[0];
      if (row === undefined)
        throw new Error(`No snapshot row returned for ${table.name}.`);
      state[table.name] = row;
    }
  } finally {
    await client.query("ROLLBACK");
  }
  return state;
}

async function canonicalTrainingDesignState(
  client: Client,
  workspaceId: UUID,
): Promise<ScopedState> {
  return scopedState(client, workspaceId, canonicalTrainingDesignTables);
}

async function agentOperationalState(
  client: Client,
  workspaceId: UUID,
): Promise<ScopedState> {
  return scopedState(client, workspaceId, agentOperationalTables);
}

async function sessionPrescriptionMutationCount(
  client: Client,
  workspaceId: UUID,
  sessionId: UUID,
): Promise<number> {
  if (sentinelPrincipalId === undefined)
    throw new Error("The sentinel transaction requires a principal context.");
  await client.query("BEGIN");
  try {
    await client.query(
      `SELECT
         set_config('workoutpal.principal_id', $1, true),
         set_config('workoutpal.workspace_id', $2, true)`,
      [sentinelPrincipalId, workspaceId],
    );
    const result = await client.query<{ readonly count: string }>(
      `SELECT count(*)::text AS count
         FROM audit.event
        WHERE workspace_id = $1
          AND aggregate_type = 'SessionPrescription'
          AND aggregate_id = $2
          AND action = 'session_prescription.updated'`,
      [workspaceId, sessionId],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error("No mutation count row returned.");
    return Number(row.count);
  } finally {
    await client.query("ROLLBACK");
  }
}

function id(): UUID {
  return crypto.randomUUID() as UUID;
}

function context(
  actor: ActorContext,
  agentSessionId: string,
  callId: string,
  toolName: string,
): F7AgentContext {
  return {
    actor,
    agentSessionId,
    callId,
    toolName,
    requestId: `f7-${callId}`,
  };
}

describe("F7 agent proposal approval mutation with real PostgreSQL", () => {
  it("does not mutate before approval, executes one typed command, and replays idempotently", async () => {
    const persistence = createPostgresF2Persistence({
      url: databaseUrl,
      applicationName: "workoutpal-f7-integration",
      ssl: false,
    });
    const client = new Client({
      connectionString: databaseUrl,
      application_name: "workoutpal-f7-integration-sentinel",
    });
    await client.connect();
    try {
      const principalId = id();
      sentinelPrincipalId = principalId;
      const actor = {
        actorId: principalId,
        actorType: "HUMAN" as const,
      };
      const foundation = createF2Application(persistence);
      const design = createF3Application({
        transaction: persistence.f3Transaction,
      });
      const operations = createF7Application({
        transaction: persistence.f7Transaction,
      });
      const workspace = await foundation.createWorkspace({
        principalId,
        requestId: "f7-workspace",
        name: `F7 ${id()}`,
      });
      const scopedActor = {
        ...actor,
        workspaceId: workspace.id,
      } as ActorContext;
      const athlete = await foundation.createAthlete({
        principalId,
        requestId: "f7-athlete",
        workspaceId: workspace.id,
        displayName: `F7 Athlete ${id()}`,
        idempotencyKey: `f7-athlete-${id()}`,
      });
      const movement = await design.createWorkspaceMovement({
        principalId,
        requestId: "f7-movement",
        workspaceId: workspace.id,
        canonicalName: "F7 Squat",
        modality: "strength",
      });
      const plan = await design.createTrainingPlan({
        principalId,
        requestId: "f7-plan",
        workspaceId: workspace.id,
        athleteId: athlete.id,
        title: "F7 plan",
        startsOn: "2026-09-01" as never,
        endsOn: "2026-09-30" as never,
        timeZone: "America/Argentina/Buenos_Aires" as never,
      });
      const strengthSetId = id();
      const session = await design.createSessionPrescription({
        principalId,
        requestId: "f7-session",
        workspaceId: workspace.id,
        planId: plan.id,
        scheduledLocalDate: "2026-09-04" as never,
        timeZone: "America/Argentina/Buenos_Aires" as never,
        title: "F7 strength session",
        blocks: [
          {
            id: id(),
            kind: "strength",
            ordinal: 1,
            exercises: [
              {
                id: id(),
                movementId: movement.id,
                ordinal: 1,
                sets: [
                  {
                    id: strengthSetId,
                    ordinal: 1,
                    targetRepMin: 5,
                    targetRepMax: 5,
                    targetLoadKg: 140,
                  },
                ],
              },
            ],
          },
        ],
      });
      await design.publishTrainingPlan({
        principalId,
        requestId: "f7-publish",
        workspaceId: workspace.id,
        planId: plan.id,
        expectedVersion: plan.version,
      });
      const published = await design.getSessionPrescription({
        principalId,
        requestId: "f7-published-read",
        workspaceId: workspace.id,
        sessionId: session.id,
      });

      const canonicalBeforeProposal = await canonicalTrainingDesignState(
        client,
        workspace.id,
      );
      const operationalBeforeProposal = await agentOperationalState(
        client,
        workspace.id,
      );
      const mutationCountBeforeProposal =
        await sessionPrescriptionMutationCount(
          client,
          workspace.id,
          session.id,
        );

      const proposal = await operations.proposeSetStrengthTargetLoad({
        ...context(
          scopedActor,
          "f7-session-1",
          "f7-call-load-1",
          "propose_set_strength_target_load",
        ),
        sessionPrescriptionId: session.id,
        strengthSetId,
        targetLoadKg: 135,
      });
      expect(proposal.status).toBe("PENDING_APPROVAL");
      expect(proposal.beforeProjection).toMatchObject({ targetLoadKg: 140 });
      expect(proposal.afterProjection).toMatchObject({ targetLoadKg: 135 });
      const coachPrincipal = id();
      const athletePrincipal = id();
      await persistence.transaction(
        async (repositories) => {
          await repositories.memberships.insert({
            id: id(),
            workspaceId: workspace.id,
            principalId: coachPrincipal,
            role: "coach",
            status: "active",
          });
          await repositories.memberships.insert({
            id: id(),
            workspaceId: workspace.id,
            principalId: athletePrincipal,
            role: "athlete",
            status: "active",
          });
        },
        { principalId, workspaceId: workspace.id },
      );
      await expect(
        operations.decideProposal({
          principalId: coachPrincipal,
          requestId: "f7-wrong-approver",
          workspaceId: workspace.id,
          proposalId: proposal.proposalId,
          decision: "APPROVE",
          proposalDigest: proposal.commandDigest,
          agentSessionId: "f7-session-1",
        }),
      ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
      await expect(
        operations.proposeReschedule({
          ...context(
            {
              actorId: athletePrincipal,
              actorType: "HUMAN",
              workspaceId: workspace.id,
            },
            "f7-athlete-agent-session",
            "f7-athlete-agent-call",
            "propose_reschedule_session",
          ),
          sessionPrescriptionId: session.id,
          scheduledLocalDate: "2026-09-08" as never,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(await canonicalTrainingDesignState(client, workspace.id)).toEqual(
        canonicalBeforeProposal,
      );
      expect(
        await sessionPrescriptionMutationCount(
          client,
          workspace.id,
          session.id,
        ),
      ).toBe(mutationCountBeforeProposal);
      expect(await agentOperationalState(client, workspace.id)).not.toEqual(
        operationalBeforeProposal,
      );
      const proposalReplay = await operations.proposeSetStrengthTargetLoad({
        ...context(
          scopedActor,
          "f7-session-1",
          "f7-call-load-1",
          "propose_set_strength_target_load",
        ),
        sessionPrescriptionId: session.id,
        strengthSetId,
        targetLoadKg: 135,
      });
      expect(proposalReplay.proposalId).toBe(proposal.proposalId);
      await expect(
        operations.proposeSetStrengthTargetLoad({
          ...context(
            scopedActor,
            "f7-session-1",
            "f7-call-load-1",
            "propose_set_strength_target_load",
          ),
          sessionPrescriptionId: session.id,
          strengthSetId,
          targetLoadKg: 136,
        }),
      ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
      await expect(
        operations.proposeSetStrengthTargetLoad({
          ...context(
            scopedActor,
            "f7-session-1",
            "f7-call-load-noop",
            "propose_set_strength_target_load",
          ),
          sessionPrescriptionId: session.id,
          strengthSetId,
          targetLoadKg: 140,
        }),
      ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
      await expect(
        operations.proposeReschedule({
          ...context(
            scopedActor,
            "f7-session-1",
            "f7-call-date-outside-plan",
            "propose_reschedule_session",
          ),
          sessionPrescriptionId: session.id,
          scheduledLocalDate: "2026-10-01" as never,
        }),
      ).rejects.toMatchObject({ code: "DOMAIN_RULE_VIOLATION" });
      const beforeApproval = await design.getSessionPrescription({
        principalId,
        requestId: "f7-before-approval",
        workspaceId: workspace.id,
        sessionId: session.id,
      });
      expect(beforeApproval.version).toBe(published.version);
      expect(beforeApproval.status).toBe("published");
      expect(await canonicalTrainingDesignState(client, workspace.id)).toEqual(
        canonicalBeforeProposal,
      );

      const approved = await operations.decideProposal({
        principalId,
        requestId: "f7-approval",
        workspaceId: workspace.id,
        proposalId: proposal.proposalId,
        decision: "APPROVE",
        proposalDigest: proposal.commandDigest,
        approvalRequestId: "eve-request-1",
        agentSessionId: "f7-session-1",
      });
      expect(approved.status).toBe("APPROVED");
      const duplicateApproval = await operations.decideProposal({
        principalId,
        requestId: "f7-approval-retry",
        workspaceId: workspace.id,
        proposalId: proposal.proposalId,
        decision: "APPROVE",
        proposalDigest: proposal.commandDigest,
        approvalRequestId: "eve-request-1",
        agentSessionId: "f7-session-1",
      });
      expect(duplicateApproval.status).toBe("APPROVED");

      const result = await operations.executeProposal({
        ...context(
          scopedActor,
          "f7-session-1",
          "f7-call-execute-1",
          "execute_agent_proposal",
        ),
        proposalId: proposal.proposalId,
      });
      expect(result.ok).toBe(true);
      expect(result.execution?.status).toBe("EXECUTED");
      const changed = await design.getSessionPrescription({
        principalId,
        requestId: "f7-after-execution",
        workspaceId: workspace.id,
        sessionId: session.id,
      });
      expect(changed.status).toBe("draft");
      expect(changed.publishedRevision).toBe(published.publishedRevision);
      expect(changed.version).toBe(beforeApproval.version + 1);
      expect(changed.blocks[0]).toMatchObject({
        kind: "strength",
      });
      const changedSet =
        changed.blocks[0]?.kind === "strength"
          ? changed.blocks[0].exercises[0]?.sets[0]
          : undefined;
      expect(changedSet?.targetLoadKg).toBe(135);
      const canonicalAfterLoad = await canonicalTrainingDesignState(
        client,
        workspace.id,
      );
      expect(canonicalAfterLoad).not.toEqual(canonicalBeforeProposal);
      expect(
        (await sessionPrescriptionMutationCount(
          client,
          workspace.id,
          session.id,
        )) - mutationCountBeforeProposal,
      ).toBe(1);

      const replay = await operations.executeProposal({
        ...context(
          scopedActor,
          "f7-session-1",
          "f7-call-execute-retry",
          "execute_agent_proposal",
        ),
        proposalId: proposal.proposalId,
      });
      expect(replay.execution?.executionId).toBe(result.execution?.executionId);
      expect(
        (
          await design.getSessionPrescription({
            principalId,
            requestId: "f7-after-replay",
            workspaceId: workspace.id,
            sessionId: session.id,
          })
        ).version,
      ).toBe(changed.version);
      expect(await canonicalTrainingDesignState(client, workspace.id)).toEqual(
        canonicalAfterLoad,
      );

      const canonicalBeforeReschedule = await canonicalTrainingDesignState(
        client,
        workspace.id,
      );
      const mutationCountBeforeReschedule =
        await sessionPrescriptionMutationCount(
          client,
          workspace.id,
          session.id,
        );
      const rescheduleProposal = await operations.proposeReschedule({
        ...context(
          scopedActor,
          "f7-session-1",
          "f7-call-reschedule-1",
          "propose_reschedule_session",
        ),
        sessionPrescriptionId: session.id,
        scheduledLocalDate: "2026-09-07" as never,
      });
      expect(canonicalBeforeReschedule).toEqual(canonicalAfterLoad);
      const approvedReschedule = await operations.decideProposal({
        principalId,
        requestId: "f7-reschedule-approval",
        workspaceId: workspace.id,
        proposalId: rescheduleProposal.proposalId,
        decision: "APPROVE",
        proposalDigest: rescheduleProposal.commandDigest,
        approvalRequestId: "eve-request-reschedule",
        agentSessionId: "f7-session-1",
      });
      expect(approvedReschedule.status).toBe("APPROVED");
      expect(await canonicalTrainingDesignState(client, workspace.id)).toEqual(
        canonicalBeforeReschedule,
      );
      const rescheduleResult = await operations.executeProposal({
        ...context(
          scopedActor,
          "f7-session-1",
          "f7-call-reschedule-execute",
          "execute_agent_proposal",
        ),
        proposalId: rescheduleProposal.proposalId,
      });
      expect(rescheduleResult.ok).toBe(true);
      const rescheduled = await design.getSessionPrescription({
        principalId,
        requestId: "f7-after-reschedule",
        workspaceId: workspace.id,
        sessionId: session.id,
      });
      expect(rescheduled.scheduledLocalDate).toBe("2026-09-07");
      expect(rescheduled.version).toBe(changed.version + 1);
      expect(
        (await sessionPrescriptionMutationCount(
          client,
          workspace.id,
          session.id,
        )) - mutationCountBeforeReschedule,
      ).toBe(1);

      const canonicalBeforeRejection = await canonicalTrainingDesignState(
        client,
        workspace.id,
      );
      const mutationCountBeforeRejection =
        await sessionPrescriptionMutationCount(
          client,
          workspace.id,
          session.id,
        );
      const rejectedProposal = await operations.proposeReschedule({
        ...context(
          scopedActor,
          "f7-session-1",
          "f7-call-rejected-1",
          "propose_reschedule_session",
        ),
        sessionPrescriptionId: session.id,
        scheduledLocalDate: "2026-09-08" as never,
      });
      const rejected = await operations.decideProposal({
        principalId,
        requestId: "f7-rejected-decision",
        workspaceId: workspace.id,
        proposalId: rejectedProposal.proposalId,
        decision: "REJECT",
        proposalDigest: rejectedProposal.commandDigest,
        approvalRequestId: "eve-request-rejected",
        agentSessionId: "f7-session-1",
      });
      expect(rejected.status).toBe("REJECTED");
      expect(await canonicalTrainingDesignState(client, workspace.id)).toEqual(
        canonicalBeforeRejection,
      );
      await expect(
        operations.executeProposal({
          ...context(
            scopedActor,
            "f7-session-1",
            "f7-call-rejected-execute",
            "execute_agent_proposal",
          ),
          proposalId: rejectedProposal.proposalId,
        }),
      ).rejects.toMatchObject({ code: "PROPOSAL_STATE_CONFLICT" });
      expect(
        (
          await design.getSessionPrescription({
            principalId,
            requestId: "f7-after-rejection",
            workspaceId: workspace.id,
            sessionId: session.id,
          })
        ).version,
      ).toBe(rescheduled.version);
      expect(
        await sessionPrescriptionMutationCount(
          client,
          workspace.id,
          session.id,
        ),
      ).toBe(mutationCountBeforeRejection);

      const canonicalBeforeBypass = await canonicalTrainingDesignState(
        client,
        workspace.id,
      );
      const mutationCountBeforeBypass = await sessionPrescriptionMutationCount(
        client,
        workspace.id,
        session.id,
      );
      const bypassProposal = await operations.proposeReschedule({
        ...context(
          scopedActor,
          "f7-session-1",
          "f7-call-bypass-1",
          "propose_reschedule_session",
        ),
        sessionPrescriptionId: session.id,
        scheduledLocalDate: "2026-09-05" as never,
      });
      await expect(
        operations.executeProposal({
          ...context(
            scopedActor,
            "f7-session-1",
            "f7-call-bypass-execute",
            "execute_agent_proposal",
          ),
          proposalId: bypassProposal.proposalId,
        }),
      ).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
      const afterBypass = await design.getSessionPrescription({
        principalId,
        requestId: "f7-after-bypass",
        workspaceId: workspace.id,
        sessionId: session.id,
      });
      expect(afterBypass.version).toBe(rescheduled.version);
      expect(await canonicalTrainingDesignState(client, workspace.id)).toEqual(
        canonicalBeforeBypass,
      );
      expect(
        await sessionPrescriptionMutationCount(
          client,
          workspace.id,
          session.id,
        ),
      ).toBe(mutationCountBeforeBypass);

      const canonicalBeforeStaleExecution = await canonicalTrainingDesignState(
        client,
        workspace.id,
      );
      const mutationCountBeforeStaleExecution =
        await sessionPrescriptionMutationCount(
          client,
          workspace.id,
          session.id,
        );
      const staleProposal = await operations.proposeReschedule({
        ...context(
          scopedActor,
          "f7-session-1",
          "f7-call-stale-1",
          "propose_reschedule_session",
        ),
        sessionPrescriptionId: session.id,
        scheduledLocalDate: "2026-09-06" as never,
      });
      const concurrentlyChanged = await design.updateSessionPrescription({
        principalId,
        requestId: "f7-concurrent-change",
        workspaceId: workspace.id,
        sessionId: session.id,
        expectedVersion: afterBypass.version,
        title: "Changed while approval was pending",
        createRevision: true,
      });
      await operations.decideProposal({
        principalId,
        requestId: "f7-stale-approval",
        workspaceId: workspace.id,
        proposalId: staleProposal.proposalId,
        decision: "APPROVE",
        proposalDigest: staleProposal.commandDigest,
        approvalRequestId: "eve-request-stale",
        agentSessionId: "f7-session-1",
      });
      const stale = await operations.executeProposal({
        ...context(
          scopedActor,
          "f7-session-1",
          "f7-stale-execute",
          "execute_agent_proposal",
        ),
        proposalId: staleProposal.proposalId,
      });
      expect(stale.ok).toBe(false);
      expect(stale.proposal.status).toBe("STALE");
      expect(stale.execution?.errorCode).toBe("STALE_PROPOSAL");
      const canonicalAfterStaleExecution = await canonicalTrainingDesignState(
        client,
        workspace.id,
      );
      const mutationCountAfterStaleExecution =
        await sessionPrescriptionMutationCount(
          client,
          workspace.id,
          session.id,
        );
      expect(canonicalAfterStaleExecution).not.toEqual(
        canonicalBeforeStaleExecution,
      );
      expect(mutationCountAfterStaleExecution).toBe(
        mutationCountBeforeStaleExecution + 1,
      );
      expect(
        (
          await design.getSessionPrescription({
            principalId,
            requestId: "f7-after-stale",
            workspaceId: workspace.id,
            sessionId: session.id,
          })
        ).version,
      ).toBe(concurrentlyChanged.version);

      const canonicalBeforeUnauthorized = await canonicalTrainingDesignState(
        client,
        workspace.id,
      );
      const mutationCountBeforeUnauthorized =
        await sessionPrescriptionMutationCount(
          client,
          workspace.id,
          session.id,
        );

      await expect(
        operations.executeProposal({
          ...context(
            {
              actorId: id(),
              actorType: "HUMAN",
              workspaceId: workspace.id,
            },
            "f7-session-1",
            "f7-cross-actor-replay",
            "execute_agent_proposal",
          ),
          proposalId: proposal.proposalId,
        }),
      ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
      await expect(
        operations.executeProposal({
          ...context(
            scopedActor,
            "f7-different-session",
            "f7-cross-session-replay",
            "execute_agent_proposal",
          ),
          proposalId: proposal.proposalId,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      const otherWorkspace = await foundation.createWorkspace({
        principalId,
        requestId: "f7-other-workspace",
        name: `F7 other ${id()}`,
      });
      await expect(
        operations.proposeReschedule({
          ...context(
            {
              ...scopedActor,
              workspaceId: otherWorkspace.id,
            },
            "f7-session-foreign-workspace",
            "f7-foreign-workspace",
            "propose_reschedule_session",
          ),
          sessionPrescriptionId: session.id,
          scheduledLocalDate: "2026-09-07" as never,
        }),
      ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
      expect(await canonicalTrainingDesignState(client, workspace.id)).toEqual(
        canonicalBeforeUnauthorized,
      );
      expect(
        await sessionPrescriptionMutationCount(
          client,
          workspace.id,
          session.id,
        ),
      ).toBe(mutationCountBeforeUnauthorized);

      const revokedProposal = await operations.proposeReschedule({
        ...context(
          scopedActor,
          "f7-session-revocation",
          "f7-call-revocation",
          "propose_reschedule_session",
        ),
        sessionPrescriptionId: session.id,
        scheduledLocalDate: "2026-09-10" as never,
      });
      await operations.decideProposal({
        principalId,
        requestId: "f7-revocation-approval",
        workspaceId: workspace.id,
        proposalId: revokedProposal.proposalId,
        decision: "APPROVE",
        proposalDigest: revokedProposal.commandDigest,
        agentSessionId: "f7-session-revocation",
      });
      await client.query("BEGIN");
      try {
        await client.query(
          `SELECT
             set_config('workoutpal.principal_id', $1, true),
             set_config('workoutpal.workspace_id', $2, true)`,
          [principalId, workspace.id],
        );
        await client.query(
          `UPDATE iam.workspace_member
              SET status = 'suspended'
            WHERE workspace_id = $1 AND principal_id = $2`,
          [workspace.id, principalId],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
      await expect(
        operations.executeProposal({
          ...context(
            scopedActor,
            "f7-session-revocation",
            "f7-call-revocation-execute",
            "execute_agent_proposal",
          ),
          proposalId: revokedProposal.proposalId,
        }),
      ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
    } finally {
      await client.end();
      await persistence.close();
    }
  });
});
