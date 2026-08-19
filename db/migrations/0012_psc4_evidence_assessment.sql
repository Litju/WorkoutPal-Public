-- PSC4 owns neutral assessment evidence only. No scientific processor,
-- threshold, readiness, fatigue, normative, or recommendation logic belongs here.

CREATE SCHEMA IF NOT EXISTS assessment;

CREATE TABLE IF NOT EXISTS assessment.protocol (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES iam.workspace (id) ON DELETE RESTRICT,
  key text NOT NULL CHECK (length(btrim(key)) > 0),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  description text,
  status text NOT NULL CHECK (status IN ('ACTIVE', 'RETIRED')),
  current_revision integer NOT NULL CHECK (current_revision >= 0),
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, key)
);

CREATE INDEX IF NOT EXISTS assessment_protocol_workspace_name_idx
  ON assessment.protocol (workspace_id, status, name, id);

CREATE TABLE IF NOT EXISTS assessment.protocol_revision (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  protocol_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, protocol_id, revision),
  FOREIGN KEY (workspace_id, protocol_id)
    REFERENCES assessment.protocol (workspace_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS assessment_protocol_revision_lookup_idx
  ON assessment.protocol_revision (workspace_id, protocol_id, revision DESC, id);

CREATE TABLE IF NOT EXISTS assessment.acquisition_source (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES iam.workspace (id) ON DELETE RESTRICT,
  source_class text NOT NULL CHECK (
    source_class IN ('MANUAL_ENTRY', 'DEVICE_CAPTURE', 'IMPORT', 'SYSTEM_DERIVED_NEUTRAL')
  ),
  label text NOT NULL CHECK (length(btrim(label)) > 0),
  manufacturer text,
  model text,
  serial_number text,
  firmware_version text,
  software_version text,
  configuration_metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(configuration_metadata) = 'object'),
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (workspace_id, id)
);

CREATE INDEX IF NOT EXISTS assessment_source_workspace_class_idx
  ON assessment.acquisition_source (workspace_id, source_class, label, id);

CREATE TABLE IF NOT EXISTS assessment.source_artifact (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES iam.workspace (id) ON DELETE RESTRICT,
  storage_object_reference text NOT NULL CHECK (
    length(btrim(storage_object_reference)) > 0
    AND storage_object_reference !~* '^https?://'
  ),
  media_type text NOT NULL CHECK (length(btrim(media_type)) > 0),
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  checksum_sha256 text NOT NULL CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  original_filename text,
  source_information jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(source_information) = 'object'),
  created_at timestamptz NOT NULL,
  ingested_at timestamptz NOT NULL,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, checksum_sha256, size_bytes)
);

CREATE INDEX IF NOT EXISTS assessment_source_artifact_workspace_time_idx
  ON assessment.source_artifact (workspace_id, ingested_at DESC, id);

