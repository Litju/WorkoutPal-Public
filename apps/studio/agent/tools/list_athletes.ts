import { createListAthletesTool } from "@workoutpal/agent-eve";
import { createAgentReadFacade } from "../../lib/agent-read";

export default createListAthletesTool({
  createReadFacade: createAgentReadFacade,
});
