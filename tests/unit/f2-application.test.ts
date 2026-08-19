import type {
  Workspace,
  WorkspaceMemberDetails,
  WorkspaceMembership,
  WorkspacePreferences,
} from "@workoutpal/accounts";
import type {
  AuditEvent,
  F2Persistence,
  F2Repositories,
  IdempotencyRecord,
} from "@workoutpal/application";
import { ApplicationError, createF2Application } from "@workoutpal/application";
import type {
  AthleteProfile,
  AthleteTrainingContext,
  CoachAssignment,
} from "@workoutpal/athletes";
import type {
  AthleteId,
  UUID,
  WorkspaceId,
  WorkspaceScope,
} from "@workoutpal/shared-kernel";
import { describe, expect, it } from "vitest";

const ownerId = "11111111-1111-4111-8111-111111111111" as UUID;
const otherId = "22222222-2222-4222-8222-222222222222" as UUID;
const workspaceB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as WorkspaceId;

function fakePersistence(): {
  readonly persistence: F2Persistence;
  readonly audit: AuditEvent[];
} {
  const workspaces = new Map<string, Workspace>();
  const memberships = new Map<string, WorkspaceMembership>();
  const athletes = new Map<string, AthleteProfile>();
  const contexts = new Map<string, AthleteTrainingContext>();
  const assignments = new Map<string, CoachAssignment>();
  const preferences = new Map<string, WorkspacePreferences>();
  const idempotency = new Map<string, IdempotencyRecord>();
  const audit: AuditEvent[] = [];

  const repositories: F2Repositories = {
    workspaces: {
      async get(scope: WorkspaceScope) {
        return workspaces.get(scope.workspaceId) ?? null;
      },
      async insert(workspace: Workspace) {
        workspaces.set(workspace.id, workspace);
      },
    },
    memberships: {
      async get(scope: WorkspaceScope, principalId: UUID) {
        return (
          [...memberships.values()].find(
            (item) =>
              item.workspaceId === scope.workspaceId &&
              item.principalId === principalId,
          ) ?? null
        );
      },
      async listForPrincipal(principalId: UUID) {
        return [...memberships.values()].filter(
          (item) => item.principalId === principalId,
        );
      },
      async insert(membership: WorkspaceMembership) {
        memberships.set(membership.id, membership);
      },
    },
    athletes: {
      async get(scope: WorkspaceScope, athleteId: AthleteId) {
        const item = athletes.get(athleteId);
        return item?.workspaceId === scope.workspaceId ? item : null;
      },
      async list(scope: WorkspaceScope, includeArchived: boolean) {
        return [...athletes.values()].filter(
          (item) =>
            item.workspaceId === scope.workspaceId &&
            (includeArchived || item.archivedAt === null),
        );
      },
      async insert(profile: AthleteProfile) {
        athletes.set(profile.id, profile);
      },
      async updateExpected(
        scope: WorkspaceScope,
        profile: AthleteProfile,
        expectedVersion: number,
      ) {
        const current = athletes.get(profile.id);
        if (
          current?.workspaceId !== scope.workspaceId ||
          current.version !== expectedVersion
        )
          return null;
        const updated = { ...profile, version: expectedVersion + 1 };
        athletes.set(profile.id, updated);
        return updated;
      },
    },
    athleteTrainingContexts: {
      async get(scope: WorkspaceScope, athleteId: AthleteId) {
        const item = contexts.get(`${scope.workspaceId}:${athleteId}`);
        return item ?? null;
      },
      async insert(context: AthleteTrainingContext) {
        contexts.set(`${context.workspaceId}:${context.athleteId}`, context);
      },
      async updateExpected(
        scope: WorkspaceScope,
        context: AthleteTrainingContext,
        expectedVersion: number,
      ) {
        const key = `${scope.workspaceId}:${context.athleteId}`;
        const current = contexts.get(key);
        if (current?.version !== expectedVersion) return null;
        const updated = { ...context, version: expectedVersion + 1 };
        contexts.set(key, updated);
        return updated;
      },
    },
    coachAssignments: {
      async listForAthlete(scope: WorkspaceScope, athleteId: AthleteId) {
        return [...assignments.values()].filter(
          (item) =>
            item.workspaceId === scope.workspaceId &&
            item.athleteId === athleteId,
        );
      },
      async exists(
        scope: WorkspaceScope,
        athleteId: AthleteId,
        coachPrincipalId: UUID,
      ) {
        return [...assignments.values()].some(
          (item) =>
            item.workspaceId === scope.workspaceId &&
            item.athleteId === athleteId &&
            item.coachPrincipalId === coachPrincipalId,
        );
      },
      async insert(assignment: CoachAssignment) {
        assignments.set(assignment.id, assignment);
      },
      async remove(
        scope: WorkspaceScope,
        athleteId: AthleteId,
        coachPrincipalId: UUID,
      ) {
        const found = [...assignments.values()].find(
          (item) =>
            item.workspaceId === scope.workspaceId &&
            item.athleteId === athleteId &&
            item.coachPrincipalId === coachPrincipalId,
        );
        if (found === undefined) return false;
        assignments.delete(found.id);
        return true;
      },
    },
    audit: {
      async append(event: AuditEvent) {
        audit.push(event);
      },
      async list(scope: WorkspaceScope, aggregateId?: UUID) {
        return audit.filter(
          (event) =>
            event.workspaceId === scope.workspaceId &&
            (aggregateId === undefined || event.aggregateId === aggregateId),
        );
      },
    },
    idempotency: {
      async find(
        workspaceId: WorkspaceId,
        actorId: UUID,
        operation: string,
        key: string,
      ) {
        return (
          idempotency.get(`${workspaceId}:${actorId}:${operation}:${key}`) ??
          null
        );
      },
      async reserve(record) {
        const id = `${record.workspaceId}:${record.actorId}:${record.operation}:${record.key}`;
        const existing = idempotency.get(id);
        if (existing !== undefined) return existing;
        idempotency.set(id, { ...record, outcome: null });
        return null;
      },
      async complete(
        workspaceId: WorkspaceId,
        actorId: UUID,
        operation: string,
        key: string,
        outcome: unknown,
      ) {
        const id = `${workspaceId}:${actorId}:${operation}:${key}`;
        const current = idempotency.get(id);
        if (current !== undefined) idempotency.set(id, { ...current, outcome });
      },
    },
    workspaceSettings: {
      async listMembers(
        scope: WorkspaceScope,
      ): Promise<readonly WorkspaceMemberDetails[]> {
        return [...memberships.values()]
          .filter((member) => member.workspaceId === scope.workspaceId)
          .map((member) => ({ ...member, displayName: null, email: null }));
      },
      async updateMemberRole(
        scope: WorkspaceScope,
        memberId: UUID,
        role: WorkspaceMembership["role"],
      ) {
        const current = memberships.get(memberId);
        if (current?.workspaceId !== scope.workspaceId) return null;
        const updated = { ...current, role };
        memberships.set(memberId, updated);
        return updated;
      },
      async suspendMember(scope: WorkspaceScope, memberId: UUID) {
        const current = memberships.get(memberId);
        if (current?.workspaceId !== scope.workspaceId) return null;
        const updated = { ...current, status: "suspended" as const };
        memberships.set(memberId, updated);
        return updated;
      },
      async getPreferences(scope: WorkspaceScope) {
        return preferences.get(scope.workspaceId) ?? null;
      },
      async insertPreferences(value: WorkspacePreferences) {
        preferences.set(value.workspaceId, value);
      },
      async updatePreferencesExpected(
        scope: WorkspaceScope,
        value: WorkspacePreferences,
        expectedVersion: number,
      ) {
        const current = preferences.get(scope.workspaceId);
        if (current?.version !== expectedVersion) return null;
        const updated = { ...value, version: expectedVersion + 1 };
        preferences.set(scope.workspaceId, updated);
        return updated;
      },
    },
    search: {
      async search() {
        return [];
      },
    },
  };

  return {
    persistence: {
      async transaction<T>(work: (repositories: F2Repositories) => Promise<T>) {
        return work(repositories);
      },
    },
    audit,
  };
}

