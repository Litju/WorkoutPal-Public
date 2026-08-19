import { randomUUID } from "node:crypto";

const baseUrl = (
  process.env.WORKOUTPAL_APP_URL ?? "http://127.0.0.1:3000"
).replace(/\/$/u, "");
const email = process.env.WORKOUTPAL_DEMO_EMAIL ?? "demo@workoutpal.local";
const password =
  process.env.WORKOUTPAL_DEMO_PASSWORD ?? "WorkoutPal-Demo-2026!";
const timeZone = "America/Argentina/Buenos_Aires";
const workspaceName = "WorkoutPal Demo Lab";
const athleteNames = ["Avery Stone", "Jordan Vale"];
const movementNames = {
  strength: "Back Squat",
  endurance: "Tempo Run",
  mobility: "Ankle Dorsiflexion",
};

let cookie = "";

function responseCookie(response) {
  const values =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [];
  const fallback = response.headers.get("set-cookie");
  if (fallback !== null) values.push(fallback);
  return values
    .map((value) => value.split(";", 1)[0])
    .filter((value) => value.length > 0)
    .join("; ");
}

async function payload(response) {
  const text = await response.text();
  if (text.length === 0) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text.slice(0, 500);
  }
}

async function authenticate() {
  const signUp = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: baseUrl,
      referer: `${baseUrl}/sign-in`,
    },
    body: JSON.stringify({
      name: "WorkoutPal Demo Coach",
      email,
      password,
    }),
  });
  if (signUp.ok) {
    cookie = responseCookie(signUp);
    if (cookie.length > 0) return;
  }

  const signIn = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: baseUrl,
      referer: `${baseUrl}/sign-in`,
    },
    body: JSON.stringify({ email, password }),
  });
  if (!signIn.ok) {
    const detail = await payload(signIn);
    throw new Error(
      `Demo authentication failed (${signIn.status}): ${JSON.stringify(detail).slice(0, 500)}`,
    );
  }
  cookie = responseCookie(signIn);
  if (cookie.length === 0)
    throw new Error("Demo authentication returned no session cookie.");
}

async function api(path, { method = "GET", body, idempotencyKey } = {}) {
  const headers = {
    ...(cookie.length === 0 ? {} : { cookie }),
    ...(body === undefined ? {} : { "content-type": "application/json" }),
    ...(idempotencyKey === undefined
      ? {}
      : { "idempotency-key": idempotencyKey }),
  };
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const value = await payload(response);
  if (!response.ok) {
    throw new Error(
      `${method} ${path} returned ${response.status}: ${JSON.stringify(value).slice(0, 500)}`,
    );
  }
  if (
    typeof value === "object" &&
    value !== null &&
    Object.hasOwn(value, "data")
  ) {
    return value.data;
  }
  return value;
}

async function list(path) {
  const value = await api(path);
  return Array.isArray(value) ? value : [];
}

function idOf(value, label) {
  if (typeof value?.id !== "string")
    throw new Error(`${label} did not return an id.`);
  return value.id;
}

function findBy(rows, field, expected) {
  return rows.find((row) => row?.[field] === expected);
}

async function ensureWorkspace() {
  const rows = await list("/api/v1/workspaces");
  return (
    findBy(rows, "name", workspaceName) ??
    (await api("/api/v1/workspaces", {
      method: "POST",
      body: { name: workspaceName },
    }))
  );
}

async function ensureAthlete(workspaceId, displayName) {
  const rows = await list(`/api/v1/athletes?workspaceId=${workspaceId}`);
  return (
    findBy(rows, "displayName", displayName) ??
    (await api("/api/v1/athletes", {
      method: "POST",
      body: { workspaceId, displayName },
      idempotencyKey: `demo-athlete-${displayName.toLowerCase().replaceAll(" ", "-")}`,
    }))
  );
}

async function ensureMovement(workspaceId, canonicalName, modality) {
  const rows = await list(`/api/v1/movements?workspaceId=${workspaceId}`);
  return (
    rows.find(
      (row) =>
        row?.canonicalName === canonicalName || row?.name === canonicalName,
    ) ??
    (await api("/api/v1/movements", {
      method: "POST",
      body: {
        workspaceId,
        canonicalName,
        modality,
        ...(modality === "strength"
          ? { movementPattern: "squat", equipmentTags: ["barbell", "rack"] }
          : {}),
      },
      idempotencyKey: `demo-movement-${canonicalName.toLowerCase().replaceAll(" ", "-")}`,
    }))
  );
}

