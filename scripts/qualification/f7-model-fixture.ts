import { randomUUID } from "node:crypto";

const baseUrl = "http://127.0.0.1:3001";
const password = "WorkoutPal-Qualification-123!";
const timeZone = "America/Argentina/Buenos_Aires";

type Envelope<T> = Readonly<{ data: T }>;

type Account = Readonly<{
  readonly cookie: string;
  readonly principalId: string;
}>;

type Workspace = Readonly<{ readonly id: string }>;
type Athlete = Readonly<{ readonly id: string }>;
type Movement = Readonly<{ readonly id: string }>;
type Plan = Readonly<{ readonly id: string; readonly version: number }>;
type Session = Readonly<{
  readonly id: string;
  readonly version: number;
  readonly publishedRevision: number | null;
  readonly blocks: readonly Readonly<Record<string, unknown>>[];
}>;
type Execution = Readonly<{ readonly id: string; readonly version: number }>;
type ExecutionReview = Readonly<{ readonly session: Execution }>;

function jsonHeaders(cookie?: string): HeadersInit {
  return {
    "content-type": "application/json",
    ...(cookie === undefined ? {} : { cookie }),
  };
}

async function responseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text.slice(0, 240);
  }
}

async function request<T>(
  path: string,
  options: {
    readonly cookie: string;
    readonly method?: string;
    readonly body?: unknown;
    readonly idempotencyKey?: string;
    readonly workspaceId?: string;
  },
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...jsonHeaders(options.cookie),
      ...(options.idempotencyKey === undefined
        ? {}
        : { "idempotency-key": options.idempotencyKey }),
      ...(options.workspaceId === undefined
        ? {}
        : { "x-workoutpal-workspace-id": options.workspaceId }),
    },
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  });
  const payload = await responseJson(response);
  if (!response.ok) {
    throw new Error(
      `${options.method ?? "GET"} ${path} returned ${response.status}: ${JSON.stringify(payload).slice(0, 400)}`,
    );
  }
  if (typeof payload !== "object" || payload === null || !("data" in payload)) {
    throw new Error(
      `${options.method ?? "GET"} ${path} returned no data envelope.`,
    );
  }
  return (payload as Envelope<T>).data;
}

async function signUp(label: string): Promise<Account> {
  const email = `f7-qualification-${label.toLowerCase()}-${Date.now()}-${randomUUID()}@example.com`;
  const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    method: "POST",
    headers: {
      ...jsonHeaders(),
      origin: baseUrl,
      referer: `${baseUrl}/sign-in`,
    },
    body: JSON.stringify({
      name: `F7 ${label}`,
      email,
      password,
    }),
  });
  const payload = await responseJson(response);
  if (!response.ok) {
    throw new Error(`Sign-up for ${label} returned ${response.status}.`);
  }
  const setCookies = response.headers.getSetCookie?.() ?? [];
  const cookie = setCookies
    .map((value) => value.split(";", 1)[0])
    .filter((value) => value.length > 0)
    .join("; ");
  if (cookie.length === 0) {
    throw new Error(`Sign-up for ${label} did not return a session cookie.`);
  }
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("user" in payload) ||
    typeof payload.user !== "object" ||
    payload.user === null ||
    !("id" in payload.user) ||
    typeof payload.user.id !== "string"
  ) {
    throw new Error(`Sign-up for ${label} did not return a user identifier.`);
  }
  return { cookie, principalId: payload.user.id };
}

async function createWorkspace(
  account: Account,
  name: string,
): Promise<Workspace> {
  return request<Workspace>("/api/v1/workspaces", {
    cookie: account.cookie,
    method: "POST",
    body: { name },
  });
}

async function createAthlete(
  account: Account,
  workspaceId: string,
  displayName: string,
): Promise<Athlete> {
  return request<Athlete>("/api/v1/athletes", {
    cookie: account.cookie,
    method: "POST",
    body: { workspaceId, displayName },
    idempotencyKey: `f7-qualification-athlete-${randomUUID()}`,
  });
}

async function createMovement(
  account: Account,
  workspaceId: string,
  canonicalName: string,
  modality: "strength" | "endurance" | "mobility",
): Promise<Movement> {
  return request<Movement>("/api/v1/movements", {
    cookie: account.cookie,
    method: "POST",
    body: { workspaceId, canonicalName, modality },
  });
}

