-- F3 owns training intent only. Executed/performed training remains outside this migration.

CREATE TABLE IF NOT EXISTS design.movement_definition (
  id uuid PRIMARY KEY,
  workspace_id uuid REFERENCES iam.workspace (id),
  scope text NOT NULL CHECK (scope IN ('global', 'workspace')),
  canonical_name text NOT NULL CHECK (length(btrim(canonical_name)) > 0),
  modality text NOT NULL CHECK (modality IN ('strength', 'endurance', 'mobility', 'general')),
  movement_pattern text,
  laterality text,
  equipment_tags jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(equipment_tags) = 'array'),
  archived_at timestamptz,
  created_at timestamptz NOT NULL,
  created_by uuid,
  updated_at timestamptz NOT NULL,
  updated_by uuid,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (workspace_id, id),
  CHECK ((scope = 'global' AND workspace_id IS NULL) OR (scope = 'workspace' AND workspace_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS design_movement_visible_idx
  ON design.movement_definition (workspace_id, scope, archived_at, canonical_name);

CREATE TABLE IF NOT EXISTS design.training_goal (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES iam.workspace (id),
  athlete_id uuid NOT NULL,
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  description text,
  target_date date,
  starts_on date,
  ends_on date,
  archived_at timestamptz,
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, athlete_id)
    REFERENCES athlete.profile (workspace_id, id) ON DELETE RESTRICT,
  CHECK (starts_on IS NULL OR ends_on IS NOT NULL),
  CHECK (ends_on IS NULL OR starts_on IS NOT NULL),
  CHECK (starts_on IS NULL OR starts_on <= ends_on)
);

CREATE INDEX IF NOT EXISTS design_training_goal_athlete_idx
  ON design.training_goal (workspace_id, athlete_id, archived_at, target_date);

CREATE TABLE IF NOT EXISTS design.training_plan (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES iam.workspace (id),
  athlete_id uuid NOT NULL,
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  description text,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  time_zone text NOT NULL CHECK (length(btrim(time_zone)) > 0),
  status text NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
  published_revision integer CHECK (published_revision IS NULL OR published_revision > 0),
  published_at timestamptz,
  published_by uuid,
  archived_at timestamptz,
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, athlete_id)
    REFERENCES athlete.profile (workspace_id, id) ON DELETE RESTRICT,
  CHECK (starts_on <= ends_on),
  CHECK ((status = 'archived' AND archived_at IS NOT NULL) OR status <> 'archived'),
  CHECK ((status = 'published' AND published_revision IS NOT NULL AND published_at IS NOT NULL) OR status <> 'published')
);

CREATE INDEX IF NOT EXISTS design_training_plan_athlete_idx
  ON design.training_plan (workspace_id, athlete_id, archived_at, starts_on);

