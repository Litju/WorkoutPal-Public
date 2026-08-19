import { createProposeSetStrengthTargetLoadTool } from "@workoutpal/agent-eve";
import { createAgentMutationFacade } from "../../lib/agent-read";

export default createProposeSetStrengthTargetLoadTool({
  createMutationFacade: createAgentMutationFacade,
});
