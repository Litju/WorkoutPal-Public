import { canAccessWorkspace } from "@workoutpal/accounts";
import type {
  UUID,
  WorkspaceId,
  WorkspaceScope,
} from "@workoutpal/shared-kernel";
import { transactionContext } from "./application-shared.js";
import type {
  CommandMetadata,
  F2Persistence,
  F2Repositories,
  WorkspaceSearchResult,
} from "./contracts.js";
import { ApplicationError } from "./contracts.js";

function scope(workspaceId: WorkspaceId): WorkspaceScope {
  return { workspaceId };
}

function searchLimit(limit: number | undefined): number {
  const value = limit ?? 25;
  if (!Number.isInteger(value) || value < 1 || value > 50) {
    throw new ApplicationError(
      "VALIDATION_FAILED",
      "Search limit must be a whole number between 1 and 50.",
    );
  }
  return value;
}

async function authorizeSearch(
  repositories: F2Repositories,
  principalId: UUID,
  workspaceId: WorkspaceId,
): Promise<void> {
  const membership = await repositories.memberships.get(
    scope(workspaceId),
    principalId,
  );
  if (!canAccessWorkspace(membership, "workspace.read")) {
    throw new ApplicationError(
      "FORBIDDEN",
      "Your workspace role cannot search this workspace.",
    );
  }
}

export class SearchApplication {
  constructor(private readonly persistence: F2Persistence) {}

  async search(
    input: CommandMetadata & {
      readonly workspaceId: WorkspaceId;
      readonly query?: string;
      readonly limit?: number;
    },
  ): Promise<readonly WorkspaceSearchResult[]> {
    const query = input.query?.trim() ?? "";
    if (query.length > 200) {
      throw new ApplicationError(
        "VALIDATION_FAILED",
        "Search query must be 200 characters or fewer.",
      );
    }
    const limit = searchLimit(input.limit);
    return this.persistence.transaction(async (repositories) => {
      await authorizeSearch(repositories, input.principalId, input.workspaceId);
      return repositories.search.search(scope(input.workspaceId), query, limit);
    }, transactionContext(input));
  }
}

export function createSearchApplication(
  persistence: F2Persistence,
): SearchApplication {
  return new SearchApplication(persistence);
}