async function createPlan(
  account: Account,
  workspaceId: string,
  athleteId: string,
  title: string,
): Promise<Plan> {
  return request<Plan>("/api/v1/training-plans", {
    cookie: account.cookie,
    method: "POST",
    body: {
      workspaceId,
      athleteId,
      title,
      startsOn: "2026-08-01",
      endsOn: "2026-09-30",
      timeZone,
    },
  });
}

type SessionParts = Readonly<{
  readonly session: Session;
  readonly strengthSetId: string;
  readonly strengthExerciseId: string;
  readonly strengthMovementId: string;
  readonly enduranceSegmentId: string;
  readonly mobilityItemId: string;
  readonly mobilityMovementId: string;
}>;

async function createSession(
  account: Account,
  workspaceId: string,
  planId: string,
  title: string,
  scheduledLocalDate: string,
  movements: Readonly<{
    readonly strength: Movement;
    readonly endurance: Movement;
    readonly mobility: Movement;
  }>,
): Promise<SessionParts> {
  const strengthSetId = randomUUID();
  const strengthExerciseId = randomUUID();
  const enduranceSegmentId = randomUUID();
  const mobilityItemId = randomUUID();
  const session = await request<Session>("/api/v1/session-prescriptions", {
    cookie: account.cookie,
    method: "POST",
    body: {
      workspaceId,
      planId,
      scheduledLocalDate,
      timeZone,
      title,
      blocks: [
        {
          id: randomUUID(),
          kind: "strength",
          ordinal: 1,
          exercises: [
            {
              id: strengthExerciseId,
              movementId: movements.strength.id,
              ordinal: 1,
              sets: [
                {
                  id: strengthSetId,
                  ordinal: 1,
                  targetRepMin: 5,
                  targetRepMax: 5,
                  targetLoadKg: 140,
                },
              ],
            },
          ],
        },
        {
          id: randomUUID(),
          kind: "endurance",
          ordinal: 2,
          segments: [
            {
              id: enduranceSegmentId,
              ordinal: 1,
              kind: "work",
              repeatCount: 1,
              durationSeconds: 600,
            },
          ],
        },
        {
          id: randomUUID(),
          kind: "mobility",
          ordinal: 3,
          items: [
            {
              id: mobilityItemId,
              movementId: movements.mobility.id,
              ordinal: 1,
              sets: 2,
              reps: 8,
              holdSeconds: 30,
              side: "bilateral",
            },
          ],
        },
      ],
    },
  });
  return {
    session,
    strengthSetId,
    strengthExerciseId,
    strengthMovementId: movements.strength.id,
    enduranceSegmentId,
    mobilityItemId,
    mobilityMovementId: movements.mobility.id,
  };
}

async function publishPlan(
  account: Account,
  workspaceId: string,
  plan: Plan,
): Promise<void> {
  await request(`/api/v1/training-plans/${plan.id}/publish`, {
    cookie: account.cookie,
    method: "POST",
    body: { workspaceId, expectedVersion: plan.version },
    idempotencyKey: `f7-qualification-publish-${randomUUID()}`,
  });
}

