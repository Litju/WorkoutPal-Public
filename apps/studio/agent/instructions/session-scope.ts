import { defineDynamic, defineInstructions } from "eve/instructions";

function scopeMismatch(context: {
  readonly session: {
    readonly auth: {
      readonly current: {
        readonly principalId: string;
        readonly attributes: Readonly<
          Record<string, string | readonly string[]>
        >;
      } | null;
      readonly initiator: {
        readonly principalId: string;
        readonly attributes: Readonly<
          Record<string, string | readonly string[]>
        >;
      } | null;
    };
  };
}): boolean {
  const current = context.session.auth.current;
  const initiator = context.session.auth.initiator;
  if (current === null || initiator === null) return true;
  const currentWorkspace = current.attributes.workspaceId;
  const initiatorWorkspace = initiator.attributes.workspaceId;
  return (
    current.principalId !== initiator.principalId ||
    currentWorkspace !== initiatorWorkspace
  );
}

const refusal = defineInstructions({
  markdown:
    "SESSION SCOPE FAILURE: the current authenticated caller does not match the session initiator. Do not use prior conversation content, do not call any WorkoutPal read tool, and tell the caller to start a new authenticated Studio conversation.",
});

export default defineDynamic({
  events: {
    "session.started": (_event, context) =>
      scopeMismatch(context) ? refusal : null,
    "turn.started": (_event, context) =>
      scopeMismatch(context) ? refusal : null,
  },
});
