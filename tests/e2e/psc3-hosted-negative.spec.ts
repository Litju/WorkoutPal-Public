import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";

const password = "WorkoutPal-Local-123!";
const timeZone = "America/Argentina/Buenos_Aires";

type Envelope<T> = Readonly<{ data: T }>;
type Athlete = Readonly<{ id: string }>;
type Movement = Readonly<{ id: string; version: number }>;
type Plan = Readonly<{ id: string; version: number }>;
type Session = Readonly<{ id: string }>;
type Member = Readonly<{ id: string }>;

function headers(workspaceId?: string): Record<string, string> {
  return {
    "content-type": "application/json",
    ...(workspaceId === undefined
      ? {}
      : { "x-workoutpal-workspace-id": workspaceId }),
  };
}

async function responseData<T>(
  response: Awaited<ReturnType<Page["request"]["fetch"]>>,
): Promise<T> {
  const payload = (await response.json()) as Envelope<T>;
  if (!response.ok()) {
    throw new Error(`Hosted fixture request failed with ${response.status()}.`);
  }
  return payload.data;
}

async function post<T>(
  page: Page,
  path: string,
  workspaceId: string,
  body: unknown,
): Promise<T> {
  return responseData<T>(
    await page.request.post(path, {
      headers: { ...headers(workspaceId), "idempotency-key": randomUUID() },
      data: body,
    }),
  );
}

async function createMovement(
  page: Page,
  workspaceId: string,
  canonicalName: string,
) {
  return post<Movement>(page, "/api/v1/movements", workspaceId, {
    workspaceId,
    canonicalName,
    modality: "strength",
  });
}

async function createPlan(
  page: Page,
  workspaceId: string,
  athleteId: string,
  title: string,
) {
  return post<Plan>(page, "/api/v1/training-plans", workspaceId, {
    workspaceId,
    athleteId,
    title,
    startsOn: "2026-08-01",
    endsOn: "2026-12-31",
    timeZone,
  });
}

async function createSession(
  page: Page,
  workspaceId: string,
  planId: string,
  movementId: string,
  title: string,
): Promise<Session> {
  return post<Session>(page, "/api/v1/session-prescriptions", workspaceId, {
    workspaceId,
    planId,
    scheduledLocalDate: "2026-09-30",
    timeZone,
    title,
    blocks: [
      {
        id: randomUUID(),
        kind: "strength",
        ordinal: 1,
        exercises: [
          {
            id: randomUUID(),
            movementId,
            ordinal: 1,
            sets: [
              {
                id: randomUUID(),
                ordinal: 1,
                targetRepMin: 5,
                targetRepMax: 5,
                targetLoadKg: 100,
              },
            ],
          },
        ],
      },
    ],
  });
}

async function signUpAndCreateWorkspace(
  page: Page,
  name: string,
  workspaceName: string,
) {
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL;
  if (baseUrl === undefined)
    throw new Error("PLAYWRIGHT_BASE_URL is required.");
  const email = `psc3-negative-${Date.now()}-${randomUUID().slice(0, 8)}@example.com`;
  const shareUrl = process.env.VERCEL_SHARE_URL;
  if (shareUrl !== undefined) {
    await page.goto(shareUrl, { waitUntil: "domcontentloaded" });
  }
  await page.goto(`${baseUrl}/sign-in`);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .first()
    .click();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
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
  return page.url().match(/\/workspace\/([0-9a-f-]+)\/athletes$/)?.[1] ?? "";
}

