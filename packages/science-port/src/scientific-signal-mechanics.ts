import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AssumptionDeclaration,
  ClaimReference,
  ConfigurationSnapshot,
  DerivationInputReference,
  JsonValue,
  MethodIdentity,
  RecalculationHistory,
  SciencePort,
  ScienceProvenanceRef,
  ScienceRequest,
  ScienceResult,
  ScientificClaim,
  ScientificDerivationGraph,
  SoftwareProvenance,
} from "@workoutpal/science-contract";
import {
  createDerivationGraph,
  createRecalculationHistory,
  createScientificClaim,
  isPsc4SourceEvidenceType,
} from "@workoutpal/science-contract";
import {
  canonicalizeQuantity,
  createQuantity,
  type Dimension,
  type Instant,
  parseInstant,
  type Quantity,
} from "@workoutpal/shared-kernel";

export const SCIENTIFIC_SIGNAL_MECHANICS_CAPABILITY_ID =
  "scientific.signal_mechanics";
export const SCIENTIFIC_SIGNAL_MECHANICS_CAPABILITY_VERSION = "1.0.0";
export const SCIENTIFIC_SIGNAL_MECHANICS_PROCESSOR_ID =
  SCIENTIFIC_SIGNAL_MECHANICS_CAPABILITY_ID;
export const SCIENTIFIC_SIGNAL_MECHANICS_PROCESSOR_VERSION = "1.0.0";
export const SCIENTIFIC_SIGNAL_MECHANICS_INPUT_KEY =
  "scientific_signal_mechanics";
export const SCIENTIFIC_SIGNAL_MECHANICS_METHOD_VERSION = "1.0.0";
export const SCIENTIFIC_SIGNAL_REGRID_METHOD_ID = "signal.regrid.linear";

export type ScientificSignalOperation =
  | "DERIVATIVE"
  | "INTEGRATE"
  | "INTERPOLATE"
  | "RESAMPLE"
  | "FILTER"
  | "SYNCHRONIZE"
  | "DETECT_EVENTS"
  | "INTERVAL";

const METHOD_IDS: Readonly<Record<ScientificSignalOperation, string>> = {
  DERIVATIVE: "signal.derivative.second_order_gradient",
  INTEGRATE: "signal.integral.trapezoidal",
  INTERPOLATE: "signal.interpolate.linear",
  RESAMPLE: "signal.resample.polyphase",
  FILTER: "signal.filter.butterworth_sos",
  SYNCHRONIZE: "signal.synchronize.declared_offset",
  DETECT_EVENTS: "signal.events.threshold_zero_extrema",
  INTERVAL: "signal.interval.explicit",
};

const PYTHON_PROCESSOR_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../engine/scientific_signal_mechanics_processor.py",
);

const SHA_PATTERN = /^[0-9a-f]{40,64}$/iu;

export interface SignalTimebaseInput {
  readonly timeUnit: string;
  readonly declaredClassification?: "UNIFORM" | "IRREGULAR";
  readonly declaredSamplingInterval?: number;
  readonly uniformAbsoluteTolerance?: number;
  readonly uniformRelativeTolerance?: number;
}

export interface ScientificSignalInput {
  readonly signalId: string;
  readonly values: readonly number[];
  readonly times: readonly number[];
  readonly sampleIndexes: readonly number[];
  readonly quantity: Quantity;
  readonly timebase: SignalTimebaseInput;
  readonly channel: {
    readonly channelId: string;
    readonly label?: string;
    readonly axis?: string;
    readonly frame?: string;
  };
  readonly missingSampleIndexes?: readonly number[];
  readonly gapIntervals?: readonly {
    readonly start: number;
    readonly end: number;
    readonly unit?: string;
  }[];
  readonly provenance: readonly ScienceProvenanceRef[];
}

export type SignalMechanicsOptions = Readonly<Record<string, unknown>>;

export interface ScientificSignalMechanicsRequestInput {
  readonly requestId: string;
  readonly operation: ScientificSignalOperation;
  readonly signal: ScientificSignalInput;
  readonly options?: SignalMechanicsOptions;
  readonly referenceSignal?: ScientificSignalInput;
  readonly inputProvenance: readonly ScienceProvenanceRef[];
  readonly observedAt?: string;
}

export interface ScientificSignalMechanicsQualification {
  readonly qualificationId: string;
  readonly qualificationVersion: string;
  readonly oracle: { readonly id: string; readonly version: string };
  readonly validationData: { readonly id: string; readonly version: string };
}

export interface ScientificSignalMechanicsAdapterOptions {
  readonly software: SoftwareProvenance;
  readonly qualification?: ScientificSignalMechanicsQualification | null;
  readonly pythonExecutable?: string;
  readonly pythonScriptPath?: string;
  readonly engineInvoker?: ScientificSignalMechanicsEngineInvoker;
}

