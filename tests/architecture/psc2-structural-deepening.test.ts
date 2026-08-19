import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function source(...segments: string[]): string {
  return readFileSync(path.join(repositoryRoot, ...segments), "utf8");
}

function routePageFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return routePageFiles(fullPath);
    return entry.name === "page.tsx" ? [fullPath] : [];
  });
}

describe("PSC2 structural deepening", () => {
  it("keeps application and persistence public entries as stable facades", () => {
    const facades = [
      ["packages", "application", "src", "public.ts"],
      ["packages", "persistence-postgres", "src", "public.ts"],
    ];
    for (const segments of facades) {
      const facade = source(...segments);
      expect(facade).not.toMatch(
        /\b(?:class|function|interface)\s+\w+|\btype\s+\w+\s*=/,
      );
      expect(facade).not.toMatch(/(?:drizzle-orm|\bpg\b|node:fs)/i);
      expect(facade).toMatch(/export\s+(?:\*|\{)/);
    }
  });

  it("keeps capability and adapter ownership in named internal modules", () => {
    const expectedModules = [
      ["packages", "application", "src", "contracts.ts"],
      ["packages", "application", "src", "f2.ts"],
      ["packages", "application", "src", "f3.ts"],
      ["packages", "application", "src", "f4.ts"],
      ["packages", "application", "src", "f5.ts"],
      ["packages", "application", "src", "f7.ts"],
      ["packages", "persistence-postgres", "src", "account-repositories.ts"],
      [
        "packages",
        "persistence-postgres",
        "src",
        "training-design-repositories.ts",
      ],
      ["packages", "persistence-postgres", "src", "agent-repositories.ts"],
      ["packages", "persistence-postgres", "src", "transactions.ts"],
    ];
    for (const segments of expectedModules) {
      expect(existsSync(path.join(repositoryRoot, ...segments))).toBe(true);
    }
    expect(
      source("packages", "persistence-postgres", "src", "repositories.ts"),
    ).toContain("createAccountRepositories");
    expect(
      source("packages", "persistence-postgres", "src", "repositories.ts"),
    ).toContain("createTrainingDesignRepositories");
    expect(
      source("packages", "persistence-postgres", "src", "repositories.ts"),
    ).toContain("createAgentRepositories");
  });

  it("keeps route identifiers on the delivery-to-capability seam", () => {
    const routeScreen = source("apps", "studio", "app", "route-screen.tsx");
    expect(routeScreen).toContain("validateRouteContext");
    expect(routeScreen).toContain("routeContext={routeContext ?? undefined}");
    expect(source("apps", "studio", "app", "f3-client.tsx")).toContain(
      "routeContext?.sessionId",
    );
    expect(source("apps", "studio", "app", "f4-client.tsx")).toContain(
      "routeContext?.executionId",
    );
    expect(source("apps", "studio", "app", "f5-client.tsx")).toContain(
      "routeContext?.sessionId",
    );
  });

  it("keeps identifier-bearing route pages explicit", () => {
    const requiredProps: Readonly<Record<string, readonly string[]>> = {
      "ATH-02": ["workspaceId"],
      "ATH-04": ["workspaceId", "athleteId"],
      "ATH-05": ["workspaceId", "athleteId"],
      "ATH-06": ["workspaceId", "athleteId", "goalId"],
      "ASM-01": ["workspaceId", "athleteId"],
      "ASM-02": ["workspaceId", "athleteId"],
      "ASM-03": ["workspaceId", "athleteId", "assessmentId"],
      "ASM-04": ["workspaceId", "athleteId", "assessmentId"],
      "EXE-01": ["workspaceId", "athleteId", "sessionId"],
      "EXE-02": ["workspaceId", "athleteId", "sessionId"],
      "EXE-03": ["workspaceId", "athleteId", "sessionId"],
      "EXE-04": ["workspaceId", "athleteId", "sessionId"],
      "EXE-05": ["workspaceId", "athleteId", "sessionId"],
      "EXE-06": ["workspaceId", "athleteId", "executionId"],
      "EXE-07": ["workspaceId", "athleteId", "executionId"],
      "GLB-01": ["workspaceId"],
      "GLB-02": ["workspaceId"],
      "GLB-03": ["workspaceId"],
      "HIS-01": ["workspaceId"],
      "LIB-01": ["workspaceId"],
      "LIB-02": ["workspaceId", "movementId"],
      "MON-02": ["workspaceId", "athleteId", "sessionId"],
      "MON-03": ["workspaceId", "athleteId"],
      "MON-04": ["workspaceId", "athleteId"],
      "RPT-01": ["workspaceId"],
      "RPT-02": ["workspaceId"],
      "RPT-03": ["workspaceId", "reportId"],
      "SET-01": ["workspaceId"],
      "SET-02": ["workspaceId"],
      "SET-03": ["workspaceId"],
      "SET-04": ["workspaceId"],
      "TRN-01": ["workspaceId", "athleteId"],
      "TRN-02": ["workspaceId", "athleteId"],
      "TRN-03": ["workspaceId", "athleteId", "planId"],
      "TRN-04": ["workspaceId", "athleteId", "planId", "phaseId"],
      "TRN-05": ["workspaceId", "athleteId"],
      "TRN-06": ["workspaceId", "athleteId"],
      "TRN-07": ["workspaceId", "athleteId", "sessionId"],
      "TRN-08": ["workspaceId", "athleteId", "sessionId"],
      "TRN-09": ["workspaceId", "athleteId", "sessionId"],
      "TRN-10": ["workspaceId", "athleteId", "sessionId"],
      "TRN-11": ["workspaceId", "athleteId"],
      "TRN-12": ["workspaceId", "athleteId"],
    };
    const workspaceDirectory = path.join(
      repositoryRoot,
      "apps",
      "studio",
      "app",
      "workspace",
    );
    for (const filePath of routePageFiles(workspaceDirectory)) {
      const page = readFileSync(filePath, "utf8");
      if (!page.includes("<RouteScreen")) continue;
      const surfaceId = /surfaceId="([A-Z0-9-]+)"/.exec(page)?.[1];
      expect(surfaceId, filePath).toBeDefined();
      const props =
        surfaceId === undefined ? undefined : requiredProps[surfaceId];
      expect(props, `${filePath}: ${surfaceId}`).toBeDefined();
      for (const prop of props ?? []) {
        expect(page, `${filePath}: missing ${prop}`).toMatch(
          new RegExp(`\\b${prop}=\\{`),
        );
      }
    }
  });

  it("keeps tenant authority inside the transaction executor seam", () => {
    const transactions = source(
      "packages",
      "persistence-postgres",
      "src",
      "transactions.ts",
    );
    expect(transactions).toContain('client.query("BEGIN")');
    expect(transactions).toContain("set_config('workoutpal.principal_id'");
    expect(transactions).toContain("set_config('workoutpal.workspace_id'");
    expect(transactions).toContain("true)");
    expect(transactions).toContain("createRepositories(client)");
    expect(transactions).toContain('client.query("COMMIT")');
    expect(transactions).toContain('client.query("ROLLBACK")');
  });
});
