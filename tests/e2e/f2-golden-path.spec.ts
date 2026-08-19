import { expect, test } from "@playwright/test";

test("F2 golden path: login, workspace, athlete, reload, audit, archive, isolation", async ({
  browser,
  page,
}) => {
  test.setTimeout(120_000);
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const email = `f2-owner-${suffix}@example.com`;
  const athleteName = `Golden Athlete ${suffix}`;
  const workspaceName = `Golden Workspace ${suffix}`;

  await page.goto("/sign-in");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .first()
    .click();
  await page.getByLabel("Name").fill("Golden Path Coach");
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
  await expect(
    page.getByRole("heading", { name: "Active athletes" }),
  ).toBeVisible();

  await page.getByPlaceholder("Athlete name").fill(athleteName);
  await page.getByRole("button", { name: "Add athlete" }).click();
  await expect(page.getByText(athleteName)).toBeVisible();
  await page.getByRole("button", { name: new RegExp(athleteName) }).click();
  await expect(page.getByText("Athlete profile")).toBeVisible();
  await expect(page.getByText("Audit evidence")).toBeVisible();

  await page.reload();
  await expect(page.getByText(athleteName)).toBeVisible();
  await page.getByLabel("Display name").fill(`${athleteName} Updated`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(`${athleteName} Updated`)).toBeVisible();
  await expect(page.getByText("athlete.updated")).toBeVisible();

  await page.getByRole("button", { name: "Archive athlete" }).click();
  await expect(page).toHaveURL(/\/workspace\/[0-9a-f-]+\/athletes$/);
  await expect(page.getByText("No active athletes yet")).toBeVisible();

  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  const otherEmail = `f2-other-${suffix}@example.com`;
  await otherPage.goto("/sign-in");
  await otherPage
    .getByRole("button", { name: "Create account", exact: true })
    .first()
    .click();
  await otherPage.getByLabel("Name").fill("Other Workspace Owner");
  await otherPage.getByLabel("Email").fill(otherEmail);
  await otherPage.getByLabel("Password").fill("WorkoutPal-Local-123!");
  await otherPage
    .getByRole("button", { name: "Create account", exact: true })
    .last()
    .click();
  await expect(otherPage.getByText("Choose your workspace")).toBeVisible({
    timeout: 30_000,
  });
  await otherPage.locator("input").fill(`Other Workspace ${suffix}`);
  await otherPage.getByRole("button", { name: "Create workspace" }).click();
  await expect(otherPage).toHaveURL(/\/workspace\/[0-9a-f-]+\/athletes$/);
  const otherWorkspaceId = otherPage
    .url()
    .match(/\/workspace\/([0-9a-f-]+)\/athletes$/)?.[1];
  expect(otherWorkspaceId).toBeTruthy();

  const crossWorkspace = await page.request.get(
    `/api/v1/athletes?workspaceId=${otherWorkspaceId}`,
  );
  expect(crossWorkspace.status()).toBe(403);
  await otherContext.close();
});
