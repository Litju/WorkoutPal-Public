import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

type Envelope<T> = Readonly<{ data: T }>;

type Workspace = Readonly<{ id: string }>;
type Athlete = Readonly<{ id: string }>;
type Movement = Readonly<{ id: string }>;
type Plan = Readonly<{ id: string; version: number }>;

type Session = Readonly<{
  id: string;
  version: number;
  scheduledLocalDate: string;
  blocks: readonly Readonly<Record<string, unknown>>[];
}>;

type Proposal = Readonly<{
  proposalId: string;
  commandDigest: string;
  status: string;
}>;

const password = "WorkoutPal-Local-123!";
const timeZone = "America/Argentina/Buenos_Aires";

function jsonHeaders(workspaceId?: string): Record<string, string> {
  return {
    "content-type": "application/json",
    ...(workspaceId === undefined
      ? {}
      : { "x-workoutpal-workspace-id": workspaceId }),
  };
}

async function responseData<T>(
  response: Awaited<
    ReturnType<import("@playwright/test").Page["request"]["fetch"]>
  >,
): Promise<T> {
  const payload = (await response.json()) as Envelope<T>;
  if (!response.ok())
    throw new Error(`WorkoutPal request failed with ${response.status()}.`);
  return payload.data;
}

async function postData<T>(
  page: import("@playwright/test").Page,
  path: string,
  workspaceId: string,
  body: unknown,
  idempotencyKey = randomUUID(),
): Promise<T> {
  return responseData<T>(
    await page.request.post(path, {
      headers: {
        ...jsonHeaders(workspaceId),
        "idempotency-key": idempotencyKey,
      },
      data: body,
    }),
  );
}

async function getSession(
  page: import("@playwright/test").Page,
  workspaceId: string,
  sessionId: string,
): Promise<Session> {
  return responseData<Session>(
    await page.request.get(
      `/api/v1/session-prescriptions/${sessionId}?workspaceId=${workspaceId}`,
      { headers: jsonHeaders(workspaceId) },
    ),
  );
}

async function createMovement(
  page: import("@playwright/test").Page,
  workspaceId: string,
  name: string,
): Promise<Movement> {
  return postData<Movement>(page, "/api/v1/movements", workspaceId, {
    workspaceId,
    canonicalName: name,
    modality: "strength",
  });
}

async function createPlan(
  page: import("@playwright/test").Page,
  workspaceId: string,
  athleteId: string,
  title: string,
): Promise<Plan> {
  return postData<Plan>(page, "/api/v1/training-plans", workspaceId, {
    workspaceId,
    athleteId,
    title,
    startsOn: "2026-08-01",
    endsOn: "2026-12-31",
    timeZone,
  });
}

async function createSession(
  page: import("@playwright/test").Page,
  workspaceId: string,
  planId: string,
  movementId: string,
  title: string,
  scheduledLocalDate: string,
): Promise<Readonly<{ session: Session; strengthSetId: string }>> {
  const blockId = randomUUID();
  const exerciseId = randomUUID();
  const strengthSetId = randomUUID();
  const session = await postData<Session>(
    page,
    "/api/v1/session-prescriptions",
    workspaceId,
    {
      workspaceId,
      planId,
      scheduledLocalDate,
      timeZone,
      title,
      blocks: [
        {
          id: blockId,
          kind: "strength",
          ordinal: 1,
          exercises: [
            {
              id: exerciseId,
              movementId,
              ordinal: 1,
              sets: [
                {
                  id: strengthSetId,
                  ordinal: 1,
                  targetRepMin: 5,
                  targetRepMax: 5,
                  targetLoadKg: 140,
                },
              ],
            },
          ],
        },
      ],
    },
  );
  return { session, strengthSetId };
}

function proposalIdFromCard(text: string): string {
  const match = text.match(/Proposal ([0-9a-f-]{36})/i);
  if (match?.[1] === undefined)
    throw new Error("The Studio approval card did not expose a proposal ID.");
  return match[1];
}

async function ask(page: import("@playwright/test").Page, prompt: string) {
  const input = page.getByPlaceholder(
    "Ask about stored plans, sessions, or monitoring…",
  );
  await input.fill(prompt);
  await page.getByRole("button", { name: "Ask", exact: true }).click();
}

async function waitForProposalCard(page: import("@playwright/test").Page) {
  const card = page.locator(
    "aside[aria-labelledby='workoutpal-proposal-heading']",
  );
  await expect(card).toBeVisible({ timeout: 90_000 });
  return card;
}

async function resetConversation(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "New conversation" }).click();
  await expect(
    page.getByPlaceholder("Ask about stored plans, sessions, or monitoring…"),
  ).toBeVisible();
}

