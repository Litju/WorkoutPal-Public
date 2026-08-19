import { createGetExecutionReviewTool } from "@workoutpal/agent-eve";
import { createAgentReadFacade } from "../../lib/agent-read";

export default createGetExecutionReviewTool({
  createReadFacade: createAgentReadFacade,
});
