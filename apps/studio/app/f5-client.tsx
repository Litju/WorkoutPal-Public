"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ProductTrendChart } from "@/components/workoutpal/product-trend-chart";
import { WorkoutPalAssistant } from "./agent-assistant";
import { LoadingState, PageFrame, Status } from "./f2-client";
import { type RouteContext, selectRouteEntity } from "./route-context";

interface Counts {
  readonly prescribedStrengthSetCount: number;
  readonly performedStrengthSetCount: number;
  readonly prescribedEnduranceSegmentCount: number;
  readonly performedEnduranceSegmentCount: number;
  readonly prescribedMobilityItemCount: number;
  readonly performedMobilityItemCount: number;
  readonly amendedPerformedFactCount: number;
}

interface SessionSummary {
  readonly id: string;
  readonly title: string;
  readonly scheduledLocalDate: string | null;
  readonly classification: string;
  readonly prescriptionId: string | null;
  readonly executionId: string | null;
  readonly executionStatus: "started" | "completed" | "cancelled" | null;
  readonly counts: Counts;
}

interface Overview {
  readonly window: {
    readonly kind: "day" | "week";
    readonly startDate: string;
    readonly endDate: string;
    readonly timeZone: string;
  };
  readonly prescribedSessionCount: number;
  readonly executedSessionCount: number;
  readonly linkedExecutedSessionCount: number;
  readonly completedSessionCount: number;
  readonly unplannedSessionCount: number;
  readonly amendedPerformedFactCount: number;
  readonly counts: Counts;
  readonly sessions: readonly SessionSummary[];
}

interface Provenance {
  readonly prescriptionId: string | null;
  readonly prescriptionVersion: number | null;
  readonly prescriptionRevision: number | null;
  readonly prescriptionSnapshotFingerprint: string | null;
  readonly executionId: string | null;
  readonly performedFactId: string | null;
  readonly amendmentIds: readonly string[];
}

interface Amendment {
  readonly amendmentId: string;
  readonly factId: string;
  readonly reason: string;
  readonly originalValues: Readonly<Record<string, unknown>>;
  readonly correctedFields: Readonly<Record<string, unknown>>;
}

interface StrengthRow {
  readonly movementName: string | null;
  readonly performedMovementName: string | null;
  readonly prescribedSetOrdinal: number | null;
  readonly performedSetOrdinal: number | null;
  readonly prescribedRepMin: number | null;
  readonly prescribedRepMax: number | null;
  readonly performedRepetitions: number | null;
  readonly prescribedLoadKg: number | null;
  readonly performedLoadKg: number | null;
  readonly prescribedRpe: number | null;
  readonly observedRpe: number | null;
  readonly status: string;
  readonly performedFactId: string | null;
  readonly provenance: Provenance;
  readonly amendments: readonly Amendment[];
}

interface EnduranceRow {
  readonly segmentKind: string | null;
  readonly prescribedTreePosition: string | null;
  readonly prescribedDurationSeconds: number | null;
  readonly performedDurationSeconds: number | null;
  readonly prescribedDistanceMeters: number | null;
  readonly performedDistanceMeters: number | null;
  readonly prescribedSpeedMpsMin: number | null;
  readonly prescribedSpeedMpsMax: number | null;
  readonly observedSpeedMps: number | null;
  readonly prescribedHrMin: number | null;
  readonly prescribedHrMax: number | null;
  readonly observedAverageHeartRateBpm: number | null;
  readonly prescribedPowerWattsMin: number | null;
  readonly prescribedPowerWattsMax: number | null;
  readonly observedAveragePowerWatts: number | null;
  readonly status: string;
  readonly provenance: Provenance;
  readonly amendments: readonly Amendment[];
}

interface MobilityRow {
  readonly movementName: string | null;
  readonly performedMovementName: string | null;
  readonly side: string | null;
  readonly prescribedSets: number | null;
  readonly performedSets: number | null;
  readonly prescribedRepetitions: number | null;
  readonly performedRepetitions: number | null;
  readonly prescribedHoldSeconds: number | null;
  readonly performedHoldSeconds: number | null;
  readonly prescribedRpe: number | null;
  readonly observedRpe: number | null;
  readonly status: string;
  readonly provenance: Provenance;
  readonly amendments: readonly Amendment[];
}

