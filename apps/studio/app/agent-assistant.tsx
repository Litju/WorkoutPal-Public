"use client";

import type { EveMessagePart } from "eve/client";
import { useEveAgent } from "eve/react";
import { useState } from "react";
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
  usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input";

interface WorkoutPalAssistantProps {
  readonly workspaceId: string;
  readonly athleteId: string | undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function evidenceFromOutput(
  output: unknown,
): readonly Readonly<Record<string, unknown>>[] {
  if (!isRecord(output) || !Array.isArray(output.evidence)) return [];
  return output.evidence.filter(isRecord);
}

interface ProposalView {
  readonly proposalId: string;
  readonly operationKind: string;
  readonly commandDigest: string;
  readonly status: string;
  readonly beforeProjection: Readonly<Record<string, unknown>>;
  readonly afterProjection: Readonly<Record<string, unknown>>;
}

function proposalFromOutput(output: unknown): ProposalView | null {
  const candidate =
    isRecord(output) && isRecord(output.proposal)
      ? output.proposal
      : isRecord(output)
        ? output
        : null;
  if (
    candidate === null ||
    typeof candidate.proposalId !== "string" ||
    typeof candidate.operationKind !== "string" ||
    typeof candidate.commandDigest !== "string" ||
    typeof candidate.status !== "string" ||
    !isRecord(candidate.beforeProjection) ||
    !isRecord(candidate.afterProjection)
  )
    return null;
  return {
    proposalId: candidate.proposalId,
    operationKind: candidate.operationKind,
    commandDigest: candidate.commandDigest,
    status: candidate.status,
    beforeProjection: candidate.beforeProjection,
    afterProjection: candidate.afterProjection,
  };
}

function latestProposal(
  messages: readonly { readonly parts: readonly EveMessagePart[] }[],
): ProposalView | null {
  let result: ProposalView | null = null;
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type === "dynamic-tool" && part.state === "output-available") {
        const proposal = proposalFromOutput(part.output);
        if (proposal !== null) result = proposal;
      }
    }
  }
  return result;
}

function pendingExecutionApproval(
  messages: readonly { readonly parts: readonly EveMessagePart[] }[],
): Extract<EveMessagePart, { type: "dynamic-tool" }> | null {
  for (const message of messages) {
    for (const part of message.parts) {
      if (
        part.type === "dynamic-tool" &&
        part.toolName === "execute_agent_proposal" &&
        part.state === "approval-requested"
      )
        return part;
    }
  }
  return null;
}

function proposalForPendingApproval(
  messages: readonly { readonly parts: readonly EveMessagePart[] }[],
  pending: Extract<EveMessagePart, { type: "dynamic-tool" }>,
): ProposalView | null {
  const pendingInput = isRecord(pending.input) ? pending.input : null;
  const pendingProposalId =
    pendingInput !== null && typeof pendingInput.proposalId === "string"
      ? pendingInput.proposalId
      : null;
  let fallback: ProposalView | null = null;
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type !== "dynamic-tool" || part.state !== "output-available")
        continue;
      const proposal = proposalFromOutput(part.output);
      if (proposal === null) continue;
      fallback = proposal;
      if (pendingProposalId === proposal.proposalId) return proposal;
    }
  }
  return pendingProposalId === null ? fallback : null;
}

function projectionValue(
  projection: Readonly<Record<string, unknown>>,
  key: string,
): string {
  const value = projection[key];
  return value === null || value === undefined ? "Not recorded" : String(value);
}

function proposalLabel(proposal: ProposalView): string {
  return proposal.operationKind === "RESCHEDULE_SESSION_PRESCRIPTION"
    ? "Reschedule session"
    : "Set strength target load";
}

