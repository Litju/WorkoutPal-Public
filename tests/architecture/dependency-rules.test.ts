import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  coreAndApplicationForbiddenPattern,
  evaluateArchitecture,
  isAgentMutationToolForbiddenSource,
  isAgentReadPathForbiddenImport,
  isAgentReadPathForbiddenSource,
  isDeliveryPrivateImport,
  isMonitoringForbiddenImport,
  isScientificContractForbiddenImport,
} from "./architecture-rules";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

describe("architecture fitness functions", () => {
  it("enforces the frozen package graph and isolation rules", () => {
    const result = evaluateArchitecture(repositoryRoot);
    expect(result.errors, result.errors.join("\n")).toEqual([]);
  });

  it("keeps the new application-layer framework rule live", () => {
    expect(coreAndApplicationForbiddenPattern.test('from "better-auth"')).toBe(
      true,
    );
    expect(
      coreAndApplicationForbiddenPattern.test(
        'from "@workoutpal/shared-kernel"',
      ),
    ).toBe(false);
  });

  it("keeps the A01 delivery portability rules live", () => {
    expect(
      coreAndApplicationForbiddenPattern.test('import "@vercel/functions"'),
    ).toBe(true);
    expect(coreAndApplicationForbiddenPattern.test('import "vercel"')).toBe(
      true,
    );
    expect(isDeliveryPrivateImport("@workoutpal/application/private")).toBe(
      true,
    );
    expect(isDeliveryPrivateImport("@workoutpal/application")).toBe(false);
    expect(
      isDeliveryPrivateImport("../../packages/application/src/internal"),
    ).toBe(true);
  });

  it("keeps the F5 monitoring adapter boundary live", () => {
    expect(
      isMonitoringForbiddenImport("@workoutpal/persistence-postgres"),
    ).toBe(true);
    expect(isMonitoringForbiddenImport("@workoutpal/training-execution")).toBe(
      false,
    );
  });

  it("keeps the F6 agent surface read-only and infrastructure-free", () => {
    expect(isAgentReadPathForbiddenImport("drizzle-orm")).toBe(true);
    expect(isAgentReadPathForbiddenImport("@workoutpal/application")).toBe(
      false,
    );
    expect(
      isAgentReadPathForbiddenSource(
        "import { exec } from 'node:child_process'",
      ),
    ).toBe(true);
    expect(isAgentReadPathForbiddenSource("return readAthlete(input)")).toBe(
      false,
    );
  });

  it("keeps the F7 authored mutation tools narrow and adapter-free", () => {
    const toolDirectory = path.join(
      repositoryRoot,
      "apps",
      "studio",
      "agent",
      "tools",
    );
    const proposalTools = [
      "propose_reschedule_session.ts",
      "propose_set_strength_target_load.ts",
      "execute_agent_proposal.ts",
    ];
    expect(
      proposalTools.every((file) => readdirSync(toolDirectory).includes(file)),
    ).toBe(true);
    for (const file of proposalTools) {
      expect(
        isAgentMutationToolForbiddenSource(
          readFileSync(path.join(toolDirectory, file), "utf8"),
        ),
        file,
      ).toBe(false);
    }
    expect(
      isAgentMutationToolForbiddenSource(
        "import { Pool } from 'pg'; fetch('/mutation');",
      ),
    ).toBe(true);
  });

  it("keeps SCI-0 contracts independent from PSC4 implementations and adapters", () => {
    expect(
      isScientificContractForbiddenImport("@workoutpal/shared-kernel"),
    ).toBe(false);
    expect(isScientificContractForbiddenImport("@workoutpal/assessments")).toBe(
      true,
    );
    expect(isScientificContractForbiddenImport("postgres")).toBe(true);
    expect(isScientificContractForbiddenImport("next/server")).toBe(true);
  });
});
