-- F4 records observed execution separately from F3 prescribed intent.
-- Performed fact tables intentionally expose insert/list semantics only in the adapter.

CREATE SCHEMA IF NOT EXISTS execution;

CREATE TABLE IF NOT EXISTS execution.session (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES iam.workspace (id),
  athlete_id uuid NOT NULL,
  prescription_id uuid NOT NULL,
  prescription_version bigint NOT NULL CHECK (prescription_version > 0),
  prescription_revision integer NOT NULL CHECK (prescription_revision > 0),
  prescription_snapshot jsonb NOT NULL CHECK (jsonb_typeof(prescription_snapshot) = 'object'),
  snapshot_fingerprint text NOT NULL CHECK (length(btrim(snapshot_fingerprint)) > 0),
  status text NOT NULL CHECK (status IN ('started', 'completed', 'cancelled')),
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  time_zone text NOT NULL CHECK (length(btrim(time_zone)) > 0),
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, athlete_id)
    REFERENCES athlete.profile (workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, prescription_id)
    REFERENCES design.session_prescription (workspace_id, id) ON DELETE RESTRICT,
  CHECK ((status = 'completed' AND completed_at IS NOT NULL) OR status <> 'completed')
);

CREATE INDEX IF NOT EXISTS execution_session_athlete_idx
  ON execution.session (workspace_id, athlete_id, started_at DESC, id);

CREATE INDEX IF NOT EXISTS execution_session_prescription_idx
  ON execution.session (workspace_id, prescription_id, prescription_revision, id);

CREATE TABLE IF NOT EXISTS execution.strength_set (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  session_id uuid NOT NULL,
  movement_id uuid NOT NULL REFERENCES design.movement_definition (id) ON DELETE RESTRICT,
  prescription_exercise_id uuid,
  prescription_set_id uuid,
  observed_at timestamptz NOT NULL,
  repetitions numeric CHECK (repetitions IS NULL OR repetitions >= 0),
  load_kg numeric CHECK (load_kg IS NULL OR load_kg >= 0),
  rpe numeric CHECK (rpe IS NULL OR rpe BETWEEN 0 AND 10),
  rir numeric CHECK (rir IS NULL OR rir BETWEEN 0 AND 10),
  duration_seconds numeric CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  notes text,
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, session_id)
    REFERENCES execution.session (workspace_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS execution_strength_session_idx
  ON execution.strength_set (workspace_id, session_id, observed_at, id);

CREATE TABLE IF NOT EXISTS execution.endurance_segment (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  session_id uuid NOT NULL,
  prescription_segment_id uuid,
  observed_at timestamptz NOT NULL,
  modality text,
  duration_seconds numeric CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  distance_meters numeric CHECK (distance_meters IS NULL OR distance_meters >= 0),
  average_heart_rate_bpm numeric CHECK (average_heart_rate_bpm IS NULL OR average_heart_rate_bpm >= 0),
  average_power_watts numeric CHECK (average_power_watts IS NULL OR average_power_watts >= 0),
  rpe numeric CHECK (rpe IS NULL OR rpe BETWEEN 0 AND 10),
  notes text,
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, session_id)
    REFERENCES execution.session (workspace_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS execution_endurance_session_idx
  ON execution.endurance_segment (workspace_id, session_id, observed_at, id);

CREATE TABLE IF NOT EXISTS execution.mobility_item (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  session_id uuid NOT NULL,
  movement_id uuid NOT NULL REFERENCES design.movement_definition (id) ON DELETE RESTRICT,
  prescription_item_id uuid,
  observed_at timestamptz NOT NULL,
  sets numeric CHECK (sets IS NULL OR sets >= 0),
  repetitions numeric CHECK (repetitions IS NULL OR repetitions >= 0),
  duration_seconds numeric CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  side text CHECK (side IS NULL OR side IN ('left', 'right', 'bilateral', 'alternating')),
  rpe numeric CHECK (rpe IS NULL OR rpe BETWEEN 0 AND 10),
  notes text,
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, session_id)
    REFERENCES execution.session (workspace_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS execution_mobility_session_idx
  ON execution.mobility_item (workspace_id, session_id, observed_at, id);

CREATE TABLE IF NOT EXISTS execution.session_observation (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  session_id uuid NOT NULL,
  observed_at timestamptz NOT NULL,
  kind text NOT NULL CHECK (kind IN ('session-rpe', 'pain', 'note', 'other')),
  value_text text,
  value_number numeric CHECK (value_number IS NULL OR value_number >= 0),
  unit text,
  notes text,
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, session_id)
    REFERENCES execution.session (workspace_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS execution_observation_session_idx
  ON execution.session_observation (workspace_id, session_id, observed_at, id);

CREATE TABLE IF NOT EXISTS execution.amendment (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  session_id uuid NOT NULL,
  fact_kind text NOT NULL CHECK (fact_kind IN ('strength-set', 'endurance-segment', 'mobility-item')),
  fact_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  original_values jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(original_values) = 'object'),
  corrected_fields jsonb NOT NULL CHECK (jsonb_typeof(corrected_fields) = 'object' AND corrected_fields <> '{}'::jsonb),
  occurred_at timestamptz NOT NULL,
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, session_id)
    REFERENCES execution.session (workspace_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS execution_amendment_session_idx
  ON execution.amendment (workspace_id, session_id, occurred_at, id);

CREATE INDEX IF NOT EXISTS execution_amendment_fact_idx
  ON execution.amendment (workspace_id, fact_kind, fact_id, occurred_at, id);
