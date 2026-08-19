import { createListExecutedSessionsTool } from "@workoutpal/agent-eve";
import { createAgentReadFacade } from "../../lib/agent-read";

export default createListExecutedSessionsTool({
  createReadFacade: createAgentReadFacade,
});