async function waitForCardToClose(page: import("@playwright/test").Page) {
  await expect(
    page.locator("aside[aria-labelledby='workoutpal-proposal-heading']"),
  ).toHaveCount(0, { timeout: 90_000 });
}

test("F7 Windows-native Studio approval and mutation qualification", async ({
  browser,
  page,
}) => {
  test.setTimeout(360_000);
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  const email = `f7-owner-${suffix}@example.com`;
  const workspaceName = `F7 Workspace ${suffix}`;
  const athleteName = `F7 Athlete ${suffix}`;

  await page.goto("/sign-in");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .first()
    .click();
  await page.getByLabel("Name").fill("F7 Qualification Coach");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
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
  if (workspaceId === undefined)
    throw new Error("Workspace ID was not created.");

  await page.getByPlaceholder("Athlete name").fill(athleteName);
  await page.getByRole("button", { name: "Add athlete" }).click();
  await expect(page.getByText(athleteName)).toBeVisible();
  await page.getByRole("button", { name: new RegExp(athleteName) }).click();
  await expect(page).toHaveURL(
    /\/workspace\/[0-9a-f-]+\/athletes\/[0-9a-f-]+$/,
  );
  const athleteId = page.url().match(/\/athletes\/([0-9a-f-]+)$/)?.[1];
  expect(athleteId).toBeDefined();
  if (athleteId === undefined) throw new Error("Athlete ID was not created.");

  const movement = await createMovement(
    page,
    workspaceId,
    `F7 squat ${suffix}`,
  );
  const plan = await createPlan(
    page,
    workspaceId,
    athleteId,
    `F7 qualification plan ${suffix}`,
  );
  const approved = await createSession(
    page,
    workspaceId,
    plan.id,
    movement.id,
    "F7 approved reschedule",
    "2026-09-20",
  );
  const loaded = await createSession(
    page,
    workspaceId,
    plan.id,
    movement.id,
    "F7 approved load",
    "2026-09-21",
  );
  const rejected = await createSession(
    page,
    workspaceId,
    plan.id,
    movement.id,
    "F7 rejected reschedule",
    "2026-09-22",
  );
  const stale = await createSession(
    page,
    workspaceId,
    plan.id,
    movement.id,
    "F7 stale reschedule",
    "2026-09-23",
  );
  const conversational = await createSession(
    page,
    workspaceId,
    plan.id,
    movement.id,
    "F7 conversational approval",
    "2026-09-24",
  );
  const wrongApprover = await createSession(
    page,
    workspaceId,
    plan.id,
    movement.id,
    "F7 wrong approver",
    "2026-09-25",
  );

  const foreignWorkspace = await postData<Workspace>(
    page,
    "/api/v1/workspaces",
    workspaceId,
    { name: `F7 foreign workspace ${suffix}` },
  );
  const foreignAthlete = await postData<Athlete>(
    page,
    "/api/v1/athletes",
    foreignWorkspace.id,
    { workspaceId: foreignWorkspace.id, displayName: `F7 foreign ${suffix}` },
  );
  const foreignPlan = await createPlan(
    page,
    foreignWorkspace.id,
    foreignAthlete.id,
    `F7 foreign plan ${suffix}`,
  );
  const foreignMovement = await createMovement(
    page,
    foreignWorkspace.id,
    `F7 foreign squat ${suffix}`,
  );
  const foreignSession = await createSession(
    page,
    foreignWorkspace.id,
    foreignPlan.id,
    foreignMovement.id,
    "F7 foreign session",
    "2026-09-26",
  );

  await postData<Plan>(
    page,
    `/api/v1/training-plans/${plan.id}/publish`,
    workspaceId,
    { workspaceId, expectedVersion: plan.version },
    `f7-publish-${suffix}`,
  );
  await postData<Plan>(
    page,
    `/api/v1/training-plans/${foreignPlan.id}/publish`,
    foreignWorkspace.id,
    { workspaceId: foreignWorkspace.id, expectedVersion: foreignPlan.version },
    `f7-publish-foreign-${suffix}`,
  );

  await page.goto(`/workspace/${workspaceId}/athletes/${athleteId}/monitoring`);
  await expect(page.getByText("F7 · Approval-gated agent")).toBeVisible();
  await expect(page.getByText("Reads only until approval")).toBeVisible();

  const infoResponse = await page.request.get("/eve/v1/info", {
    headers: jsonHeaders(workspaceId),
  });
  expect(infoResponse.status()).toBe(200);
  const info = (await infoResponse.json()) as {
    readonly tools?: {
      readonly authored?: readonly { readonly name?: string }[];
    };
  };
  const authoredTools = new Set(
    (info.tools?.authored ?? []).map((tool) => tool.name),
  );
  expect(authoredTools.has("propose_reschedule_session")).toBe(true);
  expect(authoredTools.has("propose_set_strength_target_load")).toBe(true);
  expect(authoredTools.has("execute_agent_proposal")).toBe(true);
  expect(authoredTools.has("write_file")).toBe(false);
  expect(authoredTools.has("bash")).toBe(false);

  const beforeApproved = await getSession(
    page,
    workspaceId,
    approved.session.id,
  );
  await ask(
    page,
    `Create a proposal to move session prescription ${approved.session.id} to 2026-09-27. Then call execute_agent_proposal with the returned proposalId so I can use the authenticated Studio approval card. Do not execute until I approve that card.`,
  );
  const approvedCard = await waitForProposalCard(page);
  expect(await approvedCard.innerText()).toContain("2026-09-20");
  expect(await approvedCard.innerText()).toContain("2026-09-27");
  const approvedProposalId = proposalIdFromCard(await approvedCard.innerText());
  const approvedProposal = await responseData<Proposal>(
    await page.request.get(`/api/v1/agent-proposals/${approvedProposalId}`, {
      headers: jsonHeaders(workspaceId),
    }),
  );
  expect(approvedProposal.status).toBe("PENDING_APPROVAL");
  expect(
    (await getSession(page, workspaceId, approved.session.id))
      .scheduledLocalDate,
  ).toBe(beforeApproved.scheduledLocalDate);
  await approvedCard.getByRole("button", { name: "Approve change" }).click();
  await waitForCardToClose(page);
  await expect
    .poll(
      async () =>
        (await getSession(page, workspaceId, approved.session.id))
          .scheduledLocalDate,
      { timeout: 90_000 },
    )
    .toBe("2026-09-27");
  const afterApproved = await getSession(
    page,
    workspaceId,
    approved.session.id,
  );
  expect(afterApproved.version).toBeGreaterThan(beforeApproved.version);
  await resetConversation(page);

  const beforeLoaded = await getSession(page, workspaceId, loaded.session.id);
  await ask(
    page,
    `Create a proposal to change strength set ${loaded.strengthSetId} in session prescription ${loaded.session.id} to exactly 135 kg. Then call execute_agent_proposal with the returned proposalId so I can use the authenticated Studio approval card. Do not execute until I approve it.`,
  );
  const loadedCard = await waitForProposalCard(page);
  expect(await loadedCard.innerText()).toContain("140 kg");
  expect(await loadedCard.innerText()).toContain("135 kg");
  await loadedCard.getByRole("button", { name: "Approve change" }).click();
  await waitForCardToClose(page);
  await expect
    .poll(
      async () => {
        const session = await getSession(page, workspaceId, loaded.session.id);
        const block = session.blocks[0];
        const exercises =
          typeof block === "object" && block !== null && "exercises" in block
            ? block.exercises
            : null;
        const exercise = Array.isArray(exercises) ? exercises[0] : null;
        const sets =
          typeof exercise === "object" &&
          exercise !== null &&
          "sets" in exercise
            ? exercise.sets
            : null;
        const set = Array.isArray(sets) ? sets[0] : null;
        return typeof set === "object" && set !== null && "targetLoadKg" in set
          ? set.targetLoadKg
          : null;
      },
      { timeout: 90_000 },
    )
    .toBe(135);
  expect(
    (await getSession(page, workspaceId, loaded.session.id)).version,
  ).toBeGreaterThan(beforeLoaded.version);
  await resetConversation(page);

  const beforeRejected = await getSession(
    page,
    workspaceId,
    rejected.session.id,
  );
  await ask(
    page,
    `Create a proposal to move session prescription ${rejected.session.id} to 2026-09-28. Then call execute_agent_proposal with the returned proposalId so I can use the authenticated Studio approval card. Do not execute until I decide.`,
  );
  const rejectedCard = await waitForProposalCard(page);
  await rejectedCard.getByRole("button", { name: "Reject" }).click();
  await waitForCardToClose(page);
  const afterRejected = await getSession(
    page,
    workspaceId,
    rejected.session.id,
  );
  expect(afterRejected.scheduledLocalDate).toBe(
    beforeRejected.scheduledLocalDate,
  );
  expect(afterRejected.version).toBe(beforeRejected.version);
  await resetConversation(page);

  const beforeStale = await getSession(page, workspaceId, stale.session.id);
  await ask(
    page,
    `Create a proposal to move session prescription ${stale.session.id} to 2026-09-29. Then call execute_agent_proposal with the returned proposalId so I can use the authenticated Studio approval card. Do not execute until I approve it.`,
  );
  const staleCard = await waitForProposalCard(page);
  const ordinaryEdit = await page.request.patch(
    `/api/v1/session-prescriptions/${stale.session.id}`,
    {
      headers: {
        ...jsonHeaders(workspaceId),
        "idempotency-key": `f7-stale-edit-${suffix}`,
      },
      data: {
        workspaceId,
        expectedVersion: beforeStale.version,
        title: "F7 ordinary concurrent edit",
        createRevision: true,
      },
    },
  );
  expect(ordinaryEdit.ok()).toBe(true);
  await staleCard.getByRole("button", { name: "Approve change" }).click();
  await waitForCardToClose(page);
  await expect
    .poll(
      async () =>
        (await getSession(page, workspaceId, stale.session.id))
          .scheduledLocalDate,
      { timeout: 90_000 },
    )
    .toBe(beforeStale.scheduledLocalDate);
  expect(
    (await getSession(page, workspaceId, stale.session.id)).version,
  ).toBeGreaterThan(beforeStale.version);
  await resetConversation(page);

  await ask(
    page,
    `Create a proposal to move foreign session prescription ${foreignSession.session.id} to 2026-09-30. Use only the currently authenticated workspace and do not guess or bypass scope.`,
  );
  await expect
    .poll(
      async () =>
        page.getByRole("log", { name: "Agent conversation" }).innerText(),
      { timeout: 90_000 },
    )
    .toMatch(/unavailable|not available|current authenticated|scope|cannot/i);
  await expect(
    page.locator("aside[aria-labelledby='workoutpal-proposal-heading']"),
  ).toHaveCount(0);
  await resetConversation(page);

  await ask(
    page,
    `Create a proposal to move session prescription ${conversational.session.id} to 2026-10-01, then call execute_agent_proposal with the returned proposalId so the authenticated Studio approval card is displayed. A conversational yes is not product approval; wait for the card.`,
  );
  const conversationalCard = await waitForProposalCard(page);
  const beforeConversational = await getSession(
    page,
    workspaceId,
    conversational.session.id,
  );
  expect(
    (await getSession(page, workspaceId, conversational.session.id))
      .scheduledLocalDate,
  ).toBe(beforeConversational.scheduledLocalDate);
  await conversationalCard.getByRole("button", { name: "Reject" }).click();
  await waitForCardToClose(page);
  await resetConversation(page);

  await ask(
    page,
    `Create a proposal to move session prescription ${wrongApprover.session.id} to 2026-10-02, then call execute_agent_proposal with the returned proposalId so the authenticated Studio approval card is displayed.`,
  );
  const wrongCard = await waitForProposalCard(page);
  const wrongProposalId = proposalIdFromCard(await wrongCard.innerText());
  const ownerProposal = await responseData<Proposal>(
    await page.request.get(`/api/v1/agent-proposals/${wrongProposalId}`, {
      headers: jsonHeaders(workspaceId),
    }),
  );
  const wrongContext = await browser.newContext();
  const wrongPage = await wrongContext.newPage();
  const wrongEmail = `f7-wrong-${suffix}@example.com`;
  const signUp = await wrongPage.request.post("/api/auth/sign-up/email", {
    headers: {
      ...jsonHeaders(),
      origin: new URL(page.url()).origin,
      referer: `${new URL(page.url()).origin}/sign-in`,
    },
    data: { name: "F7 Wrong Approver", email: wrongEmail, password },
  });
  expect(signUp.ok()).toBe(true);
  const wrongDecision = await wrongPage.request.post(
    `/api/v1/agent-proposals/${wrongProposalId}/decision`,
    {
      headers: {
        ...jsonHeaders(workspaceId),
        "x-workoutpal-agent-session-id": `f7-wrong-${suffix}`,
      },
      data: {
        decision: "APPROVE",
        proposalDigest: ownerProposal.commandDigest,
        approvalRequestId: `f7-wrong-request-${suffix}`,
      },
    },
  );
  expect([403, 404]).toContain(wrongDecision.status());
  await wrongContext.close();
  await wrongCard.getByRole("button", { name: "Reject" }).click();
  await waitForCardToClose(page);

  const anonymousInfo = await page.request.get("/eve/v1/info", {
    headers: {
      "x-workoutpal-workspace-id": "00000000-0000-4000-8000-000000000001",
    },
  });
  expect([401, 403]).toContain(anonymousInfo.status());

  const accessibilityScanResults = await new AxeBuilder({ page })
    .include("section[aria-labelledby='workoutpal-agent-heading']")
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(accessibilityScanResults.violations).toEqual([]);
});
