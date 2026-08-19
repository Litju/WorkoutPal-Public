import { createListPublishedTrainingWindowTool } from "@workoutpal/agent-eve";
import { createAgentReadFacade } from "../../lib/agent-read";

export default createListPublishedTrainingWindowTool({
  createReadFacade: createAgentReadFacade,
});
