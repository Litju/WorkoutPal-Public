import { expect, test } from "@playwright/test";

test("F3 golden path: author multi-modality intent, reload, publish, revise", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const email = `f3-owner-${suffix}@example.com`;
  const athleteName = `F3 Athlete ${suffix}`;
  const workspaceName = `F3 Workspace ${suffix}`;

  await page.goto("/sign-in");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .first()
    .click();
  await page.getByLabel("Name").fill("F3 Training Coach");
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

  await page.getByPlaceholder("Athlete name").fill(athleteName);
  await page.getByRole("button", { name: "Add athlete" }).click();
  await expect(page.getByText(athleteName)).toBeVisible();
  await page.getByRole("button", { name: new RegExp(athleteName) }).click();
  await page.getByRole("link", { name: "Open Training Design" }).click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("F3 · multi-modality authoring")).toBeVisible();

  const movementInput = page.getByPlaceholder("Back squat");
  await movementInput.fill("Back squat");
  await expect(movementInput).toHaveValue("Back squat");
  await page.getByRole("button", { name: "Add movement", exact: true }).click();
  await expect(
    page.getByText("Visible catalog").locator("..").getByText("1", {
      exact: true,
    }),
  ).toBeVisible({ timeout: 30_000 });

  await page
    .getByPlaceholder("Increase squat strength")
    .fill("Increase squat strength");
  await page.getByRole("button", { name: "Add goal", exact: true }).click();

  await page.getByLabel("Title").fill("F3 September build");
  await page.getByRole("button", { name: "Create draft plan" }).click();
  await expect(
    page.getByRole("heading", { name: "F3 September build" }),
  ).toBeVisible();

  await page.getByPlaceholder("Mesocycle / microcycle").fill("September base");
  await page.getByRole("button", { name: "Add phase" }).click();
  await expect(page.getByLabel("Parent phase")).toBeVisible();
  await page.getByLabel("Parent phase").selectOption({
    label: "Child of September base",
  });
  await page.getByPlaceholder("Mesocycle / microcycle").fill("First week");
  await page.getByRole("button", { name: "Add phase" }).click();
  await expect(page.getByText("↳ First week", { exact: false })).toBeVisible();

  await page.getByPlaceholder("Monday strength").fill("Monday full-body");
  await page.getByRole("button", { name: "Add session" }).click();
  await expect(
    page.getByRole("button", { name: /Monday full-body/ }),
  ).toBeVisible();

  await page.getByPlaceholder("Monday strength").fill("Wednesday intervals");
  await page.locator('input[type="date"]').last().fill("2026-09-03");
  await page.getByRole("button", { name: "Add session" }).click();
  await expect(
    page.getByRole("button", { name: /Wednesday intervals/ }),
  ).toBeVisible();

  await page.getByPlaceholder("Monday strength").fill("Saturday mobility");
  await page.locator('input[type="date"]').last().fill("2026-09-05");
  await page.getByRole("button", { name: "Add session" }).click();
  await expect(
    page.getByRole("button", { name: /Saturday mobility/ }),
  ).toBeVisible();

  await page.getByRole("button", { name: /Monday full-body/ }).click();

  await page.getByRole("button", { name: "+ StrengthBlock" }).click();
  await page.getByRole("button", { name: "+ EnduranceBlock" }).click();
  await page.getByRole("button", { name: "+ MobilityBlock" }).click();
  await page.getByRole("button", { name: "+ exercise" }).click();
  await page.getByRole("button", { name: "+ set" }).click();
  await page.getByRole("button", { name: "+ mobility item" }).click();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(
    page
      .getByRole("button", { name: /Monday full-body/ })
      .filter({ hasText: "3 blocks" }),
  ).toBeVisible();

  await page.getByRole("button", { name: /Wednesday intervals/ }).click();
  await page.getByRole("button", { name: "+ EnduranceBlock" }).click();
  await page.getByRole("button", { name: "Save draft" }).click();

  await page.getByRole("button", { name: /Saturday mobility/ }).click();
  await page.getByRole("button", { name: "+ MobilityBlock" }).click();
  await page.getByRole("button", { name: "+ mobility item" }).click();
  await page.getByRole("button", { name: "Save draft" }).click();

  await page.reload();
  await expect(
    page.getByRole("button", { name: /Monday full-body/ }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("button", { name: /Monday full-body/ })
      .filter({ hasText: "3 blocks" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Wednesday intervals/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Saturday mobility/ }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Publish plan" }).click();
  await expect(
    page.getByText(/PUBLISHED · v\d+ · revision \d+/, { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Revision 1/)).toBeVisible();

  await page.getByRole("button", { name: "Create revision" }).click();
  await expect(
    page.getByText(/DRAFT · v\d+ · revision \d+/, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Publish plan" }),
  ).toBeVisible();
});
