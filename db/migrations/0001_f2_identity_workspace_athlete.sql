-- F2 owns the first product tables. Authentication tables are adapter-owned;
-- WorkoutPal application tables remain in their bounded-context schemas.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS auth."user" (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false,
  image text,
  "createdAt" timestamptz NOT NULL,
  "updatedAt" timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS auth.session (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "expiresAt" timestamptz NOT NULL,
  token text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL,
  "updatedAt" timestamptz NOT NULL,
  "ipAddress" text,
  "userAgent" text,
  "userId" text NOT NULL REFERENCES auth."user" (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS auth_session_user_id_idx ON auth.session ("userId");

CREATE TABLE IF NOT EXISTS auth.account (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES auth."user" (id) ON DELETE CASCADE,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope text,
  password text,
  "createdAt" timestamptz NOT NULL,
  "updatedAt" timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS auth_account_provider_user_idx
  ON auth.account ("providerId", "userId");

CREATE TABLE IF NOT EXISTS auth.verification (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  identifier text NOT NULL,
  value text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz,
  "updatedAt" timestamptz
);

CREATE INDEX IF NOT EXISTS auth_verification_identifier_idx
  ON auth.verification (identifier);

CREATE TABLE IF NOT EXISTS iam.workspace (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  archived_at timestamptz
);

CREATE TABLE IF NOT EXISTS iam.workspace_member (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES iam.workspace (id),
  principal_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'coach', 'athlete', 'viewer')),
  status text NOT NULL CHECK (status IN ('active', 'suspended')),
  UNIQUE (workspace_id, principal_id),
  UNIQUE (workspace_id, id)
);

CREATE INDEX IF NOT EXISTS iam_workspace_member_principal_idx
  ON iam.workspace_member (principal_id, status);

CREATE TABLE IF NOT EXISTS athlete.profile (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES iam.workspace (id),
  display_name text NOT NULL CHECK (length(btrim(display_name)) > 0),
  linked_user_id uuid,
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  archived_at timestamptz,
  UNIQUE (workspace_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS athlete_profile_linked_user_idx
  ON athlete.profile (workspace_id, linked_user_id)
  WHERE linked_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS athlete_profile_workspace_active_idx
  ON athlete.profile (workspace_id, archived_at, created_at DESC);

CREATE TABLE IF NOT EXISTS athlete.coach_assignment (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  athlete_id uuid NOT NULL,
  coach_principal_id uuid NOT NULL,
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  UNIQUE (workspace_id, athlete_id, coach_principal_id),
  FOREIGN KEY (workspace_id, athlete_id)
    REFERENCES athlete.profile (workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, coach_principal_id)
    REFERENCES iam.workspace_member (workspace_id, principal_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS athlete_coach_assignment_coach_idx
  ON athlete.coach_assignment (workspace_id, coach_principal_id, athlete_id);

CREATE TABLE IF NOT EXISTS audit.event (
  id uuid PRIMARY KEY,
  occurred_at timestamptz NOT NULL,
  workspace_id uuid NOT NULL REFERENCES iam.workspace (id),
  actor_id uuid NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('HUMAN', 'AGENT', 'SYSTEM')),
  action text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  version_before bigint,
  version_after bigint,
  request_id text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS audit_event_workspace_time_idx
  ON audit.event (workspace_id, occurred_at, id);

CREATE INDEX IF NOT EXISTS audit_event_aggregate_idx
  ON audit.event (workspace_id, aggregate_id, occurred_at);

CREATE OR REPLACE FUNCTION audit.reject_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit.event is append-only';
END;
$$;

DROP TRIGGER IF EXISTS audit_event_append_only ON audit.event;
CREATE TRIGGER audit_event_append_only
  BEFORE UPDATE OR DELETE ON audit.event
  FOR EACH ROW EXECUTE FUNCTION audit.reject_event_mutation();

CREATE TABLE IF NOT EXISTS iam.idempotency_record (
  id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  operation text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  outcome jsonb,
  created_at timestamptz NOT NULL,
  UNIQUE (actor_id, operation, idempotency_key)
);

CREATE INDEX IF NOT EXISTS iam_idempotency_created_idx
  ON iam.idempotency_record (created_at);
