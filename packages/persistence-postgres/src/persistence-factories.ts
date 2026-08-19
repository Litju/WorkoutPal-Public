import type {
  F2Persistence,
  F2Repositories,
  F3Persistence,
  F3Repositories,
  F4Persistence,
  F4Repositories,
  F7Persistence,
  F7Repositories,
  PersistenceTransactionContext,
  Psc4Persistence,
  Psc4Repositories,
} from "@workoutpal/application";
import { Pool } from "pg";
import {
  assertPostgresConnectionConfig,
  connectionStringForNodePg,
  type PostgresConnectionConfig,
  readPostgresConnectionConfig,
} from "./connection.js";
import {
  runPostgresPsc4Transaction,
  runPostgresTransaction,
} from "./transactions.js";

export {
  classifyPostgresConnectionTarget,
  createPostgresConnection,
  type PostgresConnection,
  type PostgresConnectionConfig,
  type PostgresConnectionTarget,
  readPostgresConnectionConfig,
} from "./connection.js";

export interface PostgresF2Persistence extends F2Persistence {
  readonly pool: Pool;
  readonly f3Transaction: F3Persistence["transaction"];
  readonly f4Transaction: F4Persistence["transaction"];
  readonly f7Transaction: F7Persistence["transaction"];
  readonly psc4Transaction: Psc4Persistence["transaction"];
  close(): Promise<void>;
}

export function createPostgresF2Persistence(
  config: PostgresConnectionConfig = readPostgresConnectionConfig(),
): PostgresF2Persistence {
  const target = assertPostgresConnectionConfig(config);
  const pool = new Pool({
    connectionString: connectionStringForNodePg(config.url),
    application_name: config.applicationName,
    ssl: config.ssl,
    enableChannelBinding:
      config.enableChannelBinding ?? target !== "LOCAL_LOOPBACK",
  } as ConstructorParameters<typeof Pool>[0] & {
    readonly enableChannelBinding: boolean;
  });
  return {
    pool,
    async transaction<T>(
      work: (repositories: F2Repositories) => Promise<T>,
      context: PersistenceTransactionContext,
    ): Promise<T> {
      return runPostgresTransaction({
        pool,
        context,
        work,
      });
    },
    async f3Transaction<T>(
      work: (repositories: F3Repositories) => Promise<T>,
      context: PersistenceTransactionContext,
    ): Promise<T> {
      return runPostgresTransaction({
        pool,
        context,
        work,
      });
    },
    async f4Transaction<T>(
      work: (repositories: F4Repositories) => Promise<T>,
      context: PersistenceTransactionContext,
    ): Promise<T> {
      return runPostgresTransaction({
        pool,
        context,
        work,
      });
    },
    async f7Transaction<T>(
      work: (repositories: F7Repositories) => Promise<T>,
      context: PersistenceTransactionContext,
    ): Promise<T> {
      return runPostgresTransaction({
        pool,
        context,
        work,
      });
    },
    async psc4Transaction<T>(
      work: (repositories: Psc4Repositories) => Promise<T>,
      context: PersistenceTransactionContext,
    ): Promise<T> {
      return runPostgresPsc4Transaction({
        pool,
        context,
        work,
      });
    },
    async close() {
      await pool.end();
    },
  };
}

export interface PostgresPsc4Persistence extends Psc4Persistence {
  readonly pool: Pool;
  close(): Promise<void>;
}

export function createPostgresPsc4Persistence(
  config: PostgresConnectionConfig = readPostgresConnectionConfig(),
): PostgresPsc4Persistence {
  const persistence = createPostgresF2Persistence(config);
  return {
    pool: persistence.pool,
    transaction: persistence.psc4Transaction,
    close: persistence.close,
  };
}

export interface PostgresF3Persistence extends F3Persistence {
  readonly pool: Pool;
  close(): Promise<void>;
}

export function createPostgresF3Persistence(
  config: PostgresConnectionConfig = readPostgresConnectionConfig(),
): PostgresF3Persistence {
  const persistence = createPostgresF2Persistence(config);
  return {
    pool: persistence.pool,
    transaction: persistence.f3Transaction,
    close: persistence.close,
  };
}

export interface PostgresF4Persistence extends F4Persistence {
  readonly pool: Pool;
  close(): Promise<void>;
}

export function createPostgresF4Persistence(
  config: PostgresConnectionConfig = readPostgresConnectionConfig(),
): PostgresF4Persistence {
  const persistence = createPostgresF2Persistence(config);
  return {
    pool: persistence.pool,
    transaction: persistence.f4Transaction,
    close: persistence.close,
  };
}
