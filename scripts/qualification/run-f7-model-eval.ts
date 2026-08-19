import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

type Fixture = Readonly<Record<string, string>>;

const inheritedEnv = { ...process.env };

function localEnvironmentValue(name: string): string | undefined {
  try {
    const line = readFileSync(".env.local", "utf8")
      .split(/\r?\n/u)
      .find((candidate) => candidate.startsWith(`${name}=`));
    return line?.slice(name.length + 1);
  } catch {
    return undefined;
  }
}

function loadLocalEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...inheritedEnv };
  for (const name of [
    "DATABASE_URL",
    "BETTER_AUTH_SECRET",
    "OPENCODE_GO_API_KEY",
  ]) {
    const value = localEnvironmentValue(name);
    if (value !== undefined) environment[name] = value;
  }
  if (environment.DATABASE_URL === undefined)
    throw new Error(
      "DATABASE_URL must be supplied by the local qualification environment.",
    );
  environment.BETTER_AUTH_SECRET ??= randomUUID();
  return environment;
}

const qualificationEnv = {
  ...loadLocalEnvironment(),
  BETTER_AUTH_URL: "http://127.0.0.1:3001",
  WORKOUTPAL_E2E: "1",
};
const evalSelector =
  (Reflect.get(process, "env") as Record<string, string | undefined>)
    .WORKOUTPAL_QUALIFICATION_EVAL_SELECTOR ??
  "f7-agent-proposal-approval-mutation";

function runFixture(): Fixture {
  const result = spawnSync(
    "cmd.exe",
    [
      "/d",
      "/s",
      "/c",
      "pnpm.cmd exec tsx scripts/qualification/f7-model-fixture.ts",
    ],
    { cwd: process.cwd(), encoding: "utf8", env: qualificationEnv },
  );
  if (result.status !== 0) {
    process.stderr.write(String(result.stderr ?? result.error ?? ""));
    throw new Error("The F7 model fixture could not be created.");
  }
  const line = result.stdout.trim().split(/\r?\n/).at(-1);
  if (line === undefined) throw new Error("The F7 model fixture was empty.");
  return JSON.parse(line) as Fixture;
}

function terminate(processHandle: ReturnType<typeof spawn>): void {
  if (processHandle.pid === undefined) return;
  spawnSync("taskkill.exe", ["/PID", String(processHandle.pid), "/T", "/F"], {
    stdio: "ignore",
  });
}

const fixture = runFixture();
const eve = spawn(process.execPath, ["apps/studio/.output/server/index.mjs"], {
  cwd: process.cwd(),
  env: { ...qualificationEnv, HOST: "127.0.0.1", PORT: "4275" },
  stdio: "ignore",
  windowsHide: true,
});
const proxy = spawn(
  "cmd.exe",
  [
    "/d",
    "/s",
    "/c",
    "pnpm.cmd exec tsx scripts/qualification/eve-auth-proxy.ts",
  ],
  {
    cwd: process.cwd(),
    env: {
      ...qualificationEnv,
      WORKOUTPAL_EVE_PROXY_COOKIE: fixture.ownerCookie,
      WORKOUTPAL_EVE_PROXY_WORKSPACE_ID: fixture.workspaceId,
      WORKOUTPAL_EVE_PROXY_PORT: "3080",
      WORKOUTPAL_EVE_PROXY_EVE_URL: "http://127.0.0.1:4275",
    },
    stdio: "ignore",
    windowsHide: true,
  },
);

