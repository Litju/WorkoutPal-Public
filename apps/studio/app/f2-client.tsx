"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { PageFrame as StudioPageFrame } from "./studio-ui";

export { PageFrame } from "./studio-ui";

interface WorkspaceSummary {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
}

interface Athlete {
  readonly id: string;
  readonly workspaceId: string;
  readonly displayName: string;
  readonly linkedUserId: string | null;
  readonly archivedAt: string | null;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly updatedAt: string;
  readonly updatedBy: string;
  readonly version: number;
  readonly assignedCoachCount?: number;
}

interface Assignment {
  readonly id: string;
  readonly coachPrincipalId: string;
  readonly createdAt: string;
}

interface AuditEvent {
  readonly id: string;
  readonly occurredAt: string;
  readonly action: string;
  readonly requestId: string;
}

interface ApiEnvelope<T> {
  readonly data: T;
}

async function api<T>(input: string, init?: RequestInit): Promise<T> {
  const result = await fetch(input, { ...init, cache: "no-store" });
  const payload = (await result.json().catch(() => ({}))) as Partial<
    ApiEnvelope<T>
  > & {
    title?: string;
    message?: string;
  };
  if (!result.ok) {
    throw new Error(
      payload.title ?? payload.message ?? "The request could not be completed.",
    );
  }
  return payload.data as T;
}

export function Status({
  message,
  tone = "error",
}: {
  readonly message: string;
  readonly tone?: "error" | "info";
}) {
  return (
    <div
      className={
        tone === "error"
          ? "rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100"
          : "rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm text-cyan-100"
      }
    >
      {message}
    </div>
  );
}

export function LoadingState() {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-6 py-10 text-center text-sm text-slate-400">
      Loading workspace state…
    </div>
  );
}

export function SignInScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [name, setName] = useState("Coach");
  const [email, setEmail] = useState("coach@example.com");
  const [password, setPassword] = useState("WorkoutPal-Local-123!");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const endpoint =
        mode === "sign-in"
          ? "/api/auth/sign-in/email"
          : "/api/auth/sign-up/email";
      const body =
        mode === "sign-in" ? { email, password } : { name, email, password };
      const result = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!result.ok) {
        const payload = (await result.json().catch(() => ({}))) as {
          message?: string;
          error?: { message?: string };
        };
        throw new Error(
          payload.message ?? payload.error?.message ?? "Authentication failed.",
        );
      }
      router.replace("/");
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Authentication failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <StudioPageFrame>
      <div className="grid min-h-[calc(100vh-86px)] items-center gap-12 px-8 py-12 lg:grid-cols-[1.1fr_0.9fr] lg:px-20">
        <section className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.26em] text-cyan-300">
            F2 identity workspace athlete
          </p>
          <h1 className="mt-5 text-5xl font-semibold leading-tight tracking-tight text-white">
            Your coaching workspace, with the record underneath it.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-400">
            Sign in to select a workspace, create an athlete profile, and keep
            every change versioned and auditable.
          </p>
        </section>
        <form
          onSubmit={submit}
          className="rounded-3xl border border-slate-700/70 bg-slate-950/70 p-8 shadow-2xl shadow-black/20"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                Secure access
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-white">
                {mode === "sign-in" ? "Welcome back" : "Create your account"}
              </h2>
            </div>
            <button
              type="button"
              onClick={() =>
                setMode(mode === "sign-in" ? "sign-up" : "sign-in")
              }
              className="text-sm text-cyan-300 hover:text-cyan-200"
            >
              {mode === "sign-in" ? "Create account" : "Use sign in"}
            </button>
          </div>
          {error === null ? null : (
            <div className="mt-6">
              <Status message={error} />
            </div>
          )}
          {mode === "sign-up" ? (
            <label className="mt-6 block text-sm text-slate-300">
              Name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none ring-cyan-300 focus:ring-2"
                required
              />
            </label>
          ) : null}
          <label className="mt-6 block text-sm text-slate-300">
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none ring-cyan-300 focus:ring-2"
              required
            />
          </label>
          <label className="mt-4 block text-sm text-slate-300">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none ring-cyan-300 focus:ring-2"
              minLength={8}
              required
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="mt-7 w-full rounded-xl bg-cyan-300 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-wait disabled:opacity-60"
          >
            {busy
              ? "Working…"
              : mode === "sign-in"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>
      </div>
    </StudioPageFrame>
  );
}

