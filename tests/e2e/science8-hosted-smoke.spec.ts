import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";

type JsonRecord = Record<string, unknown>;
type HostedResponse = { status: number; payload: JsonRecord; raw: string };

const password = "WorkoutPal-Local-123!";

async function signUp(page: Page): Promise<void> {
  await page.goto("/sign-in");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .first()
    .click();
  await page.getByLabel("Name").fill("SCI-8 Hosted Smoke");
  await page
    .getByLabel("Email")
    .fill(`sci8-hosted-${Date.now()}-${randomUUID().slice(0, 8)}@example.com`);
  await page.getByLabel("Password").fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .last()
    .click();
  await expect(page.getByText("Choose your workspace")).toBeVisible({
    timeout: 30_000,
  });
  await page.locator("input").fill(`SCI-8 Hosted Smoke ${Date.now()}`);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/workspace\/[0-9a-f-]+\/athletes$/u);
}

function signal(
  values: readonly number[],
  times: readonly number[],
  quantity: { unit: string; dimension: string },
  signalId: string,
): JsonRecord {
  return {
    signalId,
    values: [...values],
    times: [...times],
    sampleIndexes: values.map((_value, index) => index),
    quantity,
    timebase: {
      timeUnit: "s",
      declaredClassification: "UNIFORM",
      declaredSamplingInterval:
        times.length > 1 ? (times[1] ?? 0) - (times[0] ?? 0) : undefined,
      uniformAbsoluteTolerance: 1e-12,
      uniformRelativeTolerance: 1e-9,
    },
    channel: { channelId: `${signalId}-channel`, axis: "A", frame: "frame-a" },
    provenance: [{ type: "PSC4_EVIDENCE", ref: "sci8-hosted-evidence" }],
  };
}

function baseBody(
  operation: string,
  sourceSignal: JsonRecord,
  options: JsonRecord = {},
): JsonRecord {
  return {
    requestId: `sci8-hosted-${operation.toLowerCase()}-${randomUUID()}`,
    operation,
    signal: sourceSignal,
    options,
    inputProvenance: [
      { type: "PSC4_EVIDENCE", ref: "sci8-hosted-evidence" },
      { type: "PSC4_RESULT", ref: "sci8-hosted-result" },
    ],
  };
}

async function post(page: Page, body: JsonRecord): Promise<HostedResponse> {
  const result = await page.request.post("/api/v1/science/signal-mechanics", {
    data: body,
  });
  const raw = await result.text();
  return {
    status: result.status(),
    payload: JSON.parse(raw) as JsonRecord,
    raw,
  };
}

function data(response: HostedResponse): JsonRecord {
  return response.payload.data as JsonRecord;
}

