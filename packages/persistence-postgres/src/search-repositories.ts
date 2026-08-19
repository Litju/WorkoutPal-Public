import type {
  F7Repositories,
  WorkspaceSearchRepository,
} from "@workoutpal/application";
import type { Instant, WorkspaceScope } from "@workoutpal/shared-kernel";
import type { PoolClient } from "pg";

function instant(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export function createSearchRepositories(
  client: PoolClient,
): Pick<F7Repositories, "search"> {
  const search: WorkspaceSearchRepository = {
    async search(scope: WorkspaceScope, query: string, limit: number) {
      const normalizedQuery = query.trim();
      const result = await client.query(
        `WITH records AS (
           SELECT 'athlete'::text AS kind, id, display_name AS title,
                  NULL::text AS subtitle, id AS athlete_id, NULL::uuid AS parent_id,
                  archived_at, created_at AS sort_at
             FROM athlete.profile
            WHERE workspace_id = $1 AND archived_at IS NULL
           UNION ALL
           SELECT 'goal'::text, id, title, description, athlete_id, NULL::uuid,
                  archived_at, created_at
             FROM design.training_goal
            WHERE workspace_id = $1 AND archived_at IS NULL
           UNION ALL
           SELECT 'movement'::text, id, canonical_name,
                  concat_ws(' · ', modality, movement_pattern), NULL::uuid,
                  NULL::uuid, archived_at, created_at
             FROM design.movement_definition
            WHERE (scope = 'global' OR workspace_id = $1)
              AND archived_at IS NULL
           UNION ALL
           SELECT 'plan'::text, id, title, description, athlete_id, NULL::uuid,
                  archived_at, created_at
             FROM design.training_plan
            WHERE workspace_id = $1 AND archived_at IS NULL
           UNION ALL
           SELECT 'session'::text, id, title,
                  scheduled_local_date::text, athlete_id, plan_id,
                  archived_at, created_at
             FROM design.session_prescription
            WHERE workspace_id = $1 AND archived_at IS NULL
           UNION ALL
           SELECT 'execution'::text, execution.id,
                  coalesce(prescription.title, 'Executed session'),
                  execution.status, execution.athlete_id,
                  execution.prescription_id, NULL::timestamptz,
                  execution.started_at
             FROM execution.session AS execution
             LEFT JOIN design.session_prescription AS prescription
               ON prescription.workspace_id = execution.workspace_id
              AND prescription.id = execution.prescription_id
            WHERE execution.workspace_id = $1
         )
         SELECT kind, id, title, subtitle, athlete_id, parent_id, archived_at
           FROM records
          WHERE $2 = ''
             OR title ILIKE '%' || $2 || '%'
             OR coalesce(subtitle, '') ILIKE '%' || $2 || '%'
          ORDER BY
            CASE
              WHEN lower(title) = lower($2) THEN 0
              WHEN lower(title) LIKE lower($2) || '%' THEN 1
              ELSE 2
            END,
            sort_at DESC,
            id
          LIMIT $3`,
        [scope.workspaceId, normalizedQuery, limit],
      );
      return result.rows.map((row) => ({
        kind: row.kind,
        id: row.id,
        title: row.title,
        subtitle: row.subtitle === null ? null : String(row.subtitle),
        athleteId: row.athlete_id === null ? null : row.athlete_id,
        parentId: row.parent_id === null ? null : row.parent_id,
        archivedAt:
          row.archived_at === null
            ? null
            : (instant(row.archived_at) as Instant),
      }));
    },
  };
  return { search };
}
