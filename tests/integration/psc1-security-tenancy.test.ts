import {
  createF2Application,
  createF3Application,
  type F2Application,
  type F3Application,
} from "@workoutpal/application";
import {
  createPostgresF2Persistence,
  readPostgresConnectionConfig,
} from "@workoutpal/persistence-postgres";
import type { AthleteId, UUID, WorkspaceId } from "@workoutpal/shared-kernel";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://workoutpal_runtime_login:workoutpal_runtime_dev@127.0.0.1:55432/workoutpal";
const connectionConfig = readPostgresConnectionConfig({
  DATABASE_URL: databaseUrl,
});

type Fixture = Readonly<{
  readonly workspaceId: WorkspaceId;
  readonly athleteId: AthleteId;
  readonly movementId: UUID;
  readonly sessionId: UUID;
  readonly blockId: UUID;
}>;

let persistence: ReturnType<typeof createPostgresF2Persistence>;
let foundation: F2Application;
let design: F3Application;
let client: Client;

function id(): UUID {
  return crypto.randomUUID() as UUID;
}

async function setContext(
  principalId: UUID,
  workspaceId: WorkspaceId,
): Promise<void> {
  await client.query(
    `SELECT
       set_config('workoutpal.principal_id', $1, true),
       set_config('workoutpal.workspace_id', $2, true)`,
    [principalId, workspaceId],
  );
}

async function readInContext<T>(
  principalId: UUID,
  workspaceId: WorkspaceId,
  work: () => Promise<T>,
): Promise<T> {
  await client.query("BEGIN");
  try {
    await setContext(principalId, workspaceId);
    return await work();
  } finally {
    await client.query("ROLLBACK");
  }
}

async function expectDenied(
  principalId: UUID,
  workspaceId: WorkspaceId,
  text: string,
  values: readonly unknown[],
): Promise<void> {
  await client.query("BEGIN");
  try {
    await setContext(principalId, workspaceId);
    await expect(client.query(text, values)).rejects.toThrow();
  } finally {
    await client.query("ROLLBACK");
  }
}

async function createFixture(
  principalId: UUID,
  label: string,
): Promise<Fixture> {
  const workspace = await foundation.createWorkspace({
    principalId,
    requestId: `${label}-workspace`,
    name: `${label} ${id()}`,
  });
  const athlete = await foundation.createAthlete({
    principalId,
    requestId: `${label}-athlete`,
    workspaceId: workspace.id,
    displayName: `${label} athlete`,
    idempotencyKey: `${label}-${id()}`,
  });
  const movement = await design.createWorkspaceMovement({
    principalId,
    requestId: `${label}-movement`,
    workspaceId: workspace.id,
    canonicalName: `${label} movement`,
    modality: "strength",
  });
  const plan = await design.createTrainingPlan({
    principalId,
    requestId: `${label}-plan`,
    workspaceId: workspace.id,
    athleteId: athlete.id,
    title: `${label} plan`,
    startsOn: "2026-09-01" as never,
    endsOn: "2026-09-30" as never,
    timeZone: "UTC" as never,
  });
  const blockId = id();
  const session = await design.createSessionPrescription({
    principalId,
    requestId: `${label}-session`,
    workspaceId: workspace.id,
    planId: plan.id,
    scheduledLocalDate: "2026-09-04" as never,
    timeZone: "UTC" as never,
    title: `${label} session`,
    blocks: [
      {
        id: blockId,
        kind: "strength",
        ordinal: 1,
        exercises: [
          {
            id: id(),
            movementId: movement.id,
            ordinal: 1,
            sets: [{ id: id(), ordinal: 1, targetRepMin: 5 }],
          },
        ],
      },
    ],
  });
  return {
    workspaceId: workspace.id,
    athleteId: athlete.id,
    movementId: movement.id,
    sessionId: session.id,
    blockId,
  };
}

