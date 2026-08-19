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
  await page.getByLabel("Name").fill("SCI-3 Hosted Smoke");
  await page
    .getByLabel("Email")
    .fill(`sci3-hosted-${Date.now()}-${randomUUID().slice(0, 8)}@example.com`);
  await page.getByLabel("Password").fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .last()
    .click();
  await expect(page.getByText("Choose your workspace")).toBeVisible({
    timeout: 30_000,
  });
  await page.locator("input").fill(`SCI-3 Hosted Smoke ${Date.now()}`);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/workspace\/[0-9a-f-]+\/athletes$/);
}

function kinematicSamples(): readonly {
  sampleIndex: number;
  time: number;
  position: number;
  velocity: number;
}[] {
  const velocities = [
    0, 0, 0, 0.1, 0.1, 0.1, 0.1, 0, 0, -0.1, -0.1, -0.1, -0.1, 0, 0, 0,
  ];
  let position = 0;
  return velocities.map((velocity, sampleIndex) => {
    const sample = { sampleIndex, time: sampleIndex * 0.1, position, velocity };
    position += velocity * 0.1;
    return sample;
  });
}

test("hosted SCI-3 endpoint returns a traced sampled-boundary segmentation", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signUp(page);
  const frame = {
    frameKind: "GLOBAL_LAB",
    frameId: "hosted-sci3-frame",
    convention: "z-up",
  };
  const samples = kinematicSamples();
  const sourceReference = "hosted:sci3-position-series";
  const response = await page.request.post("/api/v1/science/segmentation", {
    data: {
      requestId: `hosted-sci3-${randomUUID()}`,
      inputProvenance: [{ type: "PSC4_RAW_OBSERVATION", ref: sourceReference }],
      evidence: {
        samples,
        timebase: {
          declaredSamplingInterval: 0.1,
          declaredSamplingIntervalUnit: "s",
          declaredSampleCount: samples.length,
          provenanceReference: "hosted:sci3-timebase",
          missingSamplePolicy: "REJECT",
          irregularSamplingPolicy: "REJECT",
        },
        positionUnit: "m",
        velocityUnit: "m/s",
        timeUnit: "s",
        objectOfInterest: {
          objectKind: "IMPLEMENT",
          objectId: "hosted-sci3-implement",
          label: "hosted SCI-3 implement",
        },
        measurementPoint: {
          objectKind: "MEASUREMENT_POINT",
          objectId: "hosted-sci3-point",
          label: "hosted SCI-3 measurement point",
        },
        referenceFrame: frame,
        axis: {
          axis: "Z",
          sense: "POSITIVE",
          frame,
          label: "hosted SCI-3 axis",
        },
        modality: {
          modalityId: "hosted-sci3-transducer",
          version: "1.0.0",
          kind: "POSITION_TRANSDUCER",
          label: "hosted SCI-3 transducer",
        },
        assessmentId: "hosted-sci3-assessment",
        trialId: "hosted-sci3-trial",
        quality: {
          acquisition: "VALID",
          trial: "VALID",
          exclusion: "INCLUDED",
          protocol: "APPLICABLE",
          input: "VALID",
        },
        calibrationStatus: "NOT_REQUIRED",
      },
      sci2Lineage: {
        claimId: "hosted-sci2-claim",
        processor: {
          id: "resistance_training.linear_velocity_from_position",
          version: "1.0.0",
        },
        method: {
          id: "finite_difference.second_order_uniform",
          version: "1.0.0",
        },
        software: {
          packageName: "@workoutpal/science-port",
          packageVersion: "0.1.0",
          sourceRevision: "a".repeat(40),
          buildId: "hosted-sci2-build",
        },
        qualification: {
          status: "QUALIFIED",
          sourceRevision: "a".repeat(40),
          buildId: "hosted-sci2-build",
        },
      },
      movementTask: {
        kind: "MOVEMENT_TASK",
        id: "hosted-sci3-task",
        version: "1.0.0",
        revision: 1,
        phases: [
          {
            id: "phase-up",
            ordinal: 1,
            label: "Up",
            action: "CONCENTRIC",
            description: null,
          },
          {
            id: "phase-down",
            ordinal: 2,
            label: "Down",
            action: "ECCENTRIC",
            description: null,
          },
        ],
      },
      protocol: {
        kind: "SEGMENTATION_PROTOCOL",
        id: "hosted-sci3-protocol",
        version: "1.0.0",
        revision: 1,
        supportedTaskClass:
          "ONE_DIMENSIONAL_BIDIRECTIONAL_IMPLEMENT_MOTION_2_PHASE",
        movementTask: { id: "hosted-sci3-task", version: "1.0.0", revision: 1 },
        expectedPhaseSequence: [
          {
            movementTask: {
              id: "hosted-sci3-task",
              version: "1.0.0",
              revision: 1,
            },
            phaseId: "phase-up",
            phaseOrdinal: 1,
            phaseAction: "CONCENTRIC",
            polarity: "POSITIVE",
          },
          {
            movementTask: {
              id: "hosted-sci3-task",
              version: "1.0.0",
              revision: 1,
            },
            phaseId: "phase-down",
            phaseOrdinal: 2,
            phaseAction: "ECCENTRIC",
            polarity: "NEGATIVE",
          },
        ],
        filteringPolicy: "NONE_ONLY",
        interpolationPolicy: "NONE_ONLY",
        dwellPolicy: "ALLOWED",
        boundaryPolicy: "SAMPLED_ONLY_NO_INTERPOLATION",
        rationale: "Hosted SCI-3 smoke protocol",
      },
      configuration: {
        velocityEnterThresholdMps: 0.05,
        velocityExitThresholdMps: 0.025,
        minimumSustainedSamples: 2,
        minimumPrerollSamples: 3,
        minimumPostrollSamples: 3,
        minimumPhaseDurationSeconds: 0.1,
        minimumRepetitionDurationSeconds: 0.5,
        minimumExcursionMeters: 0.01,
        uniformAbsoluteToleranceSeconds: 1e-12,
        uniformRelativeTolerance: 1e-9,
        filtering: "NONE",
        interpolation: "NONE",
        dwellPolicy: "ALLOWED",
        boundaryPolicy: "SAMPLED_ONLY_NO_INTERPOLATION",
      },
    },
  });
  const rawPayload = await response.text();
  expect(response.status(), rawPayload).toBe(200);
  const payload = JSON.parse(rawPayload) as {
    data: {
      status: string;
      value: {
        repetitions: readonly {
          start: { sample_index: number };
          end: { sample_index: number };
        }[];
        claim: { claimClass: string };
      };
      provenance: readonly { type: string; ref: string }[];
    };
  };
  expect(payload.data.status).toBe("ok");
  expect(payload.data.value.repetitions).toHaveLength(1);
  expect(payload.data.value.repetitions[0]).toMatchObject({
    start: expect.objectContaining({ sample_index: 3 }),
    end: expect.objectContaining({ sample_index: 12 }),
  });
  expect(payload.data.value.claim.claimClass).toBe("MECHANICALLY_DERIVED");
  expect(payload.data.provenance).toContainEqual({
    type: "PSC4_RAW_OBSERVATION",
    ref: sourceReference,
  });
});
