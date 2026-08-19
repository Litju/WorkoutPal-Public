import { updateAssessmentRequestSchema } from "../../../../../lib/contracts";
import {
  apiRequestMetadata,
  idempotencyKey,
  parseJson,
  problemResponse,
  queryValue,
  requirePrincipal,
  response,
  uuidSchema,
} from "../../../../../lib/http";
import { getRuntime } from "../../../../../lib/workoutpal";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { readonly params: Promise<{ readonly assessmentId: string }> },
): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const details = await getRuntime().assessments.getAssessment({
      ...apiRequestMetadata(request, principalId),
      workspaceId: uuidSchema.parse(
        queryValue(request, "workspaceId"),
      ) as never,
      athleteId: uuidSchema.parse(queryValue(request, "athleteId")) as never,
      assessmentId: uuidSchema.parse(
        (await context.params).assessmentId,
      ) as never,
    });
    return response({ data: details }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}

export async function PATCH(
  request: Request,
  context: { readonly params: Promise<{ readonly assessmentId: string }> },
): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const body = await parseJson(request, updateAssessmentRequestSchema);
    const assessment = await getRuntime().assessments.updateAssessment({
      ...apiRequestMetadata(request, principalId),
      workspaceId: body.workspaceId as never,
      assessmentId: uuidSchema.parse(
        (await context.params).assessmentId,
      ) as never,
      expectedVersion: body.expectedVersion,
      ...(body.assessmentType === undefined
        ? {}
        : { assessmentType: body.assessmentType }),
      ...(body.purpose === undefined ? {} : { purpose: body.purpose }),
      ...(body.occurrenceDate === undefined
        ? {}
        : { occurrenceDate: body.occurrenceDate as never }),
      ...(body.assessmentOccurredAt === undefined
        ? {}
        : { assessmentOccurredAt: body.assessmentOccurredAt as never }),
      ...(body.timeZone === undefined
        ? {}
        : { timeZone: body.timeZone as never }),
      ...(body.protocolRevisionId === undefined
        ? {}
        : { protocolRevisionId: body.protocolRevisionId as never }),
      ...(body.sourceId === undefined
        ? {}
        : { sourceId: body.sourceId as never }),
      ...(body.sourceVersion === undefined
        ? {}
        : { sourceVersion: body.sourceVersion }),
      ...(body.artifactIds === undefined
        ? {}
        : { artifactIds: body.artifactIds as never }),
      ...(body.notes === undefined ? {} : { notes: body.notes }),
      ...(body.reason === undefined ? {} : { reason: body.reason }),
      idempotencyKey: idempotencyKey(request),
    });
    return response({ data: assessment }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}
