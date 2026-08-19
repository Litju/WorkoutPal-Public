import { expect, test } from "@playwright/test";

test("PSC3 browser coverage: context, goal, movement, search, and preferences", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const email = `psc3-browser-${suffix}@example.com`;
  const athleteName = `PSC3 Browser Athlete ${suffix}`;
  const workspaceName = `PSC3 Browser Workspace ${suffix}`;
  const goalTitle = `PSC3 Browser Goal ${suffix}`;
  const movementName = `PSC3 Browser Movement ${suffix}`;
  const updatedMovementName = `${movementName} Updated`;

  await page.goto("/sign-in");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .first()
    .click();
  await page.getByLabel("Name").fill("PSC3 Browser Coach");
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
  if (workspaceId === undefined) throw new Error("Workspace was not created.");

  await page.getByPlaceholder("Athlete name").fill(athleteName);
  await page.getByRole("button", { name: "Add athlete" }).click();
  await expect(page.getByText(athleteName)).toBeVisible();
  await page.getByRole("button", { name: new RegExp(athleteName) }).click();
  await expect(page).toHaveURL(
    /\/workspace\/[0-9a-f-]+\/athletes\/[0-9a-f-]+$/,
  );
  const athleteId = page.url().match(/\/athletes\/([0-9a-f-]+)$/)?.[1];
  expect(athleteId).toBeDefined();
  if (athleteId === undefined) throw new Error("Athlete was not created.");

  await page.goto(`/workspace/${workspaceId}/athletes/${athleteId}/profile`);
  await expect(
    page.getByRole("heading", { name: "Training context" }),
  ).toBeVisible();
  await page.getByLabel("Training age (months)").fill("18");
  await page
    .getByLabel("Availability notes")
    .fill("Weekday mornings are available.");
  await page
    .getByLabel("Operational constraints")
    .fill("Keep sessions under one hour.");
  await page.getByLabel("Equipment access").fill("barbell, bands, treadmill");
  await page
    .getByLabel("Training preferences")
    .fill("Prefer consistent weekday sessions.");
  await page
    .getByLabel("Practitioner notes")
    .fill("Operational browser proof.");
  await page.getByRole("button", { name: "Save training context" }).click();
  await expect(page.getByRole("status")).toContainText("Profile saved");
  await page.reload();
  await expect(page.getByLabel("Availability notes")).toHaveValue(
    "Weekday mornings are available.",
  );
  await expect(page.getByLabel("Equipment access")).toHaveValue(
    "barbell, bands, treadmill",
  );

  await page.goto(`/workspace/${workspaceId}/athletes/${athleteId}/goals`);
  await page.getByLabel("Goal title").fill(goalTitle);
  await page.getByLabel("Description").fill("Direct browser lifecycle proof.");
  const goalCreateResponse = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/v1/athletes/${athleteId}/goals`) &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Add goal" }).click();
  const goalCreateResult = await goalCreateResponse;
  expect(goalCreateResult.status()).toBe(201);
  await page.reload();
  await expect(page.getByText(goalTitle)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("link", { name: new RegExp(goalTitle) }).click();
  await expect(page.getByRole("heading", { name: goalTitle })).toBeVisible({
    timeout: 30_000,
  });
  const goalId = page.url().match(/\/goals\/([0-9a-f-]+)$/)?.[1];
  expect(goalId).toBeDefined();
  if (goalId === undefined) throw new Error("Goal detail was not opened.");
  const updatedGoalTitle = `${goalTitle} Updated`;
  await page.getByLabel("Goal title").fill(updatedGoalTitle);
  const goalUpdateResponse = page.waitForResponse(
    (response) =>
      response
        .url()
        .includes(`/api/v1/athletes/${athleteId}/goals/${goalId}`) &&
      response.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "Save goal" }).click();
  expect((await goalUpdateResponse).status()).toBe(200);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: updatedGoalTitle }),
  ).toBeVisible({ timeout: 30_000 });
  const goalArchiveResponse = page.waitForResponse(
    (response) =>
      response
        .url()
        .includes(`/api/v1/athletes/${athleteId}/goals/${goalId}/archive`) &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Archive goal" }).click();
  expect((await goalArchiveResponse).status()).toBe(200);
  await page.reload();
  await expect(page.getByText("ARCHIVED")).toBeVisible({ timeout: 30_000 });

  await page.goto(`/workspace/${workspaceId}/library/movements`);
  await page.getByLabel("Canonical name").fill(movementName);
  await page.getByLabel("Modality").selectOption("strength");
  const movementCreateResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/movements") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Add movement" }).click();
  expect((await movementCreateResponse).status()).toBe(201);
  await page.reload();
  await expect(page.getByText(movementName)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("link", { name: new RegExp(movementName) }).click();
  await expect(page.getByRole("heading", { name: movementName })).toBeVisible({
    timeout: 30_000,
  });
  const movementId = page.url().match(/\/movements\/([0-9a-f-]+)$/)?.[1];
  expect(movementId).toBeDefined();
  if (movementId === undefined)
    throw new Error("Movement detail was not opened.");
  await page.getByLabel("Canonical name").fill(updatedMovementName);
  await page.getByLabel("Movement pattern").fill("squat");
  await page.getByLabel("Equipment tags").fill("barbell, rack");
  const movementUpdateResponse = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/v1/movements/${movementId}`) &&
      response.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "Save movement" }).click();
  expect((await movementUpdateResponse).status()).toBe(200);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: updatedMovementName }),
  ).toBeVisible({ timeout: 30_000 });
  const movementArchiveResponse = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/v1/movements/${movementId}/archive`) &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Archive movement" }).click();
  expect((await movementArchiveResponse).status()).toBe(200);
  await page.reload();
  await expect(page.getByText("Archived")).toBeVisible({ timeout: 30_000 });

  await page.goto(`/workspace/${workspaceId}/search`);
  await page.getByPlaceholder("Athlete, plan, or movement").fill(athleteName);
  await expect(page.getByText(athleteName)).toBeVisible({ timeout: 15_000 });
  await page
    .getByPlaceholder("Athlete, plan, or movement")
    .fill(`missing-${suffix}`);
  await expect(page.getByText("No matching records")).toBeVisible({
    timeout: 15_000,
  });

  await page.goto(`/workspace/${workspaceId}/settings/preferences`);
  await expect(page.getByLabel("Mass")).toBeVisible();
  await page.getByLabel("Mass").selectOption("lb");
  await page.getByLabel("Distance").selectOption("mi");
  await page.getByLabel("Pace display").selectOption("per-mi");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Display preferences saved",
    { timeout: 30_000 },
  );
  await page.reload();
  await expect(page.getByLabel("Mass")).toHaveValue("lb");
  await expect(page.getByLabel("Distance")).toHaveValue("mi");
  await expect(page.getByLabel("Pace display")).toHaveValue("per-mi");

  await page.goto(`/workspace/${workspaceId}/settings/members`);
  await expect(page.getByText("PSC3 Browser Coach")).toBeVisible();
});
