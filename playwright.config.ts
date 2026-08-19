import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3001";
const vercelBypassCookie = process.env.VERCEL_AUTOMATION_BYPASS_COOKIE;
const hostedProtectionState = process.env.VERCEL_SHARE_URL
  ? "test-results/.vercel-protection-state.json"
  : undefined;
function localSecret(name: string): string | undefined {
  try {
    const line = readFileSync(".env.local", "utf8")
      .split(/\r?\n/u)
      .find((candidate) => candidate.startsWith(`${name}=`));
    return line?.slice(name.length + 1);
  } catch {
    return undefined;
  }
}

const opencodeGoApiKey = localSecret("OPENCODE_GO_API_KEY");
const databaseUrl = localSecret("DATABASE_URL") ?? process.env.DATABASE_URL;
if (databaseUrl === undefined)
  throw new Error(
    "DATABASE_URL must be supplied by the local Playwright environment.",
  );
const authSecret = localSecret("BETTER_AUTH_SECRET") ?? randomUUID();
const localPreviewEnv = {
  DATABASE_URL: databaseUrl,
  BETTER_AUTH_SECRET: authSecret,
  BETTER_AUTH_URL: "http://127.0.0.1:3001",
  WORKOUTPAL_E2E: "1",
  ...(opencodeGoApiKey === undefined
    ? {}
    : { OPENCODE_GO_API_KEY: opencodeGoApiKey }),
};

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/hosted-protection.setup.ts",
  // Better Auth's local request limiter makes concurrent sign-up journeys flaky.
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  reporter: "html",
  use: {
    baseURL,
    storageState: hostedProtectionState,
    extraHTTPHeaders: process.env.VERCEL_AUTOMATION_BYPASS_SECRET
      ? {
          "x-vercel-protection-bypass":
            process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
          "x-vercel-set-bypass-cookie": "true",
        }
      : vercelBypassCookie
        ? { Cookie: vercelBypassCookie }
        : undefined,
    trace: "on-first-retry",
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : [
        {
          command:
            "pnpm --filter @workoutpal/studio exec eve start --port 4274",
          url: "http://127.0.0.1:4274/eve/v1/health",
          reuseExistingServer: true,
          timeout: 120_000,
          env: localPreviewEnv,
        },
        {
          command: "pnpm --filter @workoutpal/studio exec next start -p 3001",
          url: "http://127.0.0.1:3001",
          reuseExistingServer: true,
          timeout: 120_000,
          env: localPreviewEnv,
        },
      ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
