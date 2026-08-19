"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LoadingState, PageFrame, Status } from "./f2-client";
import { type RouteContext, selectRouteEntity } from "./route-context";

interface Plan {
  readonly id: string;
}

interface Prescription {
  readonly id: string;
  readonly title: string;
  readonly status: "draft" | "published" | "archived";
  readonly publishedRevision: number | null;
  readonly version: number;
  readonly blocks: readonly unknown[];
}

interface ExecutionSession {
  readonly id: string;
  readonly status: "started" | "completed" | "cancelled";
  readonly version: number;
  readonly prescription: {
    readonly prescriptionId: string;
    readonly prescriptionVersion: number;
    readonly prescriptionRevision: number;
    readonly snapshotFingerprint: string;
    readonly snapshot: Record<string, unknown>;
  } | null;
}

interface Fact {
  readonly id: string;
  readonly kind: "strength-set" | "endurance-segment" | "mobility-item";
  readonly [key: string]: unknown;
}

interface Review {
  readonly session: ExecutionSession;
  readonly strengthSets: readonly Fact[];
  readonly enduranceSegments: readonly Fact[];
  readonly mobilityItems: readonly Fact[];
  readonly observations: readonly Record<string, unknown>[];
  readonly amendments: readonly Record<string, unknown>[];
  readonly effectiveFacts: readonly Fact[];
}

interface ApiEnvelope<T> {
  readonly data: T;
}

async function api<T>(input: string, init?: RequestInit): Promise<T> {
  const result = await fetch(input, { ...init, cache: "no-store" });
  const payload = (await result.json().catch(() => ({}))) as Partial<
    ApiEnvelope<T>
  > & { readonly title?: string };
  if (!result.ok) {
    throw new Error(payload.title ?? "The request could not be completed.");
  }
  return payload.data as T;
}

