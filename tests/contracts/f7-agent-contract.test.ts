import {
  createAgentMutationToolSet,
  createExecuteAgentProposalTool,
  createProposeRescheduleSessionTool,
  createProposeSetStrengthTargetLoadTool,
} from "@workoutpal/agent-eve";
import { describe, expect, it, vi } from "vitest";

const sessionId = "11111111-1111-4111-8111-111111111111";
const setId = "22222222-2222-4222-8222-222222222222";
const proposalId = "33333333-3333-4333-8333-333333333333";

const context = {
  callId: "call-f7",
  toolName: "test",
} as never;

describe("F7 Eve tool contracts", () => {
  it("publishes exactly the two proposal tools and one executor", () => {
    const facade = {
      proposeReschedule: vi.fn(),
      proposeSetStrengthTargetLoad: vi.fn(),
      executeProposal: vi.fn(),
    } as never;
    expect(
      Object.keys(
        createAgentMutationToolSet({
          createMutationFacade: () => facade,
        }),
      ),
    ).toEqual([
      "propose_reschedule_session",
      "propose_set_strength_target_load",
      "execute_agent_proposal",
    ]);
  });

  it("accepts only typed proposal inputs and forwards no authority fields", async () => {
    const facade = {
      proposeReschedule: vi.fn(async (input) => ({ ok: true, input })),
      proposeSetStrengthTargetLoad: vi.fn(async (input) => ({
        ok: true,
        input,
      })),
      executeProposal: vi.fn(),
    } as never;
    const reschedule = createProposeRescheduleSessionTool({
      createMutationFacade: () => facade,
    });
    const load = createProposeSetStrengthTargetLoadTool({
      createMutationFacade: () => facade,
    });
    await reschedule.execute(
      { sessionPrescriptionId: sessionId, scheduledLocalDate: "2026-09-12" },
      context,
    );
    await load.execute(
      {
        sessionPrescriptionId: sessionId,
        strengthSetId: setId,
        targetLoadKg: 135,
      },
      context,
    );
    expect(facade.proposeReschedule).toHaveBeenCalledWith({
      sessionPrescriptionId: sessionId,
      scheduledLocalDate: "2026-09-12",
    });
    expect(facade.proposeSetStrengthTargetLoad).toHaveBeenCalledWith({
      sessionPrescriptionId: sessionId,
      strengthSetId: setId,
      targetLoadKg: 135,
    });
  });

  it("gates every executor call with Eve always approval and accepts only proposalId", async () => {
    const facade = {
      proposeReschedule: vi.fn(),
      proposeSetStrengthTargetLoad: vi.fn(),
      executeProposal: vi.fn(async (input) => ({ ok: true, input })),
    } as never;
    const tool = createExecuteAgentProposalTool({
      createMutationFacade: () => facade,
    }) as unknown as {
      readonly approval?: unknown;
      readonly execute: (input: unknown, context: unknown) => Promise<unknown>;
    };
    expect(tool.approval).toBeDefined();
    await tool.execute({ proposalId }, context);
    expect(facade.executeProposal).toHaveBeenCalledWith(proposalId);
  });
});
