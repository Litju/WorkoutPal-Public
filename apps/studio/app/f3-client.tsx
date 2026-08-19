"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type PlanBlock,
  PlanBlockBoard,
} from "@/components/workoutpal/plan-block-board";
import { LoadingState, PageFrame, Status } from "./f2-client";
import { type RouteContext, selectRouteEntity } from "./route-context";

interface Athlete {
  readonly id: string;
  readonly displayName: string;
}

interface Movement {
  readonly id: string;
  readonly canonicalName: string;
  readonly modality: "strength" | "endurance" | "mobility" | "general";
  readonly scope: "global" | "workspace";
  readonly archivedAt: string | null;
  readonly version: number;
}

interface Goal {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly targetDate: string | null;
  readonly version: number;
}

interface SetPrescription {
  readonly id: string;
  readonly ordinal: number;
  readonly targetRepMin?: number;
  readonly targetRepMax?: number;
  readonly targetLoadKg?: number;
  readonly targetRpe?: number;
  readonly targetRpeScale?: "0-10";
  readonly targetRir?: number;
  readonly targetRirScale?: "0-10";
  readonly targetRestSeconds?: number;
  readonly targetDurationSeconds?: number;
  readonly targetVelocityMps?: number;
  readonly tempoDescriptor?: string;
  readonly notes?: string;
}

interface StrengthExercise {
  readonly id: string;
  readonly movementId: string;
  readonly ordinal: number;
  readonly notes?: string;
  readonly sets: readonly SetPrescription[];
}

interface StrengthBlock {
  readonly id: string;
  readonly kind: "strength";
  readonly ordinal: number;
  readonly exercises: readonly StrengthExercise[];
}

interface EnduranceSegment {
  readonly id: string;
  readonly parentSegmentId: string | null;
  readonly ordinal: number;
  readonly kind: "warmup" | "work" | "recovery" | "cooldown" | "free";
  readonly repeatCount: number;
  readonly durationSeconds?: number;
  readonly distanceMeters?: number;
  readonly targetHrMin?: number;
  readonly targetHrMax?: number;
  readonly targetSpeedMpsMin?: number;
  readonly targetSpeedMpsMax?: number;
  readonly targetPowerWattsMin?: number;
  readonly targetPowerWattsMax?: number;
  readonly targetRpe?: number;
  readonly notes?: string;
}

interface EnduranceBlock {
  readonly id: string;
  readonly kind: "endurance";
  readonly ordinal: number;
  readonly segments: readonly EnduranceSegment[];
}

interface MobilityItem {
  readonly id: string;
  readonly movementId: string;
  readonly ordinal: number;
  readonly sets?: number;
  readonly reps?: number;
  readonly holdSeconds?: number;
  readonly side?: "left" | "right" | "bilateral" | "alternating";
  readonly targetRpe?: number;
  readonly notes?: string;
}

interface MobilityBlock {
  readonly id: string;
  readonly kind: "mobility";
  readonly ordinal: number;
  readonly items: readonly MobilityItem[];
}

interface GenericBlock {
  readonly id: string;
  readonly kind: "generic";
  readonly ordinal: number;
  readonly description: string;
}

type Block = StrengthBlock | EnduranceBlock | MobilityBlock | GenericBlock;

interface Session {
  readonly id: string;
  readonly planId: string;
  readonly phaseId: string | null;
  readonly title: string;
  readonly scheduledLocalDate: string;
  readonly timeZone: string;
  readonly status: "draft" | "published" | "archived";
  readonly version: number;
  readonly revision: number;
  readonly publishedRevision: number | null;
  readonly blocks: readonly Block[];
}

interface Phase {
  readonly id: string;
  readonly name: string;
  readonly parentPhaseId: string | null;
  readonly ordinal: number;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly classification: "macrocycle" | "mesocycle" | "microcycle" | "custom";
  readonly version: number;
}

interface Plan {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly timeZone: string;
  readonly status: "draft" | "published" | "archived";
  readonly version: number;
  readonly publishedRevision: number | null;
}

interface Revision {
  readonly id: string;
  readonly revision: number;
  readonly publishedAt: string;
  readonly snapshot: {
    readonly plan: Plan;
    readonly sessions: readonly Session[];
  };
}

interface PlanDetails {
  readonly plan: Plan;
  readonly goals: readonly Goal[];
  readonly phases: readonly Phase[];
  readonly sessions: readonly Session[];
  readonly revisions: readonly Revision[];
}

interface Envelope<T> {
  readonly data: T;
}

async function api<T>(input: string, init?: RequestInit): Promise<T> {
  const result = await fetch(input, { ...init, cache: "no-store" });
  const payload = (await result.json().catch(() => ({}))) as Partial<
    Envelope<T>
  > & {
    readonly title?: string;
  };
  if (!result.ok)
    throw new Error(payload.title ?? "The request could not be completed.");
  return payload.data as T;
}

function newId(): string {
  return crypto.randomUUID();
}

function numberValue(value: string): number | undefined {
  return value === "" ? undefined : Number(value);
}

function inputClass(): string {
  return "mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none ring-cyan-300 focus:ring-2";
}

function buttonClass(tone: "primary" | "secondary" = "primary"): string {
  return tone === "primary"
    ? "rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-200 disabled:opacity-60"
    : "rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:border-cyan-300/50 hover:text-cyan-200 disabled:opacity-60";
}

function updateSession(
  details: PlanDetails,
  sessionId: string,
  update: (session: Session) => Session,
): PlanDetails {
  return {
    ...details,
    sessions: details.sessions.map((session) =>
      session.id === sessionId ? update(session) : session,
    ),
  };
}

function modalityLabel(kind: Block["kind"]): string {
  return kind === "generic"
    ? "Generic"
    : `${kind.slice(0, 1).toUpperCase()}${kind.slice(1)}`;
}