test("hosted SCI-8 route executes deterministic signal mechanics with exact lineage", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await signUp(page);

  const derivative = await post(
    page,
    baseBody(
      "DERIVATIVE",
      signal(
        [0, 1, 2, 3],
        [0, 1, 2, 3],
        { unit: "m", dimension: "length" },
        "linear-position",
      ),
      { order: 1 },
    ),
  );
  expect(derivative.status, derivative.raw).toBe(200);
  const derivativeData = data(derivative);
  expect(derivativeData.status).toBe("ok");
  const derivativeValue = derivativeData.value as JsonRecord;
  const derivativeOutput = derivativeValue.output as JsonRecord;
  expect(derivativeOutput.kind).toBe("SIGNAL");
  expect(derivativeData.dimension).toBe("speed");
  expect(derivativeData.unit).toBe("m/s");
  expect((derivativeValue.claim as JsonRecord).claimClass).toBe(
    "MECHANICALLY_DERIVED",
  );
  expect(derivativeValue.qualificationState).toBe(
    "QUALIFIED_SOFTWARE_NUMERICAL_ONLY",
  );

  const integral = await post(
    page,
    baseBody(
      "INTEGRATE",
      signal(
        [2, 2, 2, 2],
        [0, 1, 2, 3],
        { unit: "m/s", dimension: "speed" },
        "constant-speed",
      ),
      { mode: "CUMULATIVE", initial_value: 0 },
    ),
  );
  expect(integral.status, integral.raw).toBe(200);
  const integralOutput = (data(integral).value as JsonRecord)
    .output as JsonRecord;
  expect(integralOutput.kind).toBe("SIGNAL");
  expect(integralOutput.values).toEqual([0, 2, 4, 6]);
  expect((integralOutput.quantity as JsonRecord).dimension).toBe("length");

  const interpolation = await post(
    page,
    baseBody(
      "INTERPOLATE",
      signal(
        [0, 2, 4, 6],
        [0, 1, 2, 3],
        { unit: "m", dimension: "length" },
        "linear-position",
      ),
      { target_time_s: 1.5 },
    ),
  );
  expect(interpolation.status, interpolation.raw).toBe(200);
  const interpolationOutput = (data(interpolation).value as JsonRecord)
    .output as JsonRecord;
  expect(interpolationOutput.kind).toBe("SAMPLE");
  expect((interpolationOutput.sample as JsonRecord).value).toBe(3);

  const downsampleTimes = Array.from(
    { length: 400 },
    (_value, index) => index / 100,
  );
  const downsampleValues = downsampleTimes.map(
    (time) =>
      Math.sin(2 * Math.PI * 3 * time) +
      0.2 * Math.sin(2 * Math.PI * 35 * time),
  );
  const downsample = await post(
    page,
    baseBody(
      "RESAMPLE",
      signal(
        downsampleValues,
        downsampleTimes,
        { unit: "m", dimension: "length" },
        "mixed-frequency",
      ),
      { target_rate_hz: 50, window: ["kaiser", 5], padtype: "line" },
    ),
  );
  expect(downsample.status, downsample.raw).toBe(200);
  const downsampleOutput = (data(downsample).value as JsonRecord)
    .output as JsonRecord;
  expect(downsampleOutput.antiAliasing as string).toContain("POLYPHASE");
  expect(downsampleOutput.rationalDown).toBe(2);

  const filterTimes = Array.from(
    { length: 300 },
    (_value, index) => index / 100,
  );
  const filterValues = filterTimes.map(
    (time) =>
      Math.sin(2 * Math.PI * 2 * time) +
      0.5 * Math.sin(2 * Math.PI * 30 * time),
  );
  const filter = await post(
    page,
    baseBody(
      "FILTER",
      signal(
        filterValues,
        filterTimes,
        { unit: "m", dimension: "length" },
        "mixed-frequency",
      ),
      {
        sample_rate_hz: 100,
        filter_type: "LOWPASS",
        order: 4,
        cutoff_hz: 8,
        mode: "ZERO_PHASE",
        online: false,
        padtype: "odd",
        padlen: 27,
      },
    ),
  );
  expect(filter.status, filter.raw).toBe(200);
  const filterOutput = (data(filter).value as JsonRecord).output as JsonRecord;
  expect(filterOutput.methodDetail).toBe("BUTTERWORTH_SECOND_ORDER_SECTIONS");
  expect(filterOutput.zeroPhase).toBe(true);

  const events = await post(
    page,
    baseBody(
      "DETECT_EVENTS",
      signal(
        [-1, -0.5, 0.5, 1],
        [0, 1, 2, 3],
        { unit: "m", dimension: "length" },
        "threshold-signal",
      ),
      {
        kind: "THRESHOLD",
        threshold: 0,
        direction: "RISING",
        timing: "LINEAR",
      },
    ),
  );
  expect(events.status, events.raw).toBe(200);
  const eventOutput = (data(events).value as JsonRecord).output as JsonRecord;
  expect(eventOutput.events as JsonRecord[]).toHaveLength(1);
  expect((eventOutput.events as JsonRecord[])[0]?.timeS).toBe(1.5);

  const syncSource = signal(
    [10, 20, 30, 40],
    [0, 1, 2, 3],
    { unit: "m", dimension: "length" },
    "sync-source",
  );
  const syncReference = signal(
    [0, 0, 0, 0],
    [0.5, 1.5, 2.5, 3.5],
    { unit: "m", dimension: "length" },
    "sync-reference",
  );
  const synchronization = await post(page, {
    ...baseBody("SYNCHRONIZE", syncSource, {
      offset_s: 0.5,
      alignment_mode: "EXACT_COMMON_TIMESTAMPS",
    }),
    referenceSignal: syncReference,
  });
  expect(synchronization.status, synchronization.raw).toBe(200);
  const synchronizationOutput = (data(synchronization).value as JsonRecord)
    .output as JsonRecord;
  expect(synchronizationOutput.offsetS).toBe(0.5);
  expect(synchronizationOutput.alignmentMode).toBe("EXACT_COMMON_TIMESTAMPS");

  const expectedSha = process.env.HOSTED_EXPECTED_SHA;
  if (expectedSha !== undefined) {
    const claim = derivativeValue.claim as JsonRecord;
    expect((claim.software as JsonRecord).sourceRevision).toBe(expectedSha);
  }
});