describe("F2 application use cases", () => {
  it("bootstraps a workspace and owner membership in one application transaction", async () => {
    const fake = fakePersistence();
    const app = createF2Application(fake.persistence);
    const workspace = await app.createWorkspace({
      principalId: ownerId,
      requestId: "req-bootstrap",
      name: "Owner workspace",
    });
    expect(workspace.name).toBe("Owner workspace");
    expect(fake.audit.map((event) => event.action)).toEqual([
      "workspace.created",
      "workspace.membership_created",
    ]);
  });

  it("returns the same athlete outcome for a retry and rejects a changed payload", async () => {
    const fake = fakePersistence();
    const app = createF2Application(fake.persistence);
    const workspace = await app.createWorkspace({
      principalId: ownerId,
      requestId: "req-bootstrap",
      name: "Owner workspace",
    });
    const first = await app.createAthlete({
      principalId: ownerId,
      requestId: "req-create",
      workspaceId: workspace.id,
      displayName: "Alex",
      idempotencyKey: "create-alex",
    });
    const retry = await app.createAthlete({
      principalId: ownerId,
      requestId: "req-retry",
      workspaceId: workspace.id,
      displayName: "Alex",
      idempotencyKey: "create-alex",
    });
    expect(retry.id).toBe(first.id);
    await expect(
      app.createAthlete({
        principalId: ownerId,
        requestId: "req-conflict",
        workspaceId: workspace.id,
        displayName: "Different",
        idempotencyKey: "create-alex",
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("does not allow a principal from another workspace to use a guessed athlete scope", async () => {
    const fake = fakePersistence();
    const app = createF2Application(fake.persistence);
    await app.createWorkspace({
      principalId: ownerId,
      requestId: "req-a",
      name: "Workspace A",
    });
    await app.createWorkspace({
      principalId: otherId,
      requestId: "req-b",
      name: "Workspace B",
    });
    await expect(
      app.getWorkspace({
        principalId: ownerId,
        requestId: "req-cross",
        workspaceId: workspaceB,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("maps stale compare-and-set writes to VERSION_CONFLICT", async () => {
    const fake = fakePersistence();
    const app = createF2Application(fake.persistence);
    const workspace = await app.createWorkspace({
      principalId: ownerId,
      requestId: "req-bootstrap",
      name: "Owner workspace",
    });
    const athlete = await app.createAthlete({
      principalId: ownerId,
      requestId: "req-create",
      workspaceId: workspace.id,
      displayName: "Alex",
      idempotencyKey: "create-alex",
    });
    await app.updateAthlete({
      principalId: ownerId,
      requestId: "req-update",
      workspaceId: workspace.id,
      athleteId: athlete.id,
      expectedVersion: 1,
      displayName: "Alex Updated",
    });
    await expect(
      app.updateAthlete({
        principalId: ownerId,
        requestId: "req-stale",
        workspaceId: workspace.id,
        athleteId: athlete.id,
        expectedVersion: 1,
        displayName: "Stale Writer",
      }),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(new ApplicationError("VERSION_CONFLICT", "x").code).toBe(
      "VERSION_CONFLICT",
    );
  });

  it("persists operational context and display preferences through versioned seams", async () => {
    const fake = fakePersistence();
    const app = createF2Application(fake.persistence);
    const workspace = await app.createWorkspace({
      principalId: ownerId,
      requestId: "context-workspace",
      name: "Operational context workspace",
    });
    const athlete = await app.createAthlete({
      principalId: ownerId,
      requestId: "context-athlete",
      workspaceId: workspace.id,
      displayName: "Context athlete",
    });
    const context = await app.updateAthleteTrainingContext({
      principalId: ownerId,
      requestId: "context-create",
      workspaceId: workspace.id,
      athleteId: athlete.id,
      expectedVersion: 0,
      trainingAgeMonths: 12,
      availabilityNotes: "Tuesday evenings",
      equipmentAccess: ["bands"],
      idempotencyKey: "context-create-key",
    });
    expect(context.version).toBe(1);
    expect(
      await app.getAthleteTrainingContext({
        principalId: ownerId,
        requestId: "context-read",
        workspaceId: workspace.id,
        athleteId: athlete.id,
      }),
    ).toMatchObject({ availabilityNotes: "Tuesday evenings" });

    const preferences = await app.updateWorkspacePreferences({
      principalId: ownerId,
      requestId: "preferences-create",
      workspaceId: workspace.id,
      expectedVersion: 0,
      massUnit: "lb",
      distanceUnit: "mi",
      paceUnit: "per-mi",
      idempotencyKey: "preferences-create-key",
    });
    expect(preferences).toMatchObject({
      massUnit: "lb",
      distanceUnit: "mi",
      paceUnit: "per-mi",
      version: 1,
    });
    await expect(
      app.updateAthleteTrainingContext({
        principalId: ownerId,
        requestId: "context-stale",
        workspaceId: workspace.id,
        athleteId: athlete.id,
        expectedVersion: 0,
        availabilityNotes: "stale",
        idempotencyKey: "context-stale-key",
      }),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });
});
