import { createGetTrainingPlanTool } from "@workoutpal/agent-eve";
import { createAgentReadFacade } from "../../lib/agent-read";

export default createGetTrainingPlanTool({
  createReadFacade: createAgentReadFacade,
});
