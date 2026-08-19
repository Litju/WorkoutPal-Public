import {
  createF5Application,
  type F4Repositories,
} from "@workoutpal/application";
import type {
  AthleteId,
  IanaTimeZone,
  UUID,
  WorkspaceId,
} from "@workoutpal/shared-kernel";
import {
  type ExecutedSession,
  startExecutedSession,
} from "@workoutpal/training-execution";
import { describe, expect, it, vi } from "vitest";

const workspaceId = "11111111-1111-4111-8111-111111111111" as WorkspaceId;
const athleteId = "22222222-2222-4222-8222-222222222222" as AthleteId;
const principalId = "33333333-3333-4333-8333-333333333333" as UUID;
const timeZone = "UTC" as IanaTimeZone;

function execution(id: string, startedAt: string): ExecutedSession {
  return startExecutedSession({
    id: id as UUID,
    workspaceId,
    athleteId,
    startedAt: startedAt as never,
    timeZone,
  });
}

describe("F5 application query shape", () => {
  it("loads facts in batches instead of issuing one fact query per execution", async () => {
    const executions = [
      execution(
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "2026-09-01T10:00:00.000Z",
      ),
      execution(
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        "2026-09-02T10:00:00.000Z",
      ),
      execution(
        "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        "2026-09-03T10:00:00.000Z",
      ),
    ];
    const bulkCalls = {
      strength: 0,
      endurance: 0,
      mobility: 0,
      observations: 0,
      amendments: 0,
    };
    const repositories = {
      memberships: {
        get: vi.fn(async () => ({
          id: principalId,
          workspaceId,
          principalId,
          role: "owner" as const,
          status: "active" as const,
        })),
      },
      athletes: {
        get: vi.fn(async () => ({
          id: athleteId,
          workspaceId,
          displayName: "F5 athlete",
          linkedUserId: null,
        })),
      },
      coachAssignments: {
        listForAthlete: vi.fn(async () => []),
      },
      movements: {
        listVisible: vi.fn(async () => []),
      },
      sessionPrescriptions: {
        listPublishedForAthlete: vi.fn(async () => []),
      },
      executedSessions: {
        listForAthlete: vi.fn(async () => executions),
      },
      performedStrengthSets: {
        listForSessions: vi.fn(async () => {
          bulkCalls.strength += 1;
          return [];
        }),
      },
      performedEnduranceSegments: {
        listForSessions: vi.fn(async () => {
          bulkCalls.endurance += 1;
          return [];
        }),
      },
      performedMobilityItems: {
        listForSessions: vi.fn(async () => {
          bulkCalls.mobility += 1;
          return [];
        }),
      },
      sessionObservations: {
        listForSessions: vi.fn(async () => {
          bulkCalls.observations += 1;
          return [];
        }),
      },
      executionAmendments: {
        listForSessions: vi.fn(async () => {
          bulkCalls.amendments += 1;
          return [];
        }),
      },
    } as unknown as F4Repositories;
    const application = createF5Application({
      transaction: async (work) => work(repositories),
    });

    const overview = await application.getAthleteMonitoringOverview({
      principalId,
      requestId: "f5-performance",
      workspaceId,
      athleteId,
      startDate: "2026-09-01" as never,
      endDate: "2026-09-07" as never,
      timeZone,
    });

    expect(overview.unplannedSessionCount).toBe(3);
    expect(bulkCalls).toEqual({
      strength: 1,
      endurance: 1,
      mobility: 1,
      observations: 1,
      amendments: 1,
    });
  });
});