async function waitForHealth(url: string): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The child process may still be compiling the built runtime.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Qualification service did not become healthy: ${url}`);
}

try {
  await waitForHealth("http://127.0.0.1:4275/eve/v1/health");
  await waitForHealth("http://127.0.0.1:3080/eve/v1/health");
  const evaluationEnv = {
    ...qualificationEnv,
    WORKOUTPAL_F6_EVAL_COOKIE: fixture.ownerCookie,
    WORKOUTPAL_F6_EVAL_WORKSPACE_ID: fixture.workspaceId,
    WORKOUTPAL_F6_EVAL_ATHLETE_ID: fixture.athleteId,
    WORKOUTPAL_F6_EVAL_PLAN_ID: fixture.planId,
    WORKOUTPAL_F6_EVAL_PRESCRIPTION_ID: fixture.prescriptionId,
    WORKOUTPAL_F6_EVAL_EXECUTION_ID: fixture.executionId,
    WORKOUTPAL_F6_EVAL_FOREIGN_ATHLETE_ID: fixture.foreignAthleteId,
    WORKOUTPAL_F6_EVAL_START_DATE: "2026-08-10",
    WORKOUTPAL_F6_EVAL_END_DATE: "2026-08-16",
    WORKOUTPAL_F6_EVAL_TIME_ZONE: "America/Argentina/Buenos_Aires",
    WORKOUTPAL_F7_EVAL_COOKIE: fixture.ownerCookie,
    WORKOUTPAL_F7_EVAL_WORKSPACE_ID: fixture.workspaceId,
    WORKOUTPAL_F7_EVAL_ATHLETE_ID: fixture.athleteId,
    WORKOUTPAL_F7_EVAL_PLAN_ID: fixture.planId,
    WORKOUTPAL_F7_EVAL_PRESCRIPTION_ID: fixture.prescriptionId,
    WORKOUTPAL_F7_EVAL_EXECUTION_ID: fixture.executionId,
    WORKOUTPAL_F7_EVAL_FOREIGN_ATHLETE_ID: fixture.foreignAthleteId,
    WORKOUTPAL_F7_EVAL_FOREIGN_SESSION_PRESCRIPTION_ID:
      fixture.foreignSessionPrescriptionId,
    WORKOUTPAL_F7_EVAL_SESSION_PRESCRIPTION_ID: fixture.sessionPrescriptionId,
    WORKOUTPAL_F7_EVAL_STRENGTH_SET_ID: fixture.strengthSetId,
    WORKOUTPAL_F7_EVAL_WRONG_APPROVER_COOKIE: fixture.wrongApproverCookie,
    WORKOUTPAL_F7_EVAL_STALE_SESSION_ID: fixture.sessionIdStale,
    WORKOUTPAL_F7_EVAL_REPLAY_SESSION_ID: fixture.sessionIdReplay,
    WORKOUTPAL_F7_EVAL_WRONG_APPROVER_SESSION_ID:
      fixture.sessionIdWrongApprover,
    WORKOUTPAL_F7_EVAL_REJECTION_SESSION_ID: fixture.sessionIdRejection,
    WORKOUTPAL_F7_EVAL_APPROVAL_SESSION_ID: fixture.sessionIdApproval,
    WORKOUTPAL_F7_EVAL_CONVERSATIONAL_SESSION_ID:
      fixture.sessionIdConversational,
    WORKOUTPAL_F7_EVAL_PROOF_SESSION_ID: fixture.sessionIdProof,
    WORKOUTPAL_F7_EVAL_TARGET_LOAD_KG: "135",
    WORKOUTPAL_F7_EVAL_RESCHEDULE_DATE: "2026-09-06",
    WORKOUTPAL_F7_EVAL_STALE_DATE: "2026-09-11",
    WORKOUTPAL_F7_EVAL_REPLAY_DATE: "2026-09-12",
    WORKOUTPAL_F7_EVAL_WRONG_APPROVER_DATE: "2026-09-13",
    WORKOUTPAL_F7_EVAL_PROOF_DATE: "2026-09-14",
  };
  const result = spawnSync(
    "cmd.exe",
    [
      "/d",
      "/s",
      "/c",
      `pnpm.cmd --filter @workoutpal/studio exec eve eval --url http://127.0.0.1:3080 --json --skip-report --strict --timeout 120000 --max-concurrency 1 ${evalSelector}`,
    ],
    { cwd: process.cwd(), env: evaluationEnv, encoding: "utf8" },
  );
  const output = result.stdout ?? "";
  const jsonStart = output.indexOf("{");
  const jsonEnd = output.lastIndexOf("}");
  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    const report = JSON.parse(output.slice(jsonStart, jsonEnd + 1)) as {
      readonly passed?: number;
      readonly failed?: number;
      readonly skipped?: number;
      readonly errored?: number;
      readonly results?: readonly Record<string, unknown>[];
    };
    const record = (value: unknown): Record<string, unknown> =>
      typeof value === "object" && value !== null
        ? (value as Record<string, unknown>)
        : {};
    console.log(
      JSON.stringify({
        passed: report.passed ?? 0,
        failed: report.failed ?? 0,
        skipped: report.skipped ?? 0,
        errored: report.errored ?? 0,
        results: (report.results ?? []).map((item) => {
          const outer = record(item);
          const result = record(outer.result);
          const detail = record(result.result ?? result);
          const assertionsValue = outer.assertions ?? detail.assertions;
          const assertions = Array.isArray(assertionsValue)
            ? assertionsValue.map(record)
            : [];
          return {
            id: typeof outer.id === "string" ? outer.id : undefined,
            verdict:
              typeof outer.verdict === "string"
                ? outer.verdict
                : typeof detail.verdict === "string"
                  ? detail.verdict
                  : undefined,
            status:
              typeof detail.status === "string" ? detail.status : undefined,
            skipReason:
              typeof outer.skipReason === "string"
                ? outer.skipReason
                : typeof detail.skipReason === "string"
                  ? detail.skipReason
                  : undefined,
            error: typeof outer.error === "string" ? outer.error : undefined,
            toolNames: Array.isArray(record(detail.derived).toolCalls)
              ? record(detail.derived)
                  .toolCalls.map(record)
                  .map((call) => call.name)
                  .filter((name): name is string => typeof name === "string")
              : [],
            toolCalls: Array.isArray(record(detail.derived).toolCalls)
              ? record(detail.derived)
                  .toolCalls.map(record)
                  .map((call) => ({
                    name: typeof call.name === "string" ? call.name : undefined,
                    status:
                      typeof call.status === "string" ? call.status : undefined,
                    input: call.input,
                    output: call.output,
                  }))
              : [],
            pendingInputRequests: Array.isArray(detail.inputRequests)
              ? detail.inputRequests.map(record).map((request) => ({
                  kind:
                    typeof request.kind === "string" ? request.kind : undefined,
                  toolName:
                    typeof record(request.action).toolName === "string"
                      ? record(request.action).toolName
                      : undefined,
                  prompt:
                    typeof request.prompt === "string"
                      ? request.prompt.slice(0, 240)
                      : undefined,
                  optionIds: Array.isArray(request.options)
                    ? request.options
                        .map(record)
                        .map((option) => option.id)
                        .filter((id): id is string => typeof id === "string")
                    : [],
                }))
              : [],
            finalMessage:
              typeof detail.finalMessage === "string"
                ? detail.finalMessage.slice(0, 500)
                : undefined,
            resultKeys: Object.keys(detail),
            outerKeys: Object.keys(outer),
            failedAssertions: assertions
              .filter((assertion) => assertion.passed === false)
              .map((assertion) => ({
                name:
                  typeof assertion.name === "string"
                    ? assertion.name
                    : undefined,
                message:
                  typeof assertion.message === "string"
                    ? assertion.message
                    : undefined,
              })),
          };
        }),
      }),
    );
  } else {
    console.error("Eve eval returned no JSON report.");
  }
  process.exitCode = result.status ?? 1;
} finally {
  terminate(proxy);
  terminate(eve);
}
