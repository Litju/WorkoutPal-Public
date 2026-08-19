import { createGetAthleteTool } from "@workoutpal/agent-eve";
import { createAgentReadFacade } from "../../lib/agent-read";

export default createGetAthleteTool({
  createReadFacade: createAgentReadFacade,
});