export type ScientificSignalMechanicsEngineInvoker = (
  payload: Readonly<Record<string, unknown>>,
) => Promise<unknown>;

export interface ScientificSignalMechanicsProcessorIdentity {
  readonly processor: MethodIdentity;
  readonly methods: readonly MethodIdentity[];
  readonly software: SoftwareProvenance;
  readonly qualification:
    | {
        readonly status: "QUALIFIED";
        readonly identity: ScientificSignalMechanicsQualification;
      }
    | { readonly status: "NOT_QUALIFIED"; readonly reason: string };
}

interface CanonicalSignal {
  readonly signalId: string;
  readonly values: readonly number[];
  readonly timesS: readonly number[];
  readonly sampleIndexes: readonly number[];
  readonly quantity: Quantity;
  readonly timebase: CanonicalTimebase;
  readonly channel: ScientificSignalInput["channel"];
  readonly missingSampleIndexes: readonly number[];
  readonly gapIntervals: readonly {
    readonly startS: number;
    readonly endS: number;
  }[];
  readonly provenance: readonly ScienceProvenanceRef[];
}

interface CanonicalTimebase {
  readonly timeUnit: "s";
  readonly declaredClassification: "UNIFORM" | "IRREGULAR" | null;
  readonly classification: "UNIFORM" | "IRREGULAR" | "INVALID";
  readonly declaredSamplingIntervalS: number | null;
  readonly nominalPeriodS: number | null;
  readonly nominalRateHz: number | null;
  readonly observedMinPeriodS: number | null;
  readonly observedMaxPeriodS: number | null;
  readonly maximumDeviationS: number | null;
  readonly absoluteToleranceS: number;
  readonly relativeTolerance: number;
}

interface EngineSuccess {
  readonly status: "SUCCEEDED";
  readonly processor: { readonly id: string; readonly version: string };
  readonly method: MethodIdentity;
  readonly operation: string;
  readonly output: Record<string, unknown>;
}

interface EngineFailureResponse {
  readonly status: "FAILED";
  readonly failure: { readonly code: string; readonly message: string };
}

interface EngineInfrastructureFailure {
  readonly status: "INFRASTRUCTURE_FAILED";
  readonly exception: { readonly message: string };
}

type EngineResponse =
  | EngineSuccess
  | EngineFailureResponse
  | EngineInfrastructureFailure;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
}