function prescriptionBlocks(strengthMovementId, mobilityMovementId) {
  const strengthExerciseId = randomUUID();
  const strengthSetId = randomUUID();
  const enduranceSegmentId = randomUUID();
  const mobilityItemId = randomUUID();
  return {
    ids: {
      strengthExerciseId,
      strengthSetId,
      enduranceSegmentId,
      mobilityItemId,
    },
    blocks: [
      {
        id: randomUUID(),
        kind: "strength",
        ordinal: 1,
        exercises: [
          {
            id: strengthExerciseId,
            movementId: strengthMovementId,
            ordinal: 1,
            sets: [
              {
                id: strengthSetId,
                ordinal: 1,
                targetRepMin: 5,
                targetRepMax: 5,
                targetLoadKg: 135,
              },
              {
                id: randomUUID(),
                ordinal: 2,
                targetRepMin: 5,
                targetRepMax: 5,
                targetLoadKg: 135,
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
            movementId: mobilityMovementId,
            ordinal: 1,
            sets: 2,
            reps: 8,
            holdSeconds: 30,
            side: "bilateral",
          },
        ],
      },
    ],
  };
}

async function ensurePlan(workspaceId, athleteId) {
  const title = "Demo Strength and Velocity Cycle";
  const rows = await list(
    `/api/v1/training-plans?workspaceId=${workspaceId}&athleteId=${athleteId}`,
  );
  return (
    findBy(rows, "title", title) ??
    (await api("/api/v1/training-plans", {
      method: "POST",
      body: {
        workspaceId,
        athleteId,
        title,
        description:
          "Synthetic demonstration plan for strength, VBT, and monitoring flows.",
        startsOn: "2026-08-01",
        endsOn: "2026-09-30",
        timeZone,
      },
    }))
  );
}

async function ensureSession(
  workspaceId,
  planId,
  title,
  scheduledLocalDate,
  movementIds,
) {
  const rows = await list(
    `/api/v1/session-prescriptions?workspaceId=${workspaceId}&planId=${planId}`,
  );
  const existing = findBy(rows, "title", title);
  if (existing !== undefined) return { session: existing, ids: null };
  const blocks = prescriptionBlocks(movementIds.strength, movementIds.mobility);
  const session = await api("/api/v1/session-prescriptions", {
    method: "POST",
    body: {
      workspaceId,
      planId,
      scheduledLocalDate,
      timeZone,
      title,
      blocks: blocks.blocks,
    },
  });
  return { session, ids: blocks.ids };
}

async function publishPlan(workspaceId, plan) {
  if (plan?.publishedRevision !== null && plan?.publishedRevision !== undefined)
    return;
  await api(`/api/v1/training-plans/${idOf(plan, "plan")}/publish`, {
    method: "POST",
    body: { workspaceId, expectedVersion: plan.version },
    idempotencyKey: "demo-plan-publish",
  });
}

async function ensureCompletedExecution(
  workspaceId,
  athleteId,
  plan,
  sessionParts,
  movementIds,
) {
  const rows = await list(
    `/api/v1/session-executions?workspaceId=${workspaceId}&athleteId=${athleteId}`,
  );
  const existing = rows.find((row) =>
    String(row?.status ?? "")
      .toUpperCase()
      .includes("COMPLETED"),
  );
  if (existing !== undefined) return existing;
  if (sessionParts.ids === null) {
    throw new Error(
      "The existing demo session has no seed block identifiers; reset the demo database and rerun the seed.",
    );
  }
  let execution = await api("/api/v1/session-executions", {
    method: "POST",
    body: {
      workspaceId,
      prescriptionId: idOf(sessionParts.session, "session prescription"),
      prescriptionRevision: Number(plan.publishedRevision ?? 1),
      timeZone,
    },
    idempotencyKey: "demo-completed-execution",
  });
  const executionId = idOf(execution, "execution");
  execution = (
    await api(`/api/v1/session-executions/${executionId}/strength-sets`, {
      method: "POST",
      body: {
        workspaceId,
        expectedVersion: execution.version,
        movementId: movementIds.strength,
        prescriptionExerciseId: sessionParts.ids.strengthExerciseId,
        prescriptionSetId: sessionParts.ids.strengthSetId,
        repetitions: 5,
        loadKg: 132.5,
        rpe: 8,
        notes: "Synthetic velocity-aware strength result.",
      },
      idempotencyKey: "demo-strength-set",
    })
  ).session;
  execution = (
    await api(`/api/v1/session-executions/${executionId}/endurance-segments`, {
      method: "POST",
      body: {
        workspaceId,
        expectedVersion: execution.version,
        prescriptionSegmentId: sessionParts.ids.enduranceSegmentId,
        modality: "run",
        durationSeconds: 600,
      },
      idempotencyKey: "demo-endurance-segment",
    })
  ).session;
  execution = (
    await api(`/api/v1/session-executions/${executionId}/mobility-items`, {
      method: "POST",
      body: {
        workspaceId,
        expectedVersion: execution.version,
        movementId: movementIds.mobility,
        prescriptionItemId: sessionParts.ids.mobilityItemId,
        repetitions: 8,
        durationSeconds: 30,
        side: "bilateral",
      },
      idempotencyKey: "demo-mobility-item",
    })
  ).session;
  execution = (
    await api(`/api/v1/session-executions/${executionId}/observations`, {
      method: "POST",
      body: {
        workspaceId,
        expectedVersion: execution.version,
        kind: "note",
        valueText:
          "Synthetic completed-session observation for monitoring history.",
      },
      idempotencyKey: "demo-session-observation",
    })
  ).session;
  return (
    await api(`/api/v1/session-executions/${executionId}/complete`, {
      method: "POST",
      body: { workspaceId, expectedVersion: execution.version },
      idempotencyKey: "demo-complete-execution",
    })
  ).session;
}

function quantity(value, unit, dimension) {
  return { kind: "PRESENT", value: { value, unit, dimension } };
}

async function ensureAssessment(workspaceId, athleteId) {
  const assessments = await list(
    `/api/v1/assessments?workspaceId=${workspaceId}&athleteId=${athleteId}`,
  );
  let assessment = findBy(
    assessments,
    "assessmentType",
    "Synthetic VBT and strength assessment",
  );
  if (assessment === undefined) {
    assessment = await api("/api/v1/assessments", {
      method: "POST",
      body: {
        workspaceId,
        athleteId,
        assessmentType: "Synthetic VBT and strength assessment",
        purpose:
          "Demonstrate assessment, velocity, and strength-test data flows.",
        occurrenceDate: "2026-08-18",
        timeZone,
        notes: "Synthetic demonstration record only.",
      },
      idempotencyKey: "demo-assessment",
    });
  }
  const assessmentId = idOf(assessment, "assessment");
  let details = await api(
    `/api/v1/assessments/${assessmentId}?workspaceId=${workspaceId}&athleteId=${athleteId}`,
  );
  const trials = Array.isArray(details?.trials) ? details.trials : [];
  let trial = trials[0];
  if (trial === undefined) {
    trial = await api(`/api/v1/assessments/${assessmentId}/trials`, {
      method: "POST",
      body: {
        workspaceId,
        ordinal: 1,
        validity: "VALID",
        exclusion: "INCLUDED",
      },
      idempotencyKey: "demo-assessment-trial",
    });
  }

  const metricDefinitions = await list(
    `/api/v1/assessment-metric-definitions?workspaceId=${workspaceId}`,
  );
  const metricSpecs = [
    ["demo-mean-velocity", "Mean concentric velocity", "speed"],
    ["demo-peak-velocity", "Peak concentric velocity", "speed"],
    ["demo-external-load", "External load", "mass"],
    ["demo-estimated-1rm", "Estimated one-rep maximum", "mass"],
  ];
  const metrics = [];
  for (const [key, displayName, expectedDimension] of metricSpecs) {
    let metric = findBy(metricDefinitions, "key", key);
    if (metric === undefined) {
      metric = await api("/api/v1/assessment-metric-definitions", {
        method: "POST",
        body: {
          workspaceId,
          key,
          revision: 1,
          displayName,
          expectedDimension,
          resultScope: "TRIAL",
        },
        idempotencyKey: `demo-metric-${key}`,
      });
    }
    metrics.push(metric);
  }

  details = await api(
    `/api/v1/assessments/${assessmentId}?workspaceId=${workspaceId}&athleteId=${athleteId}`,
  );
  const observations = Array.isArray(details?.observations)
    ? details.observations
    : [];
  if (observations.length === 0) {
    const observationsToCreate = [
      ["mean_concentric_velocity", quantity(0.72, "m/s", "speed")],
      ["peak_concentric_velocity", quantity(1.15, "m/s", "speed")],
      ["external_load", quantity(132.5, "kg", "mass")],
      ["successful_repetitions", quantity(5, "count", "count")],
    ];
    for (const [observationKey, value] of observationsToCreate) {
      await api(`/api/v1/assessments/${assessmentId}/observations`, {
        method: "POST",
        body: {
          workspaceId,
          trialId: idOf(trial, "assessment trial"),
          observationKey,
          value,
          observedAt: "2026-08-18T19:00:00.000Z",
          metadata: { synthetic: true, source: "demo-seed" },
        },
        idempotencyKey: `demo-observation-${observationKey}`,
      });
    }
  }

  const results = Array.isArray(details?.results) ? details.results : [];
  if (results.length === 0) {
    const resultValues = [0.72, 1.15, 132.5, 155];
    for (let index = 0; index < metrics.length; index += 1) {
      await api(`/api/v1/assessments/${assessmentId}/results`, {
        method: "POST",
        body: {
          workspaceId,
          trialId: idOf(trial, "assessment trial"),
          metricDefinitionId: idOf(metrics[index], "metric definition"),
          value: quantity(
            resultValues[index],
            index < 2 ? "m/s" : "kg",
            index < 2 ? "speed" : "mass",
          ),
          origin: index === 3 ? "DERIVED_NEUTRAL" : "MEASURED",
          sourceClass:
            index === 3 ? "SYSTEM_DERIVED_NEUTRAL" : "DEVICE_CAPTURE",
          provenance: {
            sourceClass:
              index === 3 ? "SYSTEM_DERIVED_NEUTRAL" : "DEVICE_CAPTURE",
            sourceReference:
              index === 3
                ? "synthetic-demo-calculation"
                : "synthetic-demo-device",
            sourceId: null,
            sourceArtifactIds: [],
            protocolRevision: null,
            origin: index === 3 ? "SYSTEM" : "DEVICE",
            actorId: null,
            capturedAt: "2026-08-18T19:00:00.000Z",
            ingestedAt: "2026-08-18T19:00:00.000Z",
            createdAt: "2026-08-18T19:00:00.000Z",
            parentEvidenceIds: [],
            supersedesEvidenceId: null,
          },
        },
        idempotencyKey: `demo-result-${index}`,
      });
    }
  }
  return { id: assessmentId, trialId: idOf(trial, "assessment trial") };
}

async function main() {
  await authenticate();
  const workspace = await ensureWorkspace();
  const workspaceId = idOf(workspace, "workspace");
  const athletes = [];
  for (const name of athleteNames) {
    athletes.push(await ensureAthlete(workspaceId, name));
  }
  const movementRows = {
    strength: await ensureMovement(
      workspaceId,
      movementNames.strength,
      "strength",
    ),
    endurance: await ensureMovement(
      workspaceId,
      movementNames.endurance,
      "endurance",
    ),
    mobility: await ensureMovement(
      workspaceId,
      movementNames.mobility,
      "mobility",
    ),
  };
  const movementIds = {
    strength: idOf(movementRows.strength, "strength movement"),
    endurance: idOf(movementRows.endurance, "endurance movement"),
    mobility: idOf(movementRows.mobility, "mobility movement"),
  };
  const athleteId = idOf(athletes[0], "primary athlete");
  const plan = await ensurePlan(workspaceId, athleteId);
  const planId = idOf(plan, "training plan");
  const historicalSession = await ensureSession(
    workspaceId,
    planId,
    "Demo completed strength and VBT session",
    "2026-08-18",
    movementIds,
  );
  await ensureSession(
    workspaceId,
    planId,
    "Demo velocity-loss monitoring session",
    "2026-08-20",
    movementIds,
  );
  await ensureSession(
    workspaceId,
    planId,
    "Demo recovery and mobility session",
    "2026-08-22",
    movementIds,
  );
  await publishPlan(workspaceId, plan);
  const execution = await ensureCompletedExecution(
    workspaceId,
    athleteId,
    plan,
    historicalSession,
    movementIds,
  );
  const assessment = await ensureAssessment(workspaceId, athleteId);
  console.log(
    JSON.stringify(
      {
        status: "seeded",
        appUrl: baseUrl,
        workspaceId,
        athleteIds: athletes.map((athlete) => athlete.id),
        planId,
        completedExecutionId: execution.id,
        assessmentId: assessment.id,
        assessmentTrialId: assessment.trialId,
        syntheticOnly: true,
      },
      null,
      2,
    ),
  );
}

await main();