function ProposalCard({
  proposal,
  pending,
  workspaceId,
  agentSessionId,
  onRespond,
}: {
  readonly proposal: ProposalView;
  readonly pending: Extract<EveMessagePart, { type: "dynamic-tool" }>;
  readonly workspaceId: string;
  readonly agentSessionId: string;
  readonly onRespond: (decision: "APPROVE" | "REJECT") => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = pending.toolMetadata?.eve?.inputRequest?.requestId;

  async function decide(decision: "APPROVE" | "REJECT") {
    if (
      requestId === undefined ||
      proposal.status !== "PENDING_APPROVAL" ||
      submitting
    )
      return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/v1/agent-proposals/${proposal.proposalId}/decision`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-workoutpal-workspace-id": workspaceId,
            "x-workoutpal-agent-session-id": agentSessionId,
          },
          body: JSON.stringify({
            decision,
            proposalDigest: proposal.commandDigest,
            approvalRequestId: requestId,
          }),
        },
      );
      if (!response.ok) {
        setError("The authenticated approval record could not be saved.");
        return;
      }
      await onRespond(decision);
    } catch {
      setError("The approval request could not be completed. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const before = proposal.beforeProjection;
  const after = proposal.afterProjection;
  return (
    <aside
      aria-labelledby="workoutpal-proposal-heading"
      className="rounded-xl border border-amber-700/70 bg-amber-950/30 px-4 py-4"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-300">
        Explicit approval required
      </p>
      <h3
        id="workoutpal-proposal-heading"
        className="mt-1 text-base font-semibold text-white"
      >
        Proposed change · {proposalLabel(proposal)}
      </h3>
      {proposal.operationKind === "RESCHEDULE_SESSION_PRESCRIPTION" ? (
        <>
          <p className="mt-2 text-xs text-slate-400">
            Session {projectionValue(before, "sessionPrescriptionId")} · time
            zone {projectionValue(before, "timeZone")}
          </p>
          <dl className="mt-3 grid gap-2 text-sm text-slate-200 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-slate-400">Current local date</dt>
              <dd>{projectionValue(before, "scheduledLocalDate")}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">Proposed local date</dt>
              <dd>{projectionValue(after, "scheduledLocalDate")}</dd>
            </div>
          </dl>
        </>
      ) : (
        <>
          <p className="mt-2 text-xs text-slate-400">
            Session {projectionValue(before, "sessionPrescriptionId")} · set{" "}
            {projectionValue(before, "ordinal")} · movement{" "}
            {projectionValue(before, "movementId")}
          </p>
          <dl className="mt-3 grid gap-2 text-sm text-slate-200 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-slate-400">Current target load</dt>
              <dd>{projectionValue(before, "targetLoadKg")} kg</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">Proposed target load</dt>
              <dd>{projectionValue(after, "targetLoadKg")} kg</dd>
            </div>
          </dl>
        </>
      )}
      <p className="mt-3 text-xs text-slate-400">
        Proposal {proposal.proposalId} · digest{" "}
        {proposal.commandDigest.slice(0, 12)}…
        <br />
        No other prescription fields are changed. Reject it and ask for a new
        proposal if the requested change is different.
      </p>
      {error === null ? null : (
        <p role="alert" className="mt-3 text-xs text-rose-200">
          {error}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={submitting}
          onClick={() => void decide("REJECT")}
          className="min-h-10 rounded-lg border border-rose-700 px-4 text-sm font-semibold text-rose-200 hover:bg-rose-950/60 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Reject
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => void decide("APPROVE")}
          className="min-h-10 rounded-lg bg-amber-300 px-4 text-sm font-semibold text-slate-950 hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Approve change"}
        </button>
      </div>
    </aside>
  );
}

function ToolPart({
  part,
}: {
  readonly part: Extract<EveMessagePart, { type: "dynamic-tool" }>;
}) {
  if (part.state === "output-error") {
    return (
      <p className="mt-2 rounded-lg border border-rose-900/60 bg-rose-950/30 px-3 py-2 text-xs text-rose-200">
        {part.toolName}: {part.errorText}
      </p>
    );
  }
  if (part.state === "approval-requested") {
    return (
      <p
        className="mt-2 rounded-lg border border-amber-800/70 bg-amber-950/30 px-3 py-2 text-xs text-amber-200"
        aria-live="polite"
      >
        Waiting for the explicit approval card below before executing this
        proposal.
      </p>
    );
  }
  if (part.state !== "output-available") {
    return (
      <p className="mt-2 text-xs text-slate-300" aria-live="polite">
        Reading {part.toolName.replaceAll("_", " ")}…
      </p>
    );
  }

  const evidence = evidenceFromOutput(part.output);
  return (
    <details className="mt-2 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs">
      <summary className="cursor-pointer text-slate-400 hover:text-cyan-200">
        Grounding: {part.toolName.replaceAll("_", " ")}
      </summary>
      {evidence.length === 0 ? (
        <p className="mt-2 text-slate-300">
          The read returned no matching evidence records.
        </p>
      ) : (
        <ul className="mt-2 space-y-1 text-slate-400">
          {evidence.map((item) => (
            <li key={`${String(item.source)}-${String(item.recordId)}`}>
              <span className="text-slate-300">{String(item.source)}</span>{" "}
              {String(item.recordId)}
              {item.aggregateVersion === null ||
              item.aggregateVersion === undefined
                ? ""
                : ` · v${String(item.aggregateVersion)}`}
              {item.revision === null || item.revision === undefined
                ? ""
                : ` · rev ${String(item.revision)}`}
              {typeof item.snapshotFingerprint === "string"
                ? ` · snapshot ${item.snapshotFingerprint}`
                : ""}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

function MessagePart({ part }: { readonly part: EveMessagePart }) {
  if (part.type === "text")
    return <p className="whitespace-pre-wrap">{part.text}</p>;
  if (part.type === "dynamic-tool") return <ToolPart part={part} />;
  if (part.type === "reasoning") return null;
  if (part.type === "file") {
    return (
      <p className="text-xs text-slate-300">
        Attachment: {part.filename ?? part.mediaType}
      </p>
    );
  }
  return null;
}

function partKey(messageId: string, part: EveMessagePart): string {
  if (part.type === "dynamic-tool") return `${messageId}-${part.toolCallId}`;
  if (part.type === "text") return `${messageId}-text-${part.text}`;
  if (part.type === "reasoning") return `${messageId}-reasoning-${part.text}`;
  if (part.type === "file")
    return `${messageId}-file-${part.filename ?? part.mediaType}`;
  return `${messageId}-${part.type}`;
}

function UnsupportedAttachmentNotice() {
  const attachments = usePromptInputAttachments();
  if (attachments.files.length === 0) return null;
  return (
    <div
      aria-label="Unsupported attachments"
      className="wp-agent-attachment-notice"
      role="note"
    >
      <span>Attachments are visible but unsupported by this Eve workflow.</span>
      <ul>
        {attachments.files.map((file) => (
          <li key={file.id}>
            <span>{file.filename ?? file.mediaType}</span>
            <button
              aria-label={`Remove ${file.filename ?? "attachment"}`}
              onClick={() => attachments.remove(file.id)}
              type="button"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AgentConversation({
  workspaceId,
  athleteId,
}: WorkoutPalAssistantProps) {
  const agent = useEveAgent({
    headers: () => ({ "x-workoutpal-workspace-id": workspaceId }),
  });
  const [inputError, setInputError] = useState<string | null>(null);

  async function submit(nextDraft: string) {
    const message = nextDraft.trim();
    if (
      message.length === 0 ||
      agent.status === "submitted" ||
      agent.status === "streaming"
    )
      return;
    try {
      await agent.send(message, {
        clientContext: {
          surface: "WorkoutPal Studio athlete context",
          ...(athleteId === undefined ? {} : { athleteId }),
          note: "This page context is untrusted UI context; use server-scoped tools for authority.",
        },
      });
    } catch {
      // The hook exposes the transport error in `agent.error`; keeping the
      // submit handler quiet avoids duplicating it in the transcript.
    }
  }

  const busy = agent.status === "submitted" || agent.status === "streaming";
  return (
    <section
      aria-labelledby="workoutpal-agent-heading"
      className="rounded-2xl border border-cyan-900/70 bg-slate-950/70 p-5 shadow-2xl shadow-cyan-950/20"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
            <p>F6 · Read-only agent</p>
            <p>F7 · Approval-gated agent</p>
          </div>
          <h2
            id="workoutpal-agent-heading"
            className="mt-1 text-xl font-semibold text-white"
          >
            Ask WorkoutPal
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Answers are grounded in the authenticated workspace and show their
            source records. Supported changes appear as immutable proposal cards
            and require an explicit authenticated approval.
          </p>
        </div>
        <span className="rounded-full border border-emerald-800 bg-emerald-950/40 px-3 py-1 text-xs font-semibold text-emerald-300">
          Reads only until approval
        </span>
      </div>

      <div
        role="log"
        aria-live="polite"
        aria-label="Agent conversation"
        className="mt-5 min-h-24 space-y-4"
      >
        {agent.data.messages.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-800 px-4 py-5 text-sm text-slate-400">
            Try “What was recorded for this athlete this week?” or ask for one
            specific plan, session, or monitoring window.
          </p>
        ) : (
          agent.data.messages.map((message) => (
            <article
              key={message.id}
              className={`rounded-xl px-4 py-3 text-sm ${message.role === "user" ? "ml-8 bg-slate-800/70 text-slate-200" : "mr-4 border border-slate-800 bg-slate-900/60 text-slate-100"}`}
            >
              <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-300">
                {message.role === "user" ? "You" : "WorkoutPal"}
              </p>
              <div className="space-y-2">
                {message.parts.map((part) => (
                  <MessagePart key={partKey(message.id, part)} part={part} />
                ))}
              </div>
            </article>
          ))
        )}
      </div>

      {(() => {
        const pending = pendingExecutionApproval(agent.data.messages);
        const proposal =
          pending === null
            ? latestProposal(agent.data.messages)
            : proposalForPendingApproval(agent.data.messages, pending);
        const sessionId = agent.session?.sessionId;
        if (
          pending === null ||
          proposal === null ||
          proposal.status !== "PENDING_APPROVAL" ||
          sessionId === undefined
        )
          return null;
        return (
          <div className="mt-5">
            <ProposalCard
              proposal={proposal}
              pending={pending}
              workspaceId={workspaceId}
              agentSessionId={sessionId}
              onRespond={async (decision) => {
                const requestId =
                  pending.toolMetadata?.eve?.inputRequest?.requestId;
                if (requestId === undefined) return;
                await agent.respond([
                  {
                    requestId,
                    optionId: decision === "APPROVE" ? "approve" : "cancel",
                  },
                ]);
              }}
            />
          </div>
        );
      })()}

      {agent.error !== undefined ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-rose-900/60 bg-rose-950/30 px-3 py-2 text-sm text-rose-200"
        >
          The authenticated agent request could not be completed:{" "}
          {agent.error.message}
        </p>
      ) : null}

      <PromptInput
        aria-label="Ask WorkoutPal a question or request one supported change"
        className="mt-5"
        onSubmit={async ({ files, text }) => {
          if (files.length > 0) {
            const message =
              "Attachments are not supported in this Eve workflow yet. Remove the file and send the text request.";
            setInputError(message);
            throw new Error(message);
          }
          setInputError(null);
          await submit(text);
        }}
      >
        <UnsupportedAttachmentNotice />
        <PromptInputTextarea
          aria-label="Ask WorkoutPal a question or request one supported change"
          disabled={busy}
          placeholder="Ask about stored plans, sessions, or monitoring…"
        />
        <PromptInputSubmit onStop={agent.stop} status={agent.status} />
      </PromptInput>
      {inputError === null ? null : (
        <p className="mt-2 text-xs text-amber-200" role="alert">
          {inputError}
        </p>
      )}
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={agent.reset}
          className="min-h-9 rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-300 hover:border-slate-500 hover:text-white"
        >
          New conversation
        </button>
      </div>
    </section>
  );
}

export function WorkoutPalAssistant(props: WorkoutPalAssistantProps) {
  return <AgentConversation {...props} />;
}
