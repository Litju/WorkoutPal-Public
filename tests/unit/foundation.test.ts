import { createWorkspace, isActiveWorkspaceMember } from "@workoutpal/accounts";
import {
  AGENT_TOOL_CATALOG,
  approveChangeProposal,
  createChangeProposal,
} from "@workoutpal/agent-operations";
import { createAthleteProfile } from "@workoutpal/athletes";
import { createBetterAuthAdapter } from "@workoutpal/auth-better-auth";
import { summarizePlanActual } from "@workoutpal/monitoring";
import { readPostgresConnectionConfig } from "@workoutpal/persistence-postgres";
import {
  NotImplementedScienceAdapter,
  SCIENCE_NOT_IMPLEMENTED,
} from "@workoutpal/science-contract";
import {
  createTrainingPlan,
  publishTrainingPlan,
} from "@workoutpal/training-design";
import {
  createExecutionAmendment,
  startExecutedSession,
} from "@workoutpal/training-execution";
import { describe, expect, it } from "vitest";

const workspaceId = "00000000-0000-7000-8000-000000000001" as never;
const athleteId = "00000000-0000-7000-8000-000000000002" as never;
const actorId = "00000000-0000-7000-8000-000000000003" as never;
const planId = "00000000-0000-7000-8000-000000000004" as never;
const sessionId = "00000000-0000-7000-8000-000000000005" as never;
const factId = "00000000-0000-7000-8000-000000000006" as never;
const instant = "2026-08-10T00:00:00.000Z" as never;
const localDate = "2026-08-10" as never;
const timeZone = "America/Argentina/Buenos_Aires" as never;

describe("F1 domain and adapter boundaries", () => {
  it("keeps workspace membership and athlete identity separate", () => {
    const workspace = createWorkspace({
      id: workspaceId,
      name: "Coach workspace",
      createdAt: instant,
      createdBy: actorId,
    });
    const membership = {
      id: actorId,
      workspaceId,
      principalId: actorId,
      role: "coach" as const,
      status: "active" as const,
    };
    const athlete = createAthleteProfile({
      id: athleteId,
      workspaceId,
      displayName: "Athlete without a login",
      createdAt: instant,
    });

    expect(workspace.version).toBe(1);
    expect(isActiveWorkspaceMember(membership, workspace.id, actorId)).toBe(
      true,
    );
    expect(athlete.linkedUserId).toBeNull();
  });

  it("increments a mutable plan version on publication", () => {
    const draft = createTrainingPlan({
      id: planId,
      workspaceId,
      athleteId,
      title: "Foundation plan",
      startsOn: localDate,
      endsOn: "2026-08-31" as never,
    });

    const published = publishTrainingPlan(draft);
    expect(published.status).toBe("published");
    expect(published.version).toBe(2);
    expect(draft.status).toBe("draft");
  });

  it("preserves performed facts by creating an amendment instead of rewriting them", () => {
    const session = startExecutedSession({
      id: sessionId,
      workspaceId,
      athleteId,
      startedAt: instant,
      timeZone,
    });
    const amendment = createExecutionAmendment({
      id: factId,
      workspaceId,
      factId,
      actorId,
      reason: "Corrected an entry after reviewing the session record.",
      correctedFields: { repetitions: 8 },
      occurredAt: instant,
    });

    expect(session.facts).toHaveLength(0);
    expect(amendment.factId).toBe(factId);
    expect(amendment.reason).toContain("Corrected");
  });

  it("distinguishes absent plan items from completed items", () => {
    expect(
      summarizePlanActual({ workspaceId, plannedCount: 4, completedCount: 3 }),
    ).toEqual({
      workspaceId,
      plannedCount: 4,
      completedCount: 3,
      absentCount: 1,
    });
  });

  it("keeps agent authority on domain verbs and binds approval to trusted context", () => {
    const names = AGENT_TOOL_CATALOG.map((tool) => tool.name);
    expect(names).not.toContain("run_sql");
    expect(names).not.toContain("shell");

    const actor = { actorId, workspaceId, actorType: "HUMAN" as const };
    const proposal = createChangeProposal({
      id: factId,
      actor,
      sessionId: "agent-session-1",
      commandType: "session_prescription.move",
      commandSchemaVersion: "1",
      payload: { scheduledLocalDate: "2026-08-11" },
      expectedVersions: { [planId]: 1 },
      rationale: "Move one prescribed session after review.",
      createdAt: instant,
      expiresAt: "2026-08-10T01:00:00.000Z" as never,
    });
    const approved = approveChangeProposal(proposal, actor, instant);

    expect(proposal.workspaceId).toBe(workspaceId);
    expect(approved.status).toBe("APPROVED");
    expect(approved.approvedBy).toBe(actorId);
  });

  it("returns an explicit non-computed SciencePort state with no value", async () => {
    const adapter = new NotImplementedScienceAdapter();
    const result = await adapter.compute({
      requestId: "00000000-0000-7000-8000-000000000007",
      capabilityId: "future.capability",
      inputs: {},
      inputProvenance: [],
    });

    expect(result.status).toBe(SCIENCE_NOT_IMPLEMENTED);
    expect(result.status).toBe("not_implemented");
    expect(Object.hasOwn(result, "value")).toBe(false);
  });

  it("keeps the real Better Auth adapter behind the public identity boundary", async () => {
    const adapter = createBetterAuthAdapter({
      databaseUrl:
        "postgresql://workoutpal:workoutpal_dev@127.0.0.1:55432/workoutpal",
    });
    expect(adapter.status).toBe("CONFIGURED");
    expect(() => readPostgresConnectionConfig({})).toThrow("DATABASE_URL");
    await adapter.close();
  });
});
