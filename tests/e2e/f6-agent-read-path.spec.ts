import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("F6 golden path: authenticated read-only assistant surface and route scope", async ({
  page,
}) => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  const email = `f6-owner-${suffix}@example.com`;
  const workspaceName = `F6 Workspace ${suffix}`;
  const athleteName = `F6 Athlete ${suffix}`;

  await page.goto("/sign-in");
  const anonymousInfo = await page.request.get("/eve/v1/info", {
    headers: {
      "x-workoutpal-workspace-id": "00000000-0000-0000-0000-000000000001",
    },
  });
  expect([401, 403]).toContain(anonymousInfo.status());

  await page
    .getByRole("button", { name: "Create account", exact: true })
    .first()
    .click();
  await page.getByLabel("Name").fill("F6 Read Coach");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("WorkoutPal-Local-123!");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .last()
    .click();

  await expect(page.getByText("Choose your workspace")).toBeVisible();
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
  await expect(page).toHaveURL(
    /\/workspace\/[0-9a-f-]+\/athletes\/[0-9a-f-]+$/,
  );
  const athleteId = page.url().match(/\/athletes\/([0-9a-f-]+)$/)?.[1];
  expect(athleteId).toBeDefined();
  if (workspaceId === undefined || athleteId === undefined) {
    throw new Error(
      "The F6 journey did not produce workspace and athlete IDs.",
    );
  }

  const authorizedInfo = await page.request.get("/eve/v1/info", {
    headers: { "x-workoutpal-workspace-id": workspaceId },
  });
  expect(authorizedInfo.status()).toBe(200);
  const info = (await authorizedInfo.json()) as {
    readonly tools?: {
      readonly authored?: readonly { readonly name?: string }[];
    };
  };
  const toolNames = new Set(
    (info.tools?.authored ?? []).map((tool) => tool.name),
  );
  expect(toolNames.has("list_athletes")).toBe(true);
  expect(toolNames.has("write_file")).toBe(false);
  expect(toolNames.has("bash")).toBe(false);

  const unauthorizedInfo = await page.request.get("/eve/v1/info", {
    headers: {
      "x-workoutpal-workspace-id": "00000000-0000-4000-8000-000000000002",
    },
  });
  expect([401, 403]).toContain(unauthorizedInfo.status());

  await page.goto(`/workspace/${workspaceId}/athletes/${athleteId}/monitoring`);
  await expect(page.getByText("F5 · factual monitoring")).toBeVisible();
  await expect(page.getByText("F6 · Read-only agent")).toBeVisible();
  await expect(page.getByText("Reads only")).toBeVisible();
  await expect(
    page.getByRole("log", { name: "Agent conversation" }),
  ).toBeVisible();
  await expect(
    page.getByPlaceholder("Ask about stored plans, sessions, or monitoring…"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit" })).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "New conversation" }),
  ).toBeVisible();

  const accessibilityScanResults = await new AxeBuilder({ page })
    .include("section[aria-labelledby='workoutpal-agent-heading']")
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(accessibilityScanResults.violations).toEqual([]);
});