export function HomeScreen() {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<
    readonly WorkspaceSummary[] | null
  >(null);
  const [name, setName] = useState("My coaching workspace");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<readonly WorkspaceSummary[]>("/api/v1/workspaces")
      .then(setWorkspaces)
      .catch((loadError: unknown) => {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Sign in to continue.",
        );
      });
  }, []);

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const workspace = await api<WorkspaceSummary>("/api/v1/workspaces", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      router.push(`/workspace/${workspace.id}/athletes`);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Workspace creation failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <StudioPageFrame>
      <div className="wp-route-modern wp-route-home px-8 py-12 lg:px-20">
        <p className="text-sm font-semibold uppercase tracking-[0.26em] text-cyan-300">
          Choose your workspace
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white">
          Where do you want to work today?
        </h1>
        <p className="mt-4 max-w-2xl text-slate-400">
          Workspace membership is the authorization boundary. Your athlete data
          stays scoped to the workspace you select.
        </p>
        {error !== null && !error.toLowerCase().includes("authentication") ? (
          <div className="mt-8 max-w-xl">
            <Status message={error} />
          </div>
        ) : null}
        {workspaces === null ? (
          <div className="mt-10 max-w-xl">
            <LoadingState />
          </div>
        ) : workspaces.length === 0 ? (
          <form
            onSubmit={createWorkspace}
            className="mt-10 max-w-xl rounded-2xl border border-slate-800 bg-slate-950/60 p-7"
          >
            <p className="text-lg font-semibold text-white">
              Create your first workspace
            </p>
            <p className="mt-2 text-sm text-slate-400">
              You become its owner atomically with the workspace membership.
            </p>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-6 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none ring-cyan-300 focus:ring-2"
              minLength={2}
              maxLength={120}
              required
            />
            <button
              type="submit"
              disabled={busy}
              className="mt-4 rounded-xl bg-cyan-300 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-200 disabled:opacity-60"
            >
              {busy ? "Creating…" : "Create workspace"}
            </button>
          </form>
        ) : (
          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {workspaces.map((workspace) => (
              <button
                type="button"
                key={workspace.id}
                onClick={() =>
                  router.push(`/workspace/${workspace.id}/athletes`)
                }
                className="group rounded-2xl border border-slate-800 bg-slate-950/60 p-6 text-left transition hover:-translate-y-0.5 hover:border-cyan-300/50 hover:bg-slate-900"
              >
                <span className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  Workspace
                </span>
                <span className="mt-3 block text-xl font-semibold text-white group-hover:text-cyan-200">
                  {workspace.name}
                </span>
                <span className="mt-6 block text-sm text-slate-500">
                  Open athlete roster →
                </span>
              </button>
            ))}
            <form
              onSubmit={createWorkspace}
              className="rounded-2xl border border-dashed border-slate-700 p-6"
            >
              <span className="text-xs uppercase tracking-[0.2em] text-slate-500">
                New workspace
              </span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-4 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none ring-cyan-300 focus:ring-2"
                minLength={2}
                maxLength={120}
                required
              />
              <button
                type="submit"
                disabled={busy}
                className="mt-4 rounded-xl border border-cyan-300/40 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-300/10"
              >
                {busy ? "Creating…" : "Create workspace"}
              </button>
            </form>
          </div>
        )}
      </div>
    </StudioPageFrame>
  );
}