CREATE TABLE IF NOT EXISTS assessment.assessment (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  athlete_id uuid NOT NULL,
  assessment_type text NOT NULL CHECK (length(btrim(assessment_type)) > 0),
  purpose text,
  status text NOT NULL CHECK (status IN ('DRAFT', 'RECORDED', 'AMENDED', 'ARCHIVED')),
  occurrence_date date NOT NULL,
  occurred_at timestamptz,
  time_zone text NOT NULL CHECK (length(btrim(time_zone)) > 0),
  protocol_revision_id uuid,
  source_id uuid,
  source_version bigint CHECK (source_version IS NULL OR source_version > 0),
  notes text,
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, athlete_id)
    REFERENCES athlete.profile (workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, protocol_revision_id)
    REFERENCES assessment.protocol_revision (workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, source_id)
    REFERENCES assessment.acquisition_source (workspace_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS assessment_workspace_occurrence_idx
  ON assessment.assessment (workspace_id, occurrence_date DESC, occurred_at DESC NULLS LAST, id);

CREATE INDEX IF NOT EXISTS assessment_athlete_occurrence_idx
  ON assessment.assessment (workspace_id, athlete_id, occurrence_date DESC, occurred_at DESC NULLS LAST, id);

CREATE TABLE IF NOT EXISTS assessment.assessment_artifact (
  workspace_id uuid NOT NULL,
  assessment_id uuid NOT NULL,
  artifact_id uuid NOT NULL,
  attached_at timestamptz NOT NULL,
  attached_by uuid NOT NULL,
  PRIMARY KEY (workspace_id, assessment_id, artifact_id),
  FOREIGN KEY (workspace_id, assessment_id)
    REFERENCES assessment.assessment (workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, artifact_id)
    REFERENCES assessment.source_artifact (workspace_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS assessment_artifact_artifact_idx
  ON assessment.assessment_artifact (workspace_id, artifact_id, assessment_id);

CREATE TABLE IF NOT EXISTS assessment.trial (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  assessment_id uuid NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal > 0),
  status text NOT NULL CHECK (status IN ('RECORDED', 'AMENDED', 'ARCHIVED')),
  validity_state text NOT NULL CHECK (validity_state IN ('UNASSESSED', 'VALID', 'INVALID')),
  exclusion_state text NOT NULL CHECK (exclusion_state IN ('INCLUDED', 'EXCLUDED')),
  exclusion_reason text,
  source_class text NOT NULL CHECK (
    source_class IN ('MANUAL_ENTRY', 'DEVICE_CAPTURE', 'IMPORT', 'SYSTEM_DERIVED_NEUTRAL')
  ),
  source_reference text,
  source_id uuid,
  protocol_revision_id uuid,
  source_artifact_ids jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(source_artifact_ids) = 'array'),
  evidence_origin text NOT NULL CHECK (evidence_origin IN ('HUMAN', 'DEVICE', 'SYSTEM')),
  actor_id uuid,
  captured_at timestamptz,
  ingested_at timestamptz NOT NULL,
  evidence_created_at timestamptz NOT NULL,
  parent_evidence_ids jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(parent_evidence_ids) = 'array'),
  supersedes_evidence_id uuid,
  provenance jsonb NOT NULL CHECK (jsonb_typeof(provenance) = 'object'),
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, assessment_id, ordinal),
  FOREIGN KEY (workspace_id, assessment_id)
    REFERENCES assessment.assessment (workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, source_id)
    REFERENCES assessment.acquisition_source (workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, protocol_revision_id)
    REFERENCES assessment.protocol_revision (workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, supersedes_evidence_id)
    REFERENCES assessment.trial (workspace_id, id) ON DELETE RESTRICT,
  CHECK (
    (exclusion_state = 'EXCLUDED' AND exclusion_reason IS NOT NULL AND length(btrim(exclusion_reason)) > 0)
    OR (exclusion_state = 'INCLUDED' AND exclusion_reason IS NULL)
  ),
  CHECK ((evidence_origin = 'SYSTEM' AND source_class = 'SYSTEM_DERIVED_NEUTRAL') OR evidence_origin <> 'SYSTEM'),
  CHECK ((evidence_origin = 'DEVICE' AND source_class = 'DEVICE_CAPTURE') OR evidence_origin <> 'DEVICE')
);

CREATE INDEX IF NOT EXISTS assessment_trial_order_idx
  ON assessment.trial (workspace_id, assessment_id, ordinal, id);

CREATE TABLE IF NOT EXISTS assessment.observation (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  assessment_id uuid NOT NULL,
  trial_id uuid NOT NULL,
  observation_key text NOT NULL CHECK (length(btrim(observation_key)) > 0),
  value_kind text NOT NULL CHECK (value_kind IN ('PRESENT', 'MISSING')),
  value_magnitude numeric,
  value_unit text,
  value_dimension text,
  missing_reason text CHECK (missing_reason IS NULL OR missing_reason IN ('NOT_RECORDED', 'NOT_APPLICABLE', 'INVALID', 'EXCLUDED', 'UNKNOWN')),
  observed_at timestamptz,
  source_class text NOT NULL CHECK (
    source_class IN ('MANUAL_ENTRY', 'DEVICE_CAPTURE', 'IMPORT', 'SYSTEM_DERIVED_NEUTRAL')
  ),
  source_reference text,
  source_id uuid,
  protocol_revision_id uuid,
  source_artifact_ids jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(source_artifact_ids) = 'array'),
  evidence_origin text NOT NULL CHECK (evidence_origin IN ('HUMAN', 'DEVICE', 'SYSTEM')),
  actor_id uuid,
  captured_at timestamptz,
  ingested_at timestamptz NOT NULL,
  evidence_created_at timestamptz NOT NULL,
  parent_evidence_ids jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(parent_evidence_ids) = 'array'),
  supersedes_evidence_id uuid,
  provenance jsonb NOT NULL CHECK (jsonb_typeof(provenance) = 'object'),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  supersedes_observation_id uuid,
  recorded_at timestamptz NOT NULL,
  recorded_by uuid NOT NULL,
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, assessment_id)
    REFERENCES assessment.assessment (workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, trial_id)
    REFERENCES assessment.trial (workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, source_id)
    REFERENCES assessment.acquisition_source (workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, protocol_revision_id)
    REFERENCES assessment.protocol_revision (workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, supersedes_evidence_id)
    REFERENCES assessment.observation (workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, supersedes_observation_id)
    REFERENCES assessment.observation (workspace_id, id) ON DELETE RESTRICT,
  CHECK (value_magnitude IS NULL OR value_magnitude::text NOT IN ('NaN', 'Infinity', '-Infinity')),
  CHECK (
    (value_kind = 'PRESENT' AND value_magnitude IS NOT NULL AND value_unit IS NOT NULL AND value_dimension IS NOT NULL AND missing_reason IS NULL)
    OR (value_kind = 'MISSING' AND value_magnitude IS NULL AND value_unit IS NULL AND value_dimension IS NULL AND missing_reason IS NOT NULL)
  ),
  CHECK ((evidence_origin = 'SYSTEM' AND source_class = 'SYSTEM_DERIVED_NEUTRAL') OR evidence_origin <> 'SYSTEM'),
  CHECK ((evidence_origin = 'DEVICE' AND source_class = 'DEVICE_CAPTURE') OR evidence_origin <> 'DEVICE')
);

