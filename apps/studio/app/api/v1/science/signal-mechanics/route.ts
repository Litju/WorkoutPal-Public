import { randomUUID } from "node:crypto";
import { ApplicationError } from "@workoutpal/application";
import {
  createQualifiedScientificSignalMechanicsSoftwareProvenance,
  createScientificSignalMechanicsRequest,
  SCIENTIFIC_SIGNAL_MECHANICS_PROCESSOR_ID,
  SCIENTIFIC_SIGNAL_MECHANICS_PROCESSOR_VERSION,
  type ScientificSignalMechanicsEngineInvoker,
  type ScientificSignalMechanicsRequestInput,
  ScientificSignalMechanicsSciencePort,
} from "@workoutpal/science-port";
import { z } from "zod";
import {
  parseJson,
  problemResponse,
  requirePrincipal,
  response,
} from "../../../../../lib/http";

export const dynamic = "force-dynamic";

const provenanceSchema = z.object({
  type: z.string().trim().min(1),
  ref: z.string().trim().min(1),
});

const requestSchema = z.object({
  operation: z.enum([
    "DERIVATIVE",
    "INTEGRATE",
    "INTERPOLATE",
    "RESAMPLE",
    "FILTER",
    "SYNCHRONIZE",
    "DETECT_EVENTS",
    "INTERVAL",
  ]),
  requestId: z.string().trim().min(1).max(200).optional(),
  observedAt: z.string().trim().min(1).optional(),
  signal: z.record(z.string(), z.unknown()),
  options: z.record(z.string(), z.unknown()).optional(),
  referenceSignal: z.record(z.string(), z.unknown()).optional(),
  inputProvenance: z.array(provenanceSchema).min(1),
});

function hostedEngineInvoker(
  request: Request,
  sourceRevision: string,
): ScientificSignalMechanicsEngineInvoker | undefined {
  if (process.env.VERCEL_URL === undefined) return undefined;
  return async (payload) => {
    const endpoint = new URL("/api/science_signal_mechanics", request.url);
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-workoutpal-science-source": sourceRevision,
    };
    const cookie = request.headers.get("cookie");
    if (cookie !== null) headers.cookie = cookie;
    const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    if (bypass !== undefined) headers["x-vercel-protection-bypass"] = bypass;
    const engineResponse = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const rawBody = await engineResponse.text();
    if (!engineResponse.ok) {
      throw new Error(
        `Hosted SCI-8 engine returned HTTP ${engineResponse.status}: ${rawBody.slice(0, 500)}`,
      );
    }
    return JSON.parse(rawBody) as unknown;
  };
}

function qualifiedPort(request: Request): ScientificSignalMechanicsSciencePort {
  const sourceRevision =
    process.env.WORKOUTPAL_SOURCE_REVISION ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    "0000000000000000000000000000000000000000";
  const buildId =
    process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_URL ?? "local";
  const software = createQualifiedScientificSignalMechanicsSoftwareProvenance(
    sourceRevision,
    buildId,
  );
  const engineInvoker = hostedEngineInvoker(request, sourceRevision);
  return new ScientificSignalMechanicsSciencePort({
    software,
    qualification: {
      qualificationId: "sci8-scientific-signal-mechanics-qualified",
      qualificationVersion: "1.0.0",
      oracle: {
        id: "sci8-independent-analytical-oracles",
        version: "1.0.0",
      },
      validationData: {
        id: "sci8-deterministic-synthetic-fixtures",
        version: "1.0.0",
      },
    },
    pythonExecutable: process.platform === "win32" ? "python" : "python3",
    ...(engineInvoker === undefined ? {} : { engineInvoker }),
  });
}

export async function POST(request: Request): Promise<Response> {
  try {
    await requirePrincipal(request);
    const body = await parseJson(request, requestSchema);
    const input: ScientificSignalMechanicsRequestInput = {
      requestId: body.requestId ?? randomUUID(),
      operation: body.operation,
      signal:
        body.signal as unknown as ScientificSignalMechanicsRequestInput["signal"],
      ...(body.options === undefined ? {} : { options: body.options }),
      ...(body.referenceSignal === undefined
        ? {}
        : {
            referenceSignal: body.referenceSignal as unknown as NonNullable<
              ScientificSignalMechanicsRequestInput["referenceSignal"]
            >,
          }),
      inputProvenance: body.inputProvenance,
      ...(body.observedAt === undefined ? {} : { observedAt: body.observedAt }),
    };
    let scienceRequest: ReturnType<
      typeof createScientificSignalMechanicsRequest
    >;
    try {
      scienceRequest = createScientificSignalMechanicsRequest(input);
    } catch {
      throw new ApplicationError(
        "VALIDATION_FAILED",
        "SCI-8 request failed scientific signal and timebase validation.",
      );
    }
    const result = await qualifiedPort(request).compute(scienceRequest);
    return response(
      { data: result },
      request,
      result.status === "ok" ? 200 : 422,
    );
  } catch (error) {
    return problemResponse(error, request);
  }
}

export const SCI8_HOSTED_PROCESSOR_IDENTITY = {
  processor: {
    id: SCIENTIFIC_SIGNAL_MECHANICS_PROCESSOR_ID,
    version: SCIENTIFIC_SIGNAL_MECHANICS_PROCESSOR_VERSION,
  },
} as const;
