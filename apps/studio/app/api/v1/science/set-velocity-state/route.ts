import { randomUUID } from "node:crypto";
import {
  createQualifiedSetVelocitySoftwareProvenance,
  createSetVelocityStateRequest,
  SET_VELOCITY_STATE_METHOD_ID,
  SET_VELOCITY_STATE_METHOD_VERSION,
  SET_VELOCITY_STATE_PROCESSOR_ID,
  SET_VELOCITY_STATE_PROCESSOR_VERSION,
  type SetVelocityStateEngineInvoker,
  type SetVelocityStateRequestInput,
  SetVelocityStateSciencePort,
} from "@workoutpal/science-port";
import { z } from "zod";
import {
  parseJson,
  problemResponse,
  requirePrincipal,
  response,
} from "../../../../../lib/http";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  requestId: z.string().trim().min(1).max(200).optional(),
  observedAt: z.string().trim().min(1).optional(),
  athleteId: z.string().trim().min(1).optional(),
  setContext: z.record(z.string(), z.unknown()),
  upstreamQualifications: z.array(z.record(z.string(), z.unknown())).min(1),
  repetitions: z.array(z.record(z.string(), z.unknown())).min(1),
  mode: z.enum(["ONLINE_PREFIX", "POST_HOC_COMPLETE_SET"]),
  referencePolicy: z.enum([
    "FIRST_ELIGIBLE",
    "FASTEST_ELIGIBLE_COMPLETE_SET",
    "FASTEST_SO_FAR",
    "EXPLICIT_REPETITION",
  ]),
  explicitReferenceRepId: z.string().trim().min(1).optional(),
  thresholds: z.array(z.record(z.string(), z.unknown())),
  inputProvenance: z
    .array(
      z.object({
        type: z.string().trim().min(1),
        ref: z.string().trim().min(1),
      }),
    )
    .min(1),
});

type RequestBody = z.infer<typeof requestSchema>;

function hostedEngineInvoker(
  request: Request,
  sourceRevision: string,
): SetVelocityStateEngineInvoker | undefined {
  if (process.env.VERCEL_URL === undefined) return undefined;
  return async (payload) => {
    const endpoint = new URL("/api/science_set_velocity_state", request.url);
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
        `Hosted SCI-5 engine returned HTTP ${engineResponse.status}: ${rawBody.slice(0, 500)}`,
      );
    }
    return JSON.parse(rawBody) as unknown;
  };
}

function qualifiedPort(request: Request): SetVelocityStateSciencePort {
  const sourceRevision =
    process.env.WORKOUTPAL_SOURCE_REVISION ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    "0000000000000000000000000000000000000000";
  const buildId =
    process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_URL ?? "local";
  const software = createQualifiedSetVelocitySoftwareProvenance(
    sourceRevision,
    buildId,
  );
  const engineInvoker = hostedEngineInvoker(request, sourceRevision);
  return new SetVelocityStateSciencePort({
    software,
    qualification: {
      qualificationId: "sci5-set-level-vbt-state-qualified",
      qualificationVersion: "1.0.0",
      oracle: { id: "sci5-set-level-vbt-analytical-oracle", version: "1.0.0" },
      validationData: {
        id: "sci5-synthetic-set-level-vbt-fixtures",
        version: "1.0.0",
      },
      sourceRevision,
      buildId,
    },
    pythonExecutable: process.platform === "win32" ? "python" : "python3",
    ...(engineInvoker === undefined ? {} : { engineInvoker }),
  });
}

export async function POST(request: Request): Promise<Response> {
  try {
    await requirePrincipal(request);
    const body: RequestBody = await parseJson(request, requestSchema);
    const input: SetVelocityStateRequestInput = {
      requestId: body.requestId ?? randomUUID(),
      ...(body.observedAt === undefined ? {} : { observedAt: body.observedAt }),
      ...(body.athleteId === undefined ? {} : { athleteId: body.athleteId }),
      setContext:
        body.setContext as unknown as SetVelocityStateRequestInput["setContext"],
      upstreamQualifications:
        body.upstreamQualifications as unknown as SetVelocityStateRequestInput["upstreamQualifications"],
      repetitions:
        body.repetitions as unknown as SetVelocityStateRequestInput["repetitions"],
      mode: body.mode,
      referencePolicy: body.referencePolicy,
      ...(body.explicitReferenceRepId === undefined
        ? {}
        : { explicitReferenceRepId: body.explicitReferenceRepId }),
      thresholds:
        body.thresholds as unknown as SetVelocityStateRequestInput["thresholds"],
      inputProvenance: body.inputProvenance,
    };
    const scienceRequest = createSetVelocityStateRequest(input);
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

export const SCI5_HOSTED_PROCESSOR_IDENTITY = {
  processor: {
    id: SET_VELOCITY_STATE_PROCESSOR_ID,
    version: SET_VELOCITY_STATE_PROCESSOR_VERSION,
  },
  method: {
    id: SET_VELOCITY_STATE_METHOD_ID,
    version: SET_VELOCITY_STATE_METHOD_VERSION,
  },
} as const;
