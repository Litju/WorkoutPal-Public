import { createExecuteAgentProposalTool } from "@workoutpal/agent-eve";
import { createAgentMutationFacade } from "../../lib/agent-read";

export default createExecuteAgentProposalTool({
  createMutationFacade: createAgentMutationFacade,
});
