import type { Psc4Repositories } from "@workoutpal/application";
import type { PoolClient } from "pg";
import { createAccountRepositories } from "./account-repositories.js";
import { createAgentRepositories } from "./agent-repositories.js";
import { createAssessmentRepositories } from "./assessment-repositories.js";
import { createExecutionRepositories } from "./f4.js";
import { createSearchRepositories } from "./search-repositories.js";
import { createTrainingDesignRepositories } from "./training-design-repositories.js";

export function createRepositories(client: PoolClient): Psc4Repositories {
  return {
    ...createAccountRepositories(client),
    ...createTrainingDesignRepositories(client),
    ...createSearchRepositories(client),
    ...createAgentRepositories(client),
    ...createExecutionRepositories(client),
    ...createAssessmentRepositories(client),
  };
}