CREATE INDEX IF NOT EXISTS assessment_observation_assessment_idx
  ON assessment.observation (workspace_id, assessment_id, recorded_at, id);

CREATE INDEX IF NOT EXISTS assessment_observation_trial_idx
  ON assessment.observation (workspace_id, trial_id, observed_at NULLS LAST, id);

CREATE TABLE IF NOT EXISTS assessment.metric_definition (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES iam.workspace (id) ON DELETE RESTRICT,
  key text NOT NULL CHECK (length(btrim(key)) > 0),
  revision integer NOT NULL CHECK (revision > 0),
  display_name text NOT NULL CHECK (length(btrim(display_name)) > 0),
  description text,
  expected_dimension text,
  method_protocol_revision_id uuid,
  result_scope text NOT NULL CHECK (result_scope IN ('ASSESSMENT', 'TRIAL')),
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, key, revision),
  FOREIGN KEY (workspace_id, method_protocol_revision_id)
    REFERENCES assessment.protocol_revision (workspace_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS assessment_metric_definition_lookup_idx
  ON assessment.metric_definition (workspace_id, key, revision DESC, id);

CREATE TABLE IF NOT EXISTS assessment.result (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  assessment_id uuid NOT NULL,
  trial_id uuid,
  metric_definition_id uuid NOT NULL,
  metric_revision integer NOT NULL CHECK (metric_revision > 0),
  value_kind text NOT NULL CHECK (value_kind IN ('PRESENT', 'MISSING')),
  value_magnitude numeric,
  value_unit text,
  value_dimension text,
  missing_reason text CHECK (missing_reason IS NULL OR missing_reason IN ('NOT_RECORDED', 'NOT_APPLICABLE', 'INVALID', 'EXCLUDED', 'UNKNOWN')),
  result_origin text NOT NULL CHECK (result_origin IN ('MANUAL', 'MEASURED', 'IMPORTED', 'DERIVED_NEUTRAL')),
  source_class text NOT NULL CHECK (
    source_class IN ('MANUAL_ENTRY', 'DEVICE_CAPTURE', 'IMPORT', 'SYSTEM_DERIVED_NEUTRAL')
  ),
  method_protocol_revision_id uuid,
  source_reference text,
  source_id uuid,
  protocol_revision_id uuid,
  source_artifact_ids jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(source_artifact_ids) = 'array'),
  evidence_origin text NOT NULL CHECK (evidence_origin IN ('HUMAN', 'DEVICE', 'SYSTEM')),
  actor_id uuid,
  captured_at timestamptz,
  ingested_at timestamptz NOT NULL,
  evidence_created_at timestamptz NOT NULL,
  parent_evidence_ids jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(parent_evidence_ids) = 'array'),
  supersedes_evidence_id uuid,
  provenance jsonb NOT NULL CHECK (jsonb_typeof(provenance) = 'object'),
  recorded_at timestamptz NOT NULL,
  recorded_by uuid NOT NULL,
  supersedes_result_id uuid,
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, assessment_id)
    REFERENCES assessment.assessment (workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, trial_id)
    REFERENCES assessment.trial (workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, metric_definition_id)
    REFERENCES assessment.metric_definition (workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, method_protocol_revision_id)
    REFERENCES assessment.protocol_revision (workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, source_id)
    REFERENCES assessment.acquisition_source (workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, protocol_revision_id)
    REFERENCES assessment.protocol_revision (workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, supersedes_evidence_id)
    REFERENCES assessment.result (workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, supersedes_result_id)
    REFERENCES assessment.result (workspace_id, id) ON DELETE RESTRICT,
  CHECK (value_magnitude IS NULL OR value_magnitude::text NOT IN ('NaN', 'Infinity', '-Infinity')),
  CHECK (
    (value_kind = 'PRESENT' AND value_magnitude IS NOT NULL AND value_unit IS NOT NULL AND value_dimension IS NOT NULL AND missing_reason IS NULL)
    OR (value_kind = 'MISSING' AND value_magnitude IS NULL AND value_unit IS NULL AND value_dimension IS NULL AND missing_reason IS NOT NULL)
  ),
  CHECK ((evidence_origin = 'SYSTEM' AND source_class = 'SYSTEM_DERIVED_NEUTRAL') OR evidence_origin <> 'SYSTEM'),
  CHECK ((evidence_origin = 'DEVICE' AND source_class = 'DEVICE_CAPTURE') OR evidence_origin <> 'DEVICE')
);