function firstMovementId(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = firstMovementId(entry);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    if (typeof object.movementId === "string") return object.movementId;
    for (const entry of Object.values(object)) {
      const found = firstMovementId(entry);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function optionalNumber(value: FormDataEntryValue | null): number | undefined {
  if (typeof value !== "string" || value.trim().length === 0) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function FactList({
  facts,
  empty,
}: {
  readonly facts: readonly Fact[];
  readonly empty: string;
}) {
  if (facts.length === 0) {
    return <p className="text-sm text-slate-500">{empty}</p>;
  }
  return (
    <ul className="space-y-2" aria-label="Performed facts">
      {facts.map((fact) => (
        <li
          key={fact.id}
          className="rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm"
        >
          <span className="font-semibold text-cyan-200">{fact.kind}</span>
          <span className="ml-3 text-slate-400">{fact.id}</span>
          <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs text-slate-300 sm:grid-cols-3">
            {Object.entries(fact)
              .filter(
                ([key]) =>
                  !["id", "kind", "workspaceId", "sessionId"].includes(key),
              )
              .map(([key, value]) => (
                <div key={key}>
                  <dt className="inline text-slate-500">{key}: </dt>
                  <dd className="inline">{String(value)}</dd>
                </div>
              ))}
          </dl>
        </li>
      ))}
    </ul>
  );
}

export function F4TrainingExecutionScreen({
  workspaceId,
  athleteId,
  routeContext,
}: {
  readonly workspaceId: string;
  readonly athleteId: string;
  readonly routeContext?: RouteContext | undefined;
}) {
  const router = useRouter();
  const routeExecutionId = routeContext?.executionId;
  const routeSessionId = routeContext?.sessionId;
  const [prescriptions, setPrescriptions] = useState<readonly Prescription[]>(
    [],
  );
  const [executions, setExecutions] = useState<readonly ExecutionSession[]>([]);
  const [selectedPrescriptionId, setSelectedPrescriptionId] = useState(
    routeSessionId ?? "",
  );
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [amendmentFact, setAmendmentFact] = useState<Fact | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const plans = await api<readonly Plan[]>(
      `/api/v1/training-plans?workspaceId=${encodeURIComponent(workspaceId)}&athleteId=${encodeURIComponent(athleteId)}`,
    );
    const sessionLists = await Promise.all(
      plans.map((plan) =>
        api<readonly Prescription[]>(
          `/api/v1/session-prescriptions?workspaceId=${encodeURIComponent(workspaceId)}&planId=${encodeURIComponent(plan.id)}`,
        ),
      ),
    );
    const published = sessionLists
      .flat()
      .filter(
        (session) =>
          session.status === "published" || session.publishedRevision !== null,
      );
    setPrescriptions(published);
    const current = await api<readonly ExecutionSession[]>(
      `/api/v1/session-executions?workspaceId=${encodeURIComponent(workspaceId)}&athleteId=${encodeURIComponent(athleteId)}`,
    );
    setExecutions(current);
    if (routeExecutionId !== undefined) {
      setReview(
        await api<Review>(
          `/api/v1/session-executions/${routeExecutionId}?workspaceId=${encodeURIComponent(workspaceId)}`,
        ),
      );
      return;
    }
    if (routeSessionId !== undefined) {
      const selection = selectRouteEntity(published, routeSessionId);
      if (selection === null || selection.kind === "missing") {
        throw new Error("The requested session is not available.");
      }
      setSelectedPrescriptionId(selection.value.id);
      const matchingExecution = current.find(
        (execution) =>
          execution.prescription?.prescriptionId === selection.value.id,
      );
      if (matchingExecution === undefined) {
        setReview(null);
      } else {
        setReview(
          await api<Review>(
            `/api/v1/session-executions/${matchingExecution.id}?workspaceId=${encodeURIComponent(workspaceId)}`,
          ),
        );
      }
      return;
    }
    const latest = current[0];
    if (latest !== undefined) {
      setReview(
        await api<Review>(
          `/api/v1/session-executions/${latest.id}?workspaceId=${encodeURIComponent(workspaceId)}`,
        ),
      );
    }
  }, [athleteId, routeExecutionId, routeSessionId, workspaceId]);

  useEffect(() => {
    void load().catch((cause: unknown) => {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load execution state.",
      );
    });
  }, [load]);

  const selectedPrescription = useMemo(
    () =>
      prescriptions.find(
        (prescription) => prescription.id === selectedPrescriptionId,
      ),
    [prescriptions, selectedPrescriptionId],
  );
  const defaultMovementId = firstMovementId(selectedPrescription?.blocks);
  const isStarted = review?.session.status === "started";
  const version = review?.session.version ?? 0;

  async function refreshReview(executionId: string) {
    const next = await api<Review>(
      `/api/v1/session-executions/${executionId}?workspaceId=${encodeURIComponent(workspaceId)}`,
    );
    setReview(next);
    setExecutions((current) =>
      current.map((session) =>
        session.id === next.session.id ? next.session : session,
      ),
    );
    return next;
  }

  async function startSession() {
    if (selectedPrescriptionId.length === 0) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const session = await api<ExecutionSession>(
        "/api/v1/session-executions",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": `studio-start-${selectedPrescriptionId}`,
          },
          body: JSON.stringify({
            workspaceId,
            prescriptionId: selectedPrescriptionId,
          }),
        },
      );
      await refreshReview(session.id);
      setNotice("Execution started from the published prescription snapshot.");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to start execution.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitFact(
    event: FormEvent<HTMLFormElement>,
    path:
      | "strength-sets"
      | "endurance-segments"
      | "mobility-items"
      | "observations",
    body: Record<string, unknown>,
  ) {
    event.preventDefault();
    if (review === null) return;
    setBusy(true);
    setError(null);
    try {
      const next = await api<Review>(
        `/api/v1/session-executions/${review.session.id}/${path}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": `studio-${path}-${crypto.randomUUID()}`,
          },
          body: JSON.stringify({
            workspaceId,
            expectedVersion: version,
            ...body,
          }),
        },
      );
      setReview(next);
      setNotice("Observed fact recorded. The prescription remains unchanged.");
      event.currentTarget.reset();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to record fact.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitObservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (review === null) return;
    const form = new FormData(event.currentTarget);
    await submitFact(event, "observations", {
      kind: "note",
      valueText: String(form.get("valueText") ?? ""),
      notes: String(form.get("notes") ?? ""),
    });
  }

  async function completeSession() {
    if (review === null) return;
    setBusy(true);
    setError(null);
    try {
      const next = await api<Review>(
        `/api/v1/session-executions/${review.session.id}/complete`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": `studio-complete-${review.session.id}`,
          },
          body: JSON.stringify({ workspaceId, expectedVersion: version }),
        },
      );
      setReview(next);
      setNotice(
        "Session completed. Performed facts are now immutable originals.",
      );
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to complete session.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function amend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (review === null || amendmentFact === null) return;
    const form = new FormData(event.currentTarget);
    const value = optionalNumber(form.get("correctedValue"));
    if (value === undefined) {
      setError("Enter a numeric corrected value.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await api<Review>(
        `/api/v1/session-executions/${review.session.id}/amendments`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": `studio-amend-${amendmentFact.id}-${crypto.randomUUID()}`,
          },
          body: JSON.stringify({
            workspaceId,
            expectedVersion: version,
            factKind: amendmentFact.kind,
            factId: amendmentFact.id,
            reason: String(form.get("reason") ?? "").trim(),
            correctedFields: { repetitions: value },
          }),
        },
      );
      setReview(next);
      setAmendmentFact(null);
      setNotice(
        "Amendment recorded. The original performed fact remains preserved.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to amend fact.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageFrame>
      <div className="wp-route-modern wp-route-execution px-8 py-10 lg:px-20">
        <button
          type="button"
          onClick={() =>
            router.push(`/workspace/${workspaceId}/athletes/${athleteId}`)
          }
          className="text-sm text-slate-500 hover:text-white"
        >
          ← Athlete profile
        </button>
        <div className="mt-8 flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-300">
              F4 · observed execution
            </p>
            <h1 className="mt-3 text-5xl font-semibold tracking-tight text-white">
              Training execution
            </h1>
            <p className="mt-3 max-w-3xl text-slate-400">
              Record what happened without rewriting the prescribed intent. This
              desktop-class Studio view is the canonical V1 client.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              void load().catch((cause: unknown) =>
                setError(
                  cause instanceof Error ? cause.message : "Unable to reload.",
                ),
              )
            }
            className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:border-cyan-300"
          >
            Reload / review
          </button>
        </div>
        {error === null ? null : (
          <div className="mt-6">
            <Status message={error} />
          </div>
        )}
        {notice === null ? null : (
          <div className="mt-6">
            <Status message={notice} tone="info" />
          </div>
        )}

        <div className="mt-8 grid gap-8 xl:grid-cols-[360px_1fr]">
          <aside className="space-y-6">
            <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6">
              <h2 className="text-xl font-semibold text-white">
                Published prescriptions
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                Start from an exact published revision and preserve its snapshot
                hash.
              </p>
              <label className="mt-5 block text-sm text-slate-300">
                Session prescription
                <select
                  value={selectedPrescriptionId}
                  onChange={(event) =>
                    setSelectedPrescriptionId(event.target.value)
                  }
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-white outline-none focus:ring-2 focus:ring-cyan-300"
                >
                  <option value="">Choose a published session</option>
                  {prescriptions.map((prescription) => (
                    <option key={prescription.id} value={prescription.id}>
                      {prescription.title} · revision{" "}
                      {prescription.publishedRevision ?? "—"}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={busy || selectedPrescriptionId.length === 0}
                onClick={() => void startSession()}
                className="mt-4 w-full rounded-xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Start executed session
              </button>
              {prescriptions.length === 0 ? (
                <p className="mt-4 text-xs text-amber-200">
                  No published prescriptions are available for this athlete yet.
                </p>
              ) : null}
            </section>
            <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6">
              <h2 className="text-xl font-semibold text-white">
                Execution history
              </h2>
              <ul className="mt-4 space-y-2">
                {executions.map((session) => (
                  <li key={session.id}>
                    <button
                      type="button"
                      onClick={() =>
                        void refreshReview(session.id).catch((cause: unknown) =>
                          setError(
                            cause instanceof Error
                              ? cause.message
                              : "Unable to load review.",
                          ),
                        )
                      }
                      className={`w-full rounded-xl border px-4 py-3 text-left text-sm ${review?.session.id === session.id ? "border-cyan-300/70 bg-cyan-300/10" : "border-slate-800 hover:border-slate-600"}`}
                    >
                      <span className="block font-semibold text-white">
                        {session.status}
                      </span>
                      <span className="block text-xs text-slate-500">
                        v{session.version} · {session.id}
                      </span>
                    </button>
                  </li>
                ))}
                {executions.length === 0 ? (
                  <li className="text-sm text-slate-500">
                    No executions started.
                  </li>
                ) : null}
              </ul>
            </section>
          </aside>

          <main className="space-y-8">
            {review === null ? (
              <LoadingState />
            ) : (
              <>
                <section className="rounded-2xl border border-cyan-300/20 bg-cyan-300/5 p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
                        Session review
                      </p>
                      <h2 className="mt-2 text-2xl font-semibold text-white">
                        {review.session.status} · expected version {version}
                      </h2>
                    </div>
                    {isStarted ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void completeSession()}
                        className="rounded-xl bg-emerald-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
                      >
                        Complete session
                      </button>
                    ) : null}
                  </div>
                  {review.session.prescription === null ? null : (
                    <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
                      <div>
                        <dt className="text-slate-500">Prescription ID</dt>
                        <dd className="mt-1 break-all text-slate-200">
                          {review.session.prescription.prescriptionId}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Revision / version</dt>
                        <dd className="mt-1 text-slate-200">
                          {review.session.prescription.prescriptionRevision} /{" "}
                          {review.session.prescription.prescriptionVersion}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">
                          Immutable snapshot SHA-256
                        </dt>
                        <dd className="mt-1 break-all font-mono text-xs text-cyan-100">
                          {review.session.prescription.snapshotFingerprint}
                        </dd>
                      </div>
                    </dl>
                  )}
                </section>

                <section
                  aria-labelledby="record-heading"
                  className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6"
                >
                  <h2
                    id="record-heading"
                    className="text-2xl font-semibold text-white"
                  >
                    Record observed facts
                  </h2>
                  <p className="mt-2 text-sm text-slate-400">
                    Raw performed facts are append-only evidence. Forms are
                    disabled after completion.
                  </p>
                  <div className="mt-6 grid gap-6 lg:grid-cols-3">
                    <form
                      onSubmit={(event) => {
                        const form = new FormData(event.currentTarget);
                        void submitFact(event, "strength-sets", {
                          movementId: String(form.get("movementId") ?? ""),
                          repetitions: optionalNumber(form.get("repetitions")),
                          loadKg: optionalNumber(form.get("loadKg")),
                        });
                      }}
                      className="space-y-3 rounded-xl border border-slate-800 p-4"
                    >
                      <h3 className="font-semibold text-white">Strength set</h3>
                      <label className="block text-sm text-slate-300">
                        Movement ID
                        <input
                          name="movementId"
                          defaultValue={defaultMovementId}
                          required
                          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
                        />
                      </label>
                      <label className="block text-sm text-slate-300">
                        Repetitions
                        <input
                          name="repetitions"
                          type="number"
                          min="0"
                          step="1"
                          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
                        />
                      </label>
                      <label className="block text-sm text-slate-300">
                        Load (kg)
                        <input
                          name="loadKg"
                          type="number"
                          min="0"
                          step="0.1"
                          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={!isStarted || busy}
                        className="w-full rounded-lg bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40"
                      >
                        Record strength
                      </button>
                    </form>
                    <form
                      onSubmit={(event) => {
                        const form = new FormData(event.currentTarget);
                        void submitFact(event, "endurance-segments", {
                          durationSeconds: optionalNumber(
                            form.get("durationSeconds"),
                          ),
                          distanceMeters: optionalNumber(
                            form.get("distanceMeters"),
                          ),
                          averageSpeedMps: optionalNumber(
                            form.get("averageSpeedMps"),
                          ),
                          averageHeartRateBpm: optionalNumber(
                            form.get("averageHeartRateBpm"),
                          ),
                          averagePowerWatts: optionalNumber(
                            form.get("averagePowerWatts"),
                          ),
                          rpe: optionalNumber(form.get("rpe")),
                          notes: String(form.get("notes") ?? ""),
                          modality: String(form.get("modality") ?? ""),
                        });
                      }}
                      className="space-y-3 rounded-xl border border-slate-800 p-4"
                    >
                      <h3 className="font-semibold text-white">
                        Endurance segment
                      </h3>
                      <label className="block text-sm text-slate-300">
                        Modality
                        <input
                          name="modality"
                          placeholder="run / bike"
                          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
                        />
                      </label>
                      <label className="block text-sm text-slate-300">
                        Duration (seconds)
                        <input
                          name="durationSeconds"
                          type="number"
                          min="0"
                          step="1"
                          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
                        />
                      </label>
                      <label className="block text-sm text-slate-300">
                        Distance (meters)
                        <input
                          name="distanceMeters"
                          type="number"
                          min="0"
                          step="0.1"
                          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
                        />
                      </label>
                      <label className="block text-sm text-slate-300">
                        Average speed (m/s)
                        <input
                          name="averageSpeedMps"
                          type="number"
                          min="0"
                          step="0.01"
                        />
                      </label>
                      <label className="block text-sm text-slate-300">
                        Average heart rate (bpm)
                        <input
                          name="averageHeartRateBpm"
                          type="number"
                          min="0"
                          step="1"
                        />
                      </label>
                      <label className="block text-sm text-slate-300">
                        Average power (watts)
                        <input
                          name="averagePowerWatts"
                          type="number"
                          min="0"
                          step="1"
                        />
                      </label>
                      <label className="block text-sm text-slate-300">
                        RPE (0–10)
                        <input
                          name="rpe"
                          type="number"
                          min="0"
                          max="10"
                          step="0.1"
                        />
                      </label>
                      <label className="block text-sm text-slate-300">
                        Notes
                        <textarea name="notes" rows={2} />
                      </label>
                      <button
                        type="submit"
                        disabled={!isStarted || busy}
                        className="w-full rounded-lg bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40"
                      >
                        Record endurance
                      </button>
                    </form>
                    <form
                      onSubmit={(event) => {
                        const form = new FormData(event.currentTarget);
                        void submitFact(event, "mobility-items", {
                          movementId: String(form.get("movementId") ?? ""),
                          repetitions: optionalNumber(form.get("repetitions")),
                          durationSeconds: optionalNumber(
                            form.get("durationSeconds"),
                          ),
                        });
                      }}
                      className="space-y-3 rounded-xl border border-slate-800 p-4"
                    >
                      <h3 className="font-semibold text-white">
                        Mobility item
                      </h3>
                      <label className="block text-sm text-slate-300">
                        Movement ID
                        <input
                          name="movementId"
                          defaultValue={defaultMovementId}
                          required
                          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
                        />
                      </label>
                      <label className="block text-sm text-slate-300">
                        Repetitions
                        <input
                          name="repetitions"
                          type="number"
                          min="0"
                          step="1"
                          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
                        />
                      </label>
                      <label className="block text-sm text-slate-300">
                        Duration (seconds)
                        <input
                          name="durationSeconds"
                          type="number"
                          min="0"
                          step="1"
                          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={!isStarted || busy}
                        className="w-full rounded-lg bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40"
                      >
                        Record mobility
                      </button>
                    </form>
                  </div>
                  <form
                    onSubmit={submitObservation}
                    className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-800 p-4"
                  >
                    <label className="min-w-56 flex-1 text-sm text-slate-300">
                      Session note
                      <input
                        name="valueText"
                        placeholder="What did the athlete report?"
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
                      />
                    </label>
                    <label className="min-w-56 flex-1 text-sm text-slate-300">
                      Context note
                      <input
                        name="notes"
                        placeholder="Optional context"
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={!isStarted || busy}
                      className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40"
                    >
                      Record observation
                    </button>
                  </form>
                </section>

                <section className="grid gap-8 lg:grid-cols-2">
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6">
                    <h2 className="text-2xl font-semibold text-white">
                      Original performed facts
                    </h2>
                    <p className="mt-2 text-sm text-slate-400">
                      Immutable source record. Amendments never replace these
                      values.
                    </p>
                    <div className="mt-5 space-y-5">
                      <div>
                        <h3 className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Strength
                        </h3>
                        <FactList
                          facts={review.strengthSets}
                          empty="No strength facts."
                        />
                      </div>
                      <div>
                        <h3 className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Endurance
                        </h3>
                        <FactList
                          facts={review.enduranceSegments}
                          empty="No endurance facts."
                        />
                      </div>
                      <div>
                        <h3 className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Mobility
                        </h3>
                        <FactList
                          facts={review.mobilityItems}
                          empty="No mobility facts."
                        />
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6">
                    <h2 className="text-2xl font-semibold text-white">
                      Effective corrected view
                    </h2>
                    <p className="mt-2 text-sm text-slate-400">
                      Derived from originals plus explicit amendments.
                    </p>
                    <div className="mt-5">
                      <FactList
                        facts={review.effectiveFacts}
                        empty="No effective facts yet."
                      />
                    </div>
                    {review.session.status === "completed" &&
                    review.strengthSets[0] !== undefined ? (
                      <form
                        onSubmit={amend}
                        className="mt-6 space-y-3 rounded-xl border border-amber-300/20 bg-amber-300/5 p-4"
                      >
                        <h3 className="font-semibold text-amber-100">
                          Amend a strength fact
                        </h3>
                        <label className="block text-sm text-slate-300">
                          Fact
                          <select
                            value={amendmentFact?.id ?? ""}
                            onChange={(event) =>
                              setAmendmentFact(
                                review.strengthSets.find(
                                  (fact) => fact.id === event.target.value,
                                ) ?? null,
                              )
                            }
                            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
                          >
                            <option value="">Choose a fact</option>
                            {review.strengthSets.map((fact) => (
                              <option key={fact.id} value={fact.id}>
                                {fact.id}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block text-sm text-slate-300">
                          Corrected repetitions
                          <input
                            name="correctedValue"
                            type="number"
                            min="0"
                            step="1"
                            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
                            required
                          />
                        </label>
                        <label className="block text-sm text-slate-300">
                          Reason
                          <input
                            name="reason"
                            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
                            required
                            minLength={1}
                          />
                        </label>
                        <button
                          type="submit"
                          disabled={busy || amendmentFact === null}
                          className="rounded-lg bg-amber-200 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40"
                        >
                          Record amendment
                        </button>
                      </form>
                    ) : null}
                  </div>
                </section>
              </>
            )}
          </main>
        </div>
      </div>
    </PageFrame>
  );
}
