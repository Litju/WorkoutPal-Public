import { createProposeRescheduleSessionTool } from "@workoutpal/agent-eve";
import { createAgentMutationFacade } from "../../lib/agent-read";

export default createProposeRescheduleSessionTool({
  createMutationFacade: createAgentMutationFacade,
});
