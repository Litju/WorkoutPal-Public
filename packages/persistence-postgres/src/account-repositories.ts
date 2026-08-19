import type {
  Workspace,
  WorkspaceMembership,
  WorkspacePreferences,
} from "@workoutpal/accounts";
import type { AuditEvent, F7Repositories } from "@workoutpal/application";
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
import type { PoolClient } from "pg";
import {
  mapAssignment,
  mapAthlete,
  mapAthleteTrainingContext,
  mapAudit,
  mapIdempotency,
  mapMembership,
  mapWorkspace,
  mapWorkspaceMemberDetails,
  mapWorkspacePreferences,
} from "./mappers.js";

export function createAccountRepositories(
  client: PoolClient,
): Pick<
  F7Repositories,
  | "workspaces"
  | "memberships"
  | "athletes"
  | "athleteTrainingContexts"
  | "coachAssignments"
  | "audit"
  | "idempotency"
  | "workspaceSettings"
> {
  return {
    workspaces: {
      async get(scope: WorkspaceScope) {
        const result = await client.query(
          `SELECT id, name, created_at, created_by, updated_at, archived_at, version
             FROM iam.workspace
            WHERE id = $1`,
          [scope.workspaceId],
        );
        const row = result.rows[0] as Record<string, unknown> | undefined;
        return row === undefined ? null : mapWorkspace(row);
      },
      async insert(workspace: Workspace) {
        await client.query(
          `INSERT INTO iam.workspace
             (id, name, created_at, created_by, updated_at, version, archived_at)
           VALUES ($1, $2, $3, $4, $3, $5, $6)`,
          [
            workspace.id,
            workspace.name,
            workspace.createdAt,
            workspace.createdBy,
            workspace.version,
            workspace.archivedAt,
          ],
        );
      },
    },
    memberships: {
      async get(scope: WorkspaceScope, principalId: UUID) {
        const result = await client.query(
          `SELECT id, workspace_id, principal_id, role, status
             FROM iam.workspace_member
            WHERE workspace_id = $1 AND principal_id = $2`,
          [scope.workspaceId, principalId],
        );
        const row = result.rows[0] as Record<string, unknown> | undefined;
        return row === undefined ? null : mapMembership(row);
      },
      async listForPrincipal(principalId: UUID) {
        const result = await client.query(
          `SELECT id, workspace_id, principal_id, role, status
             FROM iam.workspace_member
            WHERE principal_id = $1 ORDER BY id`,
          [principalId],
        );
        return result.rows.map((row) =>
          mapMembership(row as Record<string, unknown>),
        );
      },
      async insert(membership: WorkspaceMembership) {
        await client.query(
          `INSERT INTO iam.workspace_member
             (id, workspace_id, principal_id, role, status)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            membership.id,
            membership.workspaceId,
            membership.principalId,
            membership.role,
            membership.status,
          ],
        );
      },
    },
    athletes: {
      async get(scope: WorkspaceScope, athleteId: AthleteId) {
        const result = await client.query(
          `SELECT id, workspace_id, display_name, linked_user_id, archived_at,
                  created_at, created_by, updated_at, updated_by, version
             FROM athlete.profile WHERE workspace_id = $1 AND id = $2`,
          [scope.workspaceId, athleteId],
        );
        const row = result.rows[0] as Record<string, unknown> | undefined;
        return row === undefined ? null : mapAthlete(row);
      },
      async list(scope: WorkspaceScope, includeArchived: boolean) {
        const result = await client.query(
          `SELECT id, workspace_id, display_name, linked_user_id, archived_at,
                  created_at, created_by, updated_at, updated_by, version
             FROM athlete.profile
            WHERE workspace_id = $1 AND ($2::boolean OR archived_at IS NULL)
            ORDER BY created_at DESC, id DESC`,
          [scope.workspaceId, includeArchived],
        );
        return result.rows.map((row) =>
          mapAthlete(row as Record<string, unknown>),
        );
      },
      async insert(profile: AthleteProfile) {
        await client.query(
          `INSERT INTO athlete.profile
             (id, workspace_id, display_name, linked_user_id, created_at, created_by,
              updated_at, updated_by, version, archived_at)
           VALUES ($1, $2, $3, $4, $5, $6, $5, $6, $7, $8)`,
          [
            profile.id,
            profile.workspaceId,
            profile.displayName,
            profile.linkedUserId,
            profile.createdAt,
            profile.createdBy,
            profile.version,
            profile.archivedAt,
          ],
        );
      },
      async updateExpected(
        scope: WorkspaceScope,
        profile: AthleteProfile,
        expectedVersion: number,
      ) {
        const result = await client.query(
          `UPDATE athlete.profile
              SET display_name = $3, linked_user_id = $4, updated_at = $5,
                  updated_by = $6, version = version + 1, archived_at = $7
            WHERE workspace_id = $1 AND id = $2 AND version = $8
            RETURNING id, workspace_id, display_name, linked_user_id, archived_at,
                      created_at, created_by, updated_at, updated_by, version`,
          [
            scope.workspaceId,
            profile.id,
            profile.displayName,
            profile.linkedUserId,
            profile.updatedAt,
            profile.updatedBy,
            profile.archivedAt,
            expectedVersion,
          ],
        );
        const row = result.rows[0] as Record<string, unknown> | undefined;
        return row === undefined ? null : mapAthlete(row);
      },
    },
    athleteTrainingContexts: {
      async get(scope: WorkspaceScope, athleteId: AthleteId) {
        const result = await client.query(
          `SELECT id, workspace_id, athlete_id, training_age_months,
                  availability_notes, operational_constraints, equipment_access,
                  training_preferences, practitioner_notes, created_at, created_by,
                  updated_at, updated_by, version
             FROM athlete.training_context
            WHERE workspace_id = $1 AND athlete_id = $2`,
          [scope.workspaceId, athleteId],
        );
        const row = result.rows[0] as Record<string, unknown> | undefined;
        return row === undefined ? null : mapAthleteTrainingContext(row);
      },
      async insert(context: AthleteTrainingContext) {
        await client.query(
          `INSERT INTO athlete.training_context
             (id, workspace_id, athlete_id, training_age_months,
              availability_notes, operational_constraints, equipment_access,
              training_preferences, practitioner_notes, created_at, created_by,
              updated_at, updated_by, version)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $10, $11, $12)`,
          [
            context.id,
            context.workspaceId,
            context.athleteId,
            context.trainingAgeMonths,
            context.availabilityNotes,
            context.operationalConstraints,
            JSON.stringify(context.equipmentAccess),
            context.trainingPreferences,
            context.practitionerNotes,
            context.createdAt,
            context.createdBy,
            context.version,
          ],
        );
      },
      async updateExpected(
        scope: WorkspaceScope,
        context: AthleteTrainingContext,
        expectedVersion: number,
      ) {
        const result = await client.query(
          `UPDATE athlete.training_context
              SET training_age_months = $3, availability_notes = $4,
                  operational_constraints = $5, equipment_access = $6,
                  training_preferences = $7, practitioner_notes = $8,
                  updated_at = $9, updated_by = $10, version = $11
            WHERE workspace_id = $1 AND athlete_id = $2 AND version = $12
            RETURNING id, workspace_id, athlete_id, training_age_months,
                      availability_notes, operational_constraints, equipment_access,
                      training_preferences, practitioner_notes, created_at, created_by,
                      updated_at, updated_by, version`,
          [
            scope.workspaceId,
            context.athleteId,
            context.trainingAgeMonths,
            context.availabilityNotes,
            context.operationalConstraints,
            JSON.stringify(context.equipmentAccess),
            context.trainingPreferences,
            context.practitionerNotes,
            context.updatedAt,
            context.updatedBy,
            context.version,
            expectedVersion,
          ],
        );
        const row = result.rows[0] as Record<string, unknown> | undefined;
        return row === undefined ? null : mapAthleteTrainingContext(row);
      },
    },
    coachAssignments: {
      async listForAthlete(scope: WorkspaceScope, athleteId: AthleteId) {
        const result = await client.query(
          `SELECT id, workspace_id, athlete_id, coach_principal_id, created_at, created_by
             FROM athlete.coach_assignment
            WHERE workspace_id = $1 AND athlete_id = $2 ORDER BY created_at, id`,
          [scope.workspaceId, athleteId],
        );
        return result.rows.map((row) =>
          mapAssignment(row as Record<string, unknown>),
        );
      },
      async exists(
        scope: WorkspaceScope,
        athleteId: AthleteId,
        coachPrincipalId: UUID,
      ) {
        const result = await client.query(
          `SELECT 1 FROM athlete.coach_assignment
            WHERE workspace_id = $1 AND athlete_id = $2 AND coach_principal_id = $3`,
          [scope.workspaceId, athleteId, coachPrincipalId],
        );
        return result.rowCount !== 0;
      },
      async insert(assignment: CoachAssignment) {
        await client.query(
          `INSERT INTO athlete.coach_assignment
             (id, workspace_id, athlete_id, coach_principal_id, created_at, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            assignment.id,
            assignment.workspaceId,
            assignment.athleteId,
            assignment.coachPrincipalId,
            assignment.createdAt,
            assignment.createdBy,
          ],
        );
      },
      async remove(
        scope: WorkspaceScope,
        athleteId: AthleteId,
        coachPrincipalId: UUID,
      ) {
        const result = await client.query(
          `DELETE FROM athlete.coach_assignment
            WHERE workspace_id = $1 AND athlete_id = $2 AND coach_principal_id = $3`,
          [scope.workspaceId, athleteId, coachPrincipalId],
        );
        return result.rowCount !== 0;
      },
    },
    audit: {
      async append(event: AuditEvent) {
        await client.query(
          `INSERT INTO audit.event
             (id, occurred_at, workspace_id, actor_id, actor_type, action,
              aggregate_type, aggregate_id, version_before, version_after, request_id, payload)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            event.id,
            event.occurredAt,
            event.workspaceId,
            event.actorId,
            event.actorType,
            event.action,
            event.aggregateType,
            event.aggregateId,
            event.versionBefore,
            event.versionAfter,
            event.requestId,
            event.payload,
          ],
        );
      },
      async list(scope: WorkspaceScope, aggregateId?: UUID) {
        const result =
          aggregateId === undefined
            ? await client.query(
                `SELECT id, occurred_at, workspace_id, actor_id, actor_type, action,
                      aggregate_type, aggregate_id, version_before, version_after, request_id, payload
                 FROM audit.event WHERE workspace_id = $1 ORDER BY occurred_at, id`,
                [scope.workspaceId],
              )
            : await client.query(
                `SELECT id, occurred_at, workspace_id, actor_id, actor_type, action,
                      aggregate_type, aggregate_id, version_before, version_after, request_id, payload
                 FROM audit.event WHERE workspace_id = $1 AND aggregate_id = $2 ORDER BY occurred_at, id`,
                [scope.workspaceId, aggregateId],
              );
        return result.rows.map((row) =>
          mapAudit(row as Record<string, unknown>),
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
        const result = await client.query(
          `SELECT workspace_id, actor_id, operation, idempotency_key, request_hash, outcome
             FROM iam.idempotency_record
            WHERE workspace_id = $1 AND actor_id = $2 AND operation = $3 AND idempotency_key = $4`,
          [workspaceId, actorId, operation, key],
        );
        const row = result.rows[0] as Record<string, unknown> | undefined;
        return row === undefined ? null : mapIdempotency(row);
      },
      async reserve(record) {
        const inserted = await client.query(
          `INSERT INTO iam.idempotency_record
             (id, workspace_id, actor_id, operation, idempotency_key, request_hash, outcome, created_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NULL, now())
           ON CONFLICT (workspace_id, actor_id, operation, idempotency_key) DO NOTHING
           RETURNING workspace_id, actor_id, operation, idempotency_key, request_hash, outcome`,
          [
            record.workspaceId,
            record.actorId,
            record.operation,
            record.key,
            record.requestHash,
          ],
        );
        if (inserted.rowCount !== 0) return null;
        const existing = await client.query(
          `SELECT workspace_id, actor_id, operation, idempotency_key, request_hash, outcome
             FROM iam.idempotency_record
            WHERE workspace_id = $1 AND actor_id = $2 AND operation = $3 AND idempotency_key = $4`,
          [record.workspaceId, record.actorId, record.operation, record.key],
        );
        const row = existing.rows[0] as Record<string, unknown> | undefined;
        return row === undefined ? null : mapIdempotency(row);
      },
      async complete(
        workspaceId: WorkspaceId,
        actorId: UUID,
        operation: string,
        key: string,
        outcome: unknown,
      ) {
        await client.query(
          `UPDATE iam.idempotency_record SET outcome = $5
            WHERE workspace_id = $1 AND actor_id = $2 AND operation = $3 AND idempotency_key = $4`,
          [workspaceId, actorId, operation, key, outcome],
        );
      },
    },
    workspaceSettings: {
      async listMembers(scope: WorkspaceScope) {
        const result = await client.query(
          `SELECT member.id, member.workspace_id, member.principal_id,
                  member.role, member.status, auth_user.name AS display_name,
                  auth_user.email
             FROM iam.workspace_member AS member
             LEFT JOIN auth."user" AS auth_user
               ON auth_user.id = member.principal_id::text
            WHERE member.workspace_id = $1
            ORDER BY member.status, member.role, member.id`,
          [scope.workspaceId],
        );
        return result.rows.map((row) =>
          mapWorkspaceMemberDetails(row as Record<string, unknown>),
        );
      },
      async updateMemberRole(
        scope: WorkspaceScope,
        memberId: UUID,
        role: WorkspaceMembership["role"],
      ) {
        const result = await client.query(
          `UPDATE iam.workspace_member
              SET role = $3
            WHERE workspace_id = $1 AND id = $2
            RETURNING id, workspace_id, principal_id, role, status`,
          [scope.workspaceId, memberId, role],
        );
        const row = result.rows[0] as Record<string, unknown> | undefined;
        return row === undefined ? null : mapMembership(row);
      },
      async suspendMember(scope: WorkspaceScope, memberId: UUID) {
        const result = await client.query(
          `UPDATE iam.workspace_member
              SET status = 'suspended'
            WHERE workspace_id = $1 AND id = $2 AND status = 'active'
            RETURNING id, workspace_id, principal_id, role, status`,
          [scope.workspaceId, memberId],
        );
        const row = result.rows[0] as Record<string, unknown> | undefined;
        return row === undefined ? null : mapMembership(row);
      },
      async getPreferences(scope: WorkspaceScope) {
        const result = await client.query(
          `SELECT id, workspace_id, mass_unit, distance_unit, pace_unit,
                  created_at, created_by, updated_at, updated_by, version
             FROM iam.workspace_preferences
            WHERE workspace_id = $1`,
          [scope.workspaceId],
        );
        const row = result.rows[0] as Record<string, unknown> | undefined;
        return row === undefined ? null : mapWorkspacePreferences(row);
      },
      async insertPreferences(preferences: WorkspacePreferences) {
        await client.query(
          `INSERT INTO iam.workspace_preferences
             (id, workspace_id, mass_unit, distance_unit, pace_unit,
              created_at, created_by, updated_at, updated_by, version)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $6, $7, $8)`,
          [
            preferences.id,
            preferences.workspaceId,
            preferences.massUnit,
            preferences.distanceUnit,
            preferences.paceUnit,
            preferences.createdAt,
            preferences.createdBy,
            preferences.version,
          ],
        );
      },
      async updatePreferencesExpected(
        scope: WorkspaceScope,
        preferences: WorkspacePreferences,
        expectedVersion: number,
      ) {
        const result = await client.query(
          `UPDATE iam.workspace_preferences
              SET mass_unit = $3, distance_unit = $4, pace_unit = $5,
                  updated_at = $6, updated_by = $7, version = $8
            WHERE workspace_id = $1 AND id = $2 AND version = $9
            RETURNING id, workspace_id, mass_unit, distance_unit, pace_unit,
                      created_at, created_by, updated_at, updated_by, version`,
          [
            scope.workspaceId,
            preferences.id,
            preferences.massUnit,
            preferences.distanceUnit,
            preferences.paceUnit,
            preferences.updatedAt,
            preferences.updatedBy,
            preferences.version,
            expectedVersion,
          ],
        );
        const row = result.rows[0] as Record<string, unknown> | undefined;
        return row === undefined ? null : mapWorkspacePreferences(row);
      },
    },
  };
}
