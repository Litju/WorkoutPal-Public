import {
  createAgentReadToolSet,
  createGetAthleteTool,
} from "@workoutpal/agent-eve";
import {
  AgentReadFacade,
  type AgentReadQueryPort,
  AgentSessionSecurityError,
  createTrustedAgentSession,
  F6_AGENT_TOOL_CATALOG,
} from "@workoutpal/agent-operations";
import type { SessionMonitoringView } from "@workoutpal/monitoring";
import type { ExecutedSession } from "@workoutpal/training-execution";
import { describe, expect, it, vi } from "vitest";

const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as never;
const actorId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc" as never;
const athleteId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" as never;
const sessionId = "11111111-1111-4111-8111-111111111111" as never;
const prescriptionId = "22222222-2222-4222-8222-222222222222" as never;
const factId = "33333333-3333-4333-8333-333333333333" as never;
const amendmentId = "44444444-4444-4444-8444-444444444444" as never;
const instant = "2026-08-10T12:00:00.000Z" as never;

function trustedSession() {
  return createTrustedAgentSession({
    current: {
      principalId: actorId,
      principalType: "user",
      attributes: { workspaceId, role: "coach" },
    },
    initiator: {
      principalId: actorId,
      principalType: "user",
      attributes: { workspaceId, role: "coach" },
    },
  });
}

function executedSession(): ExecutedSession {
  return {
    id: sessionId,
    workspaceId,
    athleteId,
    status: "completed",
    startedAt: instant,
    completedAt: instant,
    timeZone: "UTC" as never,
    prescription: {
      prescriptionId,
      prescriptionVersion: 3,
      prescriptionRevision: 2,
      snapshotFingerprint: "sha256:test",
      snapshot: { secretInternalBlock: "must not cross the DTO boundary" },
    },
    createdAt: instant,
    createdBy: actorId,
    updatedAt: instant,
    updatedBy: actorId,
    version: 4,
    facts: [],
  };
}

function monitoringView(): SessionMonitoringView {
  const provenance = {
    workspaceId,
    prescriptionId,
    prescriptionVersion: 3,
    prescriptionRevision: 2,
    prescriptionSnapshotFingerprint: "sha256:test",
    executionId: sessionId,
    performedFactId: factId,
    sourceTimestamp: instant,
    amendmentIds: [amendmentId],
  };
  return {
    id: sessionId,
    workspaceId,
    athleteId,
    title: "Strength",
    scheduledLocalDate: "2026-08-10" as never,
    classification: "PRESCRIBED_COMPLETED",
    prescriptionId,
    executionId: sessionId,
    executionStatus: "completed",
    counts: {
      prescribedStrengthSetCount: 1,
      performedStrengthSetCount: 1,
      prescribedEnduranceSegmentCount: 0,
      performedEnduranceSegmentCount: 0,
      prescribedMobilityItemCount: 0,
      performedMobilityItemCount: 0,
      amendedPerformedFactCount: 1,
    },
    timeZone: "UTC" as never,
    prescription: {
      prescriptionId,
      prescriptionVersion: 3,
      prescriptionRevision: 2,
      snapshotFingerprint: "sha256:test",
      scheduledLocalDate: "2026-08-10" as never,
      timeZone: "UTC" as never,
    },
    execution: {
      executionId: sessionId,
      status: "completed",
      startedAt: instant,
      completedAt: instant,
      timeZone: "UTC" as never,
    },
    strength: [
      {
        movementName: "Squat",
        status: "DIFFERENT",
        provenance,
        amendments: [
          {
            amendmentId,
            factId,
            factKind: "strength-set",
            actorId,
            reason: "Corrected transcription",
            originalValues: { performedRepetitions: 4 },
            correctedFields: { performedRepetitions: 5 },
            occurredAt: instant,
          },
        ],
      },
    ],
    endurance: [],
    mobility: [],
    observations: [
      {
        id: factId,
        workspaceId,
        executionId: sessionId,
        observedAt: instant,
        kind: "note",
        valueText: "Recorded",
        valueNumber: null,
        unit: null,
        notes: null,
        provenance,
      },
    ],
    amendments: [
      {
        amendmentId,
        factId,
        factKind: "strength-set",
        actorId,
        reason: "Corrected transcription",
        originalValues: { performedRepetitions: 4 },
        correctedFields: { performedRepetitions: 5 },
        occurredAt: instant,
      },
    ],
  } as unknown as SessionMonitoringView;
}

describe("F6 agent contracts", () => {
  it("exposes exactly the authored read tools and no disabled mutation tools", () => {
    const tools = createAgentReadToolSet({
      createReadFacade: vi.fn() as never,
    });
    expect(Object.keys(tools)).toEqual(
      F6_AGENT_TOOL_CATALOG.map((tool) => tool.name),
    );
    expect(Object.keys(tools)).not.toEqual(
      expect.arrayContaining(["bash", "read_file", "write_file", "run_sql"]),
    );
    expect(Object.values(tools).every((tool) => tool !== undefined)).toBe(true);
  });

  it("projects execution and monitoring DTOs without internal snapshot or actor scope fields", async () => {
    const session = executedSession();
    const queries = {
      getExecutionReview: vi.fn(async () => ({
        session,
        observations: [],
        amendments: [],
        effectiveFacts: [],
      })),
      listExecutedSessions: vi.fn(async () => [session]),
      getSessionMonitoring: vi.fn(async () => monitoringView()),
    } as unknown as AgentReadQueryPort;
    const facade = new AgentReadFacade(
      queries,
      trustedSession(),
      "f6-contract",
    );

    const review = await facade.getExecutionReview(sessionId);
    expect(review.data.session.prescription).toEqual({
      prescriptionId,
      prescriptionVersion: 3,
      prescriptionRevision: 2,
      snapshotFingerprint: "sha256:test",
    });
    expect(review.data.session.prescription).not.toHaveProperty("snapshot");

    const executed = await facade.listExecutedSessions(athleteId);
    expect(executed.data[0]?.prescription).not.toHaveProperty("snapshot");

    const monitoring = await facade.getSessionMonitoring(sessionId);
    expect(monitoring.data).not.toHaveProperty("workspaceId");
    expect(monitoring.data).not.toHaveProperty("athleteId");
    expect(monitoring.data.strength[0]?.provenance).not.toHaveProperty(
      "workspaceId",
    );
    expect(monitoring.data.strength[0]?.amendments[0]).not.toHaveProperty(
      "actorId",
    );
    expect(monitoring.data.observations[0]).not.toHaveProperty("workspaceId");
    expect(monitoring.data.observations[0]?.provenance).not.toHaveProperty(
      "workspaceId",
    );
  });

  it("returns structured auth/resource errors without exposing record existence", async () => {
    const context = {} as never;
    const authDenied = createGetAthleteTool({
      createReadFacade: () => {
        throw new AgentSessionSecurityError(
          "AGENT_AUTH_REQUIRED",
          "auth required",
        );
      },
    });
    await expect(
      authDenied.execute({ athleteId }, context),
    ).resolves.toMatchObject({
      ok: false,
      code: "AUTHENTICATION_REQUIRED",
    });

    const unavailable = createGetAthleteTool({
      createReadFacade: () => {
        throw new Error("record not found");
      },
    });
    await expect(
      unavailable.execute({ athleteId }, context),
    ).resolves.toMatchObject({
      ok: false,
      code: "RESOURCE_UNAVAILABLE",
    });
  });
});
