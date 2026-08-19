import { randomUUID } from "node:crypto";
import {
  createLoadVelocityProfileRequest,
  createQualifiedLoadVelocitySoftwareProvenance,
  LOAD_VELOCITY_PROFILE_MULTI_POINT_METHOD_ID,
  LOAD_VELOCITY_PROFILE_PROCESSOR_ID,
  LOAD_VELOCITY_PROFILE_PROCESSOR_VERSION,
  type LoadVelocityPredictionInput,
  type LoadVelocityProfileEngineInvoker,
  type LoadVelocityProfileRequestInput,
  LoadVelocityProfileSciencePort,
} from "@workoutpal/science-port";
import { z } from "zod";
import {
  parseJson,
  problemResponse,
  requirePrincipal,
  response,
} from "../../../../../lib/http";

export const dynamic = "force-dynamic";

const fitRequestSchema = z.object({
  requestId: z.string().trim().min(1).max(200).optional(),
  observedAt: z.string().trim().min(1).optional(),
  profileContext: z.record(z.string(), z.unknown()),
  upstreamQualifications: z.array(z.record(z.string(), z.unknown())).min(1),
  observations: z.array(z.record(z.string(), z.unknown())).min(2),
  fitMethod: z.enum(["TWO_POINT", "MULTI_POINT_OLS"]),
  inputProvenance: z
    .array(
      z.object({
        type: z.string().trim().min(1),
        ref: z.string().trim().min(1),
      }),
    )
    .min(1),
});

const predictionRequestSchema = z.object({
  operation: z.literal("PREDICT"),
  requestId: z.string().trim().min(1).max(200).optional(),
  profileId: z.string().trim().min(1),
  modelClaimId: z.string().trim().min(1),
  model: z.record(z.string(), z.unknown()),
  externalLoad: z.record(z.string(), z.unknown()),
  inputProvenance: z
    .array(
      z.object({
        type: z.string().trim().min(1),
        ref: z.string().trim().min(1),
      }),
    )
    .min(1),
});

const requestSchema = z.union([fitRequestSchema, predictionRequestSchema]);

type RequestBody = z.infer<typeof requestSchema>;

function hostedEngineInvoker(
  request: Request,
  sourceRevision: string,
): LoadVelocityProfileEngineInvoker | undefined {
  if (process.env.VERCEL_URL === undefined) return undefined;
  return async (payload) => {
    const endpoint = new URL("/api/science_load_velocity_profile", request.url);
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
        `Hosted SCI-6 engine returned HTTP ${engineResponse.status}: ${rawBody.slice(0, 500)}`,
      );
    }
    return JSON.parse(rawBody) as unknown;
  };
}

function qualifiedPort(request: Request): LoadVelocityProfileSciencePort {
  const sourceRevision =
    process.env.WORKOUTPAL_SOURCE_REVISION ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    "0000000000000000000000000000000000000000";
  const buildId =
    process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_URL ?? "local";
  const software = createQualifiedLoadVelocitySoftwareProvenance(
    sourceRevision,
    buildId,
  );
  const engineInvoker = hostedEngineInvoker(request, sourceRevision);
  return new LoadVelocityProfileSciencePort({
    software,
    qualification: {
      qualificationId: "sci6-load-velocity-profile-qualified",
      qualificationVersion: "1.0.0",
      oracle: { id: "sci6-load-velocity-analytical-oracle", version: "1.0.0" },
      validationData: {
        id: "sci6-load-velocity-synthetic-fixtures",
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
    if ("operation" in body && body.operation === "PREDICT") {
      const predictionInput: LoadVelocityPredictionInput = {
        requestId: body.requestId ?? randomUUID(),
        profileId: body.profileId,
        modelClaimId: body.modelClaimId,
        model: body.model as unknown as LoadVelocityPredictionInput["model"],
        externalLoad:
          body.externalLoad as unknown as LoadVelocityPredictionInput["externalLoad"],
        inputProvenance:
          body.inputProvenance as LoadVelocityPredictionInput["inputProvenance"],
      };
      const prediction = await qualifiedPort(request).predict(predictionInput);
      return response(
        { data: prediction },
        request,
        prediction.status === "ok" ? 200 : 422,
      );
    }
    const fitBody = body as z.infer<typeof fitRequestSchema>;
    const input: LoadVelocityProfileRequestInput = {
      requestId: fitBody.requestId ?? randomUUID(),
      ...(fitBody.observedAt === undefined
        ? {}
        : { observedAt: fitBody.observedAt }),
      profileContext:
        fitBody.profileContext as unknown as LoadVelocityProfileRequestInput["profileContext"],
      upstreamQualifications:
        fitBody.upstreamQualifications as unknown as LoadVelocityProfileRequestInput["upstreamQualifications"],
      observations:
        fitBody.observations as unknown as LoadVelocityProfileRequestInput["observations"],
      fitMethod: fitBody.fitMethod,
      inputProvenance: fitBody.inputProvenance,
    };
    const scienceRequest = createLoadVelocityProfileRequest(input);
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

export const SCI6_HOSTED_PROCESSOR_IDENTITY = {
  processor: {
    id: LOAD_VELOCITY_PROFILE_PROCESSOR_ID,
    version: LOAD_VELOCITY_PROFILE_PROCESSOR_VERSION,
  },
  defaultMethod: {
    id: LOAD_VELOCITY_PROFILE_MULTI_POINT_METHOD_ID,
    version: "1.0.0",
  },
} as const;
