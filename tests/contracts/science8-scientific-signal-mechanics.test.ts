import {
  createQualifiedScientificSignalMechanicsSoftwareProvenance,
  createScientificSignalMechanicsRequest,
  SCIENTIFIC_SIGNAL_MECHANICS_CAPABILITY_ID,
  type ScientificSignalInput,
  ScientificSignalMechanicsSciencePort,
} from "@workoutpal/science-port";
import { createQuantity } from "@workoutpal/shared-kernel";
import { describe, expect, it } from "vitest";

const sourceRevision = "c".repeat(40);
const software = createQualifiedScientificSignalMechanicsSoftwareProvenance(
  sourceRevision,
  "sci8-contract-fixture",
);

function signal(
  overrides: Partial<ScientificSignalInput> = {},
): ScientificSignalInput {
  return {
    signalId: "fixture-position",
    values: [0, 10, 20, 30],
    times: [0, 1000, 2000, 3000],
    sampleIndexes: [0, 1, 2, 3],
    quantity: createQuantity({ value: 0, unit: "cm", dimension: "length" }),
    timebase: {
      timeUnit: "ms",
      declaredClassification: "UNIFORM",
      declaredSamplingInterval: 1000,
      uniformAbsoluteTolerance: 1e-9,
      uniformRelativeTolerance: 1e-9,
    },
    channel: { channelId: "channel-a", axis: "A", frame: "frame-a" },
    provenance: [{ type: "PSC4_EVIDENCE", ref: "evidence-sci8-fixture" }],
    ...overrides,
  };
}

function engineInvoker(
  payload: Readonly<Record<string, unknown>>,
): Promise<unknown> {
  const operation = payload.operation;
  const signalPayload = payload.signal as Record<string, unknown>;
  const values = signalPayload.values as number[];
  const times = signalPayload.times_s as number[];
  const base = {
    status: "SUCCEEDED",
    processor: {
      id: "scientific.signal_mechanics",
      version: "1.0.0",
    },
    method: {
      id: `signal.${String(operation).toLowerCase()}.fixture`,
      version: "1.0.0",
    },
    operation,
  };
  if (operation === "DERIVATIVE") {
    return Promise.resolve({
      ...base,
      method: {
        id: "signal.derivative.second_order_gradient",
        version: "1.0.0",
      },
      output: {
        kind: "signal",
        signal_id: "fixture-position.derived",
        values: [0.01, 0.01, 0.01, 0.01],
        times_s: times,
        sample_indexes: [0, 1, 2, 3],
        unit: "m/s",
        dimension: "speed",
      },
    });
  }
  if (operation === "INTEGRATE") {
    return Promise.resolve({
      ...base,
      method: { id: "signal.integral.trapezoidal", version: "1.0.0" },
      output: {
        kind: "quantity",
        value: 0.03,
        unit: "m",
        dimension: "length",
        start_time_s: 0,
        end_time_s: 3,
        initial_condition: 0,
      },
    });
  }
  if (operation === "INTERPOLATE") {
    return Promise.resolve({
      ...base,
      method: { id: "signal.interpolate.linear", version: "1.0.0" },
      output: {
        kind: "sample",
        value: 0.015,
        time_s: 1.5,
        unit: "m",
        dimension: "length",
        bracketing: { left_index: 1, right_index: 2 },
      },
    });
  }
  if (operation === "DETECT_EVENTS") {
    return Promise.resolve({
      ...base,
      method: { id: "signal.events.threshold_zero_extrema", version: "1.0.0" },
      output: {
        kind: "events",
        signal_id: "fixture-position",
        event_kind: "THRESHOLD",
        events: [{ index: 2, time_s: 2, value: 0, direction: "RISING" }],
      },
    });
  }
  if (operation === "INTERVAL") {
    return Promise.resolve({
      ...base,
      method: { id: "signal.interval.explicit", version: "1.0.0" },
      output: {
        kind: "interval",
        signal_id: "fixture-position",
        start_index: 1,
        end_index: 3,
        start_time_s: 1,
        end_time_s: 3,
        start_inclusive: true,
        end_inclusive: false,
        duration_s: 2,
      },
    });
  }
  return Promise.resolve({
    ...base,
    method: {
      id:
        operation === "FILTER"
          ? "signal.filter.butterworth_sos"
          : "signal.resample.polyphase",
      version: "1.0.0",
    },
    output: {
      kind: "signal",
      signal_id: "fixture-position.derived",
      values,
      times_s: times,
      sample_indexes: [0, 1, 2, 3],
      unit: "m",
      dimension: "length",
    },
  });
}

function port() {
  return new ScientificSignalMechanicsSciencePort({
    software,
    qualification: {
      qualificationId: "sci8-fixture-qualification",
      qualificationVersion: "1.0.0",
      oracle: { id: "sci8-fixture-oracle", version: "1.0.0" },
      validationData: { id: "sci8-fixture-data", version: "1.0.0" },
    },
    engineInvoker,
  });
}