function finite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be finite.`);
  }
  return value;
}

function isOperation(value: unknown): value is ScientificSignalOperation {
  return typeof value === "string" && value in METHOD_IDS;
}

function nowInstant(): Instant {
  return parseInstant(new Date().toISOString());
}

function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new Error("Canonical JSON cannot contain non-finite numbers.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value))
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  throw new Error("Canonical JSON cannot contain unsupported values.");
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function configurationSnapshot(
  operation: ScientificSignalOperation,
  options: SignalMechanicsOptions,
): ConfigurationSnapshot {
  const parameters = {
    operation,
    options,
    scalarSignalOnly: true,
    noImplicitInterpolation: true,
    noImplicitFiltering: true,
    noAutomaticSynchronization: true,
  } as unknown as Readonly<Record<string, JsonValue>>;
  const canonicalSerialization = canonicalJson(parameters);
  return {
    id: "sci8-scientific-signal-mechanics-configuration",
    parameters,
    canonicalSerialization,
    contentHash: sha256(canonicalSerialization),
  };
}

function methodIdentity(
  operation: ScientificSignalOperation,
  options: SignalMechanicsOptions = {},
): MethodIdentity {
  const regrid =
    operation === "RESAMPLE" &&
    (options.gridPolicy === "EXPLICIT_LINEAR_REGRID" ||
      options.grid_policy === "EXPLICIT_LINEAR_REGRID");
  return {
    id: regrid ? SCIENTIFIC_SIGNAL_REGRID_METHOD_ID : METHOD_IDS[operation],
    version: SCIENTIFIC_SIGNAL_MECHANICS_METHOD_VERSION,
  };
}

function asReference(reference: ScienceProvenanceRef): ClaimReference | null {
  return isPsc4SourceEvidenceType(reference.type)
    ? { kind: "PSC4_EVIDENCE", ref: reference.ref }
    : null;
}

function parentReferences(
  provenance: readonly ScienceProvenanceRef[],
): readonly ClaimReference[] {
  const seen = new Set<string>();
  return provenance.flatMap((reference) => {
    const parent = asReference(reference);
    if (parent === null || seen.has(parent.ref)) return [];
    seen.add(parent.ref);
    return [parent];
  });
}

function assumptions(
  operation: ScientificSignalOperation,
): readonly AssumptionDeclaration[] {
  return [
    {
      id: "SCI8-SCALAR-SIGNAL-V1",
      version: "1.0.0",
      description:
        "SCI-8 v1 accepts scalar signals with explicit units, dimensions, sample indexes, timestamps, and source provenance.",
      reference: { type: "SCI8_METHOD", ref: "signal.identity" },
      status: "DECLARED",
      parameters: { vectorSupport: false, hiddenCoercion: false },
    },
    {
      id: "SCI8-EXPLICIT-TIMEBASE-V1",
      version: "1.0.0",
      description:
        "Timebase classification is verified from explicit timestamps and tolerances; irregular time is never silently treated as uniform.",
      reference: { type: "SCI8_METHOD", ref: "timebase.classification" },
      status: "DECLARED",
      parameters: { operation, interpolationImplicit: false },
    },
    {
      id: "SCI8-NUMERICAL-ERROR-V1",
      version: "1.0.0",
      description:
        "Formal method order and observed numerical convergence are recorded separately from measurement uncertainty and uncharacterized effects.",
      reference: { type: "SCI8_METHOD", ref: "numerical.error.policy" },
      status: "DECLARED",
      parameters: {
        measurementUncertainty: "UNKNOWN",
        fabricatedBounds: false,
      },
    },
  ];
}

function toCanonicalSignal(input: unknown, label = "signal"): CanonicalSignal {
  if (!isRecord(input)) throw new Error(`${label} must be an object.`);
  const signalId = requireText(
    input.signalId ?? input.signal_id,
    `${label}.signalId`,
  );
  const rawValues = input.values;
  const rawTimes = input.times ?? input.times_s;
  const rawSampleIndexes = input.sampleIndexes ?? input.sample_indexes;
  if (!Array.isArray(rawValues) || rawValues.length === 0) {
    throw new Error(`${label}.values must be a non-empty array.`);
  }
  if (!Array.isArray(rawTimes) || rawTimes.length !== rawValues.length) {
    throw new Error(`${label}.times must align with values.`);
  }
  if (
    !Array.isArray(rawSampleIndexes) ||
    rawSampleIndexes.length !== rawValues.length
  ) {
    throw new Error(`${label}.sampleIndexes must align with values.`);
  }
  const quantityRecord = isRecord(input.quantity) ? input.quantity : input;
  const unit = requireText(quantityRecord.unit, `${label}.quantity.unit`);
  const dimension = requireText(
    quantityRecord.dimension,
    `${label}.quantity.dimension`,
  ) as Dimension;
  const channelRecord = input.channel;
  if (!isRecord(channelRecord))
    throw new Error(`${label}.channel is required.`);
  const channel = {
    channelId: requireText(
      channelRecord.channelId,
      `${label}.channel.channelId`,
    ),
    ...(channelRecord.label === undefined
      ? {}
      : { label: requireText(channelRecord.label, `${label}.channel.label`) }),
    ...(channelRecord.axis === undefined
      ? {}
      : { axis: requireText(channelRecord.axis, `${label}.channel.axis`) }),
    ...(channelRecord.frame === undefined
      ? {}
      : { frame: requireText(channelRecord.frame, `${label}.channel.frame`) }),
  };
  const timebaseRecord = input.timebase;
  if (!isRecord(timebaseRecord))
    throw new Error(`${label}.timebase is required.`);
  const timeUnit = requireText(
    timebaseRecord.timeUnit,
    `${label}.timebase.timeUnit`,
  );
  const absoluteTolerance =
    timebaseRecord.uniformAbsoluteTolerance === undefined
      ? 1e-12
      : finite(
          timebaseRecord.uniformAbsoluteTolerance,
          `${label}.timebase.uniformAbsoluteTolerance`,
        );
  const relativeTolerance =
    timebaseRecord.uniformRelativeTolerance === undefined
      ? 1e-9
      : finite(
          timebaseRecord.uniformRelativeTolerance,
          `${label}.timebase.uniformRelativeTolerance`,
        );
  if (absoluteTolerance < 0 || relativeTolerance < 0)
    throw new Error(`${label}.timebase tolerances must be non-negative.`);
  const values = rawValues.map((value, index) => {
    if (Array.isArray(value))
      throw new Error(
        `${label}.values[${index}] vector values are not supported in v1.`,
      );
    return canonicalizeQuantity(
      createQuantity({
        value: finite(value, `${label}.values[${index}]`),
        unit,
        dimension,
      }),
    ).value;
  });
  const timesS = rawTimes.map(
    (value, index) =>
      canonicalizeQuantity(
        createQuantity({
          value: finite(value, `${label}.times[${index}]`),
          unit: timeUnit,
          dimension: "time",
        }),
      ).value,
  );
  const sampleIndexes = rawSampleIndexes.map((value, index) => {
    if (!Number.isInteger(value) || value !== index)
      throw new Error(`${label}.sampleIndexes must be contiguous from zero.`);
    return value;
  });
  for (let index = 1; index < timesS.length; index += 1) {
    const previous = timesS[index - 1];
    const current = timesS[index];
    if (previous === undefined || current === undefined)
      throw new Error(`${label}.times is invalid.`);
    if (current === previous)
      throw new Error(`${label} contains duplicate timestamps.`);
    if (current < previous)
      throw new Error(`${label} timestamps must be strictly increasing.`);
  }
  const periods = timesS
    .slice(1)
    .map((time, index) => time - (timesS[index] ?? time));
  const nominalPeriod =
    periods.length === 0
      ? null
      : (periods.slice().sort((left, right) => left - right)[
          Math.floor(periods.length / 2)
        ] ?? null);
  const declaredPeriod =
    timebaseRecord.declaredSamplingInterval === undefined
      ? null
      : canonicalizeQuantity(
          createQuantity({
            value: finite(
              timebaseRecord.declaredSamplingInterval,
              `${label}.timebase.declaredSamplingInterval`,
            ),
            unit: timeUnit,
            dimension: "time",
          }),
        ).value;
  const comparisonPeriod = declaredPeriod ?? nominalPeriod;
  const maximumDeviation =
    comparisonPeriod === null
      ? null
      : Math.max(
          ...periods.map((period) => Math.abs(period - comparisonPeriod)),
        );
  const tolerance =
    comparisonPeriod === null
      ? absoluteTolerance
      : absoluteTolerance + Math.abs(comparisonPeriod) * relativeTolerance;
  const observedClassification =
    comparisonPeriod === null || maximumDeviation === null
      ? "INVALID"
      : maximumDeviation <= tolerance
        ? "UNIFORM"
        : "IRREGULAR";
  const declaredClassificationRaw = timebaseRecord.declaredClassification;
  const declaredClassification =
    declaredClassificationRaw === undefined
      ? null
      : declaredClassificationRaw === "UNIFORM" ||
          declaredClassificationRaw === "IRREGULAR"
        ? declaredClassificationRaw
        : (() => {
            throw new Error(
              `${label}.timebase.declaredClassification is invalid.`,
            );
          })();
  const classification =
    declaredClassification === "UNIFORM" && observedClassification !== "UNIFORM"
      ? "INVALID"
      : observedClassification;
  if (classification === "INVALID")
    throw new Error(`${label} has an invalid or unverified timebase.`);
  const missingRaw = input.missingSampleIndexes ?? [];
  if (
    !Array.isArray(missingRaw) ||
    missingRaw.some((value) => !Number.isInteger(value) || value < 0)
  ) {
    throw new Error(`${label}.missingSampleIndexes is invalid.`);
  }
  const gapRaw = input.gapIntervals ?? input.gap_intervals ?? [];
  if (!Array.isArray(gapRaw))
    throw new Error(`${label}.gapIntervals is invalid.`);
  const gapIntervals = gapRaw.map((gap, index) => {
    if (!isRecord(gap))
      throw new Error(`${label}.gapIntervals[${index}] is invalid.`);
    const gapUnit =
      gap.unit === undefined
        ? timeUnit
        : requireText(gap.unit, `${label}.gapIntervals[${index}].unit`);
    const startValue = gap.start ?? gap.start_s;
    const endValue = gap.end ?? gap.end_s;
    const startS = canonicalizeQuantity(
      createQuantity({
        value: finite(startValue, `${label}.gapIntervals[${index}].start`),
        unit: gapUnit,
        dimension: "time",
      }),
    ).value;
    const endS = canonicalizeQuantity(
      createQuantity({
        value: finite(endValue, `${label}.gapIntervals[${index}].end`),
        unit: gapUnit,
        dimension: "time",
      }),
    ).value;
    if (endS <= startS)
      throw new Error(`${label}.gapIntervals must have positive duration.`);
    return { startS, endS };
  });
  const provenance = input.provenance ?? [];
  if (!Array.isArray(provenance))
    throw new Error(`${label}.provenance is required.`);
  const normalizedProvenance = provenance.map((reference, index) => {
    if (!isRecord(reference))
      throw new Error(`${label}.provenance[${index}] is invalid.`);
    return {
      type: requireText(reference.type, "provenance type"),
      ref: requireText(reference.ref, "provenance ref"),
    };
  });
  const canonicalQuantity = canonicalizeQuantity(
    createQuantity({ value: 0, unit, dimension }),
  );
  return {
    signalId,
    values,
    timesS,
    sampleIndexes,
    quantity: createQuantity({
      value: canonicalQuantity.value,
      unit: canonicalQuantity.unit,
      dimension: canonicalQuantity.dimension,
    }),
    timebase: {
      timeUnit: "s",
      declaredClassification,
      classification,
      declaredSamplingIntervalS: declaredPeriod,
      nominalPeriodS: nominalPeriod,
      nominalRateHz: nominalPeriod === null ? null : 1 / nominalPeriod,
      observedMinPeriodS: periods.length === 0 ? null : Math.min(...periods),
      observedMaxPeriodS: periods.length === 0 ? null : Math.max(...periods),
      maximumDeviationS: maximumDeviation,
      absoluteToleranceS: absoluteTolerance,
      relativeTolerance,
    },
    channel,
    missingSampleIndexes: missingRaw,
    gapIntervals,
    provenance: normalizedProvenance,
  };
}

function signalPayload(signal: CanonicalSignal): Record<string, unknown> {
  return {
    signal_id: signal.signalId,
    values: [...signal.values],
    times_s: [...signal.timesS],
    sample_indexes: [...signal.sampleIndexes],
    unit: signal.quantity.unit,
    dimension: signal.quantity.dimension,
    missing_sample_indices: [...signal.missingSampleIndexes],
    gap_intervals: signal.gapIntervals.map((gap) => ({
      start_s: gap.startS,
      end_s: gap.endS,
    })),
    timebase: signal.timebase,
    channel: signal.channel,
    provenance: signal.provenance,
  };
}

function requestInput(
  input: ScientificSignalMechanicsRequestInput,
): Record<string, unknown> {
  const signal = toCanonicalSignal(input.signal);
  const options = input.options ?? {};
  const structured: Record<string, unknown> = {
    operation: input.operation,
    signal: signalPayload(signal),
    options,
  };
  if (input.referenceSignal !== undefined)
    structured.reference = signalPayload(
      toCanonicalSignal(input.referenceSignal, "referenceSignal"),
    );
  return structured;
}

export function createScientificSignalMechanicsRequest(
  input: ScientificSignalMechanicsRequestInput,
): ScienceRequest {
  const requestId = requireText(input.requestId, "Science request id");
  if (!isOperation(input.operation))
    throw new Error("SCI-8 operation is invalid.");
  if (input.inputProvenance.length === 0)
    throw new Error("SCI-8 requests require input provenance.");
  const signal = toCanonicalSignal(input.signal);
  const reference =
    input.referenceSignal === undefined
      ? null
      : toCanonicalSignal(input.referenceSignal, "referenceSignal");
  const provenance = [
    ...input.inputProvenance,
    ...signal.provenance,
    ...(reference === null ? [] : reference.provenance),
  ].filter(
    (referenceValue, index, all) =>
      all.findIndex(
        (candidate) =>
          candidate.type === referenceValue.type &&
          candidate.ref === referenceValue.ref,
      ) === index,
  );
  return {
    requestId,
    capabilityId: SCIENTIFIC_SIGNAL_MECHANICS_CAPABILITY_ID,
    capabilityVersion: SCIENTIFIC_SIGNAL_MECHANICS_CAPABILITY_VERSION,
    ...(input.observedAt === undefined
      ? {}
      : { observedAt: parseInstant(input.observedAt) }),
    inputs: {
      [SCIENTIFIC_SIGNAL_MECHANICS_INPUT_KEY]: {
        kind: "structured",
        value: requestInput(input),
      },
    },
    inputProvenance: provenance,
  };
}

function runPython(
  payload: Readonly<Record<string, unknown>>,
  executable: string,
  scriptPath: string,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", (error: Error) => reject(error));
    child.once("close", (code: number | null) => {
      if (code !== 0) {
        reject(
          new Error(
            `SCI-8 Python engine exited with code ${code}: ${stderr.trim()}`,
          ),
        );
        return;
      }
      try {
        resolve(JSON.parse(stdout) as unknown);
      } catch (error) {
        reject(
          error instanceof Error
            ? error
            : new Error("SCI-8 engine returned invalid JSON."),
        );
      }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

function parseEngineResponse(value: unknown): EngineResponse {
  if (!isRecord(value) || typeof value.status !== "string")
    throw new Error("SCI-8 engine returned an invalid response envelope.");
  if (value.status === "FAILED" && isRecord(value.failure))
    return value as unknown as EngineFailureResponse;
  if (value.status === "INFRASTRUCTURE_FAILED" && isRecord(value.exception))
    return value as unknown as EngineInfrastructureFailure;
  if (
    value.status !== "SUCCEEDED" ||
    !isRecord(value.processor) ||
    value.processor.id !== SCIENTIFIC_SIGNAL_MECHANICS_PROCESSOR_ID ||
    value.processor.version !== SCIENTIFIC_SIGNAL_MECHANICS_PROCESSOR_VERSION ||
    !isRecord(value.method) ||
    typeof value.method.id !== "string" ||
    typeof value.method.version !== "string" ||
    typeof value.operation !== "string" ||
    !isRecord(value.output)
  )
    throw new Error("SCI-8 engine returned an invalid success payload.");
  return value as unknown as EngineSuccess;
}

function camelize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => camelize(item));
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key.replace(/_([a-z])/gu, (_match, letter: string) =>
        letter.toUpperCase(),
      ),
      camelize(item),
    ]),
  );
}

function outputArtifact(
  output: Record<string, unknown>,
): Record<string, unknown> {
  const kind = output.kind;
  if (kind === "signal") {
    const values = output.values;
    const times = output.times_s;
    const indexes = output.sample_indexes;
    if (
      !Array.isArray(values) ||
      !Array.isArray(times) ||
      !Array.isArray(indexes) ||
      typeof output.unit !== "string" ||
      typeof output.dimension !== "string"
    ) {
      throw new Error("SCI-8 engine signal output is invalid.");
    }
    const normalized: Record<string, unknown> = {
      kind: "SIGNAL",
      signalId: output.signal_id,
      values: [...values],
      times: [...times],
      sampleIndexes: [...indexes],
      quantity: { unit: output.unit, dimension: output.dimension },
      timeUnit: "s",
      timebase: {
        classification: "EXPLICIT_OUTPUT_GRID",
        source: "SCI8_ENGINE",
      },
    };
    const metadata = camelize(output);
    if (isRecord(metadata)) {
      for (const [key, value] of Object.entries(metadata)) {
        if (!(key in normalized)) normalized[key] = value;
      }
    }
    return normalized;
  }
  if (kind === "sample") {
    return {
      kind: "SAMPLE",
      sample: createQuantity({
        value: finite(output.value, "interpolated value"),
        unit: requireText(output.unit, "interpolated unit"),
        dimension: requireText(
          output.dimension,
          "interpolated dimension",
        ) as Dimension,
      }),
      timeS: finite(output.time_s, "interpolated time"),
      bracketing: camelize(output.bracketing),
    };
  }
  if (kind === "quantity") {
    return {
      kind: "QUANTITY",
      quantity: createQuantity({
        value: finite(output.value, "integral value"),
        unit: requireText(output.unit, "integral unit"),
        dimension: requireText(
          output.dimension,
          "integral dimension",
        ) as Dimension,
      }),
      startTimeS: output.start_time_s,
      endTimeS: output.end_time_s,
      initialCondition: output.initial_condition,
    };
  }
  if (kind === "events") {
    if (!Array.isArray(output.events))
      throw new Error("SCI-8 event output is invalid.");
    const eventArtifact: Record<string, unknown> = {
      kind: "EVENTS",
      signalId: output.signal_id,
      events: camelize(output.events),
    };
    if (output.event_kind !== undefined)
      eventArtifact.eventKind = output.event_kind;
    if (output.method_detail !== undefined)
      eventArtifact.methodDetail = output.method_detail;
    return eventArtifact;
  }
  if (kind === "interval") {
    const interval = camelize(output);
    return { ...(isRecord(interval) ? interval : {}), kind: "INTERVAL" };
  }
  throw new Error("SCI-8 engine returned an unsupported output artifact.");
}

function outputDimension(output: Record<string, unknown>): string | null {
  if (
    isRecord(output.quantity) &&
    typeof output.quantity.dimension === "string"
  )
    return output.quantity.dimension;
  if (typeof output.dimension === "string") return output.dimension;
  return null;
}

function outputUnit(output: Record<string, unknown>): string | null {
  if (isRecord(output.quantity) && typeof output.quantity.unit === "string")
    return output.quantity.unit;
  if (typeof output.unit === "string") return output.unit;
  return null;
}

function buildClaimArtifacts(
  request: ScienceRequest,
  operation: ScientificSignalOperation,
  options: SignalMechanicsOptions,
  output: Record<string, unknown>,
  software: SoftwareProvenance,
): {
  readonly claim: ScientificClaim;
  readonly derivation: ScientificDerivationGraph;
  readonly recalculationHistory: RecalculationHistory;
  readonly configuration: ConfigurationSnapshot;
  readonly assumptions: readonly AssumptionDeclaration[];
} {
  const parents = parentReferences(request.inputProvenance);
  if (parents.length === 0)
    throw new Error(
      "SCI-8 computation requires PSC4 source evidence in input provenance.",
    );
  const method = methodIdentity(operation, options);
  const configuration = configurationSnapshot(operation, options);
  const declaredAssumptions = assumptions(operation);
  const outputFingerprint = sha256(canonicalJson(output));
  const claimId = `sci8-derived-claim-${outputFingerprint}`;
  const lineage = {
    parents,
    provenance: [
      ...request.inputProvenance,
      { type: "SCI8_METHOD", ref: method.id },
      { type: "SCI8_CONFIGURATION", ref: configuration.contentHash },
    ],
  };
  const claim = createScientificClaim({
    claimClass: "MECHANICALLY_DERIVED",
    claimId,
    value: { kind: "REFERENCE", value: `sci8-output-${outputFingerprint}` },
    output: { kind: "REFERENCE" },
    method,
    software,
    assumptions: declaredAssumptions,
    configuration,
    lineage,
  });
  const derivationInputs = parents as readonly DerivationInputReference[];
  const nodeId = `sci8-derivation-${outputFingerprint}`;
  const derivation = createDerivationGraph({
    nodes: [
      {
        nodeId,
        outputClaimId: claimId,
        outputClass: "MECHANICALLY_DERIVED",
        inputs: derivationInputs,
        processor: {
          id: SCIENTIFIC_SIGNAL_MECHANICS_PROCESSOR_ID,
          version: SCIENTIFIC_SIGNAL_MECHANICS_PROCESSOR_VERSION,
        },
        method,
        software,
        assumptions: declaredAssumptions,
        configuration,
        createdAt: nowInstant(),
        supersession: { kind: "NONE" },
      },
    ],
    edges: [],
  });
  const recalculationHistory = createRecalculationHistory({
    records: [
      {
        recordId: `sci8-recalculation-${outputFingerprint}`,
        outputClaimId: claimId,
        inputReferences: derivationInputs,
        processor: {
          id: SCIENTIFIC_SIGNAL_MECHANICS_PROCESSOR_ID,
          version: SCIENTIFIC_SIGNAL_MECHANICS_PROCESSOR_VERSION,
        },
        method,
        software,
        configuration,
        generatedAt: nowInstant(),
        supersedesRecordId: null,
      },
    ],
  });
  return {
    claim,
    derivation,
    recalculationHistory,
    configuration,
    assumptions: declaredAssumptions,
  };
}

function failureResult(
  request: Pick<ScienceRequest, "requestId" | "capabilityId">,
  code: string,
  message: string,
  status: ScienceResult["status"] = "invalid_input",
): ScienceResult {
  return {
    requestId: request.requestId,
    capabilityId: request.capabilityId,
    status,
    generatedAt: nowInstant(),
    error: { code, message },
  };
}

export class ScientificSignalMechanicsSciencePort implements SciencePort {
  readonly identity: ScientificSignalMechanicsProcessorIdentity;
  private readonly pythonExecutable: string;
  private readonly pythonScriptPath: string;
  private readonly engineInvoker:
    | ScientificSignalMechanicsEngineInvoker
    | undefined;

  constructor(options: ScientificSignalMechanicsAdapterOptions) {
    const qualification = options.qualification;
    this.identity = {
      processor: {
        id: SCIENTIFIC_SIGNAL_MECHANICS_PROCESSOR_ID,
        version: SCIENTIFIC_SIGNAL_MECHANICS_PROCESSOR_VERSION,
      },
      methods: [
        ...Object.values(METHOD_IDS),
        SCIENTIFIC_SIGNAL_REGRID_METHOD_ID,
      ].map((id) => ({
        id,
        version: SCIENTIFIC_SIGNAL_MECHANICS_METHOD_VERSION,
      })),
      software: options.software,
      qualification:
        qualification === undefined || qualification === null
          ? {
              status: "NOT_QUALIFIED",
              reason: "No SCI-8 numerical qualification binding was supplied.",
            }
          : { status: "QUALIFIED", identity: qualification },
    };
    this.pythonExecutable = options.pythonExecutable ?? "python";
    this.pythonScriptPath = options.pythonScriptPath ?? PYTHON_PROCESSOR_PATH;
    this.engineInvoker = options.engineInvoker;
  }

  async capabilities(): Promise<
    readonly {
      capabilityId: string;
      status: ScienceResult["status"];
      description: string;
    }[]
  > {
    return [
      {
        capabilityId: SCIENTIFIC_SIGNAL_MECHANICS_CAPABILITY_ID,
        status:
          this.identity.qualification.status === "QUALIFIED"
            ? "ok"
            : "method_unavailable",
        description:
          "Domain-neutral scalar signal, timebase, numerical transform, synchronization, event, and interval mechanics with explicit provenance and configuration.",
      },
    ];
  }

  async compute(request: ScienceRequest): Promise<ScienceResult> {
    if (
      !isRecord(request) ||
      typeof request.requestId !== "string" ||
      typeof request.capabilityId !== "string" ||
      !isRecord(request.inputs)
    ) {
      return failureResult(
        request,
        "INPUT_INVALID",
        "SCI-8 request envelope is invalid.",
      );
    }
    if (request.capabilityId !== SCIENTIFIC_SIGNAL_MECHANICS_CAPABILITY_ID) {
      return failureResult(
        request,
        "CAPABILITY_NOT_SUPPORTED",
        "The SCI-8 port owns one narrow signal-mechanics capability.",
        "not_applicable",
      );
    }
    if (
      request.capabilityVersion !== undefined &&
      request.capabilityVersion !==
        SCIENTIFIC_SIGNAL_MECHANICS_CAPABILITY_VERSION
    ) {
      return failureResult(
        request,
        "UNSUPPORTED_CONFIGURATION",
        "The requested SCI-8 capability version is not supported.",
      );
    }
    if (this.identity.qualification.status !== "QUALIFIED") {
      return failureResult(
        request,
        "PROCESSOR_NOT_QUALIFIED",
        "SCI-8 numerical execution requires a qualification binding.",
        "method_unavailable",
      );
    }
    const structured = request.inputs[SCIENTIFIC_SIGNAL_MECHANICS_INPUT_KEY];
    if (structured?.kind !== "structured" || !isRecord(structured.value))
      return failureResult(
        request,
        "INPUT_INVALID",
        "SCI-8 structured input is required.",
      );
    try {
      const raw = structured.value;
      if (!isOperation(raw.operation))
        throw new Error("SCI-8 operation is invalid.");
      const signal = toCanonicalSignal(raw.signal);
      const options = isRecord(raw.options) ? raw.options : {};
      const payload: Record<string, unknown> = {
        processor: this.identity.processor,
        operation: raw.operation,
        signal: signalPayload(signal),
        options,
      };
      if (raw.reference !== undefined)
        payload.reference = signalPayload(
          toCanonicalSignal(raw.reference, "reference"),
        );
      const inputFingerprint = sha256(
        canonicalJson({
          capabilityId: request.capabilityId,
          inputProvenance: request.inputProvenance,
          structured: raw,
        }),
      );
      const engine = parseEngineResponse(
        await (this.engineInvoker === undefined
          ? runPython(payload, this.pythonExecutable, this.pythonScriptPath)
          : this.engineInvoker(payload)),
      );
      if (engine.status === "FAILED")
        return failureResult(
          request,
          engine.failure.code,
          engine.failure.message,
        );
      if (engine.status === "INFRASTRUCTURE_FAILED")
        return failureResult(
          request,
          "COMPUTATION_FAILED",
          engine.exception.message,
          "computation_failed",
        );
      if (engine.operation !== raw.operation)
        throw new Error("SCI-8 engine changed the operation identity.");
      const artifact = outputArtifact(engine.output);
      const artifacts = buildClaimArtifacts(
        request,
        raw.operation,
        options,
        artifact,
        this.identity.software,
      );
      const outputFingerprint = sha256(canonicalJson(artifact));
      return {
        requestId: request.requestId,
        capabilityId: request.capabilityId,
        status: "ok",
        method: engine.method,
        inputFingerprint,
        value: {
          operation: raw.operation,
          output: artifact,
          outputFingerprint,
          method: engine.method,
          configuration: artifacts.configuration,
          qualification: this.identity.qualification,
          claim: artifacts.claim,
          derivation: artifacts.derivation,
          recalculationHistory: artifacts.recalculationHistory,
          qualificationState: "QUALIFIED_SOFTWARE_NUMERICAL_ONLY",
        },
        unit: outputUnit(artifact),
        dimension: outputDimension(artifact),
        uncertainty: {
          status: "UNKNOWN",
          numericalError: "METHOD_SPECIFIC_OR_UNKNOWN",
          measurementUncertainty: "UNKNOWN",
          samplingResolution: "NOT_PROPAGATED",
          interpolationError:
            raw.operation === "INTERPOLATE" || raw.operation === "SYNCHRONIZE"
              ? "METHOD_SPECIFIC_OR_UNKNOWN"
              : "NOT_APPLICABLE",
        },
        assumptions: artifacts.assumptions.map(
          (assumption) => assumption.description,
        ),
        limitations: [
          "SCI-8 v1 is scalar-only; vector-valued channel semantics are not silently inferred.",
          "No automatic lag discovery, hidden interpolation, hidden filtering, extrapolation, or missing-data fill is permitted.",
          "Empirical measurement uncertainty and dataset validation remain pending; numerical error characterization is method-specific.",
        ],
        provenance: [
          ...request.inputProvenance,
          {
            type: "SCI8_DERIVATION_NODE",
            ref: artifacts.derivation.nodes[0]?.nodeId ?? "unknown",
          },
          { type: "SCI0_CLAIM", ref: artifacts.claim.claimId },
        ],
        generatedAt: nowInstant(),
      };
    } catch (error) {
      return failureResult(
        request,
        "INPUT_INVALID",
        error instanceof Error ? error.message : "SCI-8 computation failed.",
      );
    }
  }
}

export function createQualifiedScientificSignalMechanicsSoftwareProvenance(
  sourceRevision: string,
  buildId: string,
): SoftwareProvenance {
  if (!SHA_PATTERN.test(sourceRevision))
    throw new Error("Source revision must be an exact hexadecimal commit SHA.");
  return {
    packageName: "@workoutpal/science-port",
    packageVersion: "0.1.0",
    sourceRevision,
    buildId: requireText(buildId, "Build id"),
  };
}
