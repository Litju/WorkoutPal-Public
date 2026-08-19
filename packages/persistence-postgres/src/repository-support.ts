import type { UUID, WorkspaceScope } from "@workoutpal/shared-kernel";
import type {
  PrescriptionBlock,
  SessionPrescription,
  StrengthExercisePrescription,
} from "@workoutpal/training-design";
import type { PoolClient } from "pg";
import {
  mapEnduranceSegment,
  mapMobilityItem,
  mapSession,
  mapStrengthSet,
  optionalString,
} from "./mappers.js";

export async function hydrateSession(
  client: PoolClient,
  row: Record<string, unknown>,
): Promise<SessionPrescription> {
  const blockResult = await client.query(
    `SELECT id, workspace_id, session_id, ordinal, kind, generic_description
       FROM design.session_block
      WHERE workspace_id = $1 AND session_id = $2
      ORDER BY ordinal, id`,
    [row.workspace_id, row.id],
  );
  const blocks: PrescriptionBlock[] = [];
  for (const rawBlock of blockResult.rows) {
    const block = rawBlock as Record<string, unknown>;
    const kind = block.kind as PrescriptionBlock["kind"];
    if (kind === "strength") {
      const exerciseResult = await client.query(
        `SELECT id, movement_id, ordinal, notes
           FROM design.strength_exercise_prescription
          WHERE workspace_id = $1 AND block_id = $2
          ORDER BY ordinal, id`,
        [row.workspace_id, block.id],
      );
      const exercises: StrengthExercisePrescription[] = [];
      for (const rawExercise of exerciseResult.rows) {
        const exercise = rawExercise as Record<string, unknown>;
        const exerciseNotes = optionalString(exercise, "notes");
        const setResult = await client.query(
          `SELECT id, ordinal, target_rep_min, target_rep_max, target_load_kg,
                  target_rpe, target_rpe_scale, target_rir, target_rir_scale,
                  target_rest_seconds, target_duration_seconds,
                  target_velocity_mps, tempo_descriptor, notes
             FROM design.strength_set_prescription
            WHERE workspace_id = $1 AND exercise_id = $2
            ORDER BY ordinal, id`,
          [row.workspace_id, exercise.id],
        );
        exercises.push({
          id: exercise.id as UUID,
          movementId: exercise.movement_id as UUID,
          ordinal: Number(exercise.ordinal),
          ...(exerciseNotes === undefined ? {} : { notes: exerciseNotes }),
          sets: setResult.rows.map((set) =>
            mapStrengthSet(set as Record<string, unknown>),
          ),
        });
      }
      blocks.push({
        id: block.id as UUID,
        kind: "strength",
        ordinal: Number(block.ordinal),
        exercises,
      });
    } else if (kind === "endurance") {
      const segmentResult = await client.query(
        `SELECT id, parent_segment_id, ordinal, kind, repeat_count,
                duration_seconds, distance_meters, target_hr_min, target_hr_max,
                target_speed_mps_min, target_speed_mps_max,
                target_power_watts_min, target_power_watts_max, target_rpe, notes
           FROM design.endurance_segment_prescription
          WHERE workspace_id = $1 AND block_id = $2
          ORDER BY parent_segment_id NULLS FIRST, ordinal, id`,
        [row.workspace_id, block.id],
      );
      blocks.push({
        id: block.id as UUID,
        kind: "endurance",
        ordinal: Number(block.ordinal),
        segments: segmentResult.rows.map((segment) =>
          mapEnduranceSegment(segment as Record<string, unknown>),
        ),
      });
    } else if (kind === "mobility") {
      const itemResult = await client.query(
        `SELECT id, movement_id, ordinal, sets, reps, hold_seconds, side, target_rpe, notes
           FROM design.mobility_item_prescription
          WHERE workspace_id = $1 AND block_id = $2
          ORDER BY ordinal, id`,
        [row.workspace_id, block.id],
      );
      blocks.push({
        id: block.id as UUID,
        kind: "mobility",
        ordinal: Number(block.ordinal),
        items: itemResult.rows.map((item) =>
          mapMobilityItem(item as Record<string, unknown>),
        ),
      });
    } else {
      blocks.push({
        id: block.id as UUID,
        kind: "generic",
        ordinal: Number(block.ordinal),
        description: String(block.generic_description ?? ""),
      });
    }
  }
  return mapSession(row, blocks);
}

