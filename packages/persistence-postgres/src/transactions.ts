import type {
  F7Repositories,
  PersistenceTransactionContext,
  Psc4Repositories,
} from "@workoutpal/application";
import type { Pool } from "pg";
import { createRepositories } from "./repositories.js";

export async function runPostgresTransaction<T>(input: {
  readonly pool: Pool;
  readonly context: PersistenceTransactionContext;
  readonly work: (repositories: F7Repositories) => Promise<T>;
}): Promise<T> {
  if (
    input.context.principalId.trim().length === 0 ||
    (input.context.workspaceId !== undefined &&
      String(input.context.workspaceId).trim().length === 0)
  ) {
    throw new Error(
      "PostgreSQL transactions require a non-empty server-derived tenant context.",
    );
  }

  const client = await input.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT
         set_config('workoutpal.principal_id', $1, true),
         set_config('workoutpal.workspace_id', $2, true)`,
      [input.context.principalId, input.context.workspaceId ?? ""],
    );
    const result = await input.work(createRepositories(client));
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function runPostgresPsc4Transaction<T>(input: {
  readonly pool: Pool;
  readonly context: PersistenceTransactionContext;
  readonly work: (repositories: Psc4Repositories) => Promise<T>;
}): Promise<T> {
  if (
    input.context.principalId.trim().length === 0 ||
    (input.context.workspaceId !== undefined &&
      String(input.context.workspaceId).trim().length === 0)
  ) {
    throw new Error(
      "PostgreSQL transactions require a non-empty server-derived tenant context.",
    );
  }

  const client = await input.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT
         set_config('workoutpal.principal_id', $1, true),
         set_config('workoutpal.workspace_id', $2, true)`,
      [input.context.principalId, input.context.workspaceId ?? ""],
    );
    const result = await input.work(createRepositories(client));
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
