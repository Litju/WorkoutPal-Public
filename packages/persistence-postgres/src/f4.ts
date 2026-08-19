import type {
  ExecutedSessionRepository,
  ExecutionAmendmentRepository,
  F4Repositories,
  PerformedEnduranceSegmentRepository,
  PerformedMobilityItemRepository,
  PerformedStrengthSetRepository,
  SessionObservationRepository,
} from "@workoutpal/application";
import type {
  AthleteId,
  UUID,
  WorkspaceId,
  WorkspaceScope,
} from "@workoutpal/shared-kernel";
import type {
  ExecutedSession,
  ExecutionAmendment,
  ExecutionJsonObject,
  PerformedEnduranceSegment,
  PerformedMobilityItem,
  PerformedStrengthSet,
  SessionObservation,
} from "@workoutpal/training-execution";
import type { PoolClient } from "pg";

function instant(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function optionalNumber(
  row: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = row[key];
  return value === null || value === undefined ? undefined : Number(value);
}

function optionalString(
  row: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = row[key];
  return value === null || value === undefined ? undefined : String(value);
}

function mapSession(row: Record<string, unknown>): ExecutedSession {
  const prescription =
    row.prescription_id === null
      ? null
      : {
          prescriptionId: row.prescription_id as UUID,
          prescriptionVersion: Number(row.prescription_version),
          prescriptionRevision: Number(row.prescription_revision),
          snapshotFingerprint: String(row.snapshot_fingerprint),
          snapshot: row.prescription_snapshot as ExecutionJsonObject,
        };
  return {
    id: row.id as UUID,
    workspaceId: row.workspace_id as WorkspaceId,
    athleteId: row.athlete_id as AthleteId,
    status: row.status as ExecutedSession["status"],
    startedAt: instant(row.started_at) as ExecutedSession["startedAt"],
    completedAt:
      row.completed_at === null
        ? null
        : (instant(row.completed_at) as ExecutedSession["completedAt"]),
    timeZone: row.time_zone as ExecutedSession["timeZone"],
    prescription,
    createdAt: instant(row.created_at) as ExecutedSession["createdAt"],
    createdBy: row.created_by as UUID,
    updatedAt: instant(row.updated_at) as ExecutedSession["updatedAt"],
    updatedBy: row.updated_by as UUID,
    facts: [],
    version: Number(row.version),
  };
}

function mapStrengthSet(row: Record<string, unknown>): PerformedStrengthSet {
  const prescriptionExerciseId = row.prescription_exercise_id;
  const prescriptionSetId = row.prescription_set_id;
  const repetitions = optionalNumber(row, "repetitions");
  const loadKg = optionalNumber(row, "load_kg");
  const rpe = optionalNumber(row, "rpe");
  const rir = optionalNumber(row, "rir");
  const durationSeconds = optionalNumber(row, "duration_seconds");
  const notes = optionalString(row, "notes");
  return {
    kind: "strength-set",
    id: row.id as UUID,
    workspaceId: row.workspace_id as WorkspaceId,
    sessionId: row.session_id as UUID,
    movementId: row.movement_id as UUID,
    ...(prescriptionExerciseId === null
      ? {}
      : { prescriptionExerciseId: prescriptionExerciseId as UUID }),
    ...(prescriptionSetId === null
      ? {}
      : { prescriptionSetId: prescriptionSetId as UUID }),
    observedAt: instant(row.observed_at) as PerformedStrengthSet["observedAt"],
    ...(repetitions === undefined ? {} : { repetitions }),
    ...(loadKg === undefined ? {} : { loadKg }),
    ...(rpe === undefined ? {} : { rpe }),
    ...(rir === undefined ? {} : { rir }),
    ...(durationSeconds === undefined ? {} : { durationSeconds }),
    ...(notes === undefined ? {} : { notes }),
  };
}

function mapEnduranceSegment(
  row: Record<string, unknown>,
): PerformedEnduranceSegment {
  const prescriptionSegmentId = row.prescription_segment_id;
  const modality = optionalString(row, "modality");
  const durationSeconds = optionalNumber(row, "duration_seconds");
  const distanceMeters = optionalNumber(row, "distance_meters");
  const averageSpeedMps = optionalNumber(row, "average_speed_mps");
  const averageHeartRateBpm = optionalNumber(row, "average_heart_rate_bpm");
  const averagePowerWatts = optionalNumber(row, "average_power_watts");
  const rpe = optionalNumber(row, "rpe");
  const notes = optionalString(row, "notes");
  return {
    kind: "endurance-segment",
    id: row.id as UUID,
    workspaceId: row.workspace_id as WorkspaceId,
    sessionId: row.session_id as UUID,
    ...(prescriptionSegmentId === null
      ? {}
      : { prescriptionSegmentId: prescriptionSegmentId as UUID }),
    observedAt: instant(
      row.observed_at,
    ) as PerformedEnduranceSegment["observedAt"],
    ...(modality === undefined ? {} : { modality }),
    ...(durationSeconds === undefined ? {} : { durationSeconds }),
    ...(distanceMeters === undefined ? {} : { distanceMeters }),
    ...(averageSpeedMps === undefined ? {} : { averageSpeedMps }),
    ...(averageHeartRateBpm === undefined ? {} : { averageHeartRateBpm }),
    ...(averagePowerWatts === undefined ? {} : { averagePowerWatts }),
    ...(rpe === undefined ? {} : { rpe }),
    ...(notes === undefined ? {} : { notes }),
  };
}

function mapMobilityItem(row: Record<string, unknown>): PerformedMobilityItem {
  const prescriptionItemId = row.prescription_item_id;
  const sets = optionalNumber(row, "sets");
  const repetitions = optionalNumber(row, "repetitions");
  const durationSeconds = optionalNumber(row, "duration_seconds");
  const side = optionalString(row, "side");
  const rpe = optionalNumber(row, "rpe");
  const notes = optionalString(row, "notes");
  const base: Omit<PerformedMobilityItem, "side"> = {
    kind: "mobility-item",
    id: row.id as UUID,
    workspaceId: row.workspace_id as WorkspaceId,
    sessionId: row.session_id as UUID,
    movementId: row.movement_id as UUID,
    ...(prescriptionItemId === null
      ? {}
      : { prescriptionItemId: prescriptionItemId as UUID }),
    observedAt: instant(row.observed_at) as PerformedMobilityItem["observedAt"],
    ...(sets === undefined ? {} : { sets }),
    ...(repetitions === undefined ? {} : { repetitions }),
    ...(durationSeconds === undefined ? {} : { durationSeconds }),
    ...(rpe === undefined ? {} : { rpe }),
    ...(notes === undefined ? {} : { notes }),
  };
  return side === undefined
    ? base
    : {
        ...base,
        side: side as NonNullable<PerformedMobilityItem["side"]>,
      };
}

function mapObservation(row: Record<string, unknown>): SessionObservation {
  const valueText = optionalString(row, "value_text");
  const valueNumber = optionalNumber(row, "value_number");
  const unit = optionalString(row, "unit");
  const notes = optionalString(row, "notes");
  return {
    id: row.id as UUID,
    workspaceId: row.workspace_id as WorkspaceId,
    sessionId: row.session_id as UUID,
    observedAt: instant(row.observed_at) as SessionObservation["observedAt"],
    kind: row.kind as SessionObservation["kind"],
    ...(valueText === undefined ? {} : { valueText }),
    ...(valueNumber === undefined ? {} : { valueNumber }),
    ...(unit === undefined ? {} : { unit }),
    ...(notes === undefined ? {} : { notes }),
  };
}

function mapAmendment(row: Record<string, unknown>): ExecutionAmendment {
  const originalValues = row.original_values as Readonly<
    Record<string, unknown>
  >;
  return {
    id: row.id as UUID,
    workspaceId: row.workspace_id as WorkspaceId,
    sessionId: row.session_id as UUID,
    factKind: row.fact_kind as NonNullable<ExecutionAmendment["factKind"]>,
    factId: row.fact_id as UUID,
    actorId: row.actor_id as UUID,
    reason: row.reason as string,
    originalValues,
    correctedFields: row.corrected_fields as Readonly<Record<string, unknown>>,
    occurredAt: instant(row.occurred_at) as ExecutionAmendment["occurredAt"],
  };
}

const sessionSelect = `
  SELECT id, workspace_id, athlete_id, prescription_id, prescription_version,
         prescription_revision, prescription_snapshot, snapshot_fingerprint,
         status, started_at, completed_at, time_zone, created_at, created_by,
         updated_at, updated_by, version
    FROM execution.session`;

export function createExecutionRepositories(
  client: PoolClient,
): Pick<
  F4Repositories,
  | "executedSessions"
  | "performedStrengthSets"
  | "performedEnduranceSegments"
  | "performedMobilityItems"
  | "sessionObservations"
  | "executionAmendments"
> {
  const executedSessions: ExecutedSessionRepository = {
    async get(scope: WorkspaceScope, sessionId: UUID) {
      const result = await client.query(
        `${sessionSelect} WHERE workspace_id = $1 AND id = $2`,
        [scope.workspaceId, sessionId],
      );
      const row = result.rows[0] as Record<string, unknown> | undefined;
      return row === undefined ? null : mapSession(row);
    },
    async listForAthlete(scope: WorkspaceScope, athleteId: AthleteId) {
      const result = await client.query(
        `${sessionSelect}
          WHERE workspace_id = $1 AND athlete_id = $2
          ORDER BY started_at DESC, id`,
        [scope.workspaceId, athleteId],
      );
      return result.rows.map((row) =>
        mapSession(row as Record<string, unknown>),
      );
    },
    async findForPrescription(
      scope: WorkspaceScope,
      prescriptionId: UUID,
      prescriptionRevision: number,
    ) {
      const result = await client.query(
        `${sessionSelect}
          WHERE workspace_id = $1 AND prescription_id = $2 AND prescription_revision = $3
          ORDER BY started_at DESC, id
          LIMIT 1`,
        [scope.workspaceId, prescriptionId, prescriptionRevision],
      );
      const row = result.rows[0] as Record<string, unknown> | undefined;
      return row === undefined ? null : mapSession(row);
    },
    async insert(session: ExecutedSession) {
      const prescription = session.prescription;
      await client.query(
        `INSERT INTO execution.session
           (id, workspace_id, athlete_id, prescription_id, prescription_version,
            prescription_revision, prescription_snapshot, snapshot_fingerprint,
            status, started_at, completed_at, time_zone, created_at, created_by,
            updated_at, updated_by, version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [
          session.id,
          session.workspaceId,
          session.athleteId,
          prescription?.prescriptionId ?? null,
          prescription?.prescriptionVersion ?? null,
          prescription?.prescriptionRevision ?? null,
          prescription?.snapshot ?? null,
          prescription?.snapshotFingerprint ?? null,
          session.status,
          session.startedAt,
          session.completedAt,
          session.timeZone,
          session.createdAt,
          session.createdBy,
          session.updatedAt,
          session.updatedBy,
          session.version,
        ],
      );
    },
    async updateExpected(
      scope: WorkspaceScope,
      session: ExecutedSession,
      expectedVersion: number,
    ) {
      const result = await client.query(
        `UPDATE execution.session
            SET status = $3, completed_at = $4, updated_at = $5,
                updated_by = $6, version = $7
          WHERE workspace_id = $1 AND id = $2 AND version = $8
          RETURNING id, workspace_id, athlete_id, prescription_id, prescription_version,
                    prescription_revision, prescription_snapshot, snapshot_fingerprint,
                    status, started_at, completed_at, time_zone, created_at, created_by,
                    updated_at, updated_by, version`,
        [
          scope.workspaceId,
          session.id,
          session.status,
          session.completedAt,
          session.updatedAt,
          session.updatedBy,
          session.version,
          expectedVersion,
        ],
      );
      const row = result.rows[0] as Record<string, unknown> | undefined;
      return row === undefined ? null : mapSession(row);
    },
  };

  const performedStrengthSets: PerformedStrengthSetRepository = {
    async get(scope, factId) {
      const result = await client.query(
        `SELECT id, workspace_id, session_id, movement_id, prescription_exercise_id,
                prescription_set_id, observed_at, repetitions, load_kg, rpe, rir,
                duration_seconds, notes
           FROM execution.strength_set
          WHERE workspace_id = $1 AND id = $2`,
        [scope.workspaceId, factId],
      );
      const row = result.rows[0] as Record<string, unknown> | undefined;
      return row === undefined ? null : mapStrengthSet(row);
    },
    async listForSession(scope, sessionId) {
      const result = await client.query(
        `SELECT id, workspace_id, session_id, movement_id, prescription_exercise_id,
                prescription_set_id, observed_at, repetitions, load_kg, rpe, rir,
                duration_seconds, notes
           FROM execution.strength_set
          WHERE workspace_id = $1 AND session_id = $2
          ORDER BY observed_at, id`,
        [scope.workspaceId, sessionId],
      );
      return result.rows.map((row) =>
        mapStrengthSet(row as Record<string, unknown>),
      );
    },
    async listForSessions(scope, sessionIds) {
      if (sessionIds.length === 0) return [];
      const result = await client.query(
        `SELECT id, workspace_id, session_id, movement_id, prescription_exercise_id,
                prescription_set_id, observed_at, repetitions, load_kg, rpe, rir,
                duration_seconds, notes
           FROM execution.strength_set
          WHERE workspace_id = $1 AND session_id = ANY($2::uuid[])
          ORDER BY session_id, observed_at, id`,
        [scope.workspaceId, sessionIds],
      );
      return result.rows.map((row) =>
        mapStrengthSet(row as Record<string, unknown>),
      );
    },
    async insert(fact) {
      await client.query(
        `INSERT INTO execution.strength_set
           (id, workspace_id, session_id, movement_id, prescription_exercise_id,
            prescription_set_id, observed_at, repetitions, load_kg, rpe, rir,
            duration_seconds, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          fact.id,
          fact.workspaceId,
          fact.sessionId,
          fact.movementId,
          fact.prescriptionExerciseId ?? null,
          fact.prescriptionSetId ?? null,
          fact.observedAt,
          fact.repetitions ?? null,
          fact.loadKg ?? null,
          fact.rpe ?? null,
          fact.rir ?? null,
          fact.durationSeconds ?? null,
          fact.notes ?? null,
        ],
      );
    },
  };

  const performedEnduranceSegments: PerformedEnduranceSegmentRepository = {
    async get(scope, factId) {
      const result = await client.query(
        `SELECT id, workspace_id, session_id, prescription_segment_id, observed_at,
                modality, duration_seconds, distance_meters, average_speed_mps,
                average_heart_rate_bpm,
                average_power_watts, rpe, notes
           FROM execution.endurance_segment
          WHERE workspace_id = $1 AND id = $2`,
        [scope.workspaceId, factId],
      );
      const row = result.rows[0] as Record<string, unknown> | undefined;
      return row === undefined ? null : mapEnduranceSegment(row);
    },
    async listForSession(scope, sessionId) {
      const result = await client.query(
        `SELECT id, workspace_id, session_id, prescription_segment_id, observed_at,
                modality, duration_seconds, distance_meters, average_speed_mps,
                average_heart_rate_bpm,
                average_power_watts, rpe, notes
           FROM execution.endurance_segment
          WHERE workspace_id = $1 AND session_id = $2
          ORDER BY observed_at, id`,
        [scope.workspaceId, sessionId],
      );
      return result.rows.map((row) =>
        mapEnduranceSegment(row as Record<string, unknown>),
      );
    },
    async listForSessions(scope, sessionIds) {
      if (sessionIds.length === 0) return [];
      const result = await client.query(
        `SELECT id, workspace_id, session_id, prescription_segment_id, observed_at,
                modality, duration_seconds, distance_meters, average_speed_mps,
                average_heart_rate_bpm,
                average_power_watts, rpe, notes
           FROM execution.endurance_segment
          WHERE workspace_id = $1 AND session_id = ANY($2::uuid[])
          ORDER BY session_id, observed_at, id`,
        [scope.workspaceId, sessionIds],
      );
      return result.rows.map((row) =>
        mapEnduranceSegment(row as Record<string, unknown>),
      );
    },
    async insert(fact) {
      await client.query(
        `INSERT INTO execution.endurance_segment
           (id, workspace_id, session_id, prescription_segment_id, observed_at,
            modality, duration_seconds, distance_meters, average_speed_mps,
            average_heart_rate_bpm, average_power_watts, rpe, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          fact.id,
          fact.workspaceId,
          fact.sessionId,
          fact.prescriptionSegmentId ?? null,
          fact.observedAt,
          fact.modality ?? null,
          fact.durationSeconds ?? null,
          fact.distanceMeters ?? null,
          fact.averageSpeedMps ?? null,
          fact.averageHeartRateBpm ?? null,
          fact.averagePowerWatts ?? null,
          fact.rpe ?? null,
          fact.notes ?? null,
        ],
      );
    },
  };

  const performedMobilityItems: PerformedMobilityItemRepository = {
    async get(scope, factId) {
      const result = await client.query(
        `SELECT id, workspace_id, session_id, movement_id, prescription_item_id,
                observed_at, sets, repetitions, duration_seconds, side, rpe, notes
           FROM execution.mobility_item
          WHERE workspace_id = $1 AND id = $2`,
        [scope.workspaceId, factId],
      );
      const row = result.rows[0] as Record<string, unknown> | undefined;
      return row === undefined ? null : mapMobilityItem(row);
    },
    async listForSession(scope, sessionId) {
      const result = await client.query(
        `SELECT id, workspace_id, session_id, movement_id, prescription_item_id,
                observed_at, sets, repetitions, duration_seconds, side, rpe, notes
           FROM execution.mobility_item
          WHERE workspace_id = $1 AND session_id = $2
          ORDER BY observed_at, id`,
        [scope.workspaceId, sessionId],
      );
      return result.rows.map((row) =>
        mapMobilityItem(row as Record<string, unknown>),
      );
    },
    async listForSessions(scope, sessionIds) {
      if (sessionIds.length === 0) return [];
      const result = await client.query(
        `SELECT id, workspace_id, session_id, movement_id, prescription_item_id,
                observed_at, sets, repetitions, duration_seconds, side, rpe, notes
           FROM execution.mobility_item
          WHERE workspace_id = $1 AND session_id = ANY($2::uuid[])
          ORDER BY session_id, observed_at, id`,
        [scope.workspaceId, sessionIds],
      );
      return result.rows.map((row) =>
        mapMobilityItem(row as Record<string, unknown>),
      );
    },
    async insert(fact) {
      await client.query(
        `INSERT INTO execution.mobility_item
           (id, workspace_id, session_id, movement_id, prescription_item_id,
            observed_at, sets, repetitions, duration_seconds, side, rpe, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          fact.id,
          fact.workspaceId,
          fact.sessionId,
          fact.movementId,
          fact.prescriptionItemId ?? null,
          fact.observedAt,
          fact.sets ?? null,
          fact.repetitions ?? null,
          fact.durationSeconds ?? null,
          fact.side ?? null,
          fact.rpe ?? null,
          fact.notes ?? null,
        ],
      );
    },
  };

  const sessionObservations: SessionObservationRepository = {
    async listForSession(scope, sessionId) {
      const result = await client.query(
        `SELECT id, workspace_id, session_id, observed_at, kind, value_text,
                value_number, unit, notes
           FROM execution.session_observation
          WHERE workspace_id = $1 AND session_id = $2
          ORDER BY observed_at, id`,
        [scope.workspaceId, sessionId],
      );
      return result.rows.map((row) =>
        mapObservation(row as Record<string, unknown>),
      );
    },
    async listForSessions(scope, sessionIds) {
      if (sessionIds.length === 0) return [];
      const result = await client.query(
        `SELECT id, workspace_id, session_id, observed_at, kind, value_text,
                value_number, unit, notes
           FROM execution.session_observation
          WHERE workspace_id = $1 AND session_id = ANY($2::uuid[])
          ORDER BY session_id, observed_at, id`,
        [scope.workspaceId, sessionIds],
      );
      return result.rows.map((row) =>
        mapObservation(row as Record<string, unknown>),
      );
    },
    async insert(observation) {
      await client.query(
        `INSERT INTO execution.session_observation
           (id, workspace_id, session_id, observed_at, kind, value_text,
            value_number, unit, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          observation.id,
          observation.workspaceId,
          observation.sessionId,
          observation.observedAt,
          observation.kind,
          observation.valueText ?? null,
          observation.valueNumber ?? null,
          observation.unit ?? null,
          observation.notes ?? null,
        ],
      );
    },
  };

  const executionAmendments: ExecutionAmendmentRepository = {
    async listForSession(scope, sessionId) {
      const result = await client.query(
        `SELECT id, workspace_id, session_id, fact_kind, fact_id, actor_id,
                reason, original_values, corrected_fields, occurred_at
           FROM execution.amendment
          WHERE workspace_id = $1 AND session_id = $2
          ORDER BY occurred_at, id`,
        [scope.workspaceId, sessionId],
      );
      return result.rows.map((row) =>
        mapAmendment(row as Record<string, unknown>),
      );
    },
    async listForSessions(scope, sessionIds) {
      if (sessionIds.length === 0) return [];
      const result = await client.query(
        `SELECT id, workspace_id, session_id, fact_kind, fact_id, actor_id,
                reason, original_values, corrected_fields, occurred_at
           FROM execution.amendment
          WHERE workspace_id = $1 AND session_id = ANY($2::uuid[])
          ORDER BY session_id, occurred_at, id`,
        [scope.workspaceId, sessionIds],
      );
      return result.rows.map((row) =>
        mapAmendment(row as Record<string, unknown>),
      );
    },
    async insert(amendment) {
      await client.query(
        `INSERT INTO execution.amendment
           (id, workspace_id, session_id, fact_kind, fact_id, actor_id, reason,
            original_values, corrected_fields, occurred_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          amendment.id,
          amendment.workspaceId,
          amendment.sessionId,
          amendment.factKind,
          amendment.factId,
          amendment.actorId,
          amendment.reason,
          amendment.originalValues ?? {},
          amendment.correctedFields,
          amendment.occurredAt,
        ],
      );
    },
  };

  return {
    executedSessions,
    performedStrengthSets,
    performedEnduranceSegments,
    performedMobilityItems,
    sessionObservations,
    executionAmendments,
  };
}
