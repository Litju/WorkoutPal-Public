import type {
  AgentMutationFacade,
  AgentRuntime as AgentOperationsRuntime,
  AgentReadFacade,
  AgentSessionHandle,
  AgentTurnResult,
  AgentSessionStart as OperationsSessionStart,
  AgentTurnInput as OperationsTurnInput,
} from "@workoutpal/agent-operations";
import { AgentSessionSecurityError } from "@workoutpal/agent-operations";
import { Client, type ClientAuth, type HeadersValue } from "eve/client";
import { defineTool, type ToolContext, type ToolDefinition } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";

export type {
  AgentAuthPrincipalSnapshot,
  AgentEvidence,
  AgentGrounded,
  AgentTrustedSession,
} from "@workoutpal/agent-operations";
export {
  AGENT_TOOL_CATALOG,
  AgentSessionSecurityError,
  createTrustedAgentSession,
  F6_AGENT_TOOL_CATALOG,
  F6_AGENT_TOOL_COUNT,
  F6_AGENT_WRITE_TOOL_COUNT,
  F7_AGENT_DOMAIN_EXECUTION_TOOL_COUNT,
  F7_AGENT_PROPOSAL_TOOL_COUNT,
  F7_AGENT_TOOL_CATALOG,
  F7_AGENT_TOOL_COUNT,
  F7_AGENT_UNAPPROVED_DOMAIN_WRITE_TOOL_COUNT,
} from "@workoutpal/agent-operations";

/** The only dependency the authored Eve tools receive from the Studio app. */
export interface AgentReadToolDependencies {
  readonly createReadFacade: (context: ToolContext) => AgentReadFacade;
}

export interface AgentMutationToolDependencies {
  readonly createMutationFacade: (context: ToolContext) => AgentMutationFacade;
}

export interface AgentReadToolFailure {
  readonly ok: false;
  readonly code:
    | "AUTHENTICATION_REQUIRED"
    | "SESSION_SCOPE_MISMATCH"
    | "RESOURCE_UNAVAILABLE"
    | "INVALID_REQUEST";
  readonly message: string;
}

export interface AgentMutationToolFailure {
  readonly ok: false;
  readonly code:
    | "AUTHENTICATION_REQUIRED"
    | "SESSION_SCOPE_MISMATCH"
    | "RESOURCE_UNAVAILABLE"
    | "INVALID_REQUEST"
    | "APPROVAL_RECORD_REQUIRED"
    | "PROPOSAL_STATE_CONFLICT"
    | "STALE_PROPOSAL"
    | "EXECUTION_FAILED";
  readonly message: string;
}

async function safeRead<T>(
  operation: () => Promise<T>,
): Promise<T | AgentReadToolFailure> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AgentSessionSecurityError) {
      if (error.code === "AGENT_AUTH_REQUIRED") {
        return {
          ok: false,
          code: "AUTHENTICATION_REQUIRED",
          message:
            "Sign in to WorkoutPal before asking the agent to read data.",
        };
      }
      if (error.code === "AGENT_SESSION_SCOPE_MISMATCH") {
        return {
          ok: false,
          code: "SESSION_SCOPE_MISMATCH",
          message:
            "Start a new authenticated Studio conversation for this actor.",
        };
      }
      return {
        ok: false,
        code: "RESOURCE_UNAVAILABLE",
        message:
          "The requested record is unavailable in the authenticated scope.",
      };
    }
    if (
      error instanceof Error &&
      (error.message.includes("start must not") ||
        error.message.includes("window"))
    ) {
      return {
        ok: false,
        code: "INVALID_REQUEST",
        message: "The requested date window is invalid or incomplete.",
      };
    }
    return {
      ok: false,
      code: "RESOURCE_UNAVAILABLE",
      message:
        "The requested record is unavailable in the authenticated scope.",
    };
  }
}

