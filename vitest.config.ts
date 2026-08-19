import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const repositoryRoot = path.dirname(fileURLToPath(import.meta.url));

const packageAliases = [
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
  "science-port",
  "persistence-postgres",
  "auth-better-auth",
  "agent-eve",
  "ui",
].reduce<Record<string, string>>((aliases, packageName) => {
  aliases[`@workoutpal/${packageName}`] = path.join(
    repositoryRoot,
    "packages",
    packageName,
    "src",
    packageName === "ui" ? "public.tsx" : "public.ts",
  );
  return aliases;
}, {});

export default defineConfig({
  resolve: {
    alias: packageAliases,
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    passWithNoTests: false,
    reporters: ["default"],
    testTimeout: 30_000,
  },
});
