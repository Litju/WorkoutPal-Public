-- F1 creates only approved PostgreSQL logical namespaces.
-- Domain tables belong to their first vertical slice and are intentionally absent here.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS iam;
CREATE SCHEMA IF NOT EXISTS athlete;
CREATE SCHEMA IF NOT EXISTS design;
CREATE SCHEMA IF NOT EXISTS execution;
CREATE SCHEMA IF NOT EXISTS assessment;
CREATE SCHEMA IF NOT EXISTS monitoring;
CREATE SCHEMA IF NOT EXISTS agent;
CREATE SCHEMA IF NOT EXISTS audit;