export function F3TrainingDesignScreen({
  workspaceId,
  athleteId,
  routeContext,
}: {
  readonly workspaceId: string;
  readonly athleteId: string;
  readonly routeContext?: RouteContext | undefined;
}) {
  const router = useRouter();
  const routePlanId = routeContext?.planId;
  const routePhaseId = routeContext?.phaseId;
  const routeSessionId = routeContext?.sessionId;
  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [movements, setMovements] = useState<readonly Movement[]>([]);
  const [goals, setGoals] = useState<readonly Goal[]>([]);
  const [plans, setPlans] = useState<readonly Plan[]>([]);
  const [details, setDetails] = useState<PlanDetails | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(
    routePlanId ?? null,
  );
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    routeSessionId ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [movementName, setMovementName] = useState("");
  const [movementModality, setMovementModality] =
    useState<Movement["modality"]>("strength");
  const [goalTitle, setGoalTitle] = useState("");
  const [planTitle, setPlanTitle] = useState("Training plan");
  const [planStartsOn, setPlanStartsOn] = useState("2026-09-01");
  const [planEndsOn, setPlanEndsOn] = useState("2026-09-30");
  const [phaseName, setPhaseName] = useState("");
  const [phaseParentId, setPhaseParentId] = useState("");
  const [sessionTitle, setSessionTitle] = useState("");
  const [sessionDate, setSessionDate] = useState("2026-09-01");
  const [draftSessionTitle, setDraftSessionTitle] = useState("");
  const [savingSession, setSavingSession] = useState(false);
  const loadBaseGeneration = useRef(0);

  const loadBase = useCallback(async () => {
    const generation = ++loadBaseGeneration.current;
    setError(null);
    try {
      const [loadedAthlete, loadedMovements, loadedGoals, loadedPlans] =
        await Promise.all([
          api<Athlete>(
            `/api/v1/athletes/${athleteId}?workspaceId=${workspaceId}`,
          ),
          api<readonly Movement[]>(
            `/api/v1/movements?workspaceId=${workspaceId}`,
          ),
          api<readonly Goal[]>(
            `/api/v1/athletes/${athleteId}/goals?workspaceId=${workspaceId}`,
          ),
          api<readonly Plan[]>(
            `/api/v1/training-plans?workspaceId=${workspaceId}&athleteId=${athleteId}`,
          ),
        ]);
      if (generation !== loadBaseGeneration.current) return;
      setAthlete(loadedAthlete);
      setMovements(loadedMovements);
      setGoals(loadedGoals);
      setPlans(loadedPlans);
      let requestedPlanId = routePlanId;
      if (requestedPlanId === undefined && routeSessionId !== undefined) {
        const requestedSession = await api<Session>(
          `/api/v1/session-prescriptions/${routeSessionId}?workspaceId=${workspaceId}`,
        );
        requestedPlanId = requestedSession.planId;
      }
      if (requestedPlanId !== undefined) {
        setSelectedPlanId(requestedPlanId);
      } else if (selectedPlanId === null) {
        const selection = selectRouteEntity(loadedPlans, undefined);
        if (selection !== null && selection.kind !== "missing")
          setSelectedPlanId(selection.value.id);
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load Training Design.",
      );
    }
  }, [athleteId, routePlanId, routeSessionId, selectedPlanId, workspaceId]);

  const loadPlan = useCallback(
    async (planId: string) => {
      setError(null);
      try {
        const loaded = await api<PlanDetails>(
          `/api/v1/training-plans/${planId}?workspaceId=${workspaceId}`,
        );
        if (
          routeSessionId !== undefined &&
          !loaded.sessions.some((session) => session.id === routeSessionId)
        ) {
          throw new Error("The requested session is not part of this plan.");
        }
        if (
          routePhaseId !== undefined &&
          !loaded.phases.some((phase) => phase.id === routePhaseId)
        ) {
          throw new Error("The requested phase is not part of this plan.");
        }
        setDetails(loaded);
        setPlans((current) =>
          current.map((plan) =>
            plan.id === loaded.plan.id ? loaded.plan : plan,
          ),
        );
        const phaseSessions =
          routePhaseId === undefined
            ? loaded.sessions
            : loaded.sessions.filter(
                (session) => session.phaseId === routePhaseId,
              );
        const sessionSelection = selectRouteEntity(
          phaseSessions,
          routeSessionId,
        );
        if (sessionSelection?.kind === "missing") {
          throw new Error("The requested session is not in this phase.");
        }
        setSelectedSessionId(
          sessionSelection === null ? null : sessionSelection.value.id,
        );
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load the plan.",
        );
      }
    },
    [routePhaseId, routeSessionId, workspaceId],
  );

  useEffect(() => {
    void loadBase();
  }, [loadBase]);

  useEffect(() => {
    if (selectedPlanId !== null) void loadPlan(selectedPlanId);
  }, [loadPlan, selectedPlanId]);

  const selectedSession = useMemo(
    () =>
      details?.sessions.find((session) => session.id === selectedSessionId) ??
      null,
    [details, selectedSessionId],
  );

  function updateSelectedSession(update: (session: Session) => Session) {
    if (selectedSessionId === null) return;
    setDetails((current) =>
      current === null
        ? current
        : updateSession(current, selectedSessionId, update),
    );
  }

  function reorderSelectedBlocks(next: readonly PlanBlock[]) {
    updateSelectedSession((session) => {
      const blocksById = new Map(
        session.blocks.map((block) => [block.id, block] as const),
      );
      const reordered = next.flatMap((item, index) => {
        const block = blocksById.get(item.id);
        return block === undefined ? [] : [{ ...block, ordinal: index + 1 }];
      });
      return { ...session, blocks: reordered };
    });
  }

  useEffect(() => {
    if (selectedSession !== null) setDraftSessionTitle(selectedSession.title);
  }, [selectedSession]);

  async function createMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const created = await api<Movement>("/api/v1/movements", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": newId(),
        },
        body: JSON.stringify({
          workspaceId,
          canonicalName: movementName,
          modality: movementModality,
        }),
      });
      setMovements((current) => [...current, created]);
      setMovementName("");
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Could not create movement.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function createGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await api<Goal>(`/api/v1/athletes/${athleteId}/goals`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": newId(),
        },
        body: JSON.stringify({ workspaceId, title: goalTitle }),
      });
      setGoalTitle("");
      await loadBase();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Could not create goal.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function createPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const created = await api<Plan>("/api/v1/training-plans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          athleteId,
          title: planTitle,
          startsOn: planStartsOn,
          endsOn: planEndsOn,
          timeZone: "America/Argentina/Buenos_Aires",
          goalIds: goals.map((goal) => goal.id),
        }),
      });
      setSelectedPlanId(created.id);
      setDetails(null);
      await loadBase();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Could not create plan.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function createPhase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (details === null) return;
    setBusy(true);
    try {
      await api<Phase>(`/api/v1/training-plans/${details.plan.id}/phases`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          ...(phaseParentId === "" ? {} : { parentPhaseId: phaseParentId }),
          name: phaseName,
          ordinal:
            details.phases.filter(
              (phase) => phase.parentPhaseId === (phaseParentId || null),
            ).length + 1,
          classification: phaseParentId === "" ? "mesocycle" : "microcycle",
          startsOn: details.plan.startsOn,
          endsOn:
            phaseParentId === ""
              ? details.plan.endsOn
              : (details.phases.find((phase) => phase.id === phaseParentId)
                  ?.endsOn ?? details.plan.endsOn),
        }),
      });
      setPhaseName("");
      setPhaseParentId("");
      await loadPlan(details.plan.id);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Could not create phase.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function createSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (details === null) return;
    setBusy(true);
    try {
      const created = await api<Session>("/api/v1/session-prescriptions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          planId: details.plan.id,
          scheduledLocalDate: sessionDate,
          timeZone: details.plan.timeZone,
          title: sessionTitle,
        }),
      });
      setSessionTitle("");
      setSelectedSessionId(created.id);
      await loadPlan(details.plan.id);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Could not create session.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveSession() {
    if (details === null || selectedSession === null) return;
    setSavingSession(true);
    setError(null);
    try {
      await api<Session>(
        `/api/v1/session-prescriptions/${selectedSession.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            expectedVersion: selectedSession.version,
            title: draftSessionTitle,
            blocks: selectedSession.blocks,
          }),
        },
      );
      await loadPlan(details.plan.id);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Could not save the session.",
      );
    } finally {
      setSavingSession(false);
    }
  }

  async function publishPlan() {
    if (details === null) return;
    setBusy(true);
    try {
      await api<Plan>(`/api/v1/training-plans/${details.plan.id}/publish`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": newId(),
        },
        body: JSON.stringify({
          workspaceId,
          expectedVersion: details.plan.version,
        }),
      });
      await loadPlan(details.plan.id);
      await loadBase();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Could not publish the plan.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function startRevision() {
    if (details === null) return;
    setBusy(true);
    try {
      await api<Plan>(`/api/v1/training-plans/${details.plan.id}/revision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          expectedVersion: details.plan.version,
        }),
      });
      await loadPlan(details.plan.id);
      await loadBase();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Could not start a revision.",
      );
    } finally {
      setBusy(false);
    }
  }

  function addBlock(kind: "strength" | "endurance" | "mobility" | "generic") {
    if (selectedSessionId === null) return;
    const block: Block =
      kind === "strength"
        ? { id: newId(), kind, ordinal: 0, exercises: [] }
        : kind === "endurance"
          ? {
              id: newId(),
              kind,
              ordinal: 0,
              segments: [
                {
                  id: newId(),
                  parentSegmentId: null,
                  ordinal: 1,
                  kind: "warmup",
                  repeatCount: 1,
                  durationSeconds: 600,
                },
                {
                  id: newId(),
                  parentSegmentId: null,
                  ordinal: 2,
                  kind: "work",
                  repeatCount: 5,
                  durationSeconds: 240,
                },
                {
                  id: newId(),
                  parentSegmentId: null,
                  ordinal: 3,
                  kind: "recovery",
                  repeatCount: 5,
                  durationSeconds: 120,
                },
                {
                  id: newId(),
                  parentSegmentId: null,
                  ordinal: 4,
                  kind: "cooldown",
                  repeatCount: 1,
                  durationSeconds: 600,
                },
              ],
            }
          : kind === "mobility"
            ? { id: newId(), kind, ordinal: 0, items: [] }
            : { id: newId(), kind, ordinal: 0, description: "Coach note" };
    updateSelectedSession((session) => ({
      ...session,
      blocks: [
        ...session.blocks,
        { ...block, ordinal: session.blocks.length + 1 },
      ],
    }));
  }

  function addStrengthExercise(blockId: string) {
    if (selectedSessionId === null) return;
    const movement =
      movements.find((candidate) => candidate.modality === "strength") ??
      movements[0];
    if (movement === undefined) {
      setError("Create a movement before adding a strength exercise.");
      return;
    }
    updateSelectedSession((session) => ({
      ...session,
      blocks: session.blocks.map((block) =>
        block.id !== blockId || block.kind !== "strength"
          ? block
          : {
              ...block,
              exercises: [
                ...block.exercises,
                {
                  id: newId(),
                  movementId: movement.id,
                  ordinal: block.exercises.length + 1,
                  sets: [
                    {
                      id: newId(),
                      ordinal: 1,
                      targetRepMin: 5,
                      targetRepMax: 5,
                      targetLoadKg: 0,
                      targetRir: 2,
                      targetRirScale: "0-10",
                      targetRestSeconds: 120,
                    },
                  ],
                },
              ],
            },
      ),
    }));
  }

  function addStrengthSet(blockId: string, exerciseId: string) {
    if (selectedSessionId === null) return;
    updateSelectedSession((session) => ({
      ...session,
      blocks: session.blocks.map((block) =>
        block.id !== blockId || block.kind !== "strength"
          ? block
          : {
              ...block,
              exercises: block.exercises.map((exercise) =>
                exercise.id !== exerciseId
                  ? exercise
                  : {
                      ...exercise,
                      sets: [
                        ...exercise.sets,
                        {
                          id: newId(),
                          ordinal: exercise.sets.length + 1,
                          targetRepMin: 5,
                          targetRepMax: 5,
                          targetLoadKg: 0,
                          targetRir: 2,
                          targetRirScale: "0-10",
                          targetRestSeconds: 120,
                        },
                      ],
                    },
              ),
            },
      ),
    }));
  }

  function updateStrengthExercise(
    blockId: string,
    exerciseId: string,
    field: "movementId" | "notes",
    value: string,
  ) {
    if (selectedSessionId === null) return;
    updateSelectedSession((session) => ({
      ...session,
      blocks: session.blocks.map((block) =>
        block.id !== blockId || block.kind !== "strength"
          ? block
          : {
              ...block,
              exercises: block.exercises.map((exercise) =>
                exercise.id !== exerciseId
                  ? exercise
                  : { ...exercise, [field]: value },
              ),
            },
      ),
    }));
  }

  function removeStrengthExercise(blockId: string, exerciseId: string) {
    if (selectedSessionId === null) return;
    updateSelectedSession((session) => ({
      ...session,
      blocks: session.blocks.map((block) =>
        block.id !== blockId || block.kind !== "strength"
          ? block
          : {
              ...block,
              exercises: block.exercises
                .filter((exercise) => exercise.id !== exerciseId)
                .map((exercise, index) => ({
                  ...exercise,
                  ordinal: index + 1,
                })),
            },
      ),
    }));
  }

  function removeStrengthSet(
    blockId: string,
    exerciseId: string,
    setId: string,
  ) {
    if (selectedSessionId === null) return;
    updateSelectedSession((session) => ({
      ...session,
      blocks: session.blocks.map((block) =>
        block.id !== blockId || block.kind !== "strength"
          ? block
          : {
              ...block,
              exercises: block.exercises.map((exercise) =>
                exercise.id !== exerciseId
                  ? exercise
                  : {
                      ...exercise,
                      sets: exercise.sets
                        .filter((set) => set.id !== setId)
                        .map((set, index) => ({
                          ...set,
                          ordinal: index + 1,
                        })),
                    },
              ),
            },
      ),
    }));
  }

  function addEnduranceSegment(blockId: string) {
    if (selectedSessionId === null) return;
    updateSelectedSession((session) => ({
      ...session,
      blocks: session.blocks.map((block) =>
        block.id !== blockId || block.kind !== "endurance"
          ? block
          : {
              ...block,
              segments: [
                ...block.segments,
                {
                  id: newId(),
                  parentSegmentId: null,
                  ordinal: block.segments.length + 1,
                  kind: "free" as const,
                  repeatCount: 1,
                  durationSeconds: 300,
                },
              ],
            },
      ),
    }));
  }

  function updateEnduranceSegment(
    blockId: string,
    segmentId: string,
    field:
      | "kind"
      | "repeatCount"
      | "durationSeconds"
      | "distanceMeters"
      | "targetHrMin"
      | "targetHrMax"
      | "targetSpeedMpsMin"
      | "targetSpeedMpsMax"
      | "targetPowerWattsMin"
      | "targetPowerWattsMax"
      | "targetRpe"
      | "notes",
    value: string,
  ) {
    if (selectedSessionId === null) return;
    const numericFields = new Set<keyof EnduranceSegment>([
      "repeatCount",
      "durationSeconds",
      "distanceMeters",
      "targetHrMin",
      "targetHrMax",
      "targetSpeedMpsMin",
      "targetSpeedMpsMax",
      "targetPowerWattsMin",
      "targetPowerWattsMax",
      "targetRpe",
    ]);
    const nextValue = numericFields.has(field) ? numberValue(value) : value;
    updateSelectedSession((session) => ({
      ...session,
      blocks: session.blocks.map((block) =>
        block.id !== blockId || block.kind !== "endurance"
          ? block
          : {
              ...block,
              segments: block.segments.map((segment) =>
                segment.id !== segmentId
                  ? segment
                  : {
                      ...segment,
                      ...(nextValue === undefined
                        ? { [field]: undefined }
                        : { [field]: nextValue }),
                    },
              ),
            },
      ),
    }));
  }

  function removeEnduranceSegment(blockId: string, segmentId: string) {
    if (selectedSessionId === null) return;
    updateSelectedSession((session) => ({
      ...session,
      blocks: session.blocks.map((block) =>
        block.id !== blockId || block.kind !== "endurance"
          ? block
          : {
              ...block,
              segments: block.segments
                .filter((segment) => segment.id !== segmentId)
                .map((segment, index) => ({
                  ...segment,
                  parentSegmentId: null,
                  ordinal: index + 1,
                })),
            },
      ),
    }));
  }

  function updateMobilityItem(
    blockId: string,
    itemId: string,
    field:
      | "movementId"
      | "sets"
      | "reps"
      | "holdSeconds"
      | "side"
      | "targetRpe"
      | "notes",
    value: string,
  ) {
    if (selectedSessionId === null) return;
    const numericFields = new Set<keyof MobilityItem>([
      "sets",
      "reps",
      "holdSeconds",
      "targetRpe",
    ]);
    const nextValue = numericFields.has(field) ? numberValue(value) : value;
    updateSelectedSession((session) => ({
      ...session,
      blocks: session.blocks.map((block) =>
        block.id !== blockId || block.kind !== "mobility"
          ? block
          : {
              ...block,
              items: block.items.map((item) =>
                item.id !== itemId
                  ? item
                  : {
                      ...item,
                      ...(nextValue === undefined
                        ? { [field]: undefined }
                        : { [field]: nextValue }),
                    },
              ),
            },
      ),
    }));
  }

  function removeMobilityItem(blockId: string, itemId: string) {
    if (selectedSessionId === null) return;
    updateSelectedSession((session) => ({
      ...session,
      blocks: session.blocks.map((block) =>
        block.id !== blockId || block.kind !== "mobility"
          ? block
          : {
              ...block,
              items: block.items
                .filter((item) => item.id !== itemId)
                .map((item, index) => ({ ...item, ordinal: index + 1 })),
            },
      ),
    }));
  }

  function moveBlock(blockId: string, direction: -1 | 1) {
    if (selectedSessionId === null) return;
    updateSelectedSession((session) => {
      const index = session.blocks.findIndex((block) => block.id === blockId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= session.blocks.length)
        return session;
      const blocks = [...session.blocks];
      const [moved] = blocks.splice(index, 1);
      if (moved === undefined) return session;
      blocks.splice(target, 0, moved);
      return {
        ...session,
        blocks: blocks.map((block, ordinal) => ({
          ...block,
          ordinal: ordinal + 1,
        })),
      };
    });
  }

  function removeBlock(blockId: string) {
    if (selectedSessionId === null) return;
    updateSelectedSession((session) => ({
      ...session,
      blocks: session.blocks
        .filter((block) => block.id !== blockId)
        .map((block, ordinal) => ({ ...block, ordinal: ordinal + 1 })),
    }));
  }

  function updateSet(
    blockId: string,
    exerciseId: string,
    setId: string,
    field: keyof SetPrescription,
    value: string,
  ) {
    if (selectedSessionId === null) return;
    const numericFields = new Set<keyof SetPrescription>([
      "targetRepMin",
      "targetRepMax",
      "targetLoadKg",
      "targetRpe",
      "targetRir",
      "targetRestSeconds",
      "targetDurationSeconds",
      "targetVelocityMps",
    ]);
    const nextValue = numericFields.has(field) ? numberValue(value) : value;
    updateSelectedSession((session) => ({
      ...session,
      blocks: session.blocks.map((block) =>
        block.id !== blockId || block.kind !== "strength"
          ? block
          : {
              ...block,
              exercises: block.exercises.map((exercise) =>
                exercise.id !== exerciseId
                  ? exercise
                  : {
                      ...exercise,
                      sets: exercise.sets.map((set) =>
                        set.id !== setId
                          ? set
                          : {
                              ...set,
                              ...(nextValue === undefined
                                ? { [field]: undefined }
                                : { [field]: nextValue }),
                            },
                      ),
                    },
              ),
            },
      ),
    }));
  }

  function addMobilityItem(blockId: string) {
    if (selectedSessionId === null) return;
    const movement =
      movements.find((candidate) => candidate.modality === "mobility") ??
      movements[0];
    if (movement === undefined) {
      setError("Create a movement before adding a mobility item.");
      return;
    }
    updateSelectedSession((session) => ({
      ...session,
      blocks: session.blocks.map((block) =>
        block.id !== blockId || block.kind !== "mobility"
          ? block
          : {
              ...block,
              items: [
                ...block.items,
                {
                  id: newId(),
                  movementId: movement.id,
                  ordinal: block.items.length + 1,
                  sets: 3,
                  reps: 10,
                  holdSeconds: 45,
                  side: "bilateral",
                },
              ],
            },
      ),
    }));
  }

  return (
    <PageFrame>
      <div className="wp-route-modern wp-route-training grid min-h-[calc(100vh-86px)] gap-8 px-6 py-8 lg:grid-cols-[250px_1fr] lg:px-10">
        <aside className="space-y-6">
          <button
            type="button"
            onClick={() =>
              router.push(`/workspace/${workspaceId}/athletes/${athleteId}`)
            }
            className="text-sm text-slate-500 hover:text-white"
          >
            ← Athlete profile
          </button>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">
              Training Design
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-white">
              {athlete?.displayName ?? "Loading…"}
            </h1>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              Author intent only. Execution and performed facts are outside F3.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
              Plans
            </p>
            <div className="mt-3 space-y-2">
              {plans.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => {
                    setSelectedPlanId(plan.id);
                    setSelectedSessionId(null);
                  }}
                  className={`w-full rounded-xl px-3 py-3 text-left text-sm ${plan.id === selectedPlanId ? "bg-cyan-300/15 text-cyan-100" : "text-slate-400 hover:bg-slate-900 hover:text-white"}`}
                >
                  <span className="block font-semibold">{plan.title}</span>
                  <span className="mt-1 block text-xs uppercase tracking-wider text-slate-500">
                    {plan.status} · v{plan.version}
                  </span>
                </button>
              ))}
              {plans.length === 0 ? (
                <p className="text-sm text-slate-500">No plan yet.</p>
              ) : null}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
              Visible catalog
            </p>
            <p className="mt-2 text-3xl font-semibold text-white">
              {movements.length}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              workspace + global movements
            </p>
          </div>
        </aside>

        <section aria-label="Training design workspace" className="min-w-0">
          <div className="flex flex-col justify-between gap-4 border-b border-slate-800 pb-6 xl:flex-row xl:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-300">
                F3 · multi-modality authoring
              </p>
              <h2 className="mt-3 text-4xl font-semibold tracking-tight text-white">
                Plan the week with the record underneath it.
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
                Calendar dates use the plan timezone. Strength targets,
                endurance segments, and mobility items remain explicit
                prescriptions.
              </p>
            </div>
            {details !== null ? (
              <span
                className={`self-start rounded-full px-3 py-1.5 text-sm ${details.plan.status === "published" ? "bg-emerald-300/10 text-emerald-200" : details.plan.status === "archived" ? "bg-rose-300/10 text-rose-200" : "bg-amber-300/10 text-amber-200"}`}
              >
                {details.plan.status.toUpperCase()} · v{details.plan.version}
                {details.plan.publishedRevision === null
                  ? ""
                  : ` · revision ${details.plan.publishedRevision}`}
              </span>
            ) : null}
          </div>
          {selectedSession !== null ? (
            <section
              className="wp-training-command-deck"
              aria-labelledby="session-map-heading"
            >
              <div className="wp-training-command-copy">
                <div>
                  <span className="wp-overline">Live draft workbench</span>
                  <h3 id="session-map-heading">{selectedSession.title}</h3>
                  <p>
                    Reorder the local block draft before saving the prescribed
                    session. The server record remains unchanged until Save
                    session is submitted.
                  </p>
                </div>
                <span className="wp-scope-chip">
                  <span aria-hidden="true" className="wp-scope-chip-dot" />
                  {selectedSession.blocks.length} blocks
                </span>
              </div>
              <PlanBlockBoard
                blocks={selectedSession.blocks.map((block) => ({
                  detail:
                    block.kind === "strength"
                      ? `${block.exercises.length} exercises`
                      : block.kind === "endurance"
                        ? `${block.segments.length} segments`
                        : block.kind === "mobility"
                          ? `${block.items.length} mobility items`
                          : block.description,
                  id: block.id,
                  label: modalityLabel(block.kind),
                }))}
                onReorder={reorderSelectedBlocks}
              />
            </section>
          ) : null}
          {error === null ? null : (
            <div className="mt-6">
              <Status message={error} />
            </div>
          )}

          {details === null && plans.length === 0 ? (
            <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_1fr]">
              <form
                onSubmit={createPlan}
                className="rounded-2xl border border-cyan-300/20 bg-cyan-300/5 p-6"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
                  Start with a plan
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-white">
                  Create TrainingPlan
                </h3>
                <label className="mt-5 block text-sm text-slate-300">
                  Title
                  <input
                    className={inputClass()}
                    value={planTitle}
                    onChange={(event) => setPlanTitle(event.target.value)}
                    required
                  />
                </label>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="text-sm text-slate-300">
                    Starts on
                    <input
                      className={inputClass()}
                      type="date"
                      value={planStartsOn}
                      onChange={(event) => setPlanStartsOn(event.target.value)}
                      required
                    />
                  </label>
                  <label className="text-sm text-slate-300">
                    Ends on
                    <input
                      className={inputClass()}
                      type="date"
                      value={planEndsOn}
                      onChange={(event) => setPlanEndsOn(event.target.value)}
                      required
                    />
                  </label>
                </div>
                <button
                  className={`${buttonClass()} mt-5`}
                  type="submit"
                  disabled={busy}
                >
                  {busy ? "Creating…" : "Create draft plan"}
                </button>
              </form>
              <div className="space-y-6">
                <form
                  onSubmit={createGoal}
                  className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6"
                >
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                    Training Goal
                  </p>
                  <div className="mt-3 flex gap-2">
                    <input
                      className={inputClass().replace("mt-2 ", "")}
                      placeholder="Increase squat strength"
                      value={goalTitle}
                      onChange={(event) => setGoalTitle(event.target.value)}
                      required
                    />
                    <button
                      className={buttonClass()}
                      type="submit"
                      disabled={busy}
                    >
                      Add goal
                    </button>
                  </div>
                </form>
                <form
                  onSubmit={createMovement}
                  className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6"
                >
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                    MovementDefinition
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_150px_auto]">
                    <input
                      className={inputClass().replace("mt-2 ", "")}
                      placeholder="Back squat"
                      value={movementName}
                      onChange={(event) => setMovementName(event.target.value)}
                      required
                    />
                    <select
                      aria-label="Movement modality"
                      className={inputClass().replace("mt-2 ", "")}
                      value={movementModality}
                      onChange={(event) =>
                        setMovementModality(
                          event.target.value as Movement["modality"],
                        )
                      }
                    >
                      <option value="strength">Strength</option>
                      <option value="endurance">Endurance</option>
                      <option value="mobility">Mobility</option>
                      <option value="general">General</option>
                    </select>
                    <button
                      className={buttonClass()}
                      type="submit"
                      disabled={busy}
                    >
                      Add movement
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : details === null ? (
            <div className="mt-8">
              <LoadingState />
            </div>
          ) : (
            <>
              <section className="mt-8 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                        TrainingPlan
                      </p>
                      <h3 className="mt-2 text-2xl font-semibold text-white">
                        {details.plan.title}
                      </h3>
                      <p className="mt-2 text-sm text-slate-400">
                        {details.plan.startsOn} → {details.plan.endsOn} ·{" "}
                        {details.plan.timeZone}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {details.plan.status === "draft" ? (
                        <button
                          type="button"
                          className={buttonClass()}
                          onClick={() => void publishPlan()}
                          disabled={busy}
                        >
                          Publish plan
                        </button>
                      ) : details.plan.status === "published" ? (
                        <button
                          type="button"
                          className={buttonClass("secondary")}
                          onClick={() => void startRevision()}
                          disabled={busy}
                        >
                          Create revision
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-5 text-sm leading-6 text-slate-400">
                    Publishing creates a frozen revision. Editing published
                    intent requires the explicit revision action.
                  </p>
                  <div className="mt-6 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl bg-slate-900 px-4 py-3">
                      <span className="block text-xs uppercase tracking-wider text-slate-500">
                        Goals
                      </span>
                      <span className="mt-1 block text-xl font-semibold text-white">
                        {details.goals.length}
                      </span>
                    </div>
                    <div className="rounded-xl bg-slate-900 px-4 py-3">
                      <span className="block text-xs uppercase tracking-wider text-slate-500">
                        Phases
                      </span>
                      <span className="mt-1 block text-xl font-semibold text-white">
                        {details.phases.length}
                      </span>
                    </div>
                    <div className="rounded-xl bg-slate-900 px-4 py-3">
                      <span className="block text-xs uppercase tracking-wider text-slate-500">
                        Sessions
                      </span>
                      <span className="mt-1 block text-xl font-semibold text-white">
                        {details.sessions.length}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                    Training Goals
                  </p>
                  {details.goals.length === 0 ? (
                    <p className="mt-4 text-sm text-slate-500">
                      No goals linked.
                    </p>
                  ) : (
                    <ul className="mt-4 space-y-2">
                      {details.goals.map((goal) => (
                        <li
                          key={goal.id}
                          className="rounded-xl bg-slate-900 px-3 py-3 text-sm text-slate-200"
                        >
                          {goal.title}
                          <span className="mt-1 block text-xs text-slate-500">
                            v{goal.version}
                            {goal.targetDate === null
                              ? ""
                              : ` · target ${goal.targetDate}`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>

              <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/60 p-6">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                      Plan Phase hierarchy
                    </p>
                    <p className="mt-2 text-sm text-slate-400">
                      No durable TrainingWeek is stored; this board projects
                      plan phases and scheduled sessions.
                    </p>
                  </div>
                  <form onSubmit={createPhase} className="flex gap-2">
                    <select
                      aria-label="Parent phase"
                      className={inputClass().replace("mt-2 ", "")}
                      value={phaseParentId}
                      onChange={(event) => setPhaseParentId(event.target.value)}
                    >
                      <option value="">Root phase</option>
                      {details.phases.map((phase) => (
                        <option key={phase.id} value={phase.id}>
                          Child of {phase.name}
                        </option>
                      ))}
                    </select>
                    <input
                      className={inputClass().replace("mt-2 ", "")}
                      placeholder="Mesocycle / microcycle"
                      value={phaseName}
                      onChange={(event) => setPhaseName(event.target.value)}
                      required
                    />
                    <button
                      type="submit"
                      className={buttonClass("secondary")}
                      disabled={busy}
                    >
                      Add phase
                    </button>
                  </form>
                </div>
                {details.phases.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {details.phases.map((phase) => (
                      <span
                        key={phase.id}
                        className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-300"
                      >
                        {phase.parentPhaseId === null ? "↳ " : "　↳ "}
                        {phase.name}
                        <span className="ml-2 text-xs text-slate-500">
                          {phase.classification} · v{phase.version}
                        </span>
                      </span>
                    ))}
                  </div>
                ) : null}
              </section>

              <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/60 p-6">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                      Week authoring projection
                    </p>
                    <h3 className="mt-2 text-2xl font-semibold text-white">
                      Scheduled SessionPrescriptions
                    </h3>
                  </div>
                  <form
                    onSubmit={createSession}
                    className="grid gap-2 sm:grid-cols-[1fr_150px_auto]"
                  >
                    <input
                      className={inputClass().replace("mt-2 ", "")}
                      placeholder="Monday strength"
                      value={sessionTitle}
                      onChange={(event) => setSessionTitle(event.target.value)}
                      required
                    />
                    <input
                      className={inputClass().replace("mt-2 ", "")}
                      type="date"
                      value={sessionDate}
                      onChange={(event) => setSessionDate(event.target.value)}
                      required
                    />
                    <button
                      type="submit"
                      className={buttonClass()}
                      disabled={busy}
                    >
                      Add session
                    </button>
                  </form>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {details.sessions.map((session) => (
                    <button
                      type="button"
                      key={session.id}
                      onClick={() => setSelectedSessionId(session.id)}
                      disabled={savingSession}
                      className={`rounded-2xl border p-4 text-left ${session.id === selectedSessionId ? "border-cyan-300/60 bg-cyan-300/10" : "border-slate-800 bg-slate-900/60 hover:border-slate-600"}`}
                    >
                      <span className="text-xs uppercase tracking-wider text-slate-500">
                        {session.scheduledLocalDate}
                      </span>
                      <span className="mt-2 block font-semibold text-white">
                        {session.title}
                      </span>
                      <span className="mt-2 block text-xs text-slate-500">
                        {session.status.toUpperCase()} · v{session.version} ·{" "}
                        {session.blocks.length} blocks
                      </span>
                    </button>
                  ))}
                  {details.sessions.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      Schedule a session to start authoring the week.
                    </p>
                  ) : null}
                </div>
              </section>

              {selectedSession !== null ? (
                <section className="mt-6 rounded-2xl border border-cyan-300/20 bg-cyan-300/5 p-6">
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">
                        SessionPrescription editor
                      </p>
                      <input
                        aria-label="Session title"
                        className="mt-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xl font-semibold text-white outline-none ring-cyan-300 focus:ring-2"
                        value={draftSessionTitle}
                        onChange={(event) =>
                          setDraftSessionTitle(event.target.value)
                        }
                      />
                      <p className="mt-2 text-xs text-slate-500">
                        {selectedSession.scheduledLocalDate} ·{" "}
                        {selectedSession.timeZone} ·{" "}
                        {selectedSession.status.toUpperCase()} · version{" "}
                        {selectedSession.version}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={buttonClass("secondary")}
                        onClick={() => addBlock("strength")}
                        disabled={
                          savingSession ||
                          selectedSession.status === "published"
                        }
                      >
                        + StrengthBlock
                      </button>
                      <button
                        type="button"
                        className={buttonClass("secondary")}
                        onClick={() => addBlock("endurance")}
                        disabled={
                          savingSession ||
                          selectedSession.status === "published"
                        }
                      >
                        + EnduranceBlock
                      </button>
                      <button
                        type="button"
                        className={buttonClass("secondary")}
                        onClick={() => addBlock("mobility")}
                        disabled={
                          savingSession ||
                          selectedSession.status === "published"
                        }
                      >
                        + MobilityBlock
                      </button>
                      <button
                        type="button"
                        className={buttonClass()}
                        onClick={() => void saveSession()}
                        disabled={
                          savingSession ||
                          selectedSession.status === "published"
                        }
                      >
                        {savingSession ? "Saving…" : "Save draft"}
                      </button>
                    </div>
                  </div>
                  <div className="mt-6 space-y-4">
                    {selectedSession.blocks.map((block) => (
                      <div
                        key={block.id}
                        className="rounded-2xl border border-slate-700 bg-slate-950/70 p-5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <span className="text-xs uppercase tracking-[0.2em] text-slate-500">
                              Block {block.ordinal}
                            </span>
                            <h4 className="mt-1 text-lg font-semibold text-white">
                              {modalityLabel(block.kind)}
                            </h4>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              aria-label={`Move ${modalityLabel(block.kind)} block up`}
                              className={buttonClass("secondary")}
                              onClick={() => moveBlock(block.id, -1)}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              aria-label={`Move ${modalityLabel(block.kind)} block down`}
                              className={buttonClass("secondary")}
                              onClick={() => moveBlock(block.id, 1)}
                            >
                              ↓
                            </button>
                            {block.kind === "strength" ? (
                              <button
                                type="button"
                                className={buttonClass("secondary")}
                                onClick={() => addStrengthExercise(block.id)}
                              >
                                + exercise
                              </button>
                            ) : block.kind === "endurance" ? (
                              <button
                                type="button"
                                className={buttonClass("secondary")}
                                onClick={() => addEnduranceSegment(block.id)}
                              >
                                + segment
                              </button>
                            ) : block.kind === "mobility" ? (
                              <button
                                type="button"
                                className={buttonClass("secondary")}
                                onClick={() => addMobilityItem(block.id)}
                              >
                                + mobility item
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="rounded-xl border border-rose-300/30 px-3 py-2 text-xs text-rose-200 hover:border-rose-300"
                              onClick={() => removeBlock(block.id)}
                            >
                              Remove block
                            </button>
                          </div>
                        </div>
                        {block.kind === "strength" ? (
                          <div className="mt-4 space-y-4">
                            {block.exercises.map((exercise) => (
                              <div
                                key={exercise.id}
                                className="rounded-xl bg-slate-900 p-4"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <select
                                    aria-label={`Exercise ${exercise.ordinal} movement`}
                                    className={inputClass().replace(
                                      "mt-2 ",
                                      "",
                                    )}
                                    value={exercise.movementId}
                                    onChange={(event) =>
                                      updateStrengthExercise(
                                        block.id,
                                        exercise.id,
                                        "movementId",
                                        event.target.value,
                                      )
                                    }
                                  >
                                    {movements.map((movement) => (
                                      <option
                                        key={movement.id}
                                        value={movement.id}
                                      >
                                        {movement.canonicalName} ·{" "}
                                        {movement.modality}
                                      </option>
                                    ))}
                                  </select>
                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      className="text-xs text-cyan-300 hover:text-white"
                                      onClick={() =>
                                        addStrengthSet(block.id, exercise.id)
                                      }
                                    >
                                      + set
                                    </button>
                                    <button
                                      type="button"
                                      className="text-xs text-rose-200 hover:text-white"
                                      onClick={() =>
                                        removeStrengthExercise(
                                          block.id,
                                          exercise.id,
                                        )
                                      }
                                    >
                                      Remove exercise
                                    </button>
                                  </div>
                                </div>
                                <label className="mt-3 block text-xs text-slate-500">
                                  Exercise notes
                                  <input
                                    className={inputClass()}
                                    value={exercise.notes ?? ""}
                                    onChange={(event) =>
                                      updateStrengthExercise(
                                        block.id,
                                        exercise.id,
                                        "notes",
                                        event.target.value,
                                      )
                                    }
                                  />
                                </label>
                                <div className="mt-3 space-y-2">
                                  {exercise.sets.map((set) => (
                                    <div
                                      key={set.id}
                                      className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5"
                                    >
                                      <label className="text-xs text-slate-500">
                                        Rep min
                                        <input
                                          aria-label={`Set ${set.ordinal} reps`}
                                          className={inputClass()}
                                          type="number"
                                          min="0"
                                          value={set.targetRepMin ?? ""}
                                          onChange={(event) =>
                                            updateSet(
                                              block.id,
                                              exercise.id,
                                              set.id,
                                              "targetRepMin",
                                              event.target.value,
                                            )
                                          }
                                        />
                                      </label>
                                      <label className="text-xs text-slate-500">
                                        Rep max
                                        <input
                                          className={inputClass()}
                                          type="number"
                                          min="0"
                                          value={set.targetRepMax ?? ""}
                                          onChange={(event) =>
                                            updateSet(
                                              block.id,
                                              exercise.id,
                                              set.id,
                                              "targetRepMax",
                                              event.target.value,
                                            )
                                          }
                                        />
                                      </label>
                                      <label className="text-xs text-slate-500">
                                        Load kg
                                        <input
                                          className={inputClass()}
                                          type="number"
                                          min="0"
                                          step="0.1"
                                          value={set.targetLoadKg ?? ""}
                                          onChange={(event) =>
                                            updateSet(
                                              block.id,
                                              exercise.id,
                                              set.id,
                                              "targetLoadKg",
                                              event.target.value,
                                            )
                                          }
                                        />
                                      </label>
                                      <label className="text-xs text-slate-500">
                                        RPE (0-10)
                                        <input
                                          className={inputClass()}
                                          type="number"
                                          min="0"
                                          max="10"
                                          step="0.1"
                                          value={set.targetRpe ?? ""}
                                          onChange={(event) =>
                                            updateSet(
                                              block.id,
                                              exercise.id,
                                              set.id,
                                              "targetRpe",
                                              event.target.value,
                                            )
                                          }
                                        />
                                      </label>
                                      <label className="text-xs text-slate-500">
                                        RIR (0-10)
                                        <input
                                          className={inputClass()}
                                          type="number"
                                          min="0"
                                          max="10"
                                          value={set.targetRir ?? ""}
                                          onChange={(event) =>
                                            updateSet(
                                              block.id,
                                              exercise.id,
                                              set.id,
                                              "targetRir",
                                              event.target.value,
                                            )
                                          }
                                        />
                                      </label>
                                      <label className="text-xs text-slate-500">
                                        Rest s
                                        <input
                                          className={inputClass()}
                                          type="number"
                                          min="0"
                                          value={set.targetRestSeconds ?? ""}
                                          onChange={(event) =>
                                            updateSet(
                                              block.id,
                                              exercise.id,
                                              set.id,
                                              "targetRestSeconds",
                                              event.target.value,
                                            )
                                          }
                                        />
                                      </label>
                                      <label className="text-xs text-slate-500">
                                        Duration s
                                        <input
                                          className={inputClass()}
                                          type="number"
                                          min="0"
                                          step="0.1"
                                          value={
                                            set.targetDurationSeconds ?? ""
                                          }
                                          onChange={(event) =>
                                            updateSet(
                                              block.id,
                                              exercise.id,
                                              set.id,
                                              "targetDurationSeconds",
                                              event.target.value,
                                            )
                                          }
                                        />
                                      </label>
                                      <label className="text-xs text-slate-500">
                                        Velocity m/s
                                        <input
                                          className={inputClass()}
                                          type="number"
                                          min="0"
                                          step="0.01"
                                          value={set.targetVelocityMps ?? ""}
                                          onChange={(event) =>
                                            updateSet(
                                              block.id,
                                              exercise.id,
                                              set.id,
                                              "targetVelocityMps",
                                              event.target.value,
                                            )
                                          }
                                        />
                                      </label>
                                      <label className="text-xs text-slate-500">
                                        Tempo
                                        <input
                                          className={inputClass()}
                                          value={set.tempoDescriptor ?? ""}
                                          onChange={(event) =>
                                            updateSet(
                                              block.id,
                                              exercise.id,
                                              set.id,
                                              "tempoDescriptor",
                                              event.target.value,
                                            )
                                          }
                                        />
                                      </label>
                                      <label className="text-xs text-slate-500">
                                        Set notes
                                        <input
                                          className={inputClass()}
                                          value={set.notes ?? ""}
                                          onChange={(event) =>
                                            updateSet(
                                              block.id,
                                              exercise.id,
                                              set.id,
                                              "notes",
                                              event.target.value,
                                            )
                                          }
                                        />
                                      </label>
                                      <span className="self-end rounded-xl bg-slate-950 px-3 py-3 text-xs text-slate-500">
                                        Set {set.ordinal}
                                      </span>
                                      <button
                                        type="button"
                                        className="self-end text-left text-xs text-rose-200 hover:text-white"
                                        onClick={() =>
                                          removeStrengthSet(
                                            block.id,
                                            exercise.id,
                                            set.id,
                                          )
                                        }
                                      >
                                        Remove set
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                            {block.exercises.length === 0 ? (
                              <p className="text-sm text-slate-500">
                                Choose a movement to add the first exercise.
                              </p>
                            ) : null}
                          </div>
                        ) : block.kind === "endurance" ? (
                          <div className="mt-4 space-y-3">
                            <p className="text-xs leading-5 text-slate-500">
                              Structured local segments. Durations are seconds,
                              distance is metres, speed is m/s, power is watts,
                              and RPE is explicit 0-10 intent.
                            </p>
                            {block.segments.map((segment) => (
                              <div
                                key={segment.id}
                                className="rounded-xl bg-slate-900 p-4"
                              >
                                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                                  <label className="text-xs text-slate-500">
                                    Kind
                                    <select
                                      className={inputClass()}
                                      value={segment.kind}
                                      onChange={(event) =>
                                        updateEnduranceSegment(
                                          block.id,
                                          segment.id,
                                          "kind",
                                          event.target.value,
                                        )
                                      }
                                    >
                                      <option value="warmup">Warm-up</option>
                                      <option value="work">Work</option>
                                      <option value="recovery">Recovery</option>
                                      <option value="cooldown">
                                        Cool-down
                                      </option>
                                      <option value="free">Free</option>
                                    </select>
                                  </label>
                                  <label className="text-xs text-slate-500">
                                    Repeat count
                                    <input
                                      className={inputClass()}
                                      type="number"
                                      min="1"
                                      value={segment.repeatCount}
                                      onChange={(event) =>
                                        updateEnduranceSegment(
                                          block.id,
                                          segment.id,
                                          "repeatCount",
                                          event.target.value,
                                        )
                                      }
                                    />
                                  </label>
                                  <label className="text-xs text-slate-500">
                                    Duration s
                                    <input
                                      className={inputClass()}
                                      type="number"
                                      min="0"
                                      step="0.1"
                                      value={segment.durationSeconds ?? ""}
                                      onChange={(event) =>
                                        updateEnduranceSegment(
                                          block.id,
                                          segment.id,
                                          "durationSeconds",
                                          event.target.value,
                                        )
                                      }
                                    />
                                  </label>
                                  <label className="text-xs text-slate-500">
                                    Distance m
                                    <input
                                      className={inputClass()}
                                      type="number"
                                      min="0"
                                      step="0.1"
                                      value={segment.distanceMeters ?? ""}
                                      onChange={(event) =>
                                        updateEnduranceSegment(
                                          block.id,
                                          segment.id,
                                          "distanceMeters",
                                          event.target.value,
                                        )
                                      }
                                    />
                                  </label>
                                  <label className="text-xs text-slate-500">
                                    HR min
                                    <input
                                      className={inputClass()}
                                      type="number"
                                      min="0"
                                      value={segment.targetHrMin ?? ""}
                                      onChange={(event) =>
                                        updateEnduranceSegment(
                                          block.id,
                                          segment.id,
                                          "targetHrMin",
                                          event.target.value,
                                        )
                                      }
                                    />
                                  </label>
                                  <label className="text-xs text-slate-500">
                                    HR max
                                    <input
                                      className={inputClass()}
                                      type="number"
                                      min="0"
                                      value={segment.targetHrMax ?? ""}
                                      onChange={(event) =>
                                        updateEnduranceSegment(
                                          block.id,
                                          segment.id,
                                          "targetHrMax",
                                          event.target.value,
                                        )
                                      }
                                    />
                                  </label>
                                  <label className="text-xs text-slate-500">
                                    Speed min m/s
                                    <input
                                      className={inputClass()}
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={segment.targetSpeedMpsMin ?? ""}
                                      onChange={(event) =>
                                        updateEnduranceSegment(
                                          block.id,
                                          segment.id,
                                          "targetSpeedMpsMin",
                                          event.target.value,
                                        )
                                      }
                                    />
                                  </label>
                                  <label className="text-xs text-slate-500">
                                    Speed max m/s
                                    <input
                                      className={inputClass()}
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={segment.targetSpeedMpsMax ?? ""}
                                      onChange={(event) =>
                                        updateEnduranceSegment(
                                          block.id,
                                          segment.id,
                                          "targetSpeedMpsMax",
                                          event.target.value,
                                        )
                                      }
                                    />
                                  </label>
                                  <label className="text-xs text-slate-500">
                                    Power min W
                                    <input
                                      className={inputClass()}
                                      type="number"
                                      min="0"
                                      value={segment.targetPowerWattsMin ?? ""}
                                      onChange={(event) =>
                                        updateEnduranceSegment(
                                          block.id,
                                          segment.id,
                                          "targetPowerWattsMin",
                                          event.target.value,
                                        )
                                      }
                                    />
                                  </label>
                                  <label className="text-xs text-slate-500">
                                    Power max W
                                    <input
                                      className={inputClass()}
                                      type="number"
                                      min="0"
                                      value={segment.targetPowerWattsMax ?? ""}
                                      onChange={(event) =>
                                        updateEnduranceSegment(
                                          block.id,
                                          segment.id,
                                          "targetPowerWattsMax",
                                          event.target.value,
                                        )
                                      }
                                    />
                                  </label>
                                  <label className="text-xs text-slate-500">
                                    RPE (0-10)
                                    <input
                                      className={inputClass()}
                                      type="number"
                                      min="0"
                                      max="10"
                                      step="0.1"
                                      value={segment.targetRpe ?? ""}
                                      onChange={(event) =>
                                        updateEnduranceSegment(
                                          block.id,
                                          segment.id,
                                          "targetRpe",
                                          event.target.value,
                                        )
                                      }
                                    />
                                  </label>
                                  <label className="text-xs text-slate-500 sm:col-span-2">
                                    Notes
                                    <input
                                      className={inputClass()}
                                      value={segment.notes ?? ""}
                                      onChange={(event) =>
                                        updateEnduranceSegment(
                                          block.id,
                                          segment.id,
                                          "notes",
                                          event.target.value,
                                        )
                                      }
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    className="self-end text-left text-xs text-rose-200 hover:text-white"
                                    onClick={() =>
                                      removeEnduranceSegment(
                                        block.id,
                                        segment.id,
                                      )
                                    }
                                  >
                                    Remove segment
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : block.kind === "mobility" ? (
                          <div className="mt-4 space-y-3">
                            {block.items.map((item) => (
                              <div
                                key={item.id}
                                className="rounded-xl bg-slate-900 p-4"
                              >
                                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                                  <label className="text-xs text-slate-500">
                                    Movement
                                    <select
                                      className={inputClass()}
                                      value={item.movementId}
                                      onChange={(event) =>
                                        updateMobilityItem(
                                          block.id,
                                          item.id,
                                          "movementId",
                                          event.target.value,
                                        )
                                      }
                                    >
                                      {movements.map((movement) => (
                                        <option
                                          key={movement.id}
                                          value={movement.id}
                                        >
                                          {movement.canonicalName} ·{" "}
                                          {movement.modality}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <label className="text-xs text-slate-500">
                                    Sets
                                    <input
                                      className={inputClass()}
                                      type="number"
                                      min="0"
                                      value={item.sets ?? ""}
                                      onChange={(event) =>
                                        updateMobilityItem(
                                          block.id,
                                          item.id,
                                          "sets",
                                          event.target.value,
                                        )
                                      }
                                    />
                                  </label>
                                  <label className="text-xs text-slate-500">
                                    Reps
                                    <input
                                      className={inputClass()}
                                      type="number"
                                      min="0"
                                      value={item.reps ?? ""}
                                      onChange={(event) =>
                                        updateMobilityItem(
                                          block.id,
                                          item.id,
                                          "reps",
                                          event.target.value,
                                        )
                                      }
                                    />
                                  </label>
                                  <label className="text-xs text-slate-500">
                                    Hold seconds
                                    <input
                                      className={inputClass()}
                                      type="number"
                                      min="0"
                                      step="0.1"
                                      value={item.holdSeconds ?? ""}
                                      onChange={(event) =>
                                        updateMobilityItem(
                                          block.id,
                                          item.id,
                                          "holdSeconds",
                                          event.target.value,
                                        )
                                      }
                                    />
                                  </label>
                                  <label className="text-xs text-slate-500">
                                    Side
                                    <select
                                      className={inputClass()}
                                      value={item.side ?? ""}
                                      onChange={(event) =>
                                        updateMobilityItem(
                                          block.id,
                                          item.id,
                                          "side",
                                          event.target.value,
                                        )
                                      }
                                    >
                                      <option value="">Unspecified</option>
                                      <option value="left">Left</option>
                                      <option value="right">Right</option>
                                      <option value="bilateral">
                                        Bilateral
                                      </option>
                                      <option value="alternating">
                                        Alternating
                                      </option>
                                    </select>
                                  </label>
                                  <label className="text-xs text-slate-500">
                                    RPE (0-10)
                                    <input
                                      className={inputClass()}
                                      type="number"
                                      min="0"
                                      max="10"
                                      step="0.1"
                                      value={item.targetRpe ?? ""}
                                      onChange={(event) =>
                                        updateMobilityItem(
                                          block.id,
                                          item.id,
                                          "targetRpe",
                                          event.target.value,
                                        )
                                      }
                                    />
                                  </label>
                                  <label className="text-xs text-slate-500 sm:col-span-2">
                                    Notes
                                    <input
                                      className={inputClass()}
                                      value={item.notes ?? ""}
                                      onChange={(event) =>
                                        updateMobilityItem(
                                          block.id,
                                          item.id,
                                          "notes",
                                          event.target.value,
                                        )
                                      }
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    className="self-end text-left text-xs text-rose-200 hover:text-white"
                                    onClick={() =>
                                      removeMobilityItem(block.id, item.id)
                                    }
                                  >
                                    Remove mobility item
                                  </button>
                                </div>
                              </div>
                            ))}
                            {block.items.length === 0 ? (
                              <p className="text-sm text-slate-500">
                                Add a mobility item.
                              </p>
                            ) : null}
                          </div>
                        ) : (
                          <p className="mt-4 text-sm text-slate-400">
                            {block.description}
                          </p>
                        )}
                      </div>
                    ))}
                    {selectedSession.blocks.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-slate-700 px-4 py-8 text-center text-sm text-slate-500">
                        Add the three modality blocks to author this session.
                      </p>
                    ) : null}
                  </div>
                </section>
              ) : null}

              <section className="mt-6 grid gap-6 xl:grid-cols-2">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                    Published revisions
                  </p>
                  {details.revisions.length === 0 ? (
                    <p className="mt-4 text-sm text-slate-500">
                      No published revision yet.
                    </p>
                  ) : (
                    <ul className="mt-4 space-y-2">
                      {details.revisions.map((revision) => (
                        <li
                          key={revision.id}
                          className="rounded-xl bg-slate-900 px-4 py-3 text-sm text-slate-200"
                        >
                          Revision {revision.revision}
                          <span className="mt-1 block text-xs text-slate-500">
                            {new Date(revision.publishedAt).toLocaleString()} ·
                            reconstructable snapshot
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                    Movement catalog
                  </p>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {movements.map((movement) => (
                      <div
                        key={movement.id}
                        className="rounded-xl bg-slate-900 px-3 py-3 text-sm text-slate-200"
                      >
                        <span className="block">{movement.canonicalName}</span>
                        <span className="mt-1 block text-xs uppercase tracking-wider text-slate-500">
                          {movement.modality} · {movement.scope}
                        </span>
                      </div>
                    ))}
                  </div>
                  <form onSubmit={createMovement} className="mt-4 flex gap-2">
                    <input
                      className={inputClass().replace("mt-2 ", "")}
                      placeholder="Add workspace movement"
                      value={movementName}
                      onChange={(event) => setMovementName(event.target.value)}
                      required
                    />
                    <button
                      className={buttonClass("secondary")}
                      type="submit"
                      disabled={busy}
                    >
                      Add
                    </button>
                  </form>
                </div>
              </section>
            </>
          )}
        </section>
      </div>
    </PageFrame>
  );
}
