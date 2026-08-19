import type { F7Repositories } from "@workoutpal/application";
import type {
  AthleteId,
  UUID,
  WorkspaceId,
  WorkspaceScope,
} from "@workoutpal/shared-kernel";
import type {
  MovementDefinition,
  PlanPhase,
  PrescriptionBlock,
  SessionPrescription,
  SessionPrescriptionRevision,
  TrainingGoal,
  TrainingPlan,
  TrainingPlanRevision,
} from "@workoutpal/training-design";
import type { PoolClient } from "pg";
import {
  instant,
  mapMovement,
  mapPlanPhase,
  mapSession,
  mapTrainingGoal,
  mapTrainingPlan,
} from "./mappers.js";
import {
  hydrateSession,
  replaceSessionBlocks,
  selectPlanRow,
} from "./repository-support.js";

export function createTrainingDesignRepositories(
  client: PoolClient,
): Pick<
  F7Repositories,
  | "movements"
  | "trainingGoals"
  | "trainingPlans"
  | "planPhases"
  | "sessionPrescriptions"
  | "trainingDesignRevisions"
> {
  return {
    movements: {
      async get(scope: WorkspaceScope, movementId: UUID) {
        const result = await client.query(
          `SELECT id, workspace_id, scope, canonical_name, modality,
                  movement_pattern, laterality, equipment_tags, archived_at,
                  created_at, created_by, updated_at, updated_by, version
             FROM design.movement_definition
            WHERE id = $2 AND (scope = 'global' OR workspace_id = $1)`,
          [scope.workspaceId, movementId],
        );
        const row = result.rows[0] as Record<string, unknown> | undefined;
        return row === undefined ? null : mapMovement(row);
      },
      async listVisible(scope: WorkspaceScope, includeArchived: boolean) {
        const result = await client.query(
          `SELECT id, workspace_id, scope, canonical_name, modality,
                  movement_pattern, laterality, equipment_tags, archived_at,
                  created_at, created_by, updated_at, updated_by, version
             FROM design.movement_definition
            WHERE (scope = 'global' OR workspace_id = $1)
              AND ($2::boolean OR archived_at IS NULL)
            ORDER BY scope, canonical_name, id`,
          [scope.workspaceId, includeArchived],
        );
        return result.rows.map((row) =>
          mapMovement(row as Record<string, unknown>),
        );
      },
      async insert(movement: MovementDefinition) {
        await client.query(
          `INSERT INTO design.movement_definition
             (id, workspace_id, scope, canonical_name, modality, movement_pattern,
              laterality, equipment_tags, archived_at, created_at, created_by,
              updated_at, updated_by, version)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $10, $11, $12)`,
          [
            movement.id,
            movement.workspaceId,
            movement.scope,
            movement.canonicalName,
            movement.modality,
            movement.movementPattern,
            movement.laterality,
            JSON.stringify(movement.equipmentTags),
            movement.archivedAt,
            movement.createdAt,
            movement.createdBy,
            movement.version,
          ],
        );
      },
      async updateExpected(
        scope: WorkspaceScope,
        movement: MovementDefinition,
        expectedVersion: number,
      ) {
        const result = await client.query(
          `UPDATE design.movement_definition
              SET canonical_name = $3, modality = $4, movement_pattern = $5,
                  laterality = $6, equipment_tags = $7, archived_at = $8,
                  updated_at = $9, updated_by = $10, version = version + 1
            WHERE workspace_id = $1 AND id = $2 AND scope = 'workspace' AND version = $11
            RETURNING id, workspace_id, scope, canonical_name, modality,
                      movement_pattern, laterality, equipment_tags, archived_at,
                      created_at, created_by, updated_at, updated_by, version`,
          [
            scope.workspaceId,
            movement.id,
            movement.canonicalName,
            movement.modality,
            movement.movementPattern,
            movement.laterality,
            JSON.stringify(movement.equipmentTags),
            movement.archivedAt,
            movement.updatedAt,
            movement.updatedBy,
            expectedVersion,
          ],
        );
        const row = result.rows[0] as Record<string, unknown> | undefined;
        return row === undefined ? null : mapMovement(row);
      },
    },
    trainingGoals: {
      async get(scope: WorkspaceScope, goalId: UUID) {
        const result = await client.query(
          `SELECT id, workspace_id, athlete_id, title, description, target_date,
                  starts_on, ends_on, archived_at, created_at, created_by,
                  updated_at, updated_by, version
             FROM design.training_goal
            WHERE workspace_id = $1 AND id = $2`,
          [scope.workspaceId, goalId],
        );
        const row = result.rows[0] as Record<string, unknown> | undefined;
        return row === undefined ? null : mapTrainingGoal(row);
      },
      async listForAthlete(
        scope: WorkspaceScope,
        athleteId: AthleteId,
        includeArchived: boolean,
      ) {
        const result = await client.query(
          `SELECT id, workspace_id, athlete_id, title, description, target_date,
                  starts_on, ends_on, archived_at, created_at, created_by,
                  updated_at, updated_by, version
             FROM design.training_goal
            WHERE workspace_id = $1 AND athlete_id = $2
              AND ($3::boolean OR archived_at IS NULL)
            ORDER BY target_date NULLS LAST, created_at, id`,
          [scope.workspaceId, athleteId, includeArchived],
        );
        return result.rows.map((row) =>
          mapTrainingGoal(row as Record<string, unknown>),
        );
      },
      async insert(goal: TrainingGoal) {
        await client.query(
          `INSERT INTO design.training_goal
             (id, workspace_id, athlete_id, title, description, target_date,
              starts_on, ends_on, archived_at, created_at, created_by,
              updated_at, updated_by, version)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $10, $11, $12)`,
          [
            goal.id,
            goal.workspaceId,
            goal.athleteId,
            goal.title,
            goal.description,
            goal.targetDate,
            goal.startsOn,
            goal.endsOn,
            goal.archivedAt,
            goal.createdAt,
            goal.createdBy,
            goal.version,
          ],
        );
      },
      async updateExpected(
        scope: WorkspaceScope,
        goal: TrainingGoal,
        expectedVersion: number,
      ) {
        const result = await client.query(
          `UPDATE design.training_goal
              SET title = $3, description = $4, target_date = $5, starts_on = $6,
                  ends_on = $7, archived_at = $8, updated_at = $9, updated_by = $10,
                  version = version + 1
            WHERE workspace_id = $1 AND id = $2 AND version = $11
            RETURNING id, workspace_id, athlete_id, title, description, target_date,
                      starts_on, ends_on, archived_at, created_at, created_by,
                      updated_at, updated_by, version`,
          [
            scope.workspaceId,
            goal.id,
            goal.title,
            goal.description,
            goal.targetDate,
            goal.startsOn,
            goal.endsOn,
            goal.archivedAt,
            goal.updatedAt,
            goal.updatedBy,
            expectedVersion,
          ],
        );
        const row = result.rows[0] as Record<string, unknown> | undefined;
        return row === undefined ? null : mapTrainingGoal(row);
      },
    },
    trainingPlans: {
      async get(scope: WorkspaceScope, planId: UUID) {
        const row = await selectPlanRow(client, scope, planId);
        return row === undefined ? null : mapTrainingPlan(row);
      },
      async listForAthlete(
        scope: WorkspaceScope,
        athleteId: AthleteId,
        includeArchived: boolean,
      ) {
        const result = await client.query(
          `SELECT p.id, p.workspace_id, p.athlete_id, p.title, p.description,
                  p.starts_on, p.ends_on, p.time_zone, p.status, p.published_revision,
                  p.published_at, p.published_by, p.archived_at, p.created_at,
                  p.created_by, p.updated_at, p.updated_by, p.version,
                  COALESCE(array_agg(pg.goal_id ORDER BY pg.goal_id)
                           FILTER (WHERE pg.goal_id IS NOT NULL), ARRAY[]::uuid[]) AS goal_ids
             FROM design.training_plan p
             LEFT JOIN design.training_plan_goal pg
               ON pg.workspace_id = p.workspace_id AND pg.plan_id = p.id
            WHERE p.workspace_id = $1 AND p.athlete_id = $2
              AND ($3::boolean OR p.archived_at IS NULL)
            GROUP BY p.id
            ORDER BY p.starts_on DESC, p.id DESC`,
          [scope.workspaceId, athleteId, includeArchived],
        );
        return result.rows.map((row) =>
          mapTrainingPlan(row as Record<string, unknown>),
        );
      },
      async insert(plan: TrainingPlan) {
        await client.query(
          `INSERT INTO design.training_plan
             (id, workspace_id, athlete_id, title, description, starts_on, ends_on,
              time_zone, status, published_revision, published_at, published_by,
              archived_at, created_at, created_by, updated_at, updated_by, version)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $14, $15, $16)`,
          [
            plan.id,
            plan.workspaceId,
            plan.athleteId,
            plan.title,
            plan.description,
            plan.startsOn,
            plan.endsOn,
            plan.timeZone,
            plan.status,
            plan.publishedRevision,
            plan.publishedAt,
            plan.publishedBy,
            plan.archivedAt,
            plan.createdAt,
            plan.createdBy,
            plan.version,
          ],
        );
        for (const goalId of plan.goalIds) {
          await client.query(
            `INSERT INTO design.training_plan_goal (workspace_id, plan_id, goal_id)
             VALUES ($1, $2, $3)`,
            [plan.workspaceId, plan.id, goalId],
          );
        }
      },
      async updateExpected(
        scope: WorkspaceScope,
        plan: TrainingPlan,
        expectedVersion: number,
      ) {
        const result = await client.query(
          `UPDATE design.training_plan
              SET title = $3, description = $4, starts_on = $5, ends_on = $6,
                  time_zone = $7, status = $8, published_revision = $9,
                  published_at = $10, published_by = $11, archived_at = $12,
                  updated_at = $13, updated_by = $14, version = version + 1
            WHERE workspace_id = $1 AND id = $2 AND version = $15
            RETURNING id, workspace_id, athlete_id, title, description, starts_on,
                      ends_on, time_zone, status, published_revision, published_at,
                      published_by, archived_at, created_at, created_by, updated_at,
                      updated_by, version`,
          [
            scope.workspaceId,
            plan.id,
            plan.title,
            plan.description,
            plan.startsOn,
            plan.endsOn,
            plan.timeZone,
            plan.status,
            plan.publishedRevision,
            plan.publishedAt,
            plan.publishedBy,
            plan.archivedAt,
            plan.updatedAt,
            plan.updatedBy,
            expectedVersion,
          ],
        );
        const row = result.rows[0] as Record<string, unknown> | undefined;
        if (row === undefined) return null;
        await client.query(
          `DELETE FROM design.training_plan_goal WHERE workspace_id = $1 AND plan_id = $2`,
          [scope.workspaceId, plan.id],
        );
        for (const goalId of plan.goalIds) {
          await client.query(
            `INSERT INTO design.training_plan_goal (workspace_id, plan_id, goal_id)
             VALUES ($1, $2, $3)`,
            [scope.workspaceId, plan.id, goalId],
          );
        }
        return mapTrainingPlan(row, plan.goalIds);
      },
    },
    planPhases: {
      async get(scope: WorkspaceScope, phaseId: UUID) {
        const result = await client.query(
          `SELECT id, workspace_id, plan_id, parent_phase_id, ordinal, name,
                  classification, starts_on, ends_on, archived_at, created_at,
                  created_by, updated_at, updated_by, version
             FROM design.plan_phase
            WHERE workspace_id = $1 AND id = $2`,
          [scope.workspaceId, phaseId],
        );
        const row = result.rows[0] as Record<string, unknown> | undefined;
        return row === undefined ? null : mapPlanPhase(row);
      },
      async listForPlan(
        scope: WorkspaceScope,
        planId: UUID,
        includeArchived: boolean,
      ) {
        const result = await client.query(
          `SELECT id, workspace_id, plan_id, parent_phase_id, ordinal, name,
                  classification, starts_on, ends_on, archived_at, created_at,
                  created_by, updated_at, updated_by, version
             FROM design.plan_phase
            WHERE workspace_id = $1 AND plan_id = $2
              AND ($3::boolean OR archived_at IS NULL)
            ORDER BY parent_phase_id NULLS FIRST, ordinal, id`,
          [scope.workspaceId, planId, includeArchived],
        );
        return result.rows.map((row) =>
          mapPlanPhase(row as Record<string, unknown>),
        );
      },
      async insert(phase: PlanPhase) {
        await client.query(
          `INSERT INTO design.plan_phase
             (id, workspace_id, plan_id, parent_phase_id, ordinal, name,
              classification, starts_on, ends_on, archived_at, created_at, created_by,
              updated_at, updated_by, version)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $11, $12, $13)`,
          [
            phase.id,
            phase.workspaceId,
            phase.planId,
            phase.parentPhaseId,
            phase.ordinal,
            phase.name,
            phase.classification,
            phase.startsOn,
            phase.endsOn,
            phase.archivedAt,
            phase.createdAt,
            phase.createdBy,
            phase.version,
          ],
        );
      },
      async updateExpected(
        scope: WorkspaceScope,
        phase: PlanPhase,
        expectedVersion: number,
      ) {
        const result = await client.query(
          `UPDATE design.plan_phase
              SET parent_phase_id = $3, ordinal = $4, name = $5, classification = $6,
                  starts_on = $7, ends_on = $8, archived_at = $9, updated_at = $10,
                  updated_by = $11, version = version + 1
            WHERE workspace_id = $1 AND id = $2 AND version = $12
            RETURNING id, workspace_id, plan_id, parent_phase_id, ordinal, name,
                      classification, starts_on, ends_on, archived_at, created_at,
                      created_by, updated_at, updated_by, version`,
          [
            scope.workspaceId,
            phase.id,
            phase.parentPhaseId,
            phase.ordinal,
            phase.name,
            phase.classification,
            phase.startsOn,
            phase.endsOn,
            phase.archivedAt,
            phase.updatedAt,
            phase.updatedBy,
            expectedVersion,
          ],
        );
        const row = result.rows[0] as Record<string, unknown> | undefined;
        return row === undefined ? null : mapPlanPhase(row);
      },
    },
    sessionPrescriptions: {
      async get(scope: WorkspaceScope, sessionId: UUID) {
        const result = await client.query(
          `SELECT id, workspace_id, athlete_id, plan_id, phase_id,
                  scheduled_local_date, time_zone, title, status, revision,
                  published_revision, published_at, published_by, archived_at,
                  created_at, created_by, updated_at, updated_by, version
             FROM design.session_prescription
            WHERE workspace_id = $1 AND id = $2`,
          [scope.workspaceId, sessionId],
        );
        const row = result.rows[0] as Record<string, unknown> | undefined;
        return row === undefined ? null : hydrateSession(client, row);
      },
      async listPublishedForAthlete(
        scope: WorkspaceScope,
        athleteId: AthleteId,
      ) {
        const result = await client.query(
          `SELECT s.id, s.workspace_id, s.athlete_id, s.plan_id, s.phase_id,
                  s.scheduled_local_date, s.time_zone, s.title, s.status, s.revision,
                  s.published_revision, s.published_at, s.published_by, s.archived_at,
                  s.created_at, s.created_by, s.updated_at, s.updated_by, s.version,
                  r.snapshot AS published_snapshot
             FROM design.session_prescription s
             JOIN LATERAL (
               SELECT snapshot
                 FROM design.session_prescription_revision
                WHERE workspace_id = s.workspace_id
                  AND session_id = s.id
                  AND revision = s.published_revision
                LIMIT 1
             ) r ON TRUE
            WHERE s.workspace_id = $1
              AND s.athlete_id = $2
              AND s.published_revision IS NOT NULL
            ORDER BY s.scheduled_local_date, s.id`,
          [scope.workspaceId, athleteId],
        );
        return result.rows.map((row) => {
          const value = row as Record<string, unknown>;
          const snapshot = value.published_snapshot as {
            readonly blocks?: unknown;
          } | null;
          const blocks =
            snapshot !== null && Array.isArray(snapshot?.blocks)
              ? (snapshot.blocks as readonly PrescriptionBlock[])
              : [];
          return mapSession(value, blocks);
        });
      },
      async listForPlan(
        scope: WorkspaceScope,
        planId: UUID,
        includeArchived: boolean,
      ) {
        const result = await client.query(
          `SELECT id, workspace_id, athlete_id, plan_id, phase_id,
                  scheduled_local_date, time_zone, title, status, revision,
                  published_revision, published_at, published_by, archived_at,
                  created_at, created_by, updated_at, updated_by, version
             FROM design.session_prescription
            WHERE workspace_id = $1 AND plan_id = $2
              AND ($3::boolean OR archived_at IS NULL)
            ORDER BY scheduled_local_date, id`,
          [scope.workspaceId, planId, includeArchived],
        );
        const sessions: SessionPrescription[] = [];
        for (const row of result.rows)
          sessions.push(
            await hydrateSession(client, row as Record<string, unknown>),
          );
        return sessions;
      },
      async insert(session: SessionPrescription) {
        await client.query(
          `INSERT INTO design.session_prescription
             (id, workspace_id, athlete_id, plan_id, phase_id, scheduled_local_date,
              time_zone, title, status, revision, published_revision, published_at,
              published_by, archived_at, created_at, created_by, updated_at, updated_by, version)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $15, $16, $17)`,
          [
            session.id,
            session.workspaceId,
            session.athleteId,
            session.planId,
            session.phaseId,
            session.scheduledLocalDate,
            session.timeZone,
            session.title,
            session.status,
            session.revision,
            session.publishedRevision,
            session.publishedAt,
            session.publishedBy,
            session.archivedAt,
            session.createdAt,
            session.createdBy,
            session.version,
          ],
        );
        await replaceSessionBlocks(client, session);
      },
      async updateExpected(
        scope: WorkspaceScope,
        session: SessionPrescription,
        expectedVersion: number,
      ) {
        const result = await client.query(
          `UPDATE design.session_prescription
              SET athlete_id = $3, plan_id = $4, phase_id = $5, scheduled_local_date = $6,
                  time_zone = $7, title = $8, status = $9, revision = $10,
                  published_revision = $11, published_at = $12, published_by = $13,
                  archived_at = $14, updated_at = $15, updated_by = $16, version = version + 1
            WHERE workspace_id = $1 AND id = $2 AND version = $17
            RETURNING id, workspace_id, athlete_id, plan_id, phase_id,
                      scheduled_local_date, time_zone, title, status, revision,
                      published_revision, published_at, published_by, archived_at,
                      created_at, created_by, updated_at, updated_by, version`,
          [
            scope.workspaceId,
            session.id,
            session.athleteId,
            session.planId,
            session.phaseId,
            session.scheduledLocalDate,
            session.timeZone,
            session.title,
            session.status,
            session.revision,
            session.publishedRevision,
            session.publishedAt,
            session.publishedBy,
            session.archivedAt,
            session.updatedAt,
            session.updatedBy,
            expectedVersion,
          ],
        );
        const row = result.rows[0] as Record<string, unknown> | undefined;
        if (row === undefined) return null;
        await replaceSessionBlocks(client, session);
        return hydrateSession(client, row);
      },
    },
    trainingDesignRevisions: {
      async listForPlan(scope: WorkspaceScope, planId: UUID) {
        const result = await client.query(
          `SELECT id, workspace_id, plan_id, revision, published_at, published_by, snapshot
             FROM design.training_plan_revision
            WHERE workspace_id = $1 AND plan_id = $2
            ORDER BY revision`,
          [scope.workspaceId, planId],
        );
        return result.rows.map((row) => {
          const value = row as Record<string, unknown>;
          return {
            id: value.id as UUID,
            workspaceId: value.workspace_id as WorkspaceId,
            planId: value.plan_id as UUID,
            revision: Number(value.revision),
            publishedAt: instant(
              value.published_at,
            ) as TrainingPlanRevision["publishedAt"],
            publishedBy: value.published_by as UUID,
            snapshot: value.snapshot as TrainingPlanRevision["snapshot"],
          };
        });
      },
      async listForSession(scope: WorkspaceScope, sessionId: UUID) {
        const result = await client.query(
          `SELECT id, workspace_id, session_id, revision, published_at, published_by, snapshot
             FROM design.session_prescription_revision
            WHERE workspace_id = $1 AND session_id = $2
            ORDER BY revision`,
          [scope.workspaceId, sessionId],
        );
        return result.rows.map((row) => {
          const value = row as Record<string, unknown>;
          return {
            id: value.id as UUID,
            workspaceId: value.workspace_id as WorkspaceId,
            sessionId: value.session_id as UUID,
            revision: Number(value.revision),
            publishedAt: instant(
              value.published_at,
            ) as SessionPrescriptionRevision["publishedAt"],
            publishedBy: value.published_by as UUID,
            snapshot: value.snapshot as SessionPrescriptionRevision["snapshot"],
          };
        });
      },
      async insertPlanRevision(revision: TrainingPlanRevision) {
        await client.query(
          `INSERT INTO design.training_plan_revision
             (id, workspace_id, plan_id, revision, published_at, published_by, snapshot)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            revision.id,
            revision.workspaceId,
            revision.planId,
            revision.revision,
            revision.publishedAt,
            revision.publishedBy,
            revision.snapshot,
          ],
        );
      },
      async insertSessionRevision(revision: SessionPrescriptionRevision) {
        await client.query(
          `INSERT INTO design.session_prescription_revision
             (id, workspace_id, session_id, revision, published_at, published_by, snapshot)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            revision.id,
            revision.workspaceId,
            revision.sessionId,
            revision.revision,
            revision.publishedAt,
            revision.publishedBy,
            revision.snapshot,
          ],
        );
      },
    },
  };
}
