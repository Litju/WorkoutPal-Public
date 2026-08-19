-- PSC1 hardens the existing F2-F7 trust model without changing product
-- capabilities.  Application connections receive transaction-local context;
-- the database remains a defense-in-depth boundary and never trusts a browser
-- or model-selected workspace as authority.

DO $$
DECLARE
  caller_role pg_roles%ROWTYPE;
  runtime_role pg_roles%ROWTYPE;
BEGIN
  SELECT * INTO caller_role FROM pg_roles WHERE rolname = current_user;
  IF NOT caller_role.rolsuper AND NOT caller_role.rolcreaterole THEN
    RAISE EXCEPTION
      'PSC1 migration requires a migration/admin role with CREATEROLE; runtime role creation was not attempted';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workoutpal_runtime') THEN
    CREATE ROLE workoutpal_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS;
  ELSE
    SELECT * INTO runtime_role FROM pg_roles WHERE rolname = 'workoutpal_runtime';
    IF runtime_role.rolsuper OR runtime_role.rolbypassrls THEN
      RAISE EXCEPTION
        'workoutpal_runtime must remain NOSUPERUSER and NOBYPASSRLS';
    END IF;
  END IF;

  IF caller_role.rolsuper
     AND NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workoutpal_migrator') THEN
    CREATE ROLE workoutpal_migrator NOLOGIN NOSUPERUSER BYPASSRLS;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION iam.current_principal_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('workoutpal.principal_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION iam.current_workspace_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('workoutpal.workspace_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION iam.has_active_membership(
  candidate_principal_id uuid,
  candidate_workspace_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, iam
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM iam.workspace_member
    WHERE principal_id = candidate_principal_id
      AND workspace_id = candidate_workspace_id
      AND status = 'active'
  )
$$;

REVOKE ALL ON FUNCTION iam.current_principal_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION iam.current_workspace_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION iam.has_active_membership(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION iam.current_principal_id() TO workoutpal_runtime;
GRANT EXECUTE ON FUNCTION iam.current_workspace_id() TO workoutpal_runtime;
GRANT EXECUTE ON FUNCTION iam.has_active_membership(uuid, uuid) TO workoutpal_runtime;

-- The workspace root is readable across the caller's active memberships so
-- listActorWorkspaces can remain a single transaction. Mutations still require
-- the transaction's selected workspace and an active membership.
ALTER TABLE iam.workspace ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workspace_read ON iam.workspace;
CREATE POLICY workspace_read ON iam.workspace
  FOR SELECT
  USING (
    iam.has_active_membership(iam.current_principal_id(), id)
    OR (
      id = iam.current_workspace_id()
      AND created_by = iam.current_principal_id()
    )
  );
DROP POLICY IF EXISTS workspace_create ON iam.workspace;
CREATE POLICY workspace_create ON iam.workspace
  FOR INSERT
  WITH CHECK (
    id = iam.current_workspace_id()
    AND created_by = iam.current_principal_id()
  );
DROP POLICY IF EXISTS workspace_mutate ON iam.workspace;
CREATE POLICY workspace_mutate ON iam.workspace
  FOR UPDATE
  USING (
    id = iam.current_workspace_id()
    AND iam.has_active_membership(iam.current_principal_id(), id)
  )
  WITH CHECK (
    id = iam.current_workspace_id()
    AND iam.has_active_membership(iam.current_principal_id(), id)
  );

ALTER TABLE iam.workspace_member ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workspace_member_read ON iam.workspace_member;
CREATE POLICY workspace_member_read ON iam.workspace_member
  FOR SELECT
  USING (
    principal_id = iam.current_principal_id()
    OR (
      workspace_id = iam.current_workspace_id()
      AND iam.has_active_membership(iam.current_principal_id(), workspace_id)
    )
  );
DROP POLICY IF EXISTS workspace_member_create ON iam.workspace_member;
CREATE POLICY workspace_member_create ON iam.workspace_member
  FOR INSERT
  WITH CHECK (
    workspace_id = iam.current_workspace_id()
    AND (
      iam.has_active_membership(iam.current_principal_id(), workspace_id)
      OR (
        principal_id = iam.current_principal_id()
        AND EXISTS (
          SELECT 1
          FROM iam.workspace
          WHERE id = workspace_id
            AND created_by = iam.current_principal_id()
        )
      )
    )
  );
DROP POLICY IF EXISTS workspace_member_mutate ON iam.workspace_member;
CREATE POLICY workspace_member_mutate ON iam.workspace_member
  FOR UPDATE
  USING (
    workspace_id = iam.current_workspace_id()
    AND iam.has_active_membership(iam.current_principal_id(), workspace_id)
  )
  WITH CHECK (
    workspace_id = iam.current_workspace_id()
    AND iam.has_active_membership(iam.current_principal_id(), workspace_id)
  );
DROP POLICY IF EXISTS workspace_member_delete ON iam.workspace_member;
CREATE POLICY workspace_member_delete ON iam.workspace_member
  FOR DELETE
  USING (
    workspace_id = iam.current_workspace_id()
    AND iam.has_active_membership(iam.current_principal_id(), workspace_id)
  );

ALTER TABLE iam.idempotency_record ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS idempotency_actor_boundary ON iam.idempotency_record;
CREATE POLICY idempotency_actor_boundary ON iam.idempotency_record
  USING (actor_id = iam.current_principal_id())
  WITH CHECK (actor_id = iam.current_principal_id());

ALTER TABLE design.movement_definition ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS movement_read ON design.movement_definition;
CREATE POLICY movement_read ON design.movement_definition
  FOR SELECT
  USING (
    (
      workspace_id IS NULL
      AND iam.current_principal_id() IS NOT NULL
    )
    OR (
      workspace_id = iam.current_workspace_id()
      AND iam.has_active_membership(iam.current_principal_id(), workspace_id)
    )
  );
DROP POLICY IF EXISTS movement_create ON design.movement_definition;
CREATE POLICY movement_create ON design.movement_definition
  FOR INSERT
  WITH CHECK (
    workspace_id = iam.current_workspace_id()
    AND iam.has_active_membership(iam.current_principal_id(), workspace_id)
  );
DROP POLICY IF EXISTS movement_mutate ON design.movement_definition;
CREATE POLICY movement_mutate ON design.movement_definition
  FOR UPDATE
  USING (
    workspace_id = iam.current_workspace_id()
    AND iam.has_active_membership(iam.current_principal_id(), workspace_id)
  )
  WITH CHECK (
    workspace_id = iam.current_workspace_id()
    AND iam.has_active_membership(iam.current_principal_id(), workspace_id)
  );

-- All remaining application tables carry a direct workspace_id. Keep the
-- policy deliberately uniform so a missing repository predicate is still
-- constrained by the database.
DO $$
DECLARE
  tenant_table text;
BEGIN
  FOREACH tenant_table IN ARRAY ARRAY[
    'athlete.profile',
    'athlete.coach_assignment',
    'audit.event',
    'design.training_goal',
    'design.training_plan',
    'design.training_plan_goal',
    'design.plan_phase',
    'design.session_prescription',
    'design.session_block',
    'design.strength_exercise_prescription',
    'design.strength_set_prescription',
    'design.endurance_segment_prescription',
    'design.mobility_item_prescription',
    'design.training_plan_revision',
    'design.session_prescription_revision',
    'execution.session',
    'execution.strength_set',
    'execution.endurance_segment',
    'execution.mobility_item',
    'execution.session_observation',
    'execution.amendment',
    'agent.proposal',
    'agent.approval_decision',
    'agent.proposal_execution'
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

-- The runtime role is intentionally not the migration/admin role. It receives
-- table DML only; RLS remains the row boundary and the migration tracker stays
-- outside ordinary application authority.
GRANT USAGE ON SCHEMA auth, iam, athlete, audit, design, execution, assessment, monitoring, agent
  TO workoutpal_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA auth, iam, athlete, audit, design, execution, agent
  TO workoutpal_runtime;
GRANT USAGE, SELECT
  ON ALL SEQUENCES IN SCHEMA auth, iam, athlete, audit, design, execution, agent
  TO workoutpal_runtime;
REVOKE ALL ON TABLE public.workoutpal_schema_migrations FROM workoutpal_runtime;

-- Complete the tenant key for references that previously relied on a global
-- UUID. Existing globally unique IDs remain unchanged; composite keys prevent
-- a workspace column from being paired with a foreign workspace row.
ALTER TABLE design.strength_set_prescription
  ADD CONSTRAINT design_strength_set_workspace_id_key UNIQUE (workspace_id, id);
ALTER TABLE design.mobility_item_prescription
  ADD CONSTRAINT design_mobility_item_workspace_id_key UNIQUE (workspace_id, id);

ALTER TABLE execution.strength_set
  ADD CONSTRAINT execution_strength_set_prescription_exercise_fk
    FOREIGN KEY (workspace_id, prescription_exercise_id)
    REFERENCES design.strength_exercise_prescription (workspace_id, id)
    ON DELETE RESTRICT
    NOT VALID,
  ADD CONSTRAINT execution_strength_set_prescription_set_fk
    FOREIGN KEY (workspace_id, prescription_set_id)
    REFERENCES design.strength_set_prescription (workspace_id, id)
    ON DELETE RESTRICT
    NOT VALID;

ALTER TABLE execution.endurance_segment
  ADD CONSTRAINT execution_endurance_segment_prescription_fk
    FOREIGN KEY (workspace_id, prescription_segment_id)
    REFERENCES design.endurance_segment_prescription (workspace_id, id)
    ON DELETE RESTRICT
    NOT VALID;

ALTER TABLE execution.mobility_item
  ADD CONSTRAINT execution_mobility_item_prescription_fk
    FOREIGN KEY (workspace_id, prescription_item_id)
    REFERENCES design.mobility_item_prescription (workspace_id, id)
    ON DELETE RESTRICT
    NOT VALID;

CREATE OR REPLACE FUNCTION iam.enforce_workspace_movement_reference()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM design.movement_definition
    WHERE id = NEW.movement_id
      AND (workspace_id IS NULL OR workspace_id = NEW.workspace_id)
  ) THEN
    RAISE EXCEPTION
      'movement % is not global or owned by workspace %',
      NEW.movement_id,
      NEW.workspace_id
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS design_strength_exercise_movement_tenant
  ON design.strength_exercise_prescription;
CREATE TRIGGER design_strength_exercise_movement_tenant
  BEFORE INSERT OR UPDATE OF workspace_id, movement_id
  ON design.strength_exercise_prescription
  FOR EACH ROW
  EXECUTE FUNCTION iam.enforce_workspace_movement_reference();

DROP TRIGGER IF EXISTS design_mobility_item_movement_tenant
  ON design.mobility_item_prescription;
CREATE TRIGGER design_mobility_item_movement_tenant
  BEFORE INSERT OR UPDATE OF workspace_id, movement_id
  ON design.mobility_item_prescription
  FOR EACH ROW
  EXECUTE FUNCTION iam.enforce_workspace_movement_reference();

DROP TRIGGER IF EXISTS execution_strength_set_movement_tenant
  ON execution.strength_set;
CREATE TRIGGER execution_strength_set_movement_tenant
  BEFORE INSERT OR UPDATE OF workspace_id, movement_id
  ON execution.strength_set
  FOR EACH ROW
  EXECUTE FUNCTION iam.enforce_workspace_movement_reference();

DROP TRIGGER IF EXISTS execution_mobility_item_movement_tenant
  ON execution.mobility_item;
CREATE TRIGGER execution_mobility_item_movement_tenant
  BEFORE INSERT OR UPDATE OF workspace_id, movement_id
  ON execution.mobility_item
  FOR EACH ROW
  EXECUTE FUNCTION iam.enforce_workspace_movement_reference();

CREATE OR REPLACE FUNCTION iam.enforce_execution_prescription_references()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'strength_set' THEN
    IF NEW.prescription_exercise_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM design.strength_exercise_prescription
         WHERE workspace_id = NEW.workspace_id
           AND id = NEW.prescription_exercise_id
       ) THEN
      RAISE EXCEPTION
        'strength exercise prescription % is not owned by workspace %',
        NEW.prescription_exercise_id,
        NEW.workspace_id
        USING ERRCODE = '23503';
    END IF;
    IF NEW.prescription_set_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM design.strength_set_prescription
         WHERE workspace_id = NEW.workspace_id
           AND id = NEW.prescription_set_id
           AND exercise_id = NEW.prescription_exercise_id
       ) THEN
      RAISE EXCEPTION
        'strength set prescription % is not owned by exercise % in workspace %',
        NEW.prescription_set_id,
        NEW.prescription_exercise_id,
        NEW.workspace_id
        USING ERRCODE = '23503';
    END IF;
    IF NEW.prescription_set_id IS NOT NULL
       AND NEW.prescription_exercise_id IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM design.strength_set_prescription
         WHERE workspace_id = NEW.workspace_id
           AND id = NEW.prescription_set_id
           AND exercise_id <> NEW.prescription_exercise_id
       ) THEN
      RAISE EXCEPTION 'strength set prescription does not belong to its exercise'
        USING ERRCODE = '23503';
    END IF;
  ELSIF TG_TABLE_NAME = 'endurance_segment' THEN
    IF NEW.prescription_segment_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM design.endurance_segment_prescription
         WHERE workspace_id = NEW.workspace_id
           AND id = NEW.prescription_segment_id
       ) THEN
      RAISE EXCEPTION
        'endurance prescription segment % is not owned by workspace %',
        NEW.prescription_segment_id,
        NEW.workspace_id
        USING ERRCODE = '23503';
    END IF;
  ELSIF TG_TABLE_NAME = 'mobility_item' THEN
    IF NEW.prescription_item_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM design.mobility_item_prescription
         WHERE workspace_id = NEW.workspace_id
           AND id = NEW.prescription_item_id
       ) THEN
      RAISE EXCEPTION
        'mobility prescription item % is not owned by workspace %',
        NEW.prescription_item_id,
        NEW.workspace_id
        USING ERRCODE = '23503';
    END IF;
  ELSIF TG_TABLE_NAME = 'amendment' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM execution.session
      WHERE workspace_id = NEW.workspace_id
        AND id = NEW.session_id
    ) THEN
      RAISE EXCEPTION
        'amendment session % is not owned by workspace %',
        NEW.session_id,
        NEW.workspace_id
        USING ERRCODE = '23503';
    END IF;
    IF NEW.fact_kind = 'strength-set'
       AND NOT EXISTS (
         SELECT 1 FROM execution.strength_set
         WHERE workspace_id = NEW.workspace_id
           AND id = NEW.fact_id
           AND session_id = NEW.session_id
       ) THEN
      RAISE EXCEPTION 'amendment fact is not a strength fact in its session'
        USING ERRCODE = '23503';
    ELSIF NEW.fact_kind = 'endurance-segment'
       AND NOT EXISTS (
         SELECT 1 FROM execution.endurance_segment
         WHERE workspace_id = NEW.workspace_id
           AND id = NEW.fact_id
           AND session_id = NEW.session_id
       ) THEN
      RAISE EXCEPTION 'amendment fact is not an endurance fact in its session'
        USING ERRCODE = '23503';
    ELSIF NEW.fact_kind = 'mobility-item'
       AND NOT EXISTS (
         SELECT 1 FROM execution.mobility_item
         WHERE workspace_id = NEW.workspace_id
           AND id = NEW.fact_id
           AND session_id = NEW.session_id
       ) THEN
      RAISE EXCEPTION 'amendment fact is not a mobility fact in its session'
        USING ERRCODE = '23503';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS execution_strength_set_prescription_tenant
  ON execution.strength_set;
