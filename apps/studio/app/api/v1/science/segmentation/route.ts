import { randomUUID } from "node:crypto";
import {
  createQualifiedSoftwareProvenance,
  createSegmentationRequest,
  type Sci2VelocityLineage,
  SEGMENTATION_METHOD_ID,
  SEGMENTATION_METHOD_VERSION,
  SEGMENTATION_PROCESSOR_ID,
  SEGMENTATION_PROCESSOR_VERSION,
  type SegmentationConfiguration,
  type SegmentationEngineInvoker,
  type SegmentationKinematicEvidence,
  type SegmentationProtocolDefinition,
  type SegmentationRequestInput,
  SegmentationSciencePort,
} from "@workoutpal/science-port";
import { z } from "zod";
import {
  parseJson,
  problemResponse,
  requirePrincipal,
  response,
} from "../../../../../lib/http";

export const dynamic = "force-dynamic";

const configurationSchema = z.object({
  velocityEnterThresholdMps: z.number().finite().positive(),
  velocityExitThresholdMps: z.number().finite().positive(),
  minimumSustainedSamples: z.number().int().positive(),
  minimumPrerollSamples: z.number().int().positive(),
  minimumPostrollSamples: z.number().int().positive(),
  minimumPhaseDurationSeconds: z.number().finite().positive(),
  minimumRepetitionDurationSeconds: z.number().finite().positive(),
  minimumExcursionMeters: z.number().finite().positive(),
  uniformAbsoluteToleranceSeconds: z.number().finite().nonnegative(),
  uniformRelativeTolerance: z.number().finite().nonnegative(),
  filtering: z.literal("NONE"),
  interpolation: z.literal("NONE"),
  dwellPolicy: z.literal("ALLOWED"),
  boundaryPolicy: z.literal("SAMPLED_ONLY_NO_INTERPOLATION"),
});

const requestSchema = z.object({
  requestId: z.string().trim().min(1).max(200).optional(),
  observedAt: z.string().trim().min(1).optional(),
  athleteId: z.string().trim().min(1).optional(),
  evidence: z.record(z.string(), z.unknown()),
  sci2Lineage: z.record(z.string(), z.unknown()),
  movementTask: z.record(z.string(), z.unknown()),
  protocol: z.record(z.string(), z.unknown()),
  configuration: configurationSchema,
  exerciseDefinition: z.record(z.string(), z.unknown()).optional(),
  exerciseVariation: z.record(z.string(), z.unknown()).optional(),
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
): SegmentationEngineInvoker | undefined {
  if (process.env.VERCEL_URL === undefined) return undefined;
  return async (payload) => {
    const endpoint = new URL("/api/science_segmentation", request.url);
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
        `Hosted SCI-3 engine returned HTTP ${engineResponse.status}: ${rawBody.slice(0, 500)}`,
      );
    }
    return JSON.parse(rawBody) as unknown;
  };
}

function qualifiedPort(
  request: Request,
  configuration: SegmentationConfiguration,
): SegmentationSciencePort {
  const sourceRevision =
    process.env.WORKOUTPAL_SOURCE_REVISION ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    "0000000000000000000000000000000000000000";
  const buildId =
    process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_URL ?? "local";
  const software = createQualifiedSoftwareProvenance(sourceRevision, buildId);
  const engineInvoker = hostedEngineInvoker(request, sourceRevision);
  return new SegmentationSciencePort({
    software,
    configuration,
    qualification: {
      qualificationId: "sci3-repetition-phase-segmentation-qualified",
      qualificationVersion: "1.0.0",
      oracle: { id: "sci3-synthetic-segmentation-oracle", version: "1.0.0" },
      validationData: {
        id: "sci3-synthetic-repetition-phase-fixtures",
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
    const input: SegmentationRequestInput = {
      requestId: body.requestId ?? randomUUID(),
      ...(body.observedAt === undefined ? {} : { observedAt: body.observedAt }),
      ...(body.athleteId === undefined ? {} : { athleteId: body.athleteId }),
      evidence: body.evidence as unknown as SegmentationKinematicEvidence,
      sci2Lineage: body.sci2Lineage as unknown as Sci2VelocityLineage,
      movementTask: body.movementTask as never,
      protocol: body.protocol as unknown as SegmentationProtocolDefinition,
      configuration: body.configuration,
      ...(body.exerciseDefinition === undefined
        ? {}
        : { exerciseDefinition: body.exerciseDefinition as never }),
      ...(body.exerciseVariation === undefined
        ? {}
        : { exerciseVariation: body.exerciseVariation as never }),
      inputProvenance: body.inputProvenance,
    };
    const scienceRequest = createSegmentationRequest(input);
    const result = await qualifiedPort(request, body.configuration).compute(
      scienceRequest,
    );
    return response(
      { data: result },
      request,
      result.status === "ok" ? 200 : 422,
    );
  } catch (error) {
    return problemResponse(error, request);
  }
}

export const SCI3_HOSTED_PROCESSOR_IDENTITY = {
  processor: {
    id: SEGMENTATION_PROCESSOR_ID,
    version: SEGMENTATION_PROCESSOR_VERSION,
  },
  method: {
    id: SEGMENTATION_METHOD_ID,
    version: SEGMENTATION_METHOD_VERSION,
  },
} as const;