interface Observation {
  readonly id: string;
  readonly observedAt: string;
  readonly kind: string;
  readonly valueText: string | null;
  readonly valueNumber: number | null;
  readonly unit: string | null;
  readonly notes: string | null;
}

interface Detail {
  readonly title: string;
  readonly classification: string;
  readonly scheduledLocalDate: string | null;
  readonly prescription: {
    readonly prescriptionRevision: number;
    readonly snapshotFingerprint: string | null;
  } | null;
  readonly execution: {
    readonly executionId: string;
    readonly status: string;
  } | null;
  readonly strength: readonly StrengthRow[];
  readonly endurance: readonly EnduranceRow[];
  readonly mobility: readonly MobilityRow[];
  readonly observations: readonly Observation[];
  readonly amendments: readonly Amendment[];
}

interface ApiEnvelope<T> {
  readonly data: T;
}

async function api<T>(input: string): Promise<T> {
  const result = await fetch(input, { cache: "no-store" });
  const payload = (await result.json().catch(() => ({}))) as Partial<
    ApiEnvelope<T>
  > & { readonly title?: string };
  if (!result.ok) {
    throw new Error(
      payload.title ?? "The monitoring request could not be completed.",
    );
  }
  return payload.data as T;
}

function value(value: number | string | null): string {
  return value === null ? "Not recorded" : String(value);
}

function countLabel(value: number, noun: string): string {
  return `${value} ${noun}${value === 1 ? "" : "s"}`;
}

function StatusTag({ status }: { readonly status: string }) {
  return (
    <span className="inline-flex rounded-full border border-slate-600 px-2.5 py-1 text-xs font-semibold tracking-wide text-slate-200">
      {status}
    </span>
  );
}

function ProvenanceNote({ provenance }: { readonly provenance: Provenance }) {
  return (
    <details className="mt-3 text-xs text-slate-500">
      <summary className="cursor-pointer text-slate-400 hover:text-cyan-200">
        Fact provenance
      </summary>
      <dl className="mt-2 grid gap-1 sm:grid-cols-2">
        <div>
          <dt className="inline">Prescription revision: </dt>
          <dd className="inline text-slate-300">
            {value(provenance.prescriptionRevision)}
          </dd>
        </div>
        <div>
          <dt className="inline">Execution fact: </dt>
          <dd className="inline break-all text-slate-300">
            {value(provenance.performedFactId)}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="inline">Amendments: </dt>
          <dd className="inline text-slate-300">
            {provenance.amendmentIds.length === 0
              ? "None"
              : provenance.amendmentIds.join(", ")}
          </dd>
        </div>
      </dl>
    </details>
  );
}