export async function selectPlanRow(
  client: PoolClient,
  scope: WorkspaceScope,
  planId: UUID,
): Promise<Record<string, unknown> | undefined> {
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
      WHERE p.workspace_id = $1 AND p.id = $2
      GROUP BY p.id`,
    [scope.workspaceId, planId],
  );
  return result.rows[0] as Record<string, unknown> | undefined;
}

export async function replaceSessionBlocks(
  client: PoolClient,
  session: SessionPrescription,
): Promise<void> {
  await client.query(
    `DELETE FROM design.session_block WHERE workspace_id = $1 AND session_id = $2`,
    [session.workspaceId, session.id],
  );
  for (const block of session.blocks) {
    await client.query(
      `INSERT INTO design.session_block
         (id, workspace_id, session_id, ordinal, kind, generic_description)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        block.id,
        session.workspaceId,
        session.id,
        block.ordinal,
        block.kind,
        block.kind === "generic" ? block.description : null,
      ],
    );
    if (block.kind === "strength") {
      for (const exercise of block.exercises) {
        await client.query(
          `INSERT INTO design.strength_exercise_prescription
             (id, workspace_id, block_id, movement_id, ordinal, notes)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            exercise.id,
            session.workspaceId,
            block.id,
            exercise.movementId,
            exercise.ordinal,
            exercise.notes ?? null,
          ],
        );
        for (const set of exercise.sets) {
          await client.query(
            `INSERT INTO design.strength_set_prescription
               (id, workspace_id, exercise_id, ordinal, target_rep_min, target_rep_max,
                target_load_kg, target_rpe, target_rpe_scale, target_rir, target_rir_scale,
                target_rest_seconds, target_duration_seconds, target_velocity_mps,
                tempo_descriptor, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
            [
              set.id,
              session.workspaceId,
              exercise.id,
              set.ordinal,
              set.targetRepMin ?? null,
              set.targetRepMax ?? null,
              set.targetLoadKg ?? null,
              set.targetRpe ?? null,
              set.targetRpeScale ?? null,
              set.targetRir ?? null,
              set.targetRirScale ?? null,
              set.targetRestSeconds ?? null,
              set.targetDurationSeconds ?? null,
              set.targetVelocityMps ?? null,
              set.tempoDescriptor ?? null,
              set.notes ?? null,
            ],
          );
        }
      }
    } else if (block.kind === "endurance") {
      for (const segment of block.segments) {
        await client.query(
          `INSERT INTO design.endurance_segment_prescription
             (id, workspace_id, block_id, parent_segment_id, ordinal, kind, repeat_count,
              duration_seconds, distance_meters, target_hr_min, target_hr_max,
              target_speed_mps_min, target_speed_mps_max, target_power_watts_min,
              target_power_watts_max, target_rpe, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
          [
            segment.id,
            session.workspaceId,
            block.id,
            segment.parentSegmentId,
            segment.ordinal,
            segment.kind,
            segment.repeatCount,
            segment.durationSeconds ?? null,
            segment.distanceMeters ?? null,
            segment.targetHrMin ?? null,
            segment.targetHrMax ?? null,
            segment.targetSpeedMpsMin ?? null,
            segment.targetSpeedMpsMax ?? null,
            segment.targetPowerWattsMin ?? null,
            segment.targetPowerWattsMax ?? null,
            segment.targetRpe ?? null,
            segment.notes ?? null,
          ],
        );
      }
    } else if (block.kind === "mobility") {
      for (const item of block.items) {
        await client.query(
          `INSERT INTO design.mobility_item_prescription
             (id, workspace_id, block_id, movement_id, ordinal, sets, reps, hold_seconds, side, target_rpe, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            item.id,
            session.workspaceId,
            block.id,
            item.movementId,
            item.ordinal,
            item.sets ?? null,
            item.reps ?? null,
            item.holdSeconds ?? null,
            item.side ?? null,
            item.targetRpe ?? null,
            item.notes ?? null,
          ],
        );
      }
    }
  }
}