async function createCompletedExecution(
  account: Account,
  workspaceId: string,
  session: SessionParts,
): Promise<Execution> {
  let execution = await request<Execution>("/api/v1/session-executions", {
    cookie: account.cookie,
    method: "POST",
    body: {
      workspaceId,
      prescriptionId: session.session.id,
      prescriptionRevision: 1,
      timeZone,
    },
    idempotencyKey: `f7-qualification-execution-${randomUUID()}`,
  });
  execution = (
    await request<ExecutionReview>(
      `/api/v1/session-executions/${execution.id}/strength-sets`,
      {
        cookie: account.cookie,
        method: "POST",
        body: {
          workspaceId,
          expectedVersion: execution.version,
          movementId: session.strengthMovementId,
          prescriptionExerciseId: session.strengthExerciseId,
          prescriptionSetId: session.strengthSetId,
          repetitions: 5,
          loadKg: 135,
        },
        idempotencyKey: `f7-qualification-strength-${randomUUID()}`,
      },
    )
  ).session;
  execution = (
    await request<ExecutionReview>(
      `/api/v1/session-executions/${execution.id}/endurance-segments`,
      {
        cookie: account.cookie,
        method: "POST",
        body: {
          workspaceId,
          expectedVersion: execution.version,
          prescriptionSegmentId: session.enduranceSegmentId,
          modality: "run",
          durationSeconds: 600,
        },
        idempotencyKey: `f7-qualification-endurance-${randomUUID()}`,
      },
    )
  ).session;
  execution = (
    await request<ExecutionReview>(
      `/api/v1/session-executions/${execution.id}/mobility-items`,
      {
        cookie: account.cookie,
        method: "POST",
        body: {
          workspaceId,
          expectedVersion: execution.version,
          movementId: session.mobilityMovementId,
          prescriptionItemId: session.mobilityItemId,
          repetitions: 8,
          durationSeconds: 30,
          side: "bilateral",
        },
        idempotencyKey: `f7-qualification-mobility-${randomUUID()}`,
      },
    )
  ).session;
  execution = (
    await request<ExecutionReview>(
      `/api/v1/session-executions/${execution.id}/observations`,
      {
        cookie: account.cookie,
        method: "POST",
        body: {
          workspaceId,
          expectedVersion: execution.version,
          kind: "note",
          valueText: "Qualification fixture observation.",
        },
        idempotencyKey: `f7-qualification-observation-${randomUUID()}`,
      },
    )
  ).session;
  return (
    await request<ExecutionReview>(
      `/api/v1/session-executions/${execution.id}/complete`,
      {
        cookie: account.cookie,
        method: "POST",
        body: { workspaceId, expectedVersion: execution.version },
        idempotencyKey: `f7-qualification-complete-${randomUUID()}`,
      },
    )
  ).session;
}

async function createUnplannedExecution(
  account: Account,
  workspaceId: string,
  athleteId: string,
): Promise<void> {
  const execution = await request<Execution>("/api/v1/session-executions", {
    cookie: account.cookie,
    method: "POST",
    body: { workspaceId, athleteId, timeZone },
    idempotencyKey: `f7-qualification-unplanned-${randomUUID()}`,
  });
  await request<ExecutionReview>(
    `/api/v1/session-executions/${execution.id}/complete`,
    {
      cookie: account.cookie,
      method: "POST",
      body: { workspaceId, expectedVersion: execution.version },
      idempotencyKey: `f7-qualification-unplanned-complete-${randomUUID()}`,
    },
  );
}