export function AthleteListScreen({
  workspaceId,
}: {
  readonly workspaceId: string;
}) {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [athletes, setAthletes] = useState<readonly Athlete[] | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [loadedWorkspace, loadedAthletes] = await Promise.all([
        api<WorkspaceSummary>(`/api/v1/workspaces/${workspaceId}`),
        api<readonly Athlete[]>(`/api/v1/athletes?workspaceId=${workspaceId}`),
      ]);
      setWorkspace(loadedWorkspace);
      setAthletes(loadedAthletes);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load athletes.",
      );
    }
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createAthlete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api<Athlete>("/api/v1/athletes", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({ workspaceId, displayName }),
      });
      setDisplayName("");
      await load();
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Could not create athlete.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <StudioPageFrame>
      <div className="wp-route-modern wp-route-athletes grid gap-8 px-8 py-10 lg:grid-cols-[260px_1fr] lg:px-12">
        <aside className="space-y-6">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="text-sm text-slate-500 hover:text-white"
          >
            ← All workspaces
          </button>
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">
              Workspace
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-white">
              {workspace?.name ?? "Loading…"}
            </h1>
          </div>
          <nav className="space-y-2">
            <div className="rounded-xl bg-cyan-300/10 px-4 py-3 text-sm font-semibold text-cyan-200">
              Athletes{" "}
              <span className="float-right text-cyan-300">
                {athletes?.length ?? "—"}
              </span>
            </div>
            <div className="px-4 py-3 text-sm text-slate-600">
              Training plans <span className="float-right text-xs">F3</span>
            </div>
          </nav>
        </aside>
        <section>
          <div className="flex flex-col justify-between gap-5 border-b border-slate-800 pb-8 sm:flex-row sm:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-300">
                Athlete management
              </p>
              <h2 className="mt-3 text-4xl font-semibold tracking-tight text-white">
                Active athletes
              </h2>
              <p className="mt-3 text-slate-400">
                Profiles remain available for history even after they are
                archived.
              </p>
            </div>
            <form onSubmit={createAthlete} className="flex gap-2">
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Athlete name"
                className="w-48 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none ring-cyan-300 focus:ring-2"
                minLength={2}
                maxLength={120}
                required
              />
              <button
                type="submit"
                disabled={busy}
                className="rounded-xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-200 disabled:opacity-60"
              >
                {busy ? "Adding…" : "Add athlete"}
              </button>
            </form>
          </div>
          {error === null ? null : (
            <div className="mt-6">
              <Status message={error} />
            </div>
          )}
          {athletes === null ? (
            <div className="mt-8">
              <LoadingState />
            </div>
          ) : athletes.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-dashed border-slate-700 px-6 py-16 text-center">
              <p className="text-xl font-semibold text-white">
                No active athletes yet
              </p>
              <p className="mt-2 text-sm text-slate-400">
                Create the first profile above. It can exist before the athlete
                has a login.
              </p>
            </div>
          ) : (
            <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {athletes.map((athlete) => (
                <button
                  type="button"
                  key={athlete.id}
                  onClick={() =>
                    router.push(
                      `/workspace/${workspaceId}/athletes/${athlete.id}`,
                    )
                  }
                  className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6 text-left transition hover:-translate-y-0.5 hover:border-cyan-300/50"
                >
                  <div className="flex items-start justify-between gap-4">
                    <span className="grid size-11 place-items-center rounded-2xl bg-slate-800 text-lg font-semibold text-cyan-200">
                      {athlete.displayName.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="rounded-full bg-emerald-300/10 px-2.5 py-1 text-xs font-medium text-emerald-200">
                      Active
                    </span>
                  </div>
                  <h3 className="mt-5 text-xl font-semibold text-white">
                    {athlete.displayName}
                  </h3>
                  <p className="mt-2 text-sm text-slate-500">
                    Version {athlete.version} ·{" "}
                    {athlete.assignedCoachCount ?? 0} coach
                    {athlete.assignedCoachCount === 1 ? "" : "es"}
                  </p>
                  <p className="mt-6 text-sm text-cyan-300">Open profile →</p>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </StudioPageFrame>
  );
}

export function AthleteDetailScreen({
  workspaceId,
  athleteId,
}: {
  readonly workspaceId: string;
  readonly athleteId: string;
}) {
  const router = useRouter();
  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [assignments, setAssignments] = useState<readonly Assignment[]>([]);
  const [audit, setAudit] = useState<readonly AuditEvent[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [loadedAthlete, loadedAssignments, loadedAudit] = await Promise.all(
        [
          api<Athlete>(
            `/api/v1/athletes/${athleteId}?workspaceId=${workspaceId}`,
          ),
          api<readonly Assignment[]>(
            `/api/v1/athletes/${athleteId}/coach-assignments?workspaceId=${workspaceId}`,
          ),
          api<readonly AuditEvent[]>(
            `/api/v1/audit?workspaceId=${workspaceId}&aggregateId=${athleteId}`,
          ),
        ],
      );
      setAthlete(loadedAthlete);
      setDisplayName(loadedAthlete.displayName);
      setAssignments(loadedAssignments);
      setAudit(loadedAudit);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load athlete.",
      );
    }
  }, [athleteId, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (athlete === null) return;
    setBusy(true);
    setError(null);
    try {
      await api<Athlete>(`/api/v1/athletes/${athleteId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          expectedVersion: athlete.version,
          displayName,
        }),
      });
      await load();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Could not update athlete.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    if (athlete === null) return;
    setBusy(true);
    setError(null);
    try {
      await api<Athlete>(`/api/v1/athletes/${athleteId}/archive`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, expectedVersion: athlete.version }),
      });
      router.replace(`/workspace/${workspaceId}/athletes`);
      router.refresh();
    } catch (archiveError) {
      setError(
        archiveError instanceof Error
          ? archiveError.message
          : "Could not archive athlete.",
      );
      setBusy(false);
    }
  }

  return (
    <StudioPageFrame>
      <div className="wp-route-modern wp-route-athlete-detail px-8 py-10 lg:px-20">
        <button
          type="button"
          onClick={() => router.push(`/workspace/${workspaceId}/athletes`)}
          className="text-sm text-slate-500 hover:text-white"
        >
          ← Active athletes
        </button>
        {athlete === null ? (
          <div className="mt-8 max-w-3xl">
            {error === null ? <LoadingState /> : <Status message={error} />}
          </div>
        ) : (
          <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
            <section className="max-w-3xl">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-300">
                    Athlete profile
                  </p>
                  <h1 className="mt-3 text-5xl font-semibold tracking-tight text-white">
                    {athlete.displayName}
                  </h1>
                  <p className="mt-3 text-slate-400">
                    Stable profile ID · {athlete.id}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-3">
                  <span className="rounded-full bg-emerald-300/10 px-3 py-1.5 text-sm text-emerald-200">
                    Active · v{athlete.version}
                  </span>
                  <a
                    href={`/workspace/${workspaceId}/athletes/${athleteId}/plan`}
                    className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-200"
                  >
                    Open Training Design
                  </a>
                  <a
                    href={`/workspace/${workspaceId}/athletes/${athleteId}/execution`}
                    className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-cyan-200 hover:border-cyan-300"
                  >
                    Open Training Execution
                  </a>
                  <a
                    href={`/workspace/${workspaceId}/athletes/${athleteId}/monitoring`}
                    className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-cyan-200 hover:border-cyan-300"
                  >
                    Open Monitoring
                  </a>
                </div>
              </div>
              {error === null ? null : (
                <div className="mt-7">
                  <Status message={error} />
                </div>
              )}
              <form
                onSubmit={update}
                className="mt-10 rounded-2xl border border-slate-800 bg-slate-950/60 p-7"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-white">
                    Profile details
                  </h2>
                  <span className="text-xs uppercase tracking-[0.2em] text-slate-500">
                    Optimistic update
                  </span>
                </div>
                <label className="mt-6 block text-sm text-slate-300">
                  Display name
                  <input
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none ring-cyan-300 focus:ring-2"
                    minLength={2}
                    maxLength={120}
                    required
                  />
                </label>
                <p className="mt-3 text-xs text-slate-500">
                  This update submits expected version {athlete.version}. A
                  stale writer receives a conflict instead of overwriting newer
                  data.
                </p>
                <button
                  type="submit"
                  disabled={busy}
                  className="mt-6 rounded-xl bg-cyan-300 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-200 disabled:opacity-60"
                >
                  {busy ? "Saving…" : "Save changes"}
                </button>
              </form>
              <div className="mt-6 rounded-2xl border border-rose-400/20 bg-rose-400/5 p-7">
                <h2 className="text-xl font-semibold text-white">
                  Archive profile
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Archiving removes this athlete from the active list while
                  preserving the profile and its audit history.
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void archive()}
                  className="mt-5 rounded-xl border border-rose-300/40 px-5 py-3 font-semibold text-rose-200 hover:bg-rose-300/10 disabled:opacity-60"
                >
                  Archive athlete
                </button>
              </div>
            </section>
            <aside className="space-y-6">
              <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  Coach assignments
                </p>
                <p className="mt-3 text-3xl font-semibold text-white">
                  {assignments.length}
                </p>
                {assignments.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">
                    No assigned coach recorded.
                  </p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {assignments.map((assignment) => (
                      <li
                        key={assignment.id}
                        className="rounded-xl bg-slate-900 px-3 py-3 text-xs text-slate-300"
                      >
                        <span className="block text-slate-500">
                          Coach principal
                        </span>
                        <span className="mt-1 block break-all">
                          {assignment.coachPrincipalId}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  Audit evidence
                </p>
                <p className="mt-3 text-3xl font-semibold text-white">
                  {audit.length}
                </p>
                <ul className="mt-4 space-y-3">
                  {audit
                    .slice(-5)
                    .reverse()
                    .map((event) => (
                      <li key={event.id} className="text-sm">
                        <span className="block text-cyan-200">
                          {event.action}
                        </span>
                        <span className="mt-1 block text-xs text-slate-500">
                          {new Date(event.occurredAt).toLocaleString()}
                        </span>
                      </li>
                    ))}
                </ul>
              </section>
            </aside>
          </div>
        )}
      </div>
    </StudioPageFrame>
  );
}
