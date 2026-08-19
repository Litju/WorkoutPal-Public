import { createGetSessionMonitoringTool } from "@workoutpal/agent-eve";
import { createAgentReadFacade } from "../../lib/agent-read";

export default createGetSessionMonitoringTool({
  createReadFacade: createAgentReadFacade,
});
