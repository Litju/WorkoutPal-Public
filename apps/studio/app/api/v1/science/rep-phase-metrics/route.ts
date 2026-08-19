import { randomUUID } from "node:crypto";
import {
  createQualifiedSoftwareProvenance,
  createRepPhaseKinematicMetricsRequest,
  REP_PHASE_KINEMATIC_METRICS_METHOD_ID,
  REP_PHASE_KINEMATIC_METRICS_METHOD_VERSION,
  REP_PHASE_KINEMATIC_METRICS_PROCESSOR_ID,
  REP_PHASE_KINEMATIC_METRICS_PROCESSOR_VERSION,
  type RepPhaseKinematicMetricsEngineInvoker,
  type RepPhaseKinematicMetricsRequestInput,
  RepPhaseKinematicMetricsSciencePort,
  type RepPhaseMetricRequest,
  type RepPhaseSegmentationValue,
  type Sci2IntervalSummaryBinding,
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
  segmentation: z.record(z.string(), z.unknown()),
  sci2IntervalSummaries: z.array(z.record(z.string(), z.unknown())).min(1),
  metricRequests: z.array(z.record(z.string(), z.unknown())).min(1),
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
): RepPhaseKinematicMetricsEngineInvoker | undefined {
  if (process.env.VERCEL_URL === undefined) return undefined;
  return async (payload) => {
    const endpoint = new URL(
      "/api/science_rep_phase_kinematic_metrics",
      request.url,
    );
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
        `Hosted SCI-4 engine returned HTTP ${engineResponse.status}: ${rawBody.slice(0, 500)}`,
      );
    }
    return JSON.parse(rawBody) as unknown;
  };
}

function qualifiedPort(request: Request): RepPhaseKinematicMetricsSciencePort {
  const sourceRevision =
    process.env.WORKOUTPAL_SOURCE_REVISION ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    "0000000000000000000000000000000000000000";
  const buildId =
    process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_URL ?? "local";
  const software = createQualifiedSoftwareProvenance(sourceRevision, buildId);
  const engineInvoker = hostedEngineInvoker(request, sourceRevision);
  return new RepPhaseKinematicMetricsSciencePort({
    software,
    qualification: {
      qualificationId: "sci4-rep-phase-kinematic-metrics-qualified",
      qualificationVersion: "1.0.0",
      oracle: { id: "sci4-analytical-rep-phase-oracle", version: "1.0.0" },
      validationData: {
        id: "sci4-synthetic-rep-phase-fixtures",
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
    const input: RepPhaseKinematicMetricsRequestInput = {
      requestId: body.requestId ?? randomUUID(),
      ...(body.observedAt === undefined ? {} : { observedAt: body.observedAt }),
      ...(body.athleteId === undefined ? {} : { athleteId: body.athleteId }),
      segmentation: body.segmentation as unknown as RepPhaseSegmentationValue,
      sci2IntervalSummaries:
        body.sci2IntervalSummaries as unknown as readonly Sci2IntervalSummaryBinding[],
      metricRequests:
        body.metricRequests as unknown as readonly RepPhaseMetricRequest[],
      inputProvenance: body.inputProvenance,
    };
    const scienceRequest = createRepPhaseKinematicMetricsRequest(input);
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

export const SCI4_HOSTED_PROCESSOR_IDENTITY = {
  processor: {
    id: REP_PHASE_KINEMATIC_METRICS_PROCESSOR_ID,
    version: REP_PHASE_KINEMATIC_METRICS_PROCESSOR_VERSION,
  },
  method: {
    id: REP_PHASE_KINEMATIC_METRICS_METHOD_ID,
    version: REP_PHASE_KINEMATIC_METRICS_METHOD_VERSION,
  },
} as const;
