import { randomUUID } from "node:crypto";
import { ApplicationError } from "@workoutpal/application";
import {
  createMaximalStrengthRequest,
  createQualifiedMaximalStrengthSoftwareProvenance,
  MAXIMAL_STRENGTH_PROCESSOR_ID,
  MAXIMAL_STRENGTH_PROCESSOR_VERSION,
  type MaximalStrengthEngineInvoker,
  type MaximalStrengthModelingRequestInput,
  MaximalStrengthSciencePort,
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
  operation: z.enum(["TARGET_LOAD", "ESTIMATED_1RM"]),
  requestId: z.string().trim().min(1).max(200).optional(),
  observedAt: z.string().trim().min(1).optional(),
  profile: z.record(z.string(), z.unknown()),
  profileQualification: z.record(z.string(), z.unknown()),
  targetVelocityAuthority: z.record(z.string(), z.unknown()),
  inputProvenance: z
    .array(
      z.object({
        type: z.string().trim().min(1),
        ref: z.string().trim().min(1),
      }),
    )
    .min(1),
});

function hostedEngineInvoker(
  request: Request,
  sourceRevision: string,
): MaximalStrengthEngineInvoker | undefined {
  if (process.env.VERCEL_URL === undefined) return undefined;
  return async (payload) => {
    const endpoint = new URL("/api/science_maximal_strength", request.url);
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
        `Hosted SCI-7 engine returned HTTP ${engineResponse.status}: ${rawBody.slice(0, 500)}`,
      );
    }
    return JSON.parse(rawBody) as unknown;
  };
}

function qualifiedPort(request: Request): MaximalStrengthSciencePort {
  const sourceRevision =
    process.env.WORKOUTPAL_SOURCE_REVISION ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    "0000000000000000000000000000000000000000";
  const buildId =
    process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_URL ?? "local";
  const software = createQualifiedMaximalStrengthSoftwareProvenance(
    sourceRevision,
    buildId,
  );
  const engineInvoker = hostedEngineInvoker(request, sourceRevision);
  return new MaximalStrengthSciencePort({
    software,
    qualification: {
      qualificationId: "sci7-maximal-strength-modeling-qualified",
      qualificationVersion: "1.0.0",
      oracle: {
        id: "sci7-maximal-strength-analytical-oracle",
        version: "1.0.0",
      },
      validationData: {
        id: "sci7-maximal-strength-synthetic-fixtures",
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
    const body = await parseJson(request, requestSchema);
    const input: MaximalStrengthModelingRequestInput = {
      requestId: body.requestId ?? randomUUID(),
      operation: body.operation,
      ...(body.observedAt === undefined ? {} : { observedAt: body.observedAt }),
      profile:
        body.profile as unknown as MaximalStrengthModelingRequestInput["profile"],
      profileQualification:
        body.profileQualification as unknown as MaximalStrengthModelingRequestInput["profileQualification"],
      targetVelocityAuthority:
        body.targetVelocityAuthority as unknown as MaximalStrengthModelingRequestInput["targetVelocityAuthority"],
      inputProvenance: body.inputProvenance,
    };
    let scienceRequest: ReturnType<typeof createMaximalStrengthRequest>;
    try {
      scienceRequest = createMaximalStrengthRequest(input);
    } catch {
      throw new ApplicationError(
        "VALIDATION_FAILED",
        "SCI-7 request failed scientific input validation.",
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

export const SCI7_HOSTED_PROCESSOR_IDENTITY = {
  processor: {
    id: MAXIMAL_STRENGTH_PROCESSOR_ID,
    version: MAXIMAL_STRENGTH_PROCESSOR_VERSION,
  },
} as const;
