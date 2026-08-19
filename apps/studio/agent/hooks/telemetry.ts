import { defineHook, type HookContext } from "eve/hooks";

type UsageTotals = {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

type StepTelemetry = {
  modelId: string;
  startedAt: number | null;
};

type ActionTelemetry = {
  toolName: string;
  startedAt: number | null;
};

type TurnTelemetry = {
  startedAt: number | null;
  models: Set<string>;
  steps: Map<number, StepTelemetry>;
  actions: Map<string, ActionTelemetry>;
  usage: UsageTotals;
};

const turns = new Map<string, TurnTelemetry>();

function eventTime(value: string): number | null {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function turnKey(sessionId: string, turnId: string): string {
  return `${sessionId}:${turnId}`;
}

function getTurnTelemetry(sessionId: string, turnId: string): TurnTelemetry {
  const key = turnKey(sessionId, turnId);
  const existing = turns.get(key);
  if (existing) return existing;

  const created: TurnTelemetry = {
    models: new Set<string>(),
    startedAt: null,
    steps: new Map<number, StepTelemetry>(),
    actions: new Map<string, ActionTelemetry>(),
    usage: { costUsd: 0, inputTokens: 0, outputTokens: 0 },
  };
  turns.set(key, created);
  return created;
}

function durationMs(
  startedAt: number | null,
  endedAt: string,
): number | undefined {
  const ended = eventTime(endedAt);
  if (startedAt === null || ended === null) return undefined;
  return Math.max(0, ended - startedAt);
}

function usageSnapshot(usage: UsageTotals): Readonly<UsageTotals> {
  return { ...usage };
}

function addUsage(
  totals: UsageTotals,
  usage:
    | {
        readonly costUsd?: number;
        readonly inputTokens?: number;
        readonly outputTokens?: number;
      }
    | undefined,
): void {
  if (!usage) return;
  totals.costUsd += usage.costUsd ?? 0;
  totals.inputTokens += usage.inputTokens ?? 0;
  totals.outputTokens += usage.outputTokens ?? 0;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function allowlistedMutationTelemetry(
  output: unknown,
): Readonly<Record<string, string | number>> {
  if (!isRecord(output)) return {};
  const proposal = isRecord(output.proposal) ? output.proposal : output;
  const execution = isRecord(output.execution) ? output.execution : null;
  const fields: Record<string, string | number> = {};
  if (typeof proposal.proposalId === "string")
    fields.proposalId = proposal.proposalId;
  if (
    proposal.operationKind === "RESCHEDULE_SESSION_PRESCRIPTION" ||
    proposal.operationKind === "SET_STRENGTH_SET_TARGET_LOAD"
  )
    fields.operationKind = proposal.operationKind;
  if (typeof proposal.status === "string")
    fields.proposalStatus = proposal.status;
  if (execution !== null && typeof execution.status === "string")
    fields.executionOutcome = execution.status;
  if (execution !== null && typeof execution.executionId === "string")
    fields.executionId = execution.executionId;
  if (
    execution !== null &&
    typeof execution.resultingAggregateVersion === "number"
  )
    fields.resultingAggregateVersion = execution.resultingAggregateVersion;
  if (output.ok === false) fields.executionOutcome = "APPLICATION_REJECTED";
  return fields;
}

function safeScope(context: HookContext): Readonly<Record<string, string>> {
  const principal = context.session.auth.current;
  const workspaceId = principal?.attributes.workspaceId;
  return {
    sessionId: context.session.id,
    principalId: principal?.principalId ?? "none",
    workspaceId: typeof workspaceId === "string" ? workspaceId : "none",
  };
}

function finishTurn(
  context: HookContext,
  turnId: string,
  eventAt: string,
  status: "completed" | "failed" | "cancelled",
  eventId: string,
): void {
  const key = turnKey(context.session.id, turnId);
  const telemetry = turns.get(key);
  if (!telemetry) return;

  console.info("workoutpal.agent.turn.finished", {
    ...safeScope(context),
    eventId,
    turnId,
    status,
    durationMs: durationMs(telemetry.startedAt, eventAt),
    modelIds: [...telemetry.models],
    usage: usageSnapshot(telemetry.usage),
  });
  turns.delete(key);
}

export default defineHook({
  events: {
    "session.started": (event, context) => {
      console.info("workoutpal.agent.session.started", {
        ...safeScope(context),
        eventId: event.meta.id,
      });
    },
    "turn.started": (event, context) => {
      const telemetry = getTurnTelemetry(context.session.id, event.data.turnId);
      telemetry.startedAt = eventTime(event.meta.at);
      console.info("workoutpal.agent.turn.started", {
        ...safeScope(context),
        eventId: event.meta.id,
        turnId: event.data.turnId,
      });
    },
    "actions.requested": (event, context) => {
      const telemetry = getTurnTelemetry(context.session.id, event.data.turnId);
      for (const action of event.data.actions) {
        if (action.kind !== "tool-call") continue;
        telemetry.actions.set(action.callId, {
          toolName: action.toolName,
          startedAt: eventTime(event.meta.at),
        });
      }
    },
    "step.started": (event, context) => {
      const telemetry = getTurnTelemetry(context.session.id, event.data.turnId);
      telemetry.models.add(event.data.modelId);
      telemetry.steps.set(event.data.stepIndex, {
        modelId: event.data.modelId,
        startedAt: eventTime(event.meta.at),
      });
      console.info("workoutpal.agent.model.started", {
        ...safeScope(context),
        eventId: event.meta.id,
        turnId: event.data.turnId,
        stepIndex: String(event.data.stepIndex),
        modelId: event.data.modelId,
      });
    },
    "step.completed": (event, context) => {
      const telemetry = getTurnTelemetry(context.session.id, event.data.turnId);
      const step = telemetry.steps.get(event.data.stepIndex);
      addUsage(telemetry.usage, event.data.usage);
      console.info("workoutpal.agent.model.completed", {
        ...safeScope(context),
        eventId: event.meta.id,
        turnId: event.data.turnId,
        stepIndex: String(event.data.stepIndex),
        modelId: step?.modelId ?? "unknown",
        durationMs: durationMs(step?.startedAt ?? null, event.meta.at),
        usage: event.data.usage ?? {},
      });
    },
    "step.failed": (event, context) => {
      const telemetry = getTurnTelemetry(context.session.id, event.data.turnId);
      const step = telemetry.steps.get(event.data.stepIndex);
      console.warn("workoutpal.agent.model.failed", {
        ...safeScope(context),
        eventId: event.meta.id,
        turnId: event.data.turnId,
        stepIndex: String(event.data.stepIndex),
        modelId: step?.modelId ?? "unknown",
        durationMs: durationMs(step?.startedAt ?? null, event.meta.at),
        errorCode: event.data.code,
      });
    },
    "turn.completed": (event, context) => {
      finishTurn(
        context,
        event.data.turnId,
        event.meta.at,
        "completed",
        event.meta.id,
      );
    },
    "turn.failed": (event, context) => {
      finishTurn(
        context,
        event.data.turnId,
        event.meta.at,
        "failed",
        event.meta.id,
      );
    },
    "turn.cancelled": (event, context) => {
      finishTurn(
        context,
        event.data.turnId,
        event.meta.at,
        "cancelled",
        event.meta.id,
      );
    },
    "action.result": (event, context) => {
      const result = event.data.result;
      const telemetry = getTurnTelemetry(context.session.id, event.data.turnId);
      const action =
        result.kind === "tool-result"
          ? telemetry.actions.get(result.callId)
          : undefined;
      console.info("workoutpal.agent.action.result", {
        ...safeScope(context),
        eventId: event.meta.id,
        turnId: event.data.turnId,
        stepIndex: String(event.data.stepIndex),
        toolName: result.kind === "tool-result" ? result.toolName : result.kind,
        status: event.data.status,
        durationMs: durationMs(action?.startedAt ?? null, event.meta.at),
        ...(result.kind === "tool-result"
          ? allowlistedMutationTelemetry(result.output)
          : {}),
        ...(event.data.status === "rejected"
          ? { approvalOutcome: "EVE_REJECTED" }
          : {}),
      });
    },
  },
});
