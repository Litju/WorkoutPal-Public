import { randomUUID } from "node:crypto";
import {
  createPositionVelocityRequest,
  createQualifiedSoftwareProvenance,
  type ExplicitVelocityInterval,
  POSITION_VELOCITY_METHOD_ID,
  POSITION_VELOCITY_METHOD_VERSION,
  POSITION_VELOCITY_PROCESSOR_ID,
  POSITION_VELOCITY_PROCESSOR_VERSION,
  type PositionTimeSeriesEvidence,
  type PositionVelocityEngineInvoker,
  type PositionVelocityRequestInput,
  PositionVelocitySciencePort,
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
  evidence: z.record(z.string(), z.unknown()),
  inputProvenance: z
    .array(
      z.object({
        type: z.string().trim().min(1),
        ref: z.string().trim().min(1),
      }),
    )
    .min(1),
  intervals: z.array(z.unknown()).optional(),
});

type RequestBody = z.infer<typeof requestSchema>;

function hostedEngineInvoker(
  request: Request,
  sourceRevision: string,
): PositionVelocityEngineInvoker | undefined {
  if (process.env.VERCEL_URL === undefined) return undefined;
  return async (payload) => {
    const endpoint = new URL("/api/science_velocity", request.url);
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
        `Hosted SCI-2 engine returned HTTP ${engineResponse.status}: ${rawBody.slice(0, 500)}`,
      );
    }
    return JSON.parse(rawBody) as unknown;
  };
}

function qualifiedPort(request: Request): PositionVelocitySciencePort {
  const sourceRevision =
    process.env.WORKOUTPAL_SOURCE_REVISION ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    "0000000000000000000000000000000000000000";
  const buildId =
    process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_URL ?? "local";
  const software = createQualifiedSoftwareProvenance(sourceRevision, buildId);
  const engineInvoker = hostedEngineInvoker(request, sourceRevision);
  return new PositionVelocitySciencePort({
    software,
    qualification: {
      qualificationId: "sci2-position-velocity-qualified",
      qualificationVersion: "1.0.0",
      oracle: { id: "sci2-analytical-trajectory-oracle", version: "1.0.0" },
      validationData: {
        id: "sci2-synthetic-position-validation",
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
    const input: PositionVelocityRequestInput = {
      requestId: body.requestId ?? randomUUID(),
      ...(body.observedAt === undefined ? {} : { observedAt: body.observedAt }),
      ...(body.athleteId === undefined ? {} : { athleteId: body.athleteId }),
      evidence: body.evidence as unknown as PositionTimeSeriesEvidence,
      inputProvenance: body.inputProvenance,
      ...(body.intervals === undefined
        ? {}
        : {
            intervals: body.intervals as readonly ExplicitVelocityInterval[],
          }),
    };
    const scienceRequest = createPositionVelocityRequest(input);
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

export const SCI2_HOSTED_PROCESSOR_IDENTITY = {
  processor: {
    id: POSITION_VELOCITY_PROCESSOR_ID,
    version: POSITION_VELOCITY_PROCESSOR_VERSION,
  },
  method: {
    id: POSITION_VELOCITY_METHOD_ID,
    version: POSITION_VELOCITY_METHOD_VERSION,
  },
} as const;