async function main(): Promise<void> {
  const owner = await signUp("Owner");
  const ownerWorkspace = await createWorkspace(
    owner,
    "F7 qualification workspace",
  );
  const ownerAthlete = await createAthlete(
    owner,
    ownerWorkspace.id,
    "F7 qualification athlete",
  );
  const ownerMovements = {
    strength: await createMovement(
      owner,
      ownerWorkspace.id,
      "F7 qualification squat",
      "strength",
    ),
    endurance: await createMovement(
      owner,
      ownerWorkspace.id,
      "F7 qualification run",
      "endurance",
    ),
    mobility: await createMovement(
      owner,
      ownerWorkspace.id,
      "F7 qualification mobility",
      "mobility",
    ),
  };
  const ownerPlan = await createPlan(
    owner,
    ownerWorkspace.id,
    ownerAthlete.id,
    "F7 qualification plan",
  );
  const historySession = await createSession(
    owner,
    ownerWorkspace.id,
    ownerPlan.id,
    "F7 historical session",
    "2026-08-12",
    ownerMovements,
  );
  const missedSession = await createSession(
    owner,
    ownerWorkspace.id,
    ownerPlan.id,
    "F7 missed session",
    "2026-08-13",
    ownerMovements,
  );
  const mutationSessions = {
    proposalOnly: await createSession(
      owner,
      ownerWorkspace.id,
      ownerPlan.id,
      "F7 proposal-only session",
      "2026-09-01",
      ownerMovements,
    ),
    load: await createSession(
      owner,
      ownerWorkspace.id,
      ownerPlan.id,
      "F7 load session",
      "2026-09-02",
      ownerMovements,
    ),
    rejection: await createSession(
      owner,
      ownerWorkspace.id,
      ownerPlan.id,
      "F7 rejection session",
      "2026-09-03",
      ownerMovements,
    ),
    approval: await createSession(
      owner,
      ownerWorkspace.id,
      ownerPlan.id,
      "F7 approval session",
      "2026-09-04",
      ownerMovements,
    ),
    conversational: await createSession(
      owner,
      ownerWorkspace.id,
      ownerPlan.id,
      "F7 conversational approval session",
      "2026-09-05",
      ownerMovements,
    ),
    proof: await createSession(
      owner,
      ownerWorkspace.id,
      ownerPlan.id,
      "F7 proof session",
      "2026-09-06",
      ownerMovements,
    ),
    stale: await createSession(
      owner,
      ownerWorkspace.id,
      ownerPlan.id,
      "F7 stale session",
      "2026-09-07",
      ownerMovements,
    ),
    replay: await createSession(
      owner,
      ownerWorkspace.id,
      ownerPlan.id,
      "F7 replay session",
      "2026-09-08",
      ownerMovements,
    ),
    wrongApprover: await createSession(
      owner,
      ownerWorkspace.id,
      ownerPlan.id,
      "F7 wrong approver session",
      "2026-09-09",
      ownerMovements,
    ),
  };
  await publishPlan(owner, ownerWorkspace.id, ownerPlan);
  const execution = await createCompletedExecution(
    owner,
    ownerWorkspace.id,
    historySession,
  );
  await createUnplannedExecution(owner, ownerWorkspace.id, ownerAthlete.id);

  const foreign = await signUp("Foreign");
  const foreignWorkspace = await createWorkspace(
    foreign,
    "F7 foreign qualification workspace",
  );
  const foreignAthlete = await createAthlete(
    foreign,
    foreignWorkspace.id,
    "F7 foreign athlete",
  );
  const foreignMovements = {
    strength: await createMovement(
      foreign,
      foreignWorkspace.id,
      "F7 foreign squat",
      "strength",
    ),
    endurance: await createMovement(
      foreign,
      foreignWorkspace.id,
      "F7 foreign run",
      "endurance",
    ),
    mobility: await createMovement(
      foreign,
      foreignWorkspace.id,
      "F7 foreign mobility",
      "mobility",
    ),
  };
  const foreignPlan = await createPlan(
    foreign,
    foreignWorkspace.id,
    foreignAthlete.id,
    "F7 foreign plan",
  );
  const foreignSession = await createSession(
    foreign,
    foreignWorkspace.id,
    foreignPlan.id,
    "F7 foreign session",
    "2026-09-10",
    foreignMovements,
  );
  await publishPlan(foreign, foreignWorkspace.id, foreignPlan);

  console.log(
    JSON.stringify({
      ownerCookie: owner.cookie,
      wrongApproverCookie: foreign.cookie,
      workspaceId: ownerWorkspace.id,
      athleteId: ownerAthlete.id,
      planId: ownerPlan.id,
      prescriptionId: historySession.session.id,
      executionId: execution.id,
      foreignAthleteId: foreignAthlete.id,
      foreignSessionPrescriptionId: foreignSession.session.id,
      sessionPrescriptionId: mutationSessions.proposalOnly.session.id,
      strengthSetId: mutationSessions.proposalOnly.strengthSetId,
      strengthSetIdLoad: mutationSessions.load.strengthSetId,
      sessionIdLoad: mutationSessions.load.session.id,
      sessionIdRejection: mutationSessions.rejection.session.id,
      sessionIdApproval: mutationSessions.approval.session.id,
      sessionIdConversational: mutationSessions.conversational.session.id,
      sessionIdProof: mutationSessions.proof.session.id,
      sessionIdStale: mutationSessions.stale.session.id,
      sessionIdReplay: mutationSessions.replay.session.id,
      sessionIdWrongApprover: mutationSessions.wrongApprover.session.id,
      strengthSetIdRejection: mutationSessions.rejection.strengthSetId,
      strengthSetIdApproval: mutationSessions.approval.strengthSetId,
      strengthSetIdConversational:
        mutationSessions.conversational.strengthSetId,
      strengthSetIdProof: mutationSessions.proof.strengthSetId,
      strengthSetIdStale: mutationSessions.stale.strengthSetId,
      strengthSetIdReplay: mutationSessions.replay.strengthSetId,
      strengthSetIdWrongApprover: mutationSessions.wrongApprover.strengthSetId,
      missedSessionId: missedSession.session.id,
    }),
  );
}

await main();
