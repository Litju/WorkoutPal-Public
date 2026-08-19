import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("PSC4 assessment workflow persists context, trials, evidence, results, and amendments", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  const email = `psc4-owner-${suffix}@example.com`;
  const athleteName = `PSC4 Athlete ${suffix}`;
  const workspaceName = `PSC4 Workspace ${suffix}`;

  await page.goto("/sign-in");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .first()
    .click();
  await page.getByLabel("Name").fill("PSC4 Evidence Coach");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("WorkoutPal-Local-123!");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .last()
    .click();

  await expect(page.getByText("Choose your workspace")).toBeVisible({
    timeout: 30_000,
  });
  await page.locator("input").fill(workspaceName);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/workspace\/[0-9a-f-]+\/athletes$/);
  const workspaceId = page
    .url()
    .match(/\/workspace\/([0-9a-f-]+)\/athletes$/)?.[1];
  expect(workspaceId).toBeDefined();

  await page.getByPlaceholder("Athlete name").fill(athleteName);
  await page.getByRole("button", { name: "Add athlete" }).click();
  await expect(page.getByText(athleteName)).toBeVisible();
  await page.getByRole("button", { name: new RegExp(athleteName) }).click();
  await expect(page.getByText("Athlete profile")).toBeVisible();
  const athleteId = page.url().match(/\/athletes\/([0-9a-f-]+)$/)?.[1];
  expect(athleteId).toBeDefined();
  if (workspaceId === undefined || athleteId === undefined) {
    throw new Error(
      "The PSC4 journey did not produce route context identifiers.",
    );
  }

  await page.goto(
    `/workspace/${workspaceId}/athletes/${athleteId}/assessments`,
  );
  await expect(
    page.getByRole("heading", { name: "Assessment registry" }),
  ).toBeVisible();
  await expect(page.getByText("No assessments recorded")).toBeVisible();
  await page
    .getByRole("button", { name: "New assessment", exact: true })
    .first()
    .click();
  await page.getByLabel("Assessment type").fill("neutral capture");
  await page.getByLabel("Purpose (optional)").fill("PSC4 browser journey");
  await page.getByLabel("Occurrence date").fill("2026-08-15");
  await page.getByRole("button", { name: "Create assessment" }).click();
  await expect(page).toHaveURL(
    new RegExp(
      `/workspace/${workspaceId}/athletes/${athleteId}/assessments/[0-9a-f-]+$`,
    ),
  );
  await expect(
    page.getByRole("heading", { name: "neutral capture" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText("PSC4 browser journey")).toBeVisible();

  const metricResponse = await page.request.post(
    "/api/v1/assessment-metric-definitions",
    {
      data: {
        workspaceId,
        key: `recorded-mass-${suffix}`,
        revision: 1,
        displayName: "Recorded mass",
        expectedDimension: "mass",
        resultScope: "TRIAL",
      },
      headers: { "idempotency-key": `psc4-metric-${suffix}` },
    },
  );
  expect(metricResponse.ok()).toBeTruthy();

  const assessmentId = page.url().match(/\/assessments\/([0-9a-f-]+)$/)?.[1];
  expect(assessmentId).toBeDefined();
  if (assessmentId === undefined)
    throw new Error("Assessment route context is missing.");
  await page.goto(
    `/workspace/${workspaceId}/athletes/${athleteId}/assessments/${assessmentId}/trials`,
  );
  await expect(
    page.getByRole("heading", { name: /Trials · neutral capture/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add trial", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("cell", { name: "Trial 1", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("cell", { name: "Trial 1", exact: true }),
  ).toBeVisible();

  const accessibilityScanResults = await new AxeBuilder({ page })
    .include("main")
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(accessibilityScanResults.violations).toEqual([]);

  const observationForm = page
    .locator("form")
    .filter({ hasText: "Observation key" });
  await observationForm.getByLabel("Observation key").fill("body_mass");
  await observationForm.getByLabel("Quantity value").fill("100");
  await observationForm
    .getByRole("button", { name: "Record observation" })
    .click();
  await expect(page.getByText("body_mass")).toBeVisible();
  const resultForm = page
    .locator("form")
    .filter({ hasText: "Metric definition" });
  await resultForm
    .getByLabel("Metric definition")
    .selectOption({ label: "Recorded mass · revision 1 · TRIAL" });
  await resultForm
    .getByLabel("Result trial", { exact: true })
    .selectOption({ label: "Trial 1" });
  await resultForm.getByLabel("Quantity value").fill("100");
  await resultForm
    .getByRole("button", { name: "Record neutral result" })
    .click();
  await expect(page.getByText(/Recorded mass · rev 1/)).toBeVisible();
  await page.reload();
  await expect(page.getByText("body_mass")).toBeVisible();
  await expect(page.getByText(/Recorded mass · rev 1/)).toBeVisible();

  await page.goto(
    `/workspace/${workspaceId}/athletes/${athleteId}/assessments/${assessmentId}`,
  );
  await page.getByRole("button", { name: "Edit assessment" }).click();
  await page.getByLabel("Assessment type").fill("neutral capture amended");
  await page.getByLabel("Amendment reason").fill("Corrected operator label");
  await page.getByRole("button", { name: "Save amendment" }).click();
  await expect(
    page.getByRole("heading", { name: "neutral capture amended" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "neutral capture amended" }),
  ).toBeVisible();
  await expect(page.getByText("Corrected operator label")).toBeVisible();
});