test("hosted PSC3 negative tenant and admin qualification", async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000);
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const workspaceA = await signUpAndCreateWorkspace(
    page,
    "PSC3 Negative A",
    `PSC3 Negative Workspace A ${suffix}`,
  );
  expect(workspaceA).toMatch(/^[0-9a-f-]{36}$/);
  await page
    .getByPlaceholder("Athlete name")
    .fill(`PSC3 Local Athlete ${suffix}`);
  await page.getByRole("button", { name: "Add athlete" }).click();
  await expect(page.getByText(`PSC3 Local Athlete ${suffix}`)).toBeVisible();

  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  const otherBaseUrl =
    process.env.VERCEL_SHARE_URL ?? process.env.PLAYWRIGHT_BASE_URL;
  if (otherBaseUrl === undefined)
    throw new Error(
      "PLAYWRIGHT_BASE_URL or VERCEL_SHARE_URL is required for the second tenant.",
    );
  await otherPage.goto(otherBaseUrl, { waitUntil: "domcontentloaded" });
  const workspaceB = await signUpAndCreateWorkspace(
    otherPage,
    "PSC3 Negative B",
    `PSC3 Negative Workspace B ${suffix}`,
  );
  expect(workspaceB).toMatch(/^[0-9a-f-]{36}$/);
  await otherPage
    .getByPlaceholder("Athlete name")
    .fill(`PSC3 Foreign Athlete ${suffix}`);
  await otherPage.getByRole("button", { name: "Add athlete" }).click();
  await expect(
    otherPage.getByText(`PSC3 Foreign Athlete ${suffix}`),
  ).toBeVisible();
  const athleteB = otherPage.url().match(/\/workspace\/([0-9a-f-]+)\/athletes$/)
    ? await post<Athlete>(otherPage, "/api/v1/athletes", workspaceB, {
        workspaceId: workspaceB,
        displayName: `PSC3 Foreign API Athlete ${suffix}`,
      })
    : undefined;
  if (athleteB === undefined)
    throw new Error("Foreign athlete fixture was not created.");

  const movementB = await createMovement(
    otherPage,
    workspaceB,
    `PSC3 Foreign Movement ${suffix}`,
  );
  const planB = await createPlan(
    otherPage,
    workspaceB,
    athleteB.id,
    `PSC3 Foreign Plan ${suffix}`,
  );
  const sessionB = await createSession(
    otherPage,
    workspaceB,
    planB.id,
    movementB.id,
    `PSC3 Foreign Session ${suffix}`,
  );
  const membersB = await responseData<readonly Member[]>(
    await otherPage.request.get(`/api/v1/workspaces/${workspaceB}/members`, {
      headers: headers(workspaceB),
    }),
  );
  expect(membersB.length).toBeGreaterThan(0);

  const foreignReads = await Promise.all([
    page.request.get(
      `/api/v1/athletes/${athleteB.id}?workspaceId=${workspaceA}`,
      {
        headers: headers(workspaceA),
      },
    ),
    page.request.get(
      `/api/v1/movements/${movementB.id}?workspaceId=${workspaceA}`,
      {
        headers: headers(workspaceA),
      },
    ),
    page.request.get(
      `/api/v1/training-plans/${planB.id}?workspaceId=${workspaceA}`,
      {
        headers: headers(workspaceA),
      },
    ),
    page.request.get(
      `/api/v1/session-prescriptions/${sessionB.id}?workspaceId=${workspaceA}`,
      { headers: headers(workspaceA) },
    ),
  ]);
  for (const response of foreignReads) {
    expect([403, 404]).toContain(response.status());
    const body = await response.text();
    expect(body).not.toContain(athleteB.id);
    expect(body).not.toContain(movementB.id);
    expect(body).not.toContain(planB.id);
    expect(body).not.toContain(sessionB.id);
  }

  const searchResponse = await page.request.get(
    `/api/v1/search?workspaceId=${workspaceA}&q=${encodeURIComponent(`PSC3 Foreign Movement ${suffix}`)}&limit=50`,
    { headers: headers(workspaceA) },
  );
  expect(searchResponse.status()).toBe(200);
  const searchBody = await searchResponse.text();
  expect(searchBody).not.toContain(movementB.id);
  expect(searchBody).not.toContain(`PSC3 Foreign Movement ${suffix}`);

  const foreignAthleteMutation = await page.request.post("/api/v1/athletes", {
    headers: { ...headers(workspaceA), "idempotency-key": randomUUID() },
    data: {
      workspaceId: workspaceB,
      displayName: `PSC3 Unauthorized Athlete ${suffix}`,
    },
  });
  expect([403, 404]).toContain(foreignAthleteMutation.status());

  const foreignMovementMutation = await page.request.patch(
    `/api/v1/movements/${movementB.id}`,
    {
      headers: { ...headers(workspaceA), "idempotency-key": randomUUID() },
      data: {
        workspaceId: workspaceB,
        canonicalName: `PSC3 Unauthorized Movement ${suffix}`,
        modality: "strength",
        expectedVersion: movementB.version,
      },
    },
  );
  expect([403, 404]).toContain(foreignMovementMutation.status());

  const adminMutation = await page.request.patch(
    `/api/v1/workspaces/${workspaceB}/members/${membersB[0].id}`,
    {
      headers: { ...headers(workspaceA), "idempotency-key": randomUUID() },
      data: { role: "viewer" },
    },
  );
  expect([403, 404]).toContain(adminMutation.status());

  await otherContext.close();
});