CREATE TRIGGER execution_strength_set_prescription_tenant
  BEFORE INSERT OR UPDATE OF workspace_id, prescription_exercise_id, prescription_set_id
  ON execution.strength_set
  FOR EACH ROW
  EXECUTE FUNCTION iam.enforce_execution_prescription_references();

DROP TRIGGER IF EXISTS execution_endurance_segment_prescription_tenant
  ON execution.endurance_segment;
CREATE TRIGGER execution_endurance_segment_prescription_tenant
  BEFORE INSERT OR UPDATE OF workspace_id, prescription_segment_id
  ON execution.endurance_segment
  FOR EACH ROW
  EXECUTE FUNCTION iam.enforce_execution_prescription_references();

DROP TRIGGER IF EXISTS execution_mobility_item_prescription_tenant
  ON execution.mobility_item;
CREATE TRIGGER execution_mobility_item_prescription_tenant
  BEFORE INSERT OR UPDATE OF workspace_id, prescription_item_id
  ON execution.mobility_item
  FOR EACH ROW
  EXECUTE FUNCTION iam.enforce_execution_prescription_references();

DROP TRIGGER IF EXISTS execution_amendment_fact_tenant
  ON execution.amendment;
CREATE TRIGGER execution_amendment_fact_tenant
  BEFORE INSERT OR UPDATE OF workspace_id, session_id, fact_kind, fact_id
  ON execution.amendment
  FOR EACH ROW
  EXECUTE FUNCTION iam.enforce_execution_prescription_references();
