import {
  AGENT_TOOL_CATALOG,
  assertAgentProposalTransition,
  canTransitionAgentProposal,
  computeAgentCommandDigest,
  F6_AGENT_TOOL_CATALOG,
  F7_AGENT_DOMAIN_EXECUTION_TOOL_COUNT,
  F7_AGENT_PROPOSAL_TOOL_COUNT,
  F7_AGENT_TOOL_COUNT,
  F7_AGENT_UNAPPROVED_DOMAIN_WRITE_TOOL_COUNT,
} from "@workoutpal/agent-operations";
import type { UUID, WorkspaceId } from "@workoutpal/shared-kernel";
import { describe, expect, it } from "vitest";

const workspaceId = "11111111-1111-4111-8111-111111111111" as WorkspaceId;
const sessionId = "22222222-2222-4222-8222-222222222222" as UUID;

describe("F7 agent proposal contracts", () => {
  it("exposes exactly nine reads, two proposal tools, and one approved executor", () => {
    expect(F6_AGENT_TOOL_CATALOG).toHaveLength(9);
    expect(F7_AGENT_TOOL_COUNT).toBe(12);
    expect(F7_AGENT_PROPOSAL_TOOL_COUNT).toBe(2);
    expect(F7_AGENT_DOMAIN_EXECUTION_TOOL_COUNT).toBe(1);
    expect(F7_AGENT_UNAPPROVED_DOMAIN_WRITE_TOOL_COUNT).toBe(0);
    expect(AGENT_TOOL_CATALOG.map((tool) => tool.name)).toEqual([
      ...F6_AGENT_TOOL_CATALOG.map((tool) => tool.name),
      "propose_reschedule_session",
      "propose_set_strength_target_load",
      "execute_agent_proposal",
    ]);
  });

  it("keeps proposal transitions explicit and rejects replay transitions", () => {
    expect(canTransitionAgentProposal("PENDING_APPROVAL", "APPROVED")).toBe(
      true,
    );
    expect(canTransitionAgentProposal("APPROVED", "EXECUTING")).toBe(true);
    expect(canTransitionAgentProposal("EXECUTING", "EXECUTED")).toBe(true);
    expect(canTransitionAgentProposal("EXECUTED", "EXECUTING")).toBe(false);
    expect(canTransitionAgentProposal("REJECTED", "APPROVED")).toBe(false);
    expect(() => assertAgentProposalTransition("STALE", "EXECUTED")).toThrow(
      "Illegal agent proposal transition",
    );
  });

  it("binds the digest to workspace, aggregate, version, and typed command", async () => {
    const command = {
      kind: "RESCHEDULE_SESSION_PRESCRIPTION" as const,
      sessionPrescriptionId: sessionId,
      scheduledLocalDate: "2026-09-12" as never,
    };
    const first = await computeAgentCommandDigest({
      workspaceId,
      targetAggregateId: sessionId,
      targetExpectedVersion: 7,
      command,
    });
    const same = await computeAgentCommandDigest({
      workspaceId,
      targetAggregateId: sessionId,
      targetExpectedVersion: 7,
      command: { ...command },
    });
    const changed = await computeAgentCommandDigest({
      workspaceId,
      targetAggregateId: sessionId,
      targetExpectedVersion: 8,
      command,
    });
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(same).toBe(first);
    expect(changed).not.toBe(first);
  });
});