CREATE TABLE IF NOT EXISTS design.training_plan_goal (
  workspace_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  goal_id uuid NOT NULL,
  PRIMARY KEY (workspace_id, plan_id, goal_id),
  FOREIGN KEY (workspace_id, plan_id)
    REFERENCES design.training_plan (workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, goal_id)
    REFERENCES design.training_goal (workspace_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS design_training_plan_goal_goal_idx
  ON design.training_plan_goal (workspace_id, goal_id, plan_id);

CREATE TABLE IF NOT EXISTS design.plan_phase (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES iam.workspace (id),
  plan_id uuid NOT NULL,
  parent_phase_id uuid,
  ordinal integer NOT NULL CHECK (ordinal > 0),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  classification text NOT NULL CHECK (classification IN ('macrocycle', 'mesocycle', 'microcycle', 'custom')),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (workspace_id, plan_id, id),
  FOREIGN KEY (workspace_id, plan_id)
    REFERENCES design.training_plan (workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, plan_id, parent_phase_id)
    REFERENCES design.plan_phase (workspace_id, plan_id, id) ON DELETE RESTRICT,
  CHECK (starts_on <= ends_on)
);

CREATE UNIQUE INDEX IF NOT EXISTS design_plan_phase_root_ordinal_idx
  ON design.plan_phase (workspace_id, plan_id, ordinal)
  WHERE parent_phase_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS design_plan_phase_child_ordinal_idx
  ON design.plan_phase (workspace_id, plan_id, parent_phase_id, ordinal)
  WHERE parent_phase_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS design_plan_phase_plan_idx
  ON design.plan_phase (workspace_id, plan_id, parent_phase_id, ordinal);

CREATE TABLE IF NOT EXISTS design.session_prescription (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES iam.workspace (id),
  athlete_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  phase_id uuid,
  scheduled_local_date date NOT NULL,
  time_zone text NOT NULL CHECK (length(btrim(time_zone)) > 0),
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  status text NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  published_revision integer CHECK (published_revision IS NULL OR published_revision > 0),
  published_at timestamptz,
  published_by uuid,
  archived_at timestamptz,
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, athlete_id)
    REFERENCES athlete.profile (workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, plan_id)
    REFERENCES design.training_plan (workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, plan_id, phase_id)
    REFERENCES design.plan_phase (workspace_id, plan_id, id) ON DELETE RESTRICT,
  CHECK ((status = 'archived' AND archived_at IS NOT NULL) OR status <> 'archived'),
  CHECK ((status = 'published' AND published_revision IS NOT NULL AND published_at IS NOT NULL) OR status <> 'published')
);

CREATE INDEX IF NOT EXISTS design_session_plan_date_idx
  ON design.session_prescription (workspace_id, plan_id, scheduled_local_date, id);

CREATE TABLE IF NOT EXISTS design.session_block (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES iam.workspace (id),
  session_id uuid NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal > 0),
  kind text NOT NULL CHECK (kind IN ('strength', 'endurance', 'mobility', 'generic')),
  generic_description text,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, session_id, id),
  FOREIGN KEY (workspace_id, session_id)
    REFERENCES design.session_prescription (workspace_id, id) ON DELETE CASCADE,
  CHECK ((kind = 'generic' AND generic_description IS NOT NULL) OR kind <> 'generic')
);

CREATE UNIQUE INDEX IF NOT EXISTS design_session_block_ordinal_idx
  ON design.session_block (workspace_id, session_id, ordinal);

CREATE TABLE IF NOT EXISTS design.strength_exercise_prescription (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES iam.workspace (id),
  block_id uuid NOT NULL,
  movement_id uuid NOT NULL REFERENCES design.movement_definition (id) ON DELETE RESTRICT,
  ordinal integer NOT NULL CHECK (ordinal > 0),
  notes text,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, block_id, id),
  FOREIGN KEY (workspace_id, block_id)
    REFERENCES design.session_block (workspace_id, id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS design_strength_exercise_ordinal_idx
  ON design.strength_exercise_prescription (workspace_id, block_id, ordinal);

CREATE TABLE IF NOT EXISTS design.strength_set_prescription (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES iam.workspace (id),
  exercise_id uuid NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal > 0),
  target_rep_min integer CHECK (target_rep_min IS NULL OR target_rep_min >= 0),
  target_rep_max integer CHECK (target_rep_max IS NULL OR target_rep_max >= 0),
  target_load_kg numeric CHECK (target_load_kg IS NULL OR target_load_kg >= 0),
  target_rpe numeric CHECK (target_rpe IS NULL OR target_rpe BETWEEN 0 AND 10),
  target_rpe_scale text CHECK (target_rpe_scale IS NULL OR target_rpe_scale = '0-10'),
  target_rir numeric CHECK (target_rir IS NULL OR target_rir BETWEEN 0 AND 10),
  target_rir_scale text CHECK (target_rir_scale IS NULL OR target_rir_scale = '0-10'),
  target_rest_seconds numeric CHECK (target_rest_seconds IS NULL OR target_rest_seconds >= 0),
  target_duration_seconds numeric CHECK (target_duration_seconds IS NULL OR target_duration_seconds >= 0),
  target_velocity_mps numeric CHECK (target_velocity_mps IS NULL OR target_velocity_mps >= 0),
  tempo_descriptor text,
  notes text,
  UNIQUE (workspace_id, exercise_id, id),
  FOREIGN KEY (workspace_id, exercise_id)
    REFERENCES design.strength_exercise_prescription (workspace_id, id) ON DELETE CASCADE,
  UNIQUE (workspace_id, exercise_id, ordinal),
  CHECK (target_rep_min IS NULL OR target_rep_max IS NULL OR target_rep_min <= target_rep_max)
);

