import { defineInstrumentation } from "eve/instrumentation";

function safeAttribute(
  principal: {
    readonly attributes: Readonly<Record<string, string | readonly string[]>>;
  } | null,
  key: string,
): string {
  const value = principal?.attributes[key];
  return typeof value === "string" ? value : "none";
}

export default defineInstrumentation({
  functionId: "workoutpal-assistant",
  // WorkoutPal facts are already represented in typed tool evidence. Do not
  // duplicate user prompts, retrieved notes, or model output in telemetry.
  recordInputs: false,
  recordOutputs: false,
  events: {
    "step.started": ({ session, step, turn }) => ({
      runtimeContext: {
        workoutpal_actor_id: session.auth.current?.principalId ?? "none",
        workoutpal_session_id: session.id,
        workoutpal_step_index: step.index,
        workoutpal_turn_id: turn.id,
        workoutpal_workspace_id: safeAttribute(
          session.auth.current,
          "workspaceId",
        ),
      },
    }),
  },
});