async function safeMutation<T>(
  operation: () => Promise<T>,
): Promise<T | AgentMutationToolFailure> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AgentSessionSecurityError) {
      if (error.code === "AGENT_AUTH_REQUIRED") {
        return {
          ok: false,
          code: "AUTHENTICATION_REQUIRED",
          message:
            "Sign in to WorkoutPal before asking the agent to propose or execute a change.",
        };
      }
      if (error.code === "AGENT_SESSION_SCOPE_MISMATCH") {
        return {
          ok: false,
          code: "SESSION_SCOPE_MISMATCH",
          message:
            "Start a new authenticated Studio conversation for this actor.",
        };
      }
      return {
        ok: false,
        code: "RESOURCE_UNAVAILABLE",
        message:
          "The requested record is unavailable in the authenticated scope.",
      };
    }
    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : "";
    if (code === "APPROVAL_REQUIRED")
      return {
        ok: false,
        code: "APPROVAL_RECORD_REQUIRED",
        message:
          "Use the authenticated WorkoutPal approval card before execution.",
      };
    if (code === "PROPOSAL_STATE_CONFLICT")
      return {
        ok: false,
        code: "PROPOSAL_STATE_CONFLICT",
        message: "This proposal is no longer awaiting the requested action.",
      };
    if (code === "STALE_PROPOSAL")
      return {
        ok: false,
        code: "STALE_PROPOSAL",
        message:
          "The target changed; create a new proposal before trying again.",
      };
    if (code === "VALIDATION_FAILED")
      return {
        ok: false,
        code: "INVALID_REQUEST",
        message: "The requested change is invalid or incomplete.",
      };
    return {
      ok: false,
      code: "RESOURCE_UNAVAILABLE",
      message:
        "The requested change is unavailable in the authenticated scope.",
    };
  }
}

const uuidSchema = z.string().uuid();
const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use an explicit YYYY-MM-DD local date.");
const timeZoneSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9_+./-]+$/, "Use an IANA time-zone identifier.");

function readTool<TInput, TOutput>(input: {
  readonly description: string;
  readonly inputSchema: z.ZodType<TInput>;
  readonly execute: (input: TInput, context: ToolContext) => Promise<TOutput>;
}): ToolDefinition<TInput, TOutput> {
  return defineTool(input);
}

export function createListAthletesTool(
  dependencies: AgentReadToolDependencies,
) {
  return readTool({
    description:
      "Read the athletes visible to the authenticated workspace actor. Never infer or accept a workspace identifier from the user.",
    inputSchema: z.object({}).strict(),
    execute: (_input, context) =>
      safeRead(() => dependencies.createReadFacade(context).listAthletes()),
  });
}

export function createGetAthleteTool(dependencies: AgentReadToolDependencies) {
  return readTool({
    description:
      "Read one athlete by ID after the server rechecks workspace membership and athlete authorization.",
    inputSchema: z.object({ athleteId: uuidSchema }).strict(),
    execute: (input, context) =>
      safeRead(() =>
        dependencies
          .createReadFacade(context)
          .getAthlete(input.athleteId as never),
      ),
  });
}

export function createGetTrainingPlanTool(
  dependencies: AgentReadToolDependencies,
) {
  return readTool({
    description:
      "Read one authorized training plan, including its typed phases, goals, sessions, publication status, and revision metadata.",
    inputSchema: z.object({ planId: uuidSchema }).strict(),
    execute: (input, context) =>
      safeRead(() =>
        dependencies
          .createReadFacade(context)
          .getTrainingPlan(input.planId as never),
      ),
  });
}

export function createListPublishedTrainingWindowTool(
  dependencies: AgentReadToolDependencies,
) {
  return readTool({
    description:
      "Read published prescriptions for one athlete within an explicit local-date window. The time zone is required to keep calendar semantics explicit.",
    inputSchema: z
      .object({
        athleteId: uuidSchema,
        startDate: localDateSchema,
        endDate: localDateSchema,
        timeZone: timeZoneSchema,
      })
      .strict(),
    execute: (input, context) => {
      // The facade filters by stored local dates; the validated time-zone field
      // keeps the calendar contract explicit for the model and caller.
      void input.timeZone;
      return safeRead(() =>
        dependencies.createReadFacade(context).listPublishedTrainingWindow({
          athleteId: input.athleteId as never,
          startDate: input.startDate as never,
          endDate: input.endDate as never,
        }),
      );
    },
  });
}

export function createGetSessionPrescriptionTool(
  dependencies: AgentReadToolDependencies,
) {
  return readTool({
    description:
      "Read one authorized session prescription, including blocks, publication revision, and stored schedule facts.",
    inputSchema: z.object({ sessionId: uuidSchema }).strict(),
    execute: (input, context) =>
      safeRead(() =>
        dependencies
          .createReadFacade(context)
          .getSessionPrescription(input.sessionId as never),
      ),
  });
}

export function createListExecutedSessionsTool(
  dependencies: AgentReadToolDependencies,
) {
  return readTool({
    description:
      "List executed sessions for one authorized athlete. This returns stored execution facts only, without interpretation.",
    inputSchema: z.object({ athleteId: uuidSchema }).strict(),
    execute: (input, context) =>
      safeRead(() =>
        dependencies
          .createReadFacade(context)
          .listExecutedSessions(input.athleteId as never),
      ),
  });
}

