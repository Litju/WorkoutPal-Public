import { createGetSessionPrescriptionTool } from "@workoutpal/agent-eve";
import { createAgentReadFacade } from "../../lib/agent-read";

export default createGetSessionPrescriptionTool({
  createReadFacade: createAgentReadFacade,
});
