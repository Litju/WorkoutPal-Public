import {
  type AgentAuthPrincipalSnapshot,
  type AgentMutationFacade,
  AgentReadFacade,
  type AgentReadQueryPort,
  createTrustedAgentSession,
} from "@workoutpal/agent-operations";
import type { ToolContext } from "eve/tools";
import { getRuntime } from "./workoutpal";

function authSnapshot(
  value: ToolContext["session"]["auth"]["current"],
): AgentAuthPrincipalSnapshot | null {
  return value === null
    ? null
    : {
        principalId: value.principalId,
        principalType: value.principalType,
        attributes: value.attributes,
      };
}

const queries: AgentReadQueryPort = {
  listAthletes: (input) => getRuntime().application.listAthletes(input),
  getAthlete: (input) => getRuntime().application.getAthlete(input),
  listTrainingPlans: (input) =>
    getRuntime().trainingDesign.listAthleteTrainingPlans(input),
  getTrainingPlan: (input) =>
    getRuntime().trainingDesign.getTrainingPlan(input),
  listSessionPrescriptions: (input) =>
    getRuntime().trainingDesign.listSessionPrescriptions(input),
  getSessionPrescription: (input) =>
    getRuntime().trainingDesign.getSessionPrescription(input),
  listExecutedSessions: (input) =>
    getRuntime().execution.listExecutedSessions(input),
  getExecutionReview: (input) =>
    getRuntime().execution.getExecutionReview(input),
  getMonitoringOverview: (input) =>
    getRuntime().monitoring.getAthleteMonitoringOverview(input),
  getSessionMonitoring: (input) =>
    getRuntime().monitoring.getSessionMonitoring(input),
};

/**
 * The Eve tool boundary receives only auth metadata from the framework. This
 * function turns it into a trusted actor scope and binds every query to it.
 */
export function createAgentReadFacade(
  context: Pick<ToolContext, "session">,
): AgentReadFacade {
  const trustedSession = createTrustedAgentSession({
    current: authSnapshot(context.session.auth.current),
    initiator: authSnapshot(context.session.auth.initiator),
  });
  return new AgentReadFacade(
    queries,
    trustedSession,
    `eve:${context.session.id}:${context.session.turn.id}`,
  );
}

/** Binds F7 proposal/execution tools to the same trusted Eve actor/session. */
export function createAgentMutationFacade(
  context: Pick<ToolContext, "session" | "callId" | "toolName">,
): AgentMutationFacade {
  const trustedSession = createTrustedAgentSession({
    current: authSnapshot(context.session.auth.current),
    initiator: authSnapshot(context.session.auth.initiator),
  });
  return getRuntime().agentOperations.createFacade({
    actor: trustedSession.actor,
    agentSessionId: context.session.id,
    callId: context.callId,
    toolName: context.toolName,
    requestId: `eve:${context.session.id}:${context.session.turn.id}`,
  });
}
