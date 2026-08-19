import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";

const password = "WorkoutPal-Local-123!";

async function signUp(page: Page): Promise<void> {
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3001";
  await page.goto(`${baseUrl}/sign-in`);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .first()
    .click();
  await page.getByLabel("Name").fill("SCI-2 Hosted Smoke");
  await page
    .getByLabel("Email")
    .fill(`sci2-hosted-${Date.now()}-${randomUUID().slice(0, 8)}@example.com`);
  await page.getByLabel("Password").fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .last()
    .click();
  await expect(page.getByText("Choose your workspace")).toBeVisible({
    timeout: 30_000,
  });
  await page.locator("input").fill(`SCI-2 Hosted Smoke ${Date.now()}`);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/workspace\/[0-9a-f-]+\/athletes$/);
}

test("hosted SCI-2 position evidence produces a traced velocity claim", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signUp(page);

  const frame = {
    frameKind: "GLOBAL_LAB",
    frameId: "hosted-lab-frame",
    convention: "z-up",
  };
  const sourceReference = "hosted:sci2-position-series";
  const response = await page.request.post("/api/v1/science/velocity", {
    data: {
      requestId: `hosted-sci2-${randomUUID()}`,
      inputProvenance: [{ type: "PSC4_RAW_OBSERVATION", ref: sourceReference }],
      evidence: {
        samples: [
          { sampleIndex: 0, time: 0, position: 1 },
          { sampleIndex: 1, time: 0.1, position: 1.2 },
          { sampleIndex: 2, time: 0.2, position: 1.4 },
          { sampleIndex: 3, time: 0.3, position: 1.6 },
          { sampleIndex: 4, time: 0.4, position: 1.8 },
        ],
        timebase: {
          declaredSamplingInterval: 0.1,
          declaredSamplingIntervalUnit: "s",
          declaredSampleCount: 5,
          provenanceReference: "hosted:sci2-timebase",
          missingSamplePolicy: "REJECT",
          irregularSamplingPolicy: "REJECT",
        },
        positionUnit: "m",
        timeUnit: "s",
        objectOfInterest: {
          objectKind: "IMPLEMENT",
          objectId: "hosted-barbell",
          label: "hosted synthetic barbell",
        },
        measurementPoint: {
          objectKind: "MEASUREMENT_POINT",
          objectId: "hosted-barbell-tether-point",
          label: "hosted synthetic tether point",
        },
        referenceFrame: frame,
        axis: {
          axis: "Z",
          sense: "POSITIVE",
          frame,
          label: "hosted positive vertical axis",
        },
        modality: {
          modalityId: "hosted-position-transducer",
          version: "1",
          kind: "POSITION_TRANSDUCER",
          label: "hosted synthetic position transducer",
        },
        assessmentId: "hosted-sci2-assessment",
        trialId: "hosted-sci2-trial",
        quality: {
          acquisition: "VALID",
          trial: "VALID",
          exclusion: "INCLUDED",
          protocol: "APPLICABLE",
          input: "VALID",
        },
        calibrationStatus: "NOT_REQUIRED",
      },
      intervals: [],
    },
  });
  const rawPayload = await response.text();
  expect(response.status(), rawPayload).toBe(200);
  const payload = JSON.parse(rawPayload) as {
    data: {
      status: string;
      value: {
        claim: {
          claimClass: string;
          lineage: { parents: readonly { kind: string; ref: string }[] };
        };
        samples: readonly { velocity_mps: number }[];
        derivation: {
          nodes: readonly {
            inputs: readonly { kind: string; ref: string }[];
          }[];
        };
      };
    };
  };
  expect(payload.data.status).toBe("ok");
  expect(payload.data.value.claim.claimClass).toBe("MECHANICALLY_DERIVED");
  expect(payload.data.value.samples).toHaveLength(5);
  for (const sample of payload.data.value.samples) {
    expect(sample.velocity_mps).toBeCloseTo(2, 12);
  }
  expect(payload.data.value.claim.lineage.parents).toContainEqual({
    kind: "PSC4_EVIDENCE",
    ref: sourceReference,
  });
  expect(payload.data.value.derivation.nodes[0]?.inputs).toContainEqual({
    kind: "PSC4_EVIDENCE",
    ref: sourceReference,
  });
});