export function createGetExecutionReviewTool(
  dependencies: AgentReadToolDependencies,
) {
  return readTool({
    description:
      "Read one executed session review with effective performed facts, observations, immutable-source metadata, and amendment history. Use this for effective values, amendment records, observations, or provenance questions; use get_session_monitoring instead for prescribed-versus-performed comparisons.",
    inputSchema: z.object({ executionId: uuidSchema }).strict(),
    execute: (input, context) =>
      safeRead(() =>
        dependencies
          .createReadFacade(context)
          .getExecutionReview(input.executionId as never),
      ),
  });
}

export function createGetMonitoringOverviewTool(
  dependencies: AgentReadToolDependencies,
) {
  return readTool({
    description:
      "Read governed plan-versus-execution monitoring facts for an explicit athlete date window. Do not add physiological or scientific conclusions.",
    inputSchema: z
      .object({
        athleteId: uuidSchema,
        startDate: localDateSchema,
        endDate: localDateSchema,
        timeZone: timeZoneSchema,
      })
      .strict(),
    execute: (input, context) =>
      safeRead(() =>
        dependencies.createReadFacade(context).getMonitoringOverview({
          athleteId: input.athleteId as never,
          startDate: input.startDate as never,
          endDate: input.endDate as never,
          timeZone: input.timeZone as never,
        }),
      ),
  });
}

export function createGetSessionMonitoringTool(
  dependencies: AgentReadToolDependencies,
) {
  return readTool({
    description:
      "Read the governed monitoring view for an executed session. This is the required and only comparison read for any prescribed-versus-performed question across strength, endurance, or mobility; it returns statuses, comparisons, observations, amendments, and provenance. Do not substitute get_execution_review or get_session_prescription for this comparison.",
    inputSchema: z.object({ executionId: uuidSchema }).strict(),
    execute: (input, context) =>
      safeRead(() =>
        dependencies
          .createReadFacade(context)
          .getSessionMonitoring(input.executionId as never),
      ),
  });
}

export function createAgentReadToolSet(
  dependencies: AgentReadToolDependencies,
) {
  return {
    list_athletes: createListAthletesTool(dependencies),
    get_athlete: createGetAthleteTool(dependencies),
    get_training_plan: createGetTrainingPlanTool(dependencies),
    list_published_training_window:
      createListPublishedTrainingWindowTool(dependencies),
    get_session_prescription: createGetSessionPrescriptionTool(dependencies),
    list_executed_sessions: createListExecutedSessionsTool(dependencies),
    get_execution_review: createGetExecutionReviewTool(dependencies),
    get_monitoring_overview: createGetMonitoringOverviewTool(dependencies),
    get_session_monitoring: createGetSessionMonitoringTool(dependencies),
  };
}

export function createProposeRescheduleSessionTool(
  dependencies: AgentMutationToolDependencies,
) {
  return defineTool({
    description:
      "Create a human-approval proposal to move exactly one identified session prescription to the explicitly requested YYYY-MM-DD local date. Do not guess a date, infer a time, change other fields, or propose a science-based adaptation. Creating the proposal does not mutate training data.",
    inputSchema: z
      .object({
        sessionPrescriptionId: uuidSchema,
        scheduledLocalDate: localDateSchema,
      })
      .strict(),
    execute: (input, context) =>
      safeMutation(() =>
        dependencies.createMutationFacade(context).proposeReschedule({
          sessionPrescriptionId: input.sessionPrescriptionId as never,
          scheduledLocalDate: input.scheduledLocalDate as never,
        }),
      ),
  });
}

export function createProposeSetStrengthTargetLoadTool(
  dependencies: AgentMutationToolDependencies,
) {
  return defineTool({
    description:
      "Create a human-approval proposal to change exactly one identified strength set's target load to the explicitly requested non-negative kilogram value. Do not infer an appropriate load, change sibling sets, or use this for fatigue/readiness/scientific adaptation. Creating the proposal does not mutate training data.",
    inputSchema: z
      .object({
        sessionPrescriptionId: uuidSchema,
        strengthSetId: uuidSchema,
        targetLoadKg: z.number().finite().nonnegative(),
      })
      .strict(),
    execute: (input, context) =>
      safeMutation(() =>
        dependencies
          .createMutationFacade(context)
          .proposeSetStrengthTargetLoad({
            sessionPrescriptionId: input.sessionPrescriptionId as never,
            strengthSetId: input.strengthSetId as never,
            targetLoadKg: input.targetLoadKg,
          }),
      ),
  });
}

