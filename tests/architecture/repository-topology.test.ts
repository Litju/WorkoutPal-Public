import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const packageDirectories = [
  "shared-kernel",
  "application",
  "accounts",
  "athletes",
  "training-design",
  "training-execution",
  "assessments",
  "monitoring",
  "provenance",
  "agent-operations",
  "science-contract",
  "movement-science",
  "persistence-postgres",
  "auth-better-auth",
  "agent-eve",
  "ui",
  "science-port",
];

describe("F1 repository topology", () => {
  it("contains the TDD package, database, test, and Studio surfaces", () => {
    expect(
      existsSync(path.join(repositoryRoot, "apps", "studio", "package.json")),
    ).toBe(true);
    expect(existsSync(path.join(repositoryRoot, "db", "migrations"))).toBe(
      true,
    );
    expect(existsSync(path.join(repositoryRoot, "db", "seeds"))).toBe(true);
    expect(existsSync(path.join(repositoryRoot, "tests", "architecture"))).toBe(
      true,
    );
    expect(existsSync(path.join(repositoryRoot, "tests", "integration"))).toBe(
      true,
    );
    expect(existsSync(path.join(repositoryRoot, "tests", "contracts"))).toBe(
      true,
    );
    expect(existsSync(path.join(repositoryRoot, "tests", "e2e"))).toBe(true);

    const actualPackages = readdirSync(path.join(repositoryRoot, "packages"), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(actualPackages).toEqual([...packageDirectories].sort());
    for (const packageDirectory of packageDirectories) {
      expect(
        existsSync(
          path.join(
            repositoryRoot,
            "packages",
            packageDirectory,
            "package.json",
          ),
        ),
      ).toBe(true);
      expect(
        existsSync(
          path.join(
            repositoryRoot,
            "packages",
            packageDirectory,
            "tsconfig.json",
          ),
        ),
      ).toBe(true);
    }
  });
});
