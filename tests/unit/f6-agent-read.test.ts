import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  AgentReadFacade,
  type AgentReadQueryPort,
  AgentSessionSecurityError,
  createTrustedAgentSession,
  F6_AGENT_TOOL_CATALOG,
} from "@workoutpal/agent-operations";
import { createAthleteProfile } from "@workoutpal/athletes";
import { describe, expect, it, vi } from "vitest";

const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as never;
const otherWorkspaceId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as never;
const actorId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc" as never;
const otherActorId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd" as never;
const athleteId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" as never;
const instant = "2026-08-10T12:00:00.000Z" as never;

function principal(
  principalId: string,
  scopedWorkspaceId: string,
  role = "coach",
) {
  return {
    principalId,
    principalType: "user",
    attributes: { workspaceId: scopedWorkspaceId, role },
  } as const;
}

describe("F6 agent read path", () => {
  it("publishes a read-only catalog with no proposal, science, or mutation verbs", () => {
    expect(F6_AGENT_TOOL_CATALOG.length).toBe(9);
    expect(
      F6_AGENT_TOOL_CATALOG.every((tool) => tool.authorityClass === "READ"),
    ).toBe(true);
    expect(F6_AGENT_TOOL_CATALOG.map((tool) => tool.name)).not.toEqual(
      expect.arrayContaining([
        "run_sql",
        "shell",
        "write_file",
        "propose_move_session",
        "execute_approved_proposal",
        "get_science_capability",
      ]),
    );
  });

  it("rejects missing, mismatched, and malformed authenticated session scope", () => {
    expect(() =>
      createTrustedAgentSession({ current: null, initiator: null }),
    ).toThrowError(AgentSessionSecurityError);
    expect(() =>
      createTrustedAgentSession({
        current: principal(actorId, workspaceId),
        initiator: principal(otherActorId, workspaceId),
      }),
    ).toThrow("different authenticated actor");
    expect(() =>
      createTrustedAgentSession({
        current: principal(actorId, workspaceId),
        initiator: principal(actorId, otherWorkspaceId),
      }),
    ).toThrow("invalid or incomplete");
    expect(() =>
      createTrustedAgentSession({
        current: principal(actorId, workspaceId, "administrator"),
        initiator: principal(actorId, workspaceId, "administrator"),
      }),
    ).toThrow("invalid or incomplete");
  });

  it("binds a facade query to trusted actor/workspace context and returns evidence", async () => {
    const athlete = createAthleteProfile({
      id: athleteId,
      workspaceId,
      displayName: "Read-only athlete",
      createdAt: instant,
    });
    const getAthlete = vi.fn(
      async (input: {
        readonly workspaceId: unknown;
        readonly principalId: unknown;
      }) => {
        expect(input.workspaceId).toBe(workspaceId);
        expect(input.principalId).toBe(actorId);
        return athlete;
      },
    );
    const queries = { getAthlete } as unknown as AgentReadQueryPort;
    const trusted = createTrustedAgentSession({
      current: principal(actorId, workspaceId),
      initiator: principal(actorId, workspaceId),
    });
    const facade = new AgentReadFacade(queries, trusted, "f6-test-request");

    const result = await facade.getAthlete(athleteId);
    expect(result.data).toEqual({
      id: athleteId,
      displayName: "Read-only athlete",
      archivedAt: null,
      version: 1,
      createdAt: instant,
    });
    expect(result.evidence).toEqual([
      expect.objectContaining({
        source: "athlete",
        recordId: athleteId,
        aggregateId: athleteId,
        aggregateVersion: 1,
      }),
    ]);
    expect(getAthlete).toHaveBeenCalledTimes(1);
  });

  it("keeps generic infrastructure and mutation surfaces out of authored agent code", () => {
    const repoRoot = path.resolve(import.meta.dirname, "../..");
    const toolDirectory = path.join(
      repoRoot,
      "apps",
      "studio",
      "agent",
      "tools",
    );
    const source = readdirSync(toolDirectory)
      .filter((file) => file.endsWith(".ts"))
      .map((file) => readFileSync(path.join(toolDirectory, file), "utf8"))
      .join("\n");
    expect(source).not.toMatch(/run_sql|child_process|drizzle-orm|exec\s*\(/i);
    expect(source).not.toMatch(
      /run_sql|child_process|drizzle-orm|node:fs|shell\b/i,
    );
    expect(readFileSync(path.join(toolDirectory, "bash.ts"), "utf8")).toContain(
      "disableTool",
    );
    expect(
      readFileSync(path.join(toolDirectory, "write_file.ts"), "utf8"),
    ).toContain("disableTool");
  });
});
