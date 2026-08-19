import { createAssessmentResultRequestSchema } from "../../../../../../lib/contracts";
import {
  apiRequestMetadata,
  idempotencyKey,
  parseJson,
  problemResponse,
  requirePrincipal,
  response,
  uuidSchema,
} from "../../../../../../lib/http";
import { getRuntime } from "../../../../../../lib/workoutpal";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { readonly params: Promise<{ readonly assessmentId: string }> },
): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const body = await parseJson(request, createAssessmentResultRequestSchema);
    const result = await getRuntime().assessments.createNeutralResult({
      ...apiRequestMetadata(request, principalId),
      workspaceId: body.workspaceId as never,
      assessmentId: uuidSchema.parse(
        (await context.params).assessmentId,
      ) as never,
      ...(body.trialId === undefined ? {} : { trialId: body.trialId as never }),
      metricDefinitionId: body.metricDefinitionId as never,
      value: body.value as never,
      origin: body.origin,
      ...(body.sourceClass === undefined
        ? {}
        : { sourceClass: body.sourceClass }),
      ...(body.methodProtocolRevisionId === undefined
        ? {}
        : { methodProtocolRevisionId: body.methodProtocolRevisionId as never }),
      ...(body.provenance === undefined
        ? {}
        : { provenance: body.provenance as never }),
      ...(body.supersedesResultId === undefined
        ? {}
        : { supersedesResultId: body.supersedesResultId as never }),
      idempotencyKey: idempotencyKey(request),
    });
    return response({ data: result }, request, 201);
  } catch (error) {
    return problemResponse(error, request);
  }
}