CREATE TABLE IF NOT EXISTS design.endurance_segment_prescription (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES iam.workspace (id),
  block_id uuid NOT NULL,
  parent_segment_id uuid,
  ordinal integer NOT NULL CHECK (ordinal > 0),
  kind text NOT NULL CHECK (kind IN ('warmup', 'work', 'recovery', 'cooldown', 'free')),
  repeat_count integer NOT NULL DEFAULT 1 CHECK (repeat_count >= 1),
  duration_seconds numeric CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  distance_meters numeric CHECK (distance_meters IS NULL OR distance_meters >= 0),
  target_hr_min numeric CHECK (target_hr_min IS NULL OR target_hr_min >= 0),
  target_hr_max numeric CHECK (target_hr_max IS NULL OR target_hr_max >= 0),
  target_speed_mps_min numeric CHECK (target_speed_mps_min IS NULL OR target_speed_mps_min >= 0),
  target_speed_mps_max numeric CHECK (target_speed_mps_max IS NULL OR target_speed_mps_max >= 0),
  target_power_watts_min numeric CHECK (target_power_watts_min IS NULL OR target_power_watts_min >= 0),
  target_power_watts_max numeric CHECK (target_power_watts_max IS NULL OR target_power_watts_max >= 0),
  target_rpe numeric CHECK (target_rpe IS NULL OR target_rpe BETWEEN 0 AND 10),
  notes text,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, block_id, id),
  FOREIGN KEY (workspace_id, block_id)
    REFERENCES design.session_block (workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, block_id, parent_segment_id)
    REFERENCES design.endurance_segment_prescription (workspace_id, block_id, id) ON DELETE CASCADE,
  CHECK (target_hr_min IS NULL OR target_hr_max IS NULL OR target_hr_min <= target_hr_max),
  CHECK (target_speed_mps_min IS NULL OR target_speed_mps_max IS NULL OR target_speed_mps_min <= target_speed_mps_max),
  CHECK (target_power_watts_min IS NULL OR target_power_watts_max IS NULL OR target_power_watts_min <= target_power_watts_max)
);

CREATE UNIQUE INDEX IF NOT EXISTS design_endurance_segment_root_ordinal_idx
  ON design.endurance_segment_prescription (workspace_id, block_id, ordinal)
  WHERE parent_segment_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS design_endurance_segment_child_ordinal_idx
  ON design.endurance_segment_prescription (workspace_id, block_id, parent_segment_id, ordinal)
  WHERE parent_segment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS design.mobility_item_prescription (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES iam.workspace (id),
  block_id uuid NOT NULL,
  movement_id uuid NOT NULL REFERENCES design.movement_definition (id) ON DELETE RESTRICT,
  ordinal integer NOT NULL CHECK (ordinal > 0),
  sets integer CHECK (sets IS NULL OR sets >= 0),
  reps integer CHECK (reps IS NULL OR reps >= 0),
  hold_seconds numeric CHECK (hold_seconds IS NULL OR hold_seconds >= 0),
  side text CHECK (side IS NULL OR side IN ('left', 'right', 'bilateral', 'alternating')),
  target_rpe numeric CHECK (target_rpe IS NULL OR target_rpe BETWEEN 0 AND 10),
  notes text,
  UNIQUE (workspace_id, block_id, id),
  FOREIGN KEY (workspace_id, block_id)
    REFERENCES design.session_block (workspace_id, id) ON DELETE CASCADE,
  UNIQUE (workspace_id, block_id, ordinal)
);

CREATE TABLE IF NOT EXISTS design.training_plan_revision (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES iam.workspace (id),
  plan_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  published_at timestamptz NOT NULL,
  published_by uuid NOT NULL,
  snapshot jsonb NOT NULL,
  UNIQUE (workspace_id, plan_id, revision),
  FOREIGN KEY (workspace_id, plan_id)
    REFERENCES design.training_plan (workspace_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS design_training_plan_revision_lookup_idx
  ON design.training_plan_revision (workspace_id, plan_id, revision);

CREATE TABLE IF NOT EXISTS design.session_prescription_revision (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES iam.workspace (id),
  session_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  published_at timestamptz NOT NULL,
  published_by uuid NOT NULL,
  snapshot jsonb NOT NULL,
  UNIQUE (workspace_id, session_id, revision),
  FOREIGN KEY (workspace_id, session_id)
    REFERENCES design.session_prescription (workspace_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS design_session_revision_lookup_idx
  ON design.session_prescription_revision (workspace_id, session_id, revision);
