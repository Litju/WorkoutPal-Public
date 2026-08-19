-- F7 stores typed, immutable proposals separately from canonical training data.
-- The model can create a proposal, but only the application can advance it
-- through the approval-gated execution state machine.

CREATE TABLE IF NOT EXISTS agent.proposal (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES iam.workspace (id) ON DELETE RESTRICT,
  requesting_actor_id uuid NOT NULL,
  agent_session_id text NOT NULL CHECK (length(btrim(agent_session_id)) > 0),
  creation_key text NOT NULL CHECK (length(btrim(creation_key)) > 0),
  operation_kind text NOT NULL CHECK (
    operation_kind IN (
      'RESCHEDULE_SESSION_PRESCRIPTION',
      'SET_STRENGTH_SET_TARGET_LOAD'
    )
  ),
  target_aggregate_id uuid NOT NULL,
  target_expected_version bigint NOT NULL CHECK (target_expected_version > 0),
  normalized_command jsonb NOT NULL CHECK (jsonb_typeof(normalized_command) = 'object'),
  command_digest text NOT NULL CHECK (command_digest ~ '^[0-9a-f]{64}$'),
  before_projection jsonb NOT NULL CHECK (jsonb_typeof(before_projection) = 'object'),
  after_projection jsonb NOT NULL CHECK (jsonb_typeof(after_projection) = 'object'),
  status text NOT NULL CHECK (
    status IN (
      'PENDING_APPROVAL',
      'APPROVED',
      'REJECTED',
      'STALE',
      'EXECUTING',
      'EXECUTED',
      'FAILED'
    )
  ),
  provenance jsonb NOT NULL CHECK (jsonb_typeof(provenance) = 'object'),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  failure_code text,
  failure_message text,
  execution_id uuid,
  approved_at timestamptz,
  rejected_at timestamptz,
  executed_at timestamptz,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, requesting_actor_id, agent_session_id, creation_key),
  FOREIGN KEY (workspace_id, target_aggregate_id)
    REFERENCES design.session_prescription (workspace_id, id) ON DELETE RESTRICT,
  CHECK ((status = 'APPROVED' AND approved_at IS NOT NULL) OR status <> 'APPROVED'),
  CHECK ((status = 'REJECTED' AND rejected_at IS NOT NULL) OR status <> 'REJECTED'),
  CHECK ((status = 'EXECUTED' AND executed_at IS NOT NULL AND execution_id IS NOT NULL) OR status <> 'EXECUTED')
);

CREATE INDEX IF NOT EXISTS agent_proposal_workspace_status_idx
  ON agent.proposal (workspace_id, status, updated_at DESC, id);

CREATE OR REPLACE FUNCTION agent.reject_proposal_immutable_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.requesting_actor_id IS DISTINCT FROM OLD.requesting_actor_id
     OR NEW.agent_session_id IS DISTINCT FROM OLD.agent_session_id
     OR NEW.creation_key IS DISTINCT FROM OLD.creation_key
     OR NEW.operation_kind IS DISTINCT FROM OLD.operation_kind
     OR NEW.target_aggregate_id IS DISTINCT FROM OLD.target_aggregate_id
     OR NEW.target_expected_version IS DISTINCT FROM OLD.target_expected_version
     OR NEW.normalized_command IS DISTINCT FROM OLD.normalized_command
     OR NEW.command_digest IS DISTINCT FROM OLD.command_digest
     OR NEW.before_projection IS DISTINCT FROM OLD.before_projection
     OR NEW.after_projection IS DISTINCT FROM OLD.after_projection
     OR NEW.provenance IS DISTINCT FROM OLD.provenance
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'agent.proposal authoritative content is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agent_proposal_immutable ON agent.proposal;
CREATE TRIGGER agent_proposal_immutable
  BEFORE UPDATE ON agent.proposal
  FOR EACH ROW EXECUTE FUNCTION agent.reject_proposal_immutable_mutation();

CREATE OR REPLACE FUNCTION agent.enforce_proposal_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF NOT (
    (OLD.status = 'PENDING_APPROVAL' AND NEW.status IN ('APPROVED', 'REJECTED'))
    OR (OLD.status = 'APPROVED' AND NEW.status IN ('EXECUTING', 'STALE', 'FAILED'))
    OR (OLD.status = 'EXECUTING' AND NEW.status IN ('EXECUTED', 'FAILED'))
  ) THEN
    RAISE EXCEPTION 'illegal agent proposal transition % -> %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agent_proposal_transition ON agent.proposal;
CREATE TRIGGER agent_proposal_transition
  BEFORE UPDATE ON agent.proposal
  FOR EACH ROW EXECUTE FUNCTION agent.enforce_proposal_transition();

CREATE TABLE IF NOT EXISTS agent.approval_decision (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES iam.workspace (id) ON DELETE RESTRICT,
  proposal_id uuid NOT NULL,
  proposal_digest text NOT NULL CHECK (proposal_digest ~ '^[0-9a-f]{64}$'),
  approving_actor_id uuid NOT NULL,
  agent_session_id text NOT NULL CHECK (length(btrim(agent_session_id)) > 0),
  approval_request_id text,
  decision text NOT NULL CHECK (decision IN ('APPROVE', 'REJECT')),
  decided_at timestamptz NOT NULL,
  UNIQUE (workspace_id, proposal_id),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, proposal_id)
    REFERENCES agent.proposal (workspace_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS agent_approval_workspace_time_idx
  ON agent.approval_decision (workspace_id, decided_at DESC, id);

CREATE OR REPLACE FUNCTION agent.reject_approval_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'agent.approval_decision is append-only';
END;
$$;

DROP TRIGGER IF EXISTS agent_approval_append_only ON agent.approval_decision;
CREATE TRIGGER agent_approval_append_only
  BEFORE UPDATE OR DELETE ON agent.approval_decision
  FOR EACH ROW EXECUTE FUNCTION agent.reject_approval_mutation();

CREATE TABLE IF NOT EXISTS agent.proposal_execution (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES iam.workspace (id) ON DELETE RESTRICT,
  proposal_id uuid NOT NULL,
  approval_id uuid NOT NULL,
  proposal_digest text NOT NULL CHECK (proposal_digest ~ '^[0-9a-f]{64}$'),
  status text NOT NULL CHECK (status IN ('EXECUTED', 'FAILED')),
  resulting_aggregate_version bigint CHECK (
    resulting_aggregate_version IS NULL OR resulting_aggregate_version > 0
  ),
  error_code text,
  error_message text,
  executed_at timestamptz NOT NULL,
  request_id text NOT NULL CHECK (length(btrim(request_id)) > 0),
  UNIQUE (workspace_id, proposal_id),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, proposal_id)
    REFERENCES agent.proposal (workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, approval_id)
    REFERENCES agent.approval_decision (workspace_id, id) ON DELETE RESTRICT,
  CHECK ((status = 'EXECUTED' AND resulting_aggregate_version IS NOT NULL AND error_code IS NULL AND error_message IS NULL)
    OR (status = 'FAILED' AND error_code IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS agent_execution_workspace_time_idx
  ON agent.proposal_execution (workspace_id, executed_at DESC, id);

CREATE OR REPLACE FUNCTION agent.reject_execution_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'agent.proposal_execution is append-only';
END;
$$;

DROP TRIGGER IF EXISTS agent_execution_append_only ON agent.proposal_execution;
CREATE TRIGGER agent_execution_append_only
  BEFORE UPDATE OR DELETE ON agent.proposal_execution
  FOR EACH ROW EXECUTE FUNCTION agent.reject_execution_mutation();
