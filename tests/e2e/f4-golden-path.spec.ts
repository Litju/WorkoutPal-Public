import { expect, test } from "@playwright/test";

test("F4 golden path: execute, complete, reload, and amend without rewriting the original", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const email = `f4-owner-${suffix}@example.com`;
  const athleteName = `F4 Athlete ${suffix}`;
  const workspaceName = `F4 Workspace ${suffix}`;

  await page.goto("/sign-in");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .first()
    .click();
  await page.getByLabel("Name").fill("F4 Training Coach");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("WorkoutPal-Local-123!");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .last()
    .click();

  await expect(page.getByText("Choose your workspace")).toBeVisible();
  await page.locator("input").fill(workspaceName);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/workspace\/([0-9a-f-]+)\/athletes$/);
  const workspaceId = page
    .url()
    .match(/\/workspace\/([0-9a-f-]+)\/athletes$/)?.[1];
  expect(workspaceId).toBeDefined();

  await page.getByPlaceholder("Athlete name").fill(athleteName);
  await page.getByRole("button", { name: "Add athlete" }).click();
  await expect(page.getByText(athleteName)).toBeVisible();
  await page.getByRole("button", { name: new RegExp(athleteName) }).click();
  await expect(page).toHaveURL(
    /\/workspace\/[0-9a-f-]+\/athletes\/[0-9a-f-]+$/,
  );
  const athleteId = page.url().match(/\/athletes\/([0-9a-f-]+)$/)?.[1];
  expect(athleteId).toBeDefined();
  if (workspaceId === undefined || athleteId === undefined) {
    throw new Error(
      "The F4 journey did not produce workspace and athlete IDs.",
    );
  }
  await page.getByRole("link", { name: "Open Training Design" }).click();
  await page.waitForLoadState("networkidle");

  const movementInput = page.getByPlaceholder("Back squat");
  await movementInput.fill("Back squat");
  await expect(movementInput).toHaveValue("Back squat");
  await page.getByRole("button", { name: "Add movement", exact: true }).click();
  await expect(
    page.getByText("Visible catalog").locator("..").getByText("1", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByLabel("Title").fill("F4 execution plan");
  await page.getByRole("button", { name: "Create draft plan" }).click();
  await expect(
    page.getByRole("heading", { name: "F4 execution plan" }),
  ).toBeVisible();
  await page.getByPlaceholder("Monday strength").fill("F4 observed session");
  await page.getByRole("button", { name: "Add session" }).click();
  await expect(
    page.getByRole("heading", { name: "F4 observed session" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /F4 observed session/ }).click();
  await page.getByRole("button", { name: "+ StrengthBlock" }).click();
  await page.getByRole("button", { name: "+ EnduranceBlock" }).click();
  await page.getByRole("button", { name: "+ MobilityBlock" }).click();
  await page.getByRole("button", { name: "+ exercise" }).click();
  await expect(page.getByRole("button", { name: "+ set" })).toBeVisible();
  await page.getByRole("button", { name: "+ set" }).click();
  await page.getByRole("button", { name: "+ mobility item" }).click();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("button", { name: "Save draft" })).toBeEnabled();
  await page.getByRole("button", { name: "Publish plan" }).click();
  await expect(
    page.getByText(/PUBLISHED · v\d+ · revision \d+/, { exact: true }),
  ).toBeVisible();

  await page.goto(`/workspace/${workspaceId}/athletes/${athleteId}/execution`);
  await expect(page.getByText("F4 · observed execution")).toBeVisible();
  await page.getByLabel("Session prescription").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Start executed session" }).click();
  await expect(page.getByText("Immutable snapshot SHA-256")).toBeVisible();

  const strengthForm = page.locator("form").filter({ hasText: "Strength set" });
  await strengthForm.getByLabel("Repetitions").fill("5");
  await strengthForm.getByLabel("Load (kg)").fill("100");
  await page.getByRole("button", { name: "Record strength" }).click();
  await expect(
    page.getByText("Raw performed facts are append-only evidence."),
  ).toBeVisible();
  const enduranceForm = page
    .locator("form")
    .filter({ hasText: "Endurance segment" });
  await enduranceForm.getByLabel("Duration (seconds)").fill("600");
  await enduranceForm.getByLabel("Average speed (m/s)").fill("3.2");
  await page.getByRole("button", { name: "Record endurance" }).click();
  const mobilityForm = page
    .locator("form")
    .filter({ hasText: "Mobility item" });
  await mobilityForm.getByLabel("Repetitions").fill("8");
  await mobilityForm.getByLabel("Duration (seconds)").fill("30");
  await page.getByRole("button", { name: "Record mobility" }).click();
  await page.getByLabel("Session note").fill("Good tolerance");
  await page.getByRole("button", { name: "Record observation" }).click();
  await page.getByRole("button", { name: "Complete session" }).click();
  await expect(
    page.getByRole("heading", { name: /completed · expected version/ }),
  ).toBeVisible();
  await expect(page.getByText("Original performed facts")).toBeVisible();

  const amendmentForm = page
    .locator("form")
    .filter({ hasText: "Amend a strength fact" });
  await amendmentForm.getByRole("combobox").selectOption({ index: 1 });
  await amendmentForm.getByLabel("Corrected repetitions").fill("6");
  await amendmentForm
    .getByLabel("Reason")
    .fill("Athlete confirmed one additional repetition.");
  await page.getByRole("button", { name: "Record amendment" }).click();
  await expect(
    page.getByText("The original performed fact remains preserved."),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText("Effective corrected view")).toBeVisible();
  await expect(page.getByText("Original performed facts")).toBeVisible();

  await page.goto(`/workspace/${workspaceId}/athletes/${athleteId}/monitoring`);
  await expect(page.getByText("F5 · factual monitoring")).toBeVisible();
  await page.getByLabel("Week starting").fill("2026-09-01");
  await page.getByRole("button", { name: "Refresh facts" }).click();
  await expect(
    page.getByRole("heading", { name: "F4 observed session" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /F4 observed session/ }).click();
  await expect(page.getByRole("heading", { name: "Strength" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Endurance" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mobility" })).toBeVisible();
  await expect(page.getByText("Raw observations")).toBeVisible();
  await expect(page.getByText("Amendment provenance")).toBeVisible();
  await expect(page.getByText("Value corrected by amendment")).toBeVisible();
  await expect(page.getByText("Good tolerance")).toBeVisible();
  await expect(
    page.getByRole("table", {
      name: "Endurance prescribed and performed facts",
    }),
  ).toContainText("3.2");
  await page.getByLabel("Week starting").focus();
  await expect(page.getByLabel("Week starting")).toBeFocused();
  await page.getByLabel("Session timezone").focus();
  await expect(page.getByLabel("Session timezone")).toBeFocused();
  await page.getByRole("button", { name: "Refresh facts" }).focus();
  await expect(
    page.getByRole("button", { name: "Refresh facts" }),
  ).toBeFocused();
  for (const tableName of [
    "Strength prescribed and performed facts",
    "Endurance prescribed and performed facts",
    "Mobility prescribed and performed facts",
  ]) {
    await expect(page.getByRole("table", { name: tableName })).toHaveCount(1);
  }

  await page.goto(`/workspace/${workspaceId}/athletes/${athleteId}/plan`);
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByRole("button", { name: "Create revision" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create revision" }).click();
  await expect(
    page.getByRole("button", { name: "Publish plan" }),
  ).toBeVisible();
  await page.getByLabel("Session title").fill("F4 revised session");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByLabel("Session title")).toHaveValue(
    "F4 revised session",
  );
  const newSessionForm = page
    .locator("form")
    .filter({ has: page.getByPlaceholder("Monday strength") });
  await newSessionForm
    .getByPlaceholder("Monday strength")
    .fill("F5 missed prescription");
  await newSessionForm.locator('input[type="date"]').fill("2026-09-02");
  await newSessionForm.getByRole("button", { name: "Add session" }).click();
  await expect(page.getByText("F5 missed prescription")).toBeVisible();
  await page.getByRole("button", { name: "Publish plan" }).click();
  await expect(
    page.getByText(/PUBLISHED · v\d+ · revision 2/, { exact: true }),
  ).toBeVisible();

  const unplannedStart = await page.evaluate(
    async ({ workspaceId, athleteId }) => {
      const response = await fetch("/api/v1/session-executions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": `f5-preview-unplanned-${crypto.randomUUID()}`,
        },
        body: JSON.stringify({ workspaceId, athleteId }),
      });
      return { status: response.status, body: await response.json() };
    },
    { workspaceId, athleteId },
  );
  expect(unplannedStart.status, JSON.stringify(unplannedStart.body)).toBe(201);
  const unplannedExecutionId = unplannedStart.body.data.id as string;

  const executionList = await page.evaluate(
    async ({ workspaceId, athleteId }) => {
      const response = await fetch(
        `/api/v1/session-executions?workspaceId=${workspaceId}&athleteId=${athleteId}`,
      );
      return { status: response.status, body: await response.json() };
    },
    { workspaceId, athleteId },
  );
  expect(executionList.status).toBe(200);
  const historicalExecution = executionList.body.data.find(
    (execution: {
      readonly status: string;
      readonly prescription: { readonly prescriptionRevision: number } | null;
    }) =>
      execution.status === "completed" &&
      execution.prescription?.prescriptionRevision === 1,
  );
  if (historicalExecution === undefined) {
    throw new Error("The completed V1 execution was not returned.");
  }

  const historicalMonitoring = await page.evaluate(
    async ({ workspaceId, executionId }) => {
      const response = await fetch(
        `/api/v1/executed-sessions/${executionId}/monitoring?workspaceId=${workspaceId}`,
      );
      return { status: response.status, body: await response.json() };
    },
    { workspaceId, executionId: historicalExecution.id as string },
  );
  expect(historicalMonitoring.status).toBe(200);
  expect(historicalMonitoring.body.data.prescription.prescriptionRevision).toBe(
    1,
  );
  expect(historicalMonitoring.body.data.title).toBe("F4 observed session");

  const plannedWeek = await page.evaluate(
    async ({ workspaceId, athleteId }) => {
      const response = await fetch(
        `/api/v1/athletes/${athleteId}/monitoring/week?workspaceId=${workspaceId}&weekStart=2026-09-01&timeZone=UTC`,
      );
      return { status: response.status, body: await response.json() };
    },
    { workspaceId, athleteId },
  );
  expect(plannedWeek.status).toBe(200);
  expect(
    plannedWeek.body.data.sessions.some(
      (session: { readonly title: string; readonly classification: string }) =>
        session.title === "F4 observed session" &&
        session.classification === "PRESCRIBED_WITH_EXECUTION_DEVIATION",
    ),
  ).toBe(true);
  expect(
    plannedWeek.body.data.sessions.some(
      (session: { readonly title: string; readonly classification: string }) =>
        session.title === "F5 missed prescription" &&
        session.classification === "PRESCRIBED_NOT_STARTED",
    ),
  ).toBe(true);

  const unplannedWeekStart = await page.evaluate(() => {
    const date = new Date();
    const mondayOffset = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - mondayOffset);
    return date.toISOString().slice(0, 10);
  });
  const unplannedWeek = await page.evaluate(
    async ({ workspaceId, athleteId, weekStart }) => {
      const response = await fetch(
        `/api/v1/athletes/${athleteId}/monitoring/week?workspaceId=${workspaceId}&weekStart=${weekStart}&timeZone=UTC`,
      );
      return { status: response.status, body: await response.json() };
    },
    { workspaceId, athleteId, weekStart: unplannedWeekStart },
  );
  expect(unplannedWeek.status).toBe(200);
  expect(
    unplannedWeek.body.data.sessions.some(
      (session: { readonly id: string; readonly classification: string }) =>
        session.id === unplannedExecutionId &&
        session.classification === "UNPLANNED_EXECUTION",
    ),
  ).toBe(true);

  await page.goto(`/workspace/${workspaceId}/athletes/${athleteId}/monitoring`);
  await expect(page.getByText("F5 · factual monitoring")).toBeVisible();
  await page.getByLabel("Week starting").fill("2026-09-01");
  await page.getByRole("button", { name: "Refresh facts" }).click();
  await expect(
    page.getByRole("button", { name: /F5 missed prescription/ }),
  ).toBeVisible();
  await expect(
    page.getByText("PRESCRIBED_NOT_STARTED", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("No execution was recorded for this prescribed session."),
  ).toBeVisible();

  await page.getByLabel("Week starting").fill(unplannedWeekStart);
  await page.getByRole("button", { name: "Refresh facts" }).click();
  await expect(
    page.getByRole("button", { name: /Unplanned execution/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Unplanned execution/ }).click();
  await expect(
    page.getByText("This session was performed without a linked prescription."),
  ).toBeVisible();

  const tenantCheck = await page.evaluate(
    async ({ workspaceId, athleteId, email }) => {
      const signedOut = await fetch("/api/auth/sign-out", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const signedUp = await fetch("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "F5 Isolation User",
          email,
          password: "WorkoutPal-Isolation-123!",
        }),
      });
      const denied = await fetch(
        `/api/v1/athletes/${athleteId}/monitoring/week?workspaceId=${workspaceId}&weekStart=2026-09-01&timeZone=UTC`,
      );
      return {
        signedOut: signedOut.status,
        signedUp: signedUp.status,
        denied: denied.status,
      };
    },
    {
      workspaceId,
      athleteId,
      email: `f5-isolation-${suffix}@example.com`,
    },
  );
  expect(tenantCheck.signedOut).toBe(200);
  expect(tenantCheck.signedUp).toBe(200);
  expect(tenantCheck.denied).toBe(403);
});
