import { expect, test } from "@playwright/test";

type Entity = { readonly id: string };
type Plan = Entity & { readonly title: string };
type Phase = Entity & { readonly name: string };
type Session = Entity & { readonly title: string };

test("route IDs bind distinct plans, phases, and sessions", async ({
  page,
}) => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const email = `route-context-${suffix}@example.com`;
  const athleteName = `Route Context Athlete ${suffix}`;
  const workspaceName = `Route Context Workspace ${suffix}`;

  await page.goto("/sign-in");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .first()
    .click();
  await page.getByLabel("Name").fill("Route Context Coach");
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

  await page.getByPlaceholder("Athlete name").fill(athleteName);
  await page.getByRole("button", { name: "Add athlete" }).click();
  await expect(page.getByText(athleteName)).toBeVisible();
  await page.getByRole("button", { name: new RegExp(athleteName) }).click();
  await expect(page).toHaveURL(
    /\/workspace\/[0-9a-f-]+\/athletes\/[0-9a-f-]+$/,
  );
  const athleteId = page.url().match(/\/athletes\/([0-9a-f-]+)$/)?.[1];
  if (workspaceId === undefined || athleteId === undefined) {
    throw new Error("The route-context fixture did not produce stable IDs.");
  }

  async function post<T extends Entity>(
    url: string,
    body: unknown,
  ): Promise<T> {
    const response = await page.request.post(url, { data: body });
    const payload = await response.json();
    expect(response.ok(), JSON.stringify(payload)).toBe(true);
    return payload.data as T;
  }

  const planA = await post<Plan>("/api/v1/training-plans", {
    workspaceId,
    athleteId,
    title: "Route Plan A",
    startsOn: "2026-09-01",
    endsOn: "2026-09-30",
    timeZone: "UTC",
    goalIds: [],
  });
  const planB = await post<Plan>("/api/v1/training-plans", {
    workspaceId,
    athleteId,
    title: "Route Plan B",
    startsOn: "2026-10-01",
    endsOn: "2026-10-31",
    timeZone: "UTC",
    goalIds: [],
  });
  const phaseA = await post<Phase>(
    `/api/v1/training-plans/${planA.id}/phases`,
    {
      workspaceId,
      name: "Route Phase A",
      ordinal: 1,
      classification: "mesocycle",
      startsOn: "2026-09-01",
      endsOn: "2026-09-14",
    },
  );
  const phaseB = await post<Phase>(
    `/api/v1/training-plans/${planA.id}/phases`,
    {
      workspaceId,
      name: "Route Phase B",
      ordinal: 2,
      classification: "mesocycle",
      startsOn: "2026-09-15",
      endsOn: "2026-09-30",
    },
  );
  const sessionA = await post<Session>("/api/v1/session-prescriptions", {
    workspaceId,
    planId: planA.id,
    phaseId: phaseA.id,
    scheduledLocalDate: "2026-09-02",
    timeZone: "UTC",
    title: "Route Session A",
  });
  const sessionB = await post<Session>("/api/v1/session-prescriptions", {
    workspaceId,
    planId: planA.id,
    phaseId: phaseB.id,
    scheduledLocalDate: "2026-09-16",
    timeZone: "UTC",
    title: "Route Session B",
  });

  const base = `/workspace/${workspaceId}/athletes/${athleteId}`;
  await page.goto(`${base}/training/plans/${planA.id}`);
  await expect(
    page.getByRole("heading", { name: "Route Plan A" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Route Plan B" })).toHaveCount(
    0,
  );

  await page.goto(`${base}/training/plans/${planB.id}`);
  await expect(
    page.getByRole("heading", { name: "Route Plan B" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Route Plan A" })).toHaveCount(
    0,
  );

  await page.goto(`${base}/training/plans/${planA.id}/phases/${phaseA.id}`);
  await expect(page.getByLabel("Session title")).toHaveValue("Route Session A");
  await page.goto(`${base}/training/plans/${planA.id}/phases/${phaseB.id}`);
  await expect(page.getByLabel("Session title")).toHaveValue("Route Session B");

  await page.goto(`${base}/sessions/${sessionA.id}/edit`);
  await expect(page.getByLabel("Session title")).toHaveValue("Route Session A");
  await page.goto(`${base}/sessions/${sessionB.id}/edit`);
  await expect(page.getByLabel("Session title")).toHaveValue("Route Session B");
});
