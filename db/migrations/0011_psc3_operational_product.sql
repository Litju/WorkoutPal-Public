-- PSC3 operational product completion. These tables remain descriptive and
-- factual: no readiness, fatigue, recovery, load, zones, thresholds, or
-- scientific interpretation is introduced here.

ALTER TABLE execution.endurance_segment
  ADD COLUMN IF NOT EXISTS average_speed_mps numeric;

ALTER TABLE execution.endurance_segment
  ADD CONSTRAINT execution_endurance_average_speed_nonnegative
  CHECK (average_speed_mps IS NULL OR average_speed_mps >= 0);

CREATE TABLE IF NOT EXISTS athlete.training_context (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  athlete_id uuid NOT NULL,
  training_age_months integer CHECK (
    training_age_months IS NULL OR training_age_months >= 0
  ),
  availability_notes text,
  operational_constraints text,
  equipment_access jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (
    jsonb_typeof(equipment_access) = 'array'
  ),
  training_preferences text,
  practitioner_notes text,
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, athlete_id),
  FOREIGN KEY (workspace_id, athlete_id)
    REFERENCES athlete.profile (workspace_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS athlete_training_context_workspace_idx
  ON athlete.training_context (workspace_id, updated_at DESC, athlete_id);

CREATE TABLE IF NOT EXISTS iam.workspace_preferences (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES iam.workspace (id) ON DELETE RESTRICT,
  mass_unit text NOT NULL CHECK (mass_unit IN ('kg', 'lb')),
  distance_unit text NOT NULL CHECK (distance_unit IN ('m', 'km', 'mi')),
  pace_unit text NOT NULL CHECK (pace_unit IN ('per-km', 'per-mi')),
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (workspace_id),
  UNIQUE (workspace_id, id)
);

CREATE INDEX IF NOT EXISTS iam_workspace_preferences_workspace_idx
  ON iam.workspace_preferences (workspace_id);

ALTER TABLE athlete.training_context ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_workspace_boundary ON athlete.training_context;
CREATE POLICY tenant_workspace_boundary ON athlete.training_context
  USING (
    workspace_id = iam.current_workspace_id()
    AND iam.has_active_membership(iam.current_principal_id(), workspace_id)
  )
  WITH CHECK (
    workspace_id = iam.current_workspace_id()
    AND iam.has_active_membership(iam.current_principal_id(), workspace_id)
  );

ALTER TABLE iam.workspace_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_workspace_boundary ON iam.workspace_preferences;
CREATE POLICY tenant_workspace_boundary ON iam.workspace_preferences
  USING (
    workspace_id = iam.current_workspace_id()
    AND iam.has_active_membership(iam.current_principal_id(), workspace_id)
  )
  WITH CHECK (
    workspace_id = iam.current_workspace_id()
    AND iam.has_active_membership(iam.current_principal_id(), workspace_id)
  );

GRANT SELECT, INSERT, UPDATE, DELETE
  ON athlete.training_context, iam.workspace_preferences
  TO workoutpal_runtime;

GRANT USAGE, SELECT
  ON ALL SEQUENCES IN SCHEMA athlete, iam
  TO workoutpal_runtime;