describe("PSC1 live tenant isolation and referential integrity", () => {
  beforeAll(async () => {
    persistence = createPostgresF2Persistence({
      ...connectionConfig,
      applicationName: "workoutpal-psc1-security",
    });
    foundation = createF2Application(persistence);
    design = createF3Application({ transaction: persistence.f3Transaction });
    client = new Client({
      connectionString: connectionConfig.url,
      application_name: "workoutpal-psc1-security-sentinel",
      ssl: connectionConfig.ssl,
    });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
    await persistence.close();
  });

  it("keeps tenant rows isolated even when a repository predicate is missing", async () => {
    const ownerA = id();
    const ownerB = id();
    const fixtureA = await createFixture(ownerA, "PSC1 A");
    const fixtureB = await createFixture(ownerB, "PSC1 B");

    const visibleToA = await readInContext(
      ownerA,
      fixtureA.workspaceId,
      async () =>
        client.query<{ readonly id: AthleteId }>(
          "SELECT id FROM athlete.profile ORDER BY id",
        ),
    );
    expect(visibleToA.rows.map((row) => row.id)).toContain(fixtureA.athleteId);
    expect(visibleToA.rows.map((row) => row.id)).not.toContain(
      fixtureB.athleteId,
    );

    const wrongWorkspace = await readInContext(
      ownerA,
      fixtureB.workspaceId,
      async () =>
        client.query<{ readonly id: AthleteId }>(
          "SELECT id FROM athlete.profile",
        ),
    );
    expect(wrongWorkspace.rows).toEqual([]);

    const guessedUuid = await readInContext(
      ownerA,
      fixtureA.workspaceId,
      async () =>
        client.query("SELECT id FROM athlete.profile WHERE id = $1", [id()]),
    );
    expect(guessedUuid.rows).toEqual([]);

    await expectDenied(
      ownerA,
      fixtureA.workspaceId,
      `INSERT INTO athlete.profile
         (id, workspace_id, display_name, created_at, created_by, updated_at, updated_by)
       VALUES ($1, $2, 'cross-tenant', now(), $3, now(), $3)`,
      [id(), fixtureB.workspaceId, ownerA],
    );
  });

  it("scopes idempotency retries to the selected workspace", async () => {
    const principalId = id();
    const workspaceA = await foundation.createWorkspace({
      principalId,
      requestId: "psc1-idempotency-workspace-a",
      name: `PSC1 idempotency A ${id()}`,
    });
    const workspaceB = await foundation.createWorkspace({
      principalId,
      requestId: "psc1-idempotency-workspace-b",
      name: `PSC1 idempotency B ${id()}`,
    });
    const key = `psc1-same-principal-key-${id()}`;
    const first = await foundation.createAthlete({
      principalId,
      requestId: "psc1-idempotency-create-a",
      workspaceId: workspaceA.id,
      displayName: "Workspace A athlete",
      idempotencyKey: key,
    });
    const second = await foundation.createAthlete({
      principalId,
      requestId: "psc1-idempotency-create-b",
      workspaceId: workspaceB.id,
      displayName: "Workspace B athlete",
      idempotencyKey: key,
    });

    expect(second.id).not.toBe(first.id);
    expect(first.workspaceId).toBe(workspaceA.id);
    expect(second.workspaceId).toBe(workspaceB.id);

    const persisted = await readInContext(
      principalId,
      workspaceB.id,
      async () =>
        client.query<{ readonly workspace_id: WorkspaceId }>(
          `SELECT workspace_id
             FROM iam.idempotency_record
            WHERE operation = 'athlete.create' AND idempotency_key = $1`,
          [key],
        ),
    );
    expect(persisted.rows).toEqual([{ workspace_id: workspaceB.id }]);
  });

  it("rejects cross-workspace movement, athlete, and Agent target references", async () => {
    const ownerA = id();
    const ownerB = id();
    const fixtureA = await createFixture(ownerA, "PSC1 ref A");
    const fixtureB = await createFixture(ownerB, "PSC1 ref B");

    await expectDenied(
      ownerA,
      fixtureA.workspaceId,
      `INSERT INTO design.strength_exercise_prescription
         (id, workspace_id, block_id, movement_id, ordinal)
       VALUES ($1, $2, $3, $4, 99)`,
      [id(), fixtureA.workspaceId, fixtureA.blockId, fixtureB.movementId],
    );

    await expectDenied(
      ownerA,
      fixtureA.workspaceId,
      `INSERT INTO execution.session
         (id, workspace_id, athlete_id, prescription_id, prescription_version,
          prescription_revision, prescription_snapshot, snapshot_fingerprint,
          status, started_at, time_zone, created_at, created_by, updated_at, updated_by)
       VALUES ($1, $2, $3, $4, 1, 1, '{}'::jsonb, $5, 'started',
               now(), 'UTC', now(), $6, now(), $6)`,
      [
        id(),
        fixtureA.workspaceId,
        fixtureB.athleteId,
        fixtureA.sessionId,
        "0".repeat(64),
        ownerA,
      ],
    );

    await expectDenied(
      ownerA,
      fixtureA.workspaceId,
      `INSERT INTO agent.proposal
         (id, workspace_id, requesting_actor_id, agent_session_id, creation_key,
          operation_kind, target_aggregate_id, target_expected_version,
          normalized_command, command_digest, before_projection, after_projection,
          status, provenance, created_at, updated_at)
       VALUES ($1, $2, $3, 'psc1-session', $4, 'RESCHEDULE_SESSION_PRESCRIPTION',
               $5, 1, '{}'::jsonb, $6, '{}'::jsonb, '{}'::jsonb,
               'PENDING_APPROVAL', '{}'::jsonb, now(), now())`,
      [
        id(),
        fixtureA.workspaceId,
        ownerA,
        id(),
        fixtureB.sessionId,
        "0".repeat(64),
      ],
    );
  });
});
