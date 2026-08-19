-- PSC1 closes the remaining idempotency tenancy gap. A principal may belong
-- to more than one workspace, so retry identity is workspace-scoped as well
-- as actor-scoped. Existing pre-PSC1 rows remain nullable legacy history and
-- are intentionally invisible to the runtime role under the replacement RLS
-- policy; new application writes always include workspace_id.

ALTER TABLE iam.idempotency_record
  ADD COLUMN IF NOT EXISTS workspace_id uuid;

ALTER TABLE iam.idempotency_record
  ADD CONSTRAINT iam_idempotency_record_workspace_fk
  FOREIGN KEY (workspace_id)
  REFERENCES iam.workspace (id)
  ON DELETE RESTRICT;

ALTER TABLE iam.idempotency_record
  DROP CONSTRAINT IF EXISTS idempotency_record_actor_id_operation_idempotency_key_key;

CREATE UNIQUE INDEX IF NOT EXISTS iam_idempotency_workspace_actor_operation_key_idx
  ON iam.idempotency_record (workspace_id, actor_id, operation, idempotency_key);

CREATE INDEX IF NOT EXISTS iam_idempotency_workspace_created_idx
  ON iam.idempotency_record (workspace_id, created_at);

ALTER TABLE iam.idempotency_record ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS idempotency_actor_boundary ON iam.idempotency_record;
CREATE POLICY idempotency_workspace_actor_boundary ON iam.idempotency_record
  USING (
    workspace_id = iam.current_workspace_id()
    AND actor_id = iam.current_principal_id()
  )
  WITH CHECK (
    workspace_id = iam.current_workspace_id()
    AND actor_id = iam.current_principal_id()
  );

-- Role attributes are normalized by the explicit qualification provisioner.
-- Do not ALTER ROLE here: a hosted migration credential may have CREATEROLE
-- without SUPERUSER and PostgreSQL forbids it from changing SUPERUSER state.