CREATE INDEX IF NOT EXISTS assessment_result_assessment_idx
  ON assessment.result (workspace_id, assessment_id, recorded_at, id);

CREATE INDEX IF NOT EXISTS assessment_result_metric_idx
  ON assessment.result (workspace_id, metric_definition_id, metric_revision, recorded_at DESC, id);

CREATE TABLE IF NOT EXISTS assessment.amendment (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  assessment_id uuid NOT NULL,
  target_type text NOT NULL CHECK (target_type IN ('ASSESSMENT', 'TRIAL', 'OBSERVATION', 'RESULT')),
  target_id uuid NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  original_state jsonb NOT NULL CHECK (jsonb_typeof(original_state) = 'object'),
  corrected_fields jsonb NOT NULL CHECK (jsonb_typeof(corrected_fields) = 'object' AND corrected_fields <> '{}'::jsonb),
  supersedes_amendment_id uuid,
  occurred_at timestamptz NOT NULL,
  actor_id uuid NOT NULL,
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, assessment_id)
    REFERENCES assessment.assessment (workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, supersedes_amendment_id)
    REFERENCES assessment.amendment (workspace_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS assessment_amendment_target_idx
  ON assessment.amendment (workspace_id, assessment_id, target_type, target_id, occurred_at, id);

-- Evidence and artifact rows are append-only. Corrections are represented by
-- a new row plus supersession/amendment lineage, never by destructive edits.
CREATE OR REPLACE FUNCTION assessment.reject_append_only_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only historical evidence', TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS protocol_revision_append_only ON assessment.protocol_revision;
CREATE TRIGGER protocol_revision_append_only
  BEFORE UPDATE OR DELETE ON assessment.protocol_revision
  FOR EACH ROW EXECUTE FUNCTION assessment.reject_append_only_mutation();

DROP TRIGGER IF EXISTS source_artifact_append_only ON assessment.source_artifact;
CREATE TRIGGER source_artifact_append_only
  BEFORE UPDATE OR DELETE ON assessment.source_artifact
  FOR EACH ROW EXECUTE FUNCTION assessment.reject_append_only_mutation();

DROP TRIGGER IF EXISTS observation_append_only ON assessment.observation;
CREATE TRIGGER observation_append_only
  BEFORE UPDATE OR DELETE ON assessment.observation
  FOR EACH ROW EXECUTE FUNCTION assessment.reject_append_only_mutation();

DROP TRIGGER IF EXISTS result_append_only ON assessment.result;
CREATE TRIGGER result_append_only
  BEFORE UPDATE OR DELETE ON assessment.result
  FOR EACH ROW EXECUTE FUNCTION assessment.reject_append_only_mutation();

DROP TRIGGER IF EXISTS amendment_append_only ON assessment.amendment;
CREATE TRIGGER amendment_append_only
  BEFORE UPDATE OR DELETE ON assessment.amendment
  FOR EACH ROW EXECUTE FUNCTION assessment.reject_append_only_mutation();

DO $$
DECLARE
  tenant_table text;
BEGIN
  FOREACH tenant_table IN ARRAY ARRAY[
    'assessment.protocol',
    'assessment.protocol_revision',
    'assessment.acquisition_source',
    'assessment.source_artifact',
    'assessment.assessment',
    'assessment.assessment_artifact',
    'assessment.trial',
    'assessment.observation',
    'assessment.metric_definition',
    'assessment.result',
    'assessment.amendment'
  ] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format('DROP POLICY IF EXISTS tenant_workspace_boundary ON %s', tenant_table);
    EXECUTE format(
      'CREATE POLICY tenant_workspace_boundary ON %s
         USING (
           workspace_id = iam.current_workspace_id()
           AND iam.has_active_membership(iam.current_principal_id(), workspace_id)
         )
         WITH CHECK (
           workspace_id = iam.current_workspace_id()
           AND iam.has_active_membership(iam.current_principal_id(), workspace_id)
         )',
      tenant_table
    );
  END LOOP;
END
$$;

GRANT USAGE ON SCHEMA assessment TO workoutpal_runtime;
GRANT SELECT, INSERT, UPDATE
  ON assessment.protocol, assessment.acquisition_source, assessment.assessment,
     assessment.assessment_artifact, assessment.trial, assessment.metric_definition
  TO workoutpal_runtime;
GRANT SELECT, INSERT
  ON assessment.protocol_revision, assessment.source_artifact,
     assessment.observation, assessment.result, assessment.amendment
  TO workoutpal_runtime;