export function createExecuteAgentProposalTool(
  dependencies: AgentMutationToolDependencies,
) {
  return defineTool({
    description:
      "Execute exactly one immutable WorkoutPal proposal by proposalId. The server reloads the proposal, requires the matching authenticated product approval record, rechecks authorization and aggregate version, and dispatches only the two supported typed commands. Never provide a replacement command, value, workspace, actor, expected version, or digest.",
    inputSchema: z.object({ proposalId: uuidSchema }).strict(),
    approval: always(),
    execute: (input, context) =>
      safeMutation(() =>
        dependencies
          .createMutationFacade(context)
          .executeProposal(input.proposalId as never),
      ),
  });
}

export function createAgentMutationToolSet(
  dependencies: AgentMutationToolDependencies,
) {
  return {
    propose_reschedule_session:
      createProposeRescheduleSessionTool(dependencies),
    propose_set_strength_target_load:
      createProposeSetStrengthTargetLoadTool(dependencies),
    execute_agent_proposal: createExecuteAgentProposalTool(dependencies),
  };
}

export class AgentRuntimeUnavailableError extends Error {
  readonly code = "AGENT_RUNTIME_UNAVAILABLE" as const;

  constructor(message = "The Eve agent runtime is unavailable.") {
    super(message);
    this.name = "AgentRuntimeUnavailableError";
  }
}

export interface EveAgentRuntimeAdapterOptions {
  readonly host?: string;
  readonly auth?: ClientAuth;
  readonly headers?: HeadersValue;
}

function runtimeEnv(name: string): string | undefined {
  const processLike = (
    globalThis as typeof globalThis & {
      readonly process?: {
        readonly env?: Readonly<Record<string, string | undefined>>;
      };
    }
  ).process;
  return processLike?.env?.[name];
}

/**
 * Typed server-to-server adapter for the same Eve session protocol used by the
 * Studio hook. It deliberately forwards only the already-trusted workspace
 * scope as a route header; actor identity remains in the caller's auth.
 */
export class EveAgentRuntimeAdapter implements AgentOperationsRuntime {
  readonly framework = "eve" as const;
  readonly status = "CONFIGURED" as const;
  private readonly client: Client;

  constructor(options: EveAgentRuntimeAdapterOptions = {}) {
    this.client = new Client({
      host:
        options.host ??
        runtimeEnv("WORKOUTPAL_AGENT_URL") ??
        "http://127.0.0.1:3000",
      ...(options.auth === undefined ? {} : { auth: options.auth }),
      ...(options.headers === undefined ? {} : { headers: options.headers }),
      redirect: "manual",
    });
  }

  async start(input: OperationsSessionStart): Promise<AgentSessionHandle> {
    try {
      const created = await this.client.sessions.create({
        message: input.prompt,
        headers: {
          "x-workoutpal-workspace-id": input.workspaceScope.workspaceId,
        },
      });
      const result = await created.response.result();
      return {
        sessionId: created.session.state.sessionId,
        status: result.status === "failed" ? "unavailable" : "started",
      };
    } catch (error) {
      throw new AgentRuntimeUnavailableError(
        error instanceof Error ? error.message : undefined,
      );
    }
  }

  async continue(input: OperationsTurnInput): Promise<AgentTurnResult> {
    try {
      const session = this.client.sessions.attach(input.sessionId);
      const response = await session.send(input.message, {
        headers: {
          "x-workoutpal-workspace-id": input.actor.workspaceId,
        },
      });
      const result = await response.result();
      return {
        sessionId: result.sessionId,
        status: result.status === "failed" ? "unavailable" : "completed",
        ...(result.message === undefined ? {} : { text: result.message }),
      };
    } catch (error) {
      throw new AgentRuntimeUnavailableError(
        error instanceof Error ? error.message : undefined,
      );
    }
  }

  async cancel(sessionId: string): Promise<void> {
    try {
      await this.client.sessions.attach(sessionId).cancel();
    } catch (error) {
      throw new AgentRuntimeUnavailableError(
        error instanceof Error ? error.message : undefined,
      );
    }
  }
}

// Keep the adapter's public runtime contract visible to package consumers.
export type {
  AgentRuntime,
  AgentSessionHandle,
  AgentSessionStart,
  AgentTurnInput,
  AgentTurnResult,
} from "@workoutpal/agent-operations";
