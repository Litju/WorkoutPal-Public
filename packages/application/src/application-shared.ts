import type {
  ActorContext,
  UUID,
  WorkspaceId,
} from "@workoutpal/shared-kernel";
import type { PersistenceTransactionContext } from "./contracts.js";

export type TransactionAuthoritativeInput =
  | {
      readonly principalId: UUID;
      readonly workspaceId?: WorkspaceId;
    }
  | {
      readonly actor: Pick<ActorContext, "actorId" | "workspaceId">;
    };

export function transactionContext(
  input: TransactionAuthoritativeInput,
): PersistenceTransactionContext {
  if ("actor" in input) {
    return {
      principalId: input.actor.actorId,
      workspaceId: input.actor.workspaceId,
    };
  }
  return {
    principalId: input.principalId,
    ...(input.workspaceId === undefined
      ? {}
      : { workspaceId: input.workspaceId }),
  };
}
