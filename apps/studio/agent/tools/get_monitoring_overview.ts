import { createGetMonitoringOverviewTool } from "@workoutpal/agent-eve";
import { createAgentReadFacade } from "../../lib/agent-read";

export default createGetMonitoringOverviewTool({
  createReadFacade: createAgentReadFacade,
});
