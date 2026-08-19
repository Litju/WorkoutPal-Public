import {
  AgentReadFacade,
  type AgentReadQueryPort,
  createTrustedAgentSession,
} from "@workoutpal/agent-operations";
import {
  createF2Application,
  createF3Application,
  createF4Application,
  createF5Application,
  type F2Application,
  type F3Application,
  type F4Application,
  type F5Application,
} from "@workoutpal/application";
import { createPostgresF2Persistence } from "@workoutpal/persistence-postgres";
import type { UUID } from "@workoutpal/shared-kernel";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://workoutpal:workoutpal_dev@127.0.0.1:55432/workoutpal";

const canonicalTables = [
  { name: "iam.workspace", scopeColumn: "id" },
  { name: "iam.workspace_member", scopeColumn: "workspace_id" },
  { name: "athlete.profile", scopeColumn: "workspace_id" },
  { name: "athlete.coach_assignment", scopeColumn: "workspace_id" },
  { name: "audit.event", scopeColumn: "workspace_id" },
  { name: "design.movement_definition", scopeColumn: "workspace_id" },
  { name: "design.training_goal", scopeColumn: "workspace_id" },
  { name: "design.training_plan", scopeColumn: "workspace_id" },
  { name: "design.training_plan_goal", scopeColumn: "workspace_id" },
  { name: "design.plan_phase", scopeColumn: "workspace_id" },
  { name: "design.session_prescription", scopeColumn: "workspace_id" },
  { name: "design.session_block", scopeColumn: "workspace_id" },
  {
    name: "design.strength_exercise_prescription",
    scopeColumn: "workspace_id",
  },
  { name: "design.strength_set_prescription", scopeColumn: "workspace_id" },
  {
    name: "design.endurance_segment_prescription",
    scopeColumn: "workspace_id",
  },
  { name: "design.mobility_item_prescription", scopeColumn: "workspace_id" },
  { name: "design.training_plan_revision", scopeColumn: "workspace_id" },
  {
    name: "design.session_prescription_revision",
    scopeColumn: "workspace_id",
  },
  { name: "execution.session", scopeColumn: "workspace_id" },
  { name: "execution.strength_set", scopeColumn: "workspace_id" },
  { name: "execution.endurance_segment", scopeColumn: "workspace_id" },
  { name: "execution.mobility_item", scopeColumn: "workspace_id" },
  { name: "execution.session_observation", scopeColumn: "workspace_id" },
  { name: "execution.amendment", scopeColumn: "workspace_id" },
] as const;

function id(): UUID {
  return crypto.randomUUID() as UUID;
}

async function canonicalState(client: Client, workspaceId: UUID) {
  const state: Record<
    string,
    { readonly count: string; readonly fingerprint: string }
  > = {};
  for (const table of canonicalTables) {
    const result = await client.query<{
      readonly count: string;
      readonly fingerprint: string;
    }>(
      `SELECT count(*)::text AS count,
              md5(COALESCE(string_agg(row_to_json(t)::text, '|' ORDER BY row_to_json(t)::text), '')) AS fingerprint
         FROM ${table.name} AS t
        WHERE t.${table.scopeColumn} = $1`,
      [workspaceId],
    );
    const row = result.rows[0];
    if (row === undefined)
      throw new Error(`No snapshot row returned for ${table.name}.`);
    state[table.name] = row;
  }
  return state;
}

function createQueries(
  application: F2Application,
  trainingDesign: F3Application,
  execution: F4Application,
  monitoring: F5Application,
): AgentReadQueryPort {
  return {
    listAthletes: (input) => application.listAthletes(input),
    getAthlete: (input) => application.getAthlete(input),
    listTrainingPlans: (input) =>
      trainingDesign.listAthleteTrainingPlans(input),
    getTrainingPlan: (input) => trainingDesign.getTrainingPlan(input),
    listSessionPrescriptions: (input) =>
      trainingDesign.listSessionPrescriptions(input),
    getSessionPrescription: (input) =>
      trainingDesign.getSessionPrescription(input),
    listExecutedSessions: (input) => execution.listExecutedSessions(input),
    getExecutionReview: (input) => execution.getExecutionReview(input),
    getMonitoringOverview: (input) =>
      monitoring.getAthleteMonitoringOverview(input),
    getSessionMonitoring: (input) => monitoring.getSessionMonitoring(input),
  };
}

describe("F6 read boundary with real PostgreSQL", () => {
  it("does not change canonical F2-F5 state during an agent read", async () => {
    const persistence = createPostgresF2Persistence({
      url: databaseUrl,
      applicationName: "workoutpal-f6-read-sentinel",
      ssl: false,
    });
    const client = new Client({
      connectionString: databaseUrl,
      application_name: "workoutpal-f6-read-sentinel-snapshot",
    });
    await client.connect();
    try {
      const application = createF2Application(persistence);
      const trainingDesign = createF3Application({
        transaction: persistence.f3Transaction,
      });
      const execution = createF4Application({
        transaction: persistence.f4Transaction,
      });
      const monitoring = createF5Application({
        transaction: persistence.f4Transaction,
      });
      const principalId = id();
      const workspace = await application.createWorkspace({
        principalId,
        requestId: "f6-sentinel-workspace",
        name: `F6 Sentinel Workspace ${id()}`,
      });
      const athlete = await application.createAthlete({
        principalId,
        requestId: "f6-sentinel-athlete",
        workspaceId: workspace.id,
        displayName: `F6 Sentinel Athlete ${id()}`,
        idempotencyKey: `f6-sentinel-athlete-${id()}`,
      });
      const before = await canonicalState(client, workspace.id);
      const trustedSession = createTrustedAgentSession({
        current: {
          principalId,
          principalType: "user",
          attributes: { workspaceId: workspace.id, role: "owner" },
        },
        initiator: {
          principalId,
          principalType: "user",
          attributes: { workspaceId: workspace.id, role: "owner" },
        },
      });
      const facade = new AgentReadFacade(
        createQueries(application, trainingDesign, execution, monitoring),
        trustedSession,
        "f6-read-sentinel",
      );

      const result = await facade.listAthletes();

      expect(result.data.some((item) => item.id === athlete.id)).toBe(true);
      expect(await canonicalState(client, workspace.id)).toEqual(before);
    } finally {
      await client.end();
      await persistence.close();
    }
  });
});
