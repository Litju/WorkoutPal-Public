import {
  canAccessWorkspace,
  type WorkspaceAction,
  type WorkspaceMembership,
  type WorkspaceRole,
} from "@workoutpal/accounts";
import { describe, expect, it } from "vitest";
import { agentProposalDecisionRequestSchema } from "../../apps/studio/lib/contracts";

const agentActions: readonly WorkspaceAction[] = [
  "agent.propose",
  "agent.approve",
  "agent.execute",
];

function membership(role: WorkspaceRole): WorkspaceMembership {
  return {
    id: "00000000-0000-7000-8000-000000000001" as never,
    workspaceId: "00000000-0000-7000-8000-000000000002" as never,
    principalId: "00000000-0000-7000-8000-000000000003" as never,
    role,
    status: "active",
  };
}

describe("PSC1 canonical authorization matrix", () => {
  it("keeps Agent proposal, approval, and execution within existing practitioner roles", () => {
    for (const role of ["owner", "coach"] as const) {
      for (const action of agentActions) {
        expect(canAccessWorkspace(membership(role), action)).toBe(true);
      }
    }
    for (const role of ["athlete", "viewer"] as const) {
      for (const action of agentActions) {
        expect(canAccessWorkspace(membership(role), action)).toBe(false);
      }
    }
    expect(
      canAccessWorkspace(
        { ...membership("owner"), status: "suspended" },
        "agent.execute",
      ),
    ).toBe(false);
  });

  it("accepts only typed approval decisions, never free-text approval", () => {
    expect(
      agentProposalDecisionRequestSchema.parse({
        decision: "APPROVE",
        proposalDigest: "0".repeat(64),
      }).decision,
    ).toBe("APPROVE");
    expect(() =>
      agentProposalDecisionRequestSchema.parse({
        decision: "approve",
        proposalDigest: "0".repeat(64),
      }),
    ).toThrow();
    expect(() =>
      agentProposalDecisionRequestSchema.parse({
        decision: "yes",
        proposalDigest: "0".repeat(64),
      }),
    ).toThrow();
  });
});
