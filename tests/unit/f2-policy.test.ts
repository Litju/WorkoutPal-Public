import {
  canAccessAthlete,
  canAccessWorkspace,
  type WorkspaceMembership,
} from "@workoutpal/accounts";
import type { UUID, WorkspaceId } from "@workoutpal/shared-kernel";
import { describe, expect, it } from "vitest";

const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as WorkspaceId;
const ownerId = "11111111-1111-4111-8111-111111111111" as UUID;
const coachId = "22222222-2222-4222-8222-222222222222" as UUID;
const otherId = "33333333-3333-4333-8333-333333333333" as UUID;

function membership(role: WorkspaceMembership["role"]): WorkspaceMembership {
  return {
    id: ownerId,
    workspaceId,
    principalId: ownerId,
    role,
    status: "active",
  };
}

describe("F2 authorization policy", () => {
  it("covers the complete coarse role matrix for F2 actions", () => {
    const actions = [
      "workspace.read",
      "workspace.manage",
      "athlete.list",
      "athlete.read",
      "athlete.create",
      "athlete.update",
      "athlete.archive",
      "coach-assignment.manage",
    ] as const;
    const expected: Record<
      WorkspaceMembership["role"],
      readonly (typeof actions)[number][]
    > = {
      owner: actions,
      coach: [
        "workspace.read",
        "athlete.list",
        "athlete.read",
        "athlete.create",
        "athlete.update",
        "athlete.archive",
      ],
      athlete: [
        "workspace.read",
        "athlete.list",
        "athlete.read",
        "athlete.update",
      ],
      viewer: ["workspace.read", "athlete.list", "athlete.read"],
    };

    for (const role of Object.keys(expected) as WorkspaceMembership["role"][]) {
      for (const action of actions) {
        expect(canAccessWorkspace(membership(role), action)).toBe(
          expected[role].includes(action),
        );
      }
    }
  });

  it("keeps role vocabulary separate from athlete assignment authority", () => {
    const subject = {
      workspaceId,
      linkedUserId: null,
      assignedCoachIds: [coachId],
    };
    expect(canAccessWorkspace(membership("coach"), "athlete.update")).toBe(
      true,
    );
    expect(
      canAccessAthlete(membership("coach"), coachId, "athlete.update", subject),
    ).toBe(true);
    expect(
      canAccessAthlete(membership("coach"), otherId, "athlete.update", subject),
    ).toBe(false);
  });

  it("gives owner full F2 management, viewer read-only access, and athlete self-read", () => {
    const subject = {
      workspaceId,
      linkedUserId: ownerId,
      assignedCoachIds: [],
    };
    expect(
      canAccessWorkspace(membership("owner"), "coach-assignment.manage"),
    ).toBe(true);
    expect(
      canAccessAthlete(
        membership("owner"),
        ownerId,
        "athlete.archive",
        subject,
      ),
    ).toBe(true);
    expect(
      canAccessAthlete(membership("viewer"), ownerId, "athlete.read", subject),
    ).toBe(true);
    expect(
      canAccessAthlete(
        membership("viewer"),
        ownerId,
        "athlete.update",
        subject,
      ),
    ).toBe(false);
    expect(
      canAccessAthlete(membership("athlete"), ownerId, "athlete.read", subject),
    ).toBe(true);
    expect(canAccessWorkspace(membership("athlete"), "athlete.read")).toBe(
      true,
    );
    expect(canAccessWorkspace(membership("athlete"), "athlete.update")).toBe(
      true,
    );
    expect(
      canAccessAthlete(
        membership("athlete"),
        ownerId,
        "athlete.archive",
        subject,
      ),
    ).toBe(false);
  });
});