function StrengthTable({ rows }: { readonly rows: readonly StrengthRow[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-800">
      <table className="min-w-full text-left text-sm">
        <caption className="sr-only">
          Strength prescribed and performed facts
        </caption>
        <thead className="bg-slate-900 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th scope="col" className="px-4 py-3">
              Movement
            </th>
            <th scope="col" className="px-4 py-3">
              Set
            </th>
            <th scope="col" className="px-4 py-3">
              Repetitions
            </th>
            <th scope="col" className="px-4 py-3">
              Load kg
            </th>
            <th scope="col" className="px-4 py-3">
              RPE
            </th>
            <th scope="col" className="px-4 py-3">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800 bg-slate-950/40">
          {rows.map((row, index) => (
            <tr
              key={row.performedFactId ?? `prescribed-${index}`}
              className="align-top"
            >
              <td className="px-4 py-3 text-slate-200">
                {row.movementName ??
                  row.performedMovementName ??
                  "Unplanned movement"}
              </td>
              <td className="px-4 py-3 text-slate-300">
                {value(row.prescribedSetOrdinal)} /{" "}
                {value(row.performedSetOrdinal)}
              </td>
              <td className="px-4 py-3 text-slate-300">
                {value(row.prescribedRepMin)}–{value(row.prescribedRepMax)} /{" "}
                {value(row.performedRepetitions)}
              </td>
              <td className="px-4 py-3 text-slate-300">
                {value(row.prescribedLoadKg)} / {value(row.performedLoadKg)}
              </td>
              <td className="px-4 py-3 text-slate-300">
                {value(row.prescribedRpe)} / {value(row.observedRpe)}
              </td>
              <td className="px-4 py-3">
                <StatusTag status={row.status} />
                <ProvenanceNote provenance={row.provenance} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 ? (
        <p className="px-4 py-5 text-sm text-slate-500">
          No strength prescription or execution facts.
        </p>
      ) : null}
    </div>
  );
}

function EnduranceTable({ rows }: { readonly rows: readonly EnduranceRow[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-800">
      <table className="min-w-full text-left text-sm">
        <caption className="sr-only">
          Endurance prescribed and performed facts
        </caption>
        <thead className="bg-slate-900 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th scope="col" className="px-4 py-3">
              Segment
            </th>
            <th scope="col" className="px-4 py-3">
              Duration seconds
            </th>
            <th scope="col" className="px-4 py-3">
              Distance meters
            </th>
            <th scope="col" className="px-4 py-3">
              Speed m/s
            </th>
            <th scope="col" className="px-4 py-3">
              Heart rate bpm
            </th>
            <th scope="col" className="px-4 py-3">
              Power watts
            </th>
            <th scope="col" className="px-4 py-3">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800 bg-slate-950/40">
          {rows.map((row, index) => (
            <tr
              key={row.provenance.performedFactId ?? `prescribed-${index}`}
              className="align-top"
            >
              <td className="px-4 py-3 text-slate-200">
                {row.segmentKind ?? "Unplanned segment"}{" "}
                {row.prescribedTreePosition ?? ""}
              </td>
              <td className="px-4 py-3 text-slate-300">
                {value(row.prescribedDurationSeconds)} /{" "}
                {value(row.performedDurationSeconds)}
              </td>
              <td className="px-4 py-3 text-slate-300">
                {value(row.prescribedDistanceMeters)} /{" "}
                {value(row.performedDistanceMeters)}
              </td>
              <td className="px-4 py-3 text-slate-300">
                {value(row.prescribedSpeedMpsMin)}–
                {value(row.prescribedSpeedMpsMax)} /{" "}
                {value(row.observedSpeedMps)}
              </td>
              <td className="px-4 py-3 text-slate-300">
                {value(row.prescribedHrMin)}–{value(row.prescribedHrMax)} /{" "}
                {value(row.observedAverageHeartRateBpm)}
              </td>
              <td className="px-4 py-3 text-slate-300">
                {value(row.prescribedPowerWattsMin)}–
                {value(row.prescribedPowerWattsMax)} /{" "}
                {value(row.observedAveragePowerWatts)}
              </td>
              <td className="px-4 py-3">
                <StatusTag status={row.status} />
                <ProvenanceNote provenance={row.provenance} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 ? (
        <p className="px-4 py-5 text-sm text-slate-500">
          No endurance prescription or execution facts.
        </p>
      ) : null}
    </div>
  );
}

function MobilityTable({ rows }: { readonly rows: readonly MobilityRow[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-800">
      <table className="min-w-full text-left text-sm">
        <caption className="sr-only">
          Mobility prescribed and performed facts
        </caption>
        <thead className="bg-slate-900 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th scope="col" className="px-4 py-3">
              Movement
            </th>
            <th scope="col" className="px-4 py-3">
              Side
            </th>
            <th scope="col" className="px-4 py-3">
              Sets
            </th>
            <th scope="col" className="px-4 py-3">
              Repetitions
            </th>
            <th scope="col" className="px-4 py-3">
              Hold seconds
            </th>
            <th scope="col" className="px-4 py-3">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800 bg-slate-950/40">
          {rows.map((row, index) => (
            <tr
              key={row.provenance.performedFactId ?? `prescribed-${index}`}
              className="align-top"
            >
              <td className="px-4 py-3 text-slate-200">
                {row.movementName ??
                  row.performedMovementName ??
                  "Unplanned movement"}
              </td>
              <td className="px-4 py-3 text-slate-300">{value(row.side)}</td>
              <td className="px-4 py-3 text-slate-300">
                {value(row.prescribedSets)} / {value(row.performedSets)}
              </td>
              <td className="px-4 py-3 text-slate-300">
                {value(row.prescribedRepetitions)} /{" "}
                {value(row.performedRepetitions)}
              </td>
              <td className="px-4 py-3 text-slate-300">
                {value(row.prescribedHoldSeconds)} /{" "}
                {value(row.performedHoldSeconds)}
              </td>
              <td className="px-4 py-3">
                <StatusTag status={row.status} />
                <ProvenanceNote provenance={row.provenance} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 ? (
        <p className="px-4 py-5 text-sm text-slate-500">
          No mobility prescription or execution facts.
        </p>
      ) : null}
    </div>
  );
}

function DetailPanel({ detail }: { readonly detail: Detail }) {
  return (
    <section aria-labelledby="selected-session-heading" className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">
            Selected session
          </p>
          <h2
            id="selected-session-heading"
            className="mt-2 text-3xl font-semibold text-white"
          >
            {detail.title}
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            {detail.scheduledLocalDate ?? "No scheduled local date"}
          </p>
        </div>
        <StatusTag status={detail.classification} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Execution
          </p>
          <p className="mt-2 text-sm text-slate-200">
            {detail.execution?.status ?? "No execution recorded"}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Prescription revision
          </p>
          <p className="mt-2 text-sm text-slate-200">
            {detail.prescription?.prescriptionRevision ?? "Not prescribed"}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Snapshot fingerprint
          </p>
          <p className="mt-2 break-all text-xs text-slate-300">
            {detail.prescription?.snapshotFingerprint ?? "Not applicable"}
          </p>
        </div>
      </div>
      <div>
        <h3 className="mb-3 text-lg font-semibold text-white">Strength</h3>
        <StrengthTable rows={detail.strength} />
      </div>
      <div>
        <h3 className="mb-3 text-lg font-semibold text-white">Endurance</h3>
        <EnduranceTable rows={detail.endurance} />
      </div>
      <div>
        <h3 className="mb-3 text-lg font-semibold text-white">Mobility</h3>
        <MobilityTable rows={detail.mobility} />
      </div>
      <div>
        <h3 className="mb-3 text-lg font-semibold text-white">
          Raw observations
        </h3>
        {detail.observations.length === 0 ? (
          <p className="rounded-xl border border-slate-800 px-4 py-5 text-sm text-slate-500">
            No raw observations were recorded.
          </p>
        ) : (
          <ul aria-label="Raw session observations" className="space-y-2">
            {detail.observations.map((observation) => (
              <li
                key={observation.id}
                className="rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-sm"
              >
                <div className="flex flex-wrap justify-between gap-3">
                  <span className="font-semibold text-cyan-200">
                    {observation.kind}
                  </span>
                  <time
                    dateTime={observation.observedAt}
                    className="text-slate-500"
                  >
                    {observation.observedAt}
                  </time>
                </div>
                <p className="mt-2 text-slate-200">
                  {observation.valueText ?? value(observation.valueNumber)}
                  {observation.unit === null ? "" : ` ${observation.unit}`}
                </p>
                {observation.notes === null ? null : (
                  <p className="mt-1 text-slate-400">{observation.notes}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h3 className="mb-3 text-lg font-semibold text-white">
          Amendment provenance
        </h3>
        {detail.amendments.length === 0 ? (
          <p className="rounded-xl border border-slate-800 px-4 py-5 text-sm text-slate-500">
            No amendments were recorded.
          </p>
        ) : (
          <ul aria-label="Amendment provenance" className="space-y-2">
            {detail.amendments.map((amendment) => (
              <li
                key={amendment.amendmentId}
                className="rounded-xl border border-amber-300/30 bg-amber-300/5 px-4 py-3 text-sm"
              >
                <p className="font-semibold text-amber-100">
                  Value corrected by amendment
                </p>
                <p className="mt-1 text-slate-300">{amendment.reason}</p>
                <p className="mt-2 text-xs text-slate-500">
                  Original: {JSON.stringify(amendment.originalValues)} ·
                  Effective correction:{" "}
                  {JSON.stringify(amendment.correctedFields)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export function F5MonitoringScreen({
  workspaceId,
  athleteId,
  routeContext,
}: {
  readonly workspaceId: string;
  readonly athleteId: string;
  readonly routeContext?: RouteContext | undefined;
}) {
  const initialDate = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const routeSessionId = routeContext?.sessionId;
  const [weekStart, setWeekStart] = useState(initialDate);
  const [timeZone, setTimeZone] = useState("UTC");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await api<Overview>(
        `/api/v1/athletes/${encodeURIComponent(athleteId)}/monitoring/week?workspaceId=${encodeURIComponent(workspaceId)}&weekStart=${encodeURIComponent(weekStart)}&timeZone=${encodeURIComponent(timeZone)}`,
      );
      const requested = selectRouteEntity(next.sessions, routeSessionId);
      if (requested?.kind === "missing") {
        throw new Error("The requested monitoring session is not available.");
      }
      const first =
        requested?.value ??
        next.sessions.find((session) => session.executionId !== null) ??
        next.sessions[0];
      setOverview(next);
      setSelectedId(first?.id ?? null);
      if (first?.executionId === undefined || first.executionId === null) {
        setDetail(null);
      } else {
        setDetail(
          await api<Detail>(
            `/api/v1/executed-sessions/${encodeURIComponent(first.executionId)}/monitoring?workspaceId=${encodeURIComponent(workspaceId)}`,
          ),
        );
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to load monitoring.",
      );
    } finally {
      setBusy(false);
    }
  }, [athleteId, routeSessionId, timeZone, weekStart, workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function selectSession(session: SessionSummary) {
    setSelectedId(session.id);
    setError(null);
    if (session.executionId === null) {
      setDetail(null);
      return;
    }
    try {
      setDetail(
        await api<Detail>(
          `/api/v1/executed-sessions/${encodeURIComponent(session.executionId)}/monitoring?workspaceId=${encodeURIComponent(workspaceId)}`,
        ),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load the selected session.",
      );
    }
  }

  return (
    <PageFrame>
      <div className="wp-route-modern wp-route-monitoring px-8 py-10 lg:px-12">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">
              F5 · factual monitoring
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">
              What was prescribed, what was observed?
            </h1>
            <p className="mt-3 max-w-3xl text-slate-400">
              This workspace compares stored training intent with stored
              execution facts. It does not interpret physiological meaning.
            </p>
          </div>
          <a
            href={`/workspace/${workspaceId}/athletes/${athleteId}`}
            className="text-sm text-slate-400 hover:text-white"
          >
            ← Athlete profile
          </a>
        </div>
        <form
          className="mt-8 grid gap-4 rounded-2xl border border-slate-800 bg-slate-950/50 p-5 md:grid-cols-[1fr_1fr_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            void refresh();
          }}
        >
          <label className="text-sm text-slate-300">
            Week starting
            <input
              aria-label="Week starting"
              type="date"
              value={weekStart}
              onChange={(event) => setWeekStart(event.target.value)}
              className="mt-2 block w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-white"
              required
            />
          </label>
          <label className="text-sm text-slate-300">
            Session timezone
            <input
              aria-label="Session timezone"
              value={timeZone}
              onChange={(event) => setTimeZone(event.target.value)}
              className="mt-2 block w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-white"
              required
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="self-end rounded-xl bg-cyan-300 px-5 py-2.5 font-semibold text-slate-950 hover:bg-cyan-200 disabled:opacity-60"
          >
            {busy ? "Loading…" : "Refresh facts"}
          </button>
        </form>
        {error === null ? null : (
          <div className="mt-5">
            <Status message={error} />
          </div>
        )}
        {overview === null ? (
          <div className="mt-8">
            <LoadingState />
          </div>
        ) : (
          <>
            <section aria-labelledby="week-summary-heading" className="mt-8">
              <div className="flex items-center justify-between gap-4">
                <h2
                  id="week-summary-heading"
                  className="text-xl font-semibold text-white"
                >
                  Week summary
                </h2>
                <span className="text-sm text-slate-500">
                  {overview.window.startDate} → {overview.window.endDate} ·{" "}
                  {overview.window.timeZone}
                </span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5">
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    Prescribed sessions
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-white">
                    {overview.prescribedSessionCount}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5">
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    Executed sessions
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-white">
                    {overview.executedSessionCount}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5">
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    Completed sessions
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-white">
                    {overview.completedSessionCount}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5">
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    Unplanned executions
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-white">
                    {overview.unplannedSessionCount}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5">
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    Amended facts
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-white">
                    {overview.amendedPerformedFactCount}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-sm text-slate-400">
                {countLabel(
                  overview.counts.performedStrengthSetCount,
                  "performed strength set",
                )}{" "}
                recorded against{" "}
                {countLabel(
                  overview.counts.prescribedStrengthSetCount,
                  "prescribed strength set",
                )}
                . Counts are direct stored facts.
              </p>
            </section>
            <div className="mt-6">
              <ProductTrendChart
                data={overview.sessions.map((session) => ({
                  label:
                    session.scheduledLocalDate ?? session.title.slice(0, 12),
                  value: session.executionId === null ? 0 : 1,
                }))}
                description="Binary linkage by listed session; this is a stored relationship, not a readiness or performance interpretation."
                title="Execution linkage by session"
                unit="linked sessions"
              />
            </div>
            <div className="mt-8 grid gap-8 xl:grid-cols-[360px_1fr]">
              <section
                aria-labelledby="session-list-heading"
                className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4"
              >
                <h2
                  id="session-list-heading"
                  className="px-2 text-lg font-semibold text-white"
                >
                  Session list
                </h2>
                {overview.sessions.length === 0 ? (
                  <p className="px-2 py-6 text-sm text-slate-500">
                    No published prescriptions or executions in this week.
                  </p>
                ) : (
                  <ul
                    aria-label="Monitoring sessions"
                    className="mt-3 space-y-2"
                  >
                    {overview.sessions.map((session) => (
                      <li key={session.id}>
                        <button
                          type="button"
                          onClick={() => void selectSession(session)}
                          aria-pressed={selectedId === session.id}
                          className={`w-full rounded-xl border px-3 py-3 text-left transition ${selectedId === session.id ? "border-cyan-300/60 bg-cyan-300/10" : "border-slate-800 bg-slate-900/40 hover:border-slate-600"}`}
                        >
                          <span className="flex items-start justify-between gap-3">
                            <span>
                              <span className="block font-semibold text-slate-100">
                                {session.title}
                              </span>
                              <span className="mt-1 block text-xs text-slate-500">
                                {session.scheduledLocalDate ?? "Unplanned"}
                              </span>
                            </span>
                            <StatusTag status={session.classification} />
                          </span>
                          <span className="mt-3 block text-xs text-slate-400">
                            {session.executionId === null
                              ? "No execution was recorded for this prescribed session."
                              : session.prescriptionId === null
                                ? "This session was performed without a linked prescription."
                                : session.executionStatus}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section className="min-w-0 rounded-2xl border border-slate-800 bg-slate-950/40 p-6">
                {detail === null ? (
                  <div className="rounded-xl border border-dashed border-slate-700 px-5 py-10 text-center">
                    <h2 className="text-xl font-semibold text-white">
                      No execution detail selected
                    </h2>
                    <p className="mt-2 text-sm text-slate-400">
                      Select an executed session to inspect factual comparisons.
                      A prescribed session without execution remains visible in
                      the list.
                    </p>
                  </div>
                ) : (
                  <DetailPanel detail={detail} />
                )}
              </section>
            </div>
          </>
        )}
        <div className="mt-10">
          <WorkoutPalAssistant
            workspaceId={workspaceId}
            athleteId={athleteId}
          />
        </div>
      </div>
    </PageFrame>
  );
}