function request(
  operation: Parameters<
    typeof createScientificSignalMechanicsRequest
  >[0]["operation"],
  options: Record<string, unknown> = {},
) {
  return createScientificSignalMechanicsRequest({
    requestId: `sci8-${operation.toLowerCase()}`,
    operation,
    signal: signal(),
    options,
    inputProvenance: [{ type: "PSC4_EVIDENCE", ref: "evidence-sci8-fixture" }],
  });
}

describe("SCI-8 scientific signal mechanics contract", () => {
  it("canonicalizes time and signal units while retaining explicit timebase authority", () => {
    const scienceRequest = request("DERIVATIVE", { order: 1 });
    const structured = scienceRequest.inputs.scientific_signal_mechanics;
    expect(structured.kind).toBe("structured");
    if (structured.kind !== "structured") return;
    const canonicalSignal = structured.value.signal as Record<string, unknown>;
    expect(canonicalSignal.unit).toBe("m");
    expect(canonicalSignal.times_s).toEqual([0, 1, 2, 3]);
    expect(
      (canonicalSignal.timebase as Record<string, unknown>).classification,
    ).toBe("UNIFORM");
  });

  it("returns mechanically-derived claim, derivation, configuration, and qualification", async () => {
    const result = await port().compute(request("DERIVATIVE", { order: 1 }));
    expect(result.status).toBe("ok");
    const value = result.value as Record<string, unknown>;
    expect((value.claim as Record<string, unknown>).claimClass).toBe(
      "MECHANICALLY_DERIVED",
    );
    expect((value.derivation as Record<string, unknown>).nodes).toHaveLength(1);
    expect(
      (value.configuration as Record<string, unknown>).contentHash,
    ).toMatch(/^[0-9a-f]{64}$/u);
    expect((value.qualification as Record<string, unknown>).status).toBe(
      "QUALIFIED",
    );
    expect(result.dimension).toBe("speed");
    expect(result.unit).toBe("m/s");
  });

  it("makes configuration identity change when the operation configuration changes", async () => {
    const first = await port().compute(request("DERIVATIVE", { order: 1 }));
    const second = await port().compute(request("DERIVATIVE", { order: 2 }));
    const firstValue = first.value as Record<string, unknown>;
    const secondValue = second.value as Record<string, unknown>;
    expect(
      (firstValue.configuration as Record<string, unknown>).contentHash,
    ).not.toBe(
      (secondValue.configuration as Record<string, unknown>).contentHash,
    );
    expect(first.inputFingerprint).not.toBe(second.inputFingerprint);
  });

  it("supports the narrow result families without moving arithmetic into TypeScript", async () => {
    for (const operation of [
      "INTEGRATE",
      "INTERPOLATE",
      "RESAMPLE",
      "FILTER",
      "DETECT_EVENTS",
      "INTERVAL",
    ] as const) {
      const result = await port().compute(
        request(
          operation,
          operation === "INTEGRATE"
            ? { mode: "INTERVAL", initial_value: 0 }
            : {},
        ),
      );
      expect(result.status, operation).toBe("ok");
    }
  });

  it("fails closed when PSC4 source evidence is absent", async () => {
    const noEvidence = createScientificSignalMechanicsRequest({
      requestId: "sci8-no-evidence",
      operation: "DERIVATIVE",
      signal: signal({
        provenance: [{ type: "SCI8_METHOD", ref: "not-source-evidence" }],
      }),
      inputProvenance: [{ type: "SCI8_METHOD", ref: "not-source-evidence" }],
    });
    const result = await port().compute(noEvidence);
    expect(result.status).toBe("invalid_input");
    expect(result.error?.message).toContain("PSC4");
  });

  it("rejects a declared uniform timebase when observed timestamps are irregular", () => {
    expect(() =>
      createScientificSignalMechanicsRequest({
        requestId: "sci8-irregular",
        operation: "DERIVATIVE",
        signal: signal({ times: [0, 1000, 2200, 3000] }),
        inputProvenance: [
          { type: "PSC4_EVIDENCE", ref: "evidence-sci8-fixture" },
        ],
      }),
    ).toThrow(/timebase|timestamps/iu);
  });

  it("does not mutate caller-owned samples", () => {
    const values = [0, 10, 20, 30];
    const input = signal({ values });
    createScientificSignalMechanicsRequest({
      requestId: "sci8-no-mutation",
      operation: "DERIVATIVE",
      signal: input,
      inputProvenance: [
        { type: "PSC4_EVIDENCE", ref: "evidence-sci8-fixture" },
      ],
    });
    expect(values).toEqual([0, 10, 20, 30]);
    expect(SCIENTIFIC_SIGNAL_MECHANICS_CAPABILITY_ID).toBe(
      "scientific.signal_mechanics",
    );
  });
});
