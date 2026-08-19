import { createAssessmentRequestSchema } from "../../../../lib/contracts";
import {
  apiRequestMetadata,
  idempotencyKey,
  parseJson,
  problemResponse,
  queryValue,
  requirePrincipal,
  response,
  uuidSchema,
} from "../../../../lib/http";
import { getRuntime } from "../../../../lib/workoutpal";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const assessments = await getRuntime().assessments.listAssessments({
      ...apiRequestMetadata(request, principalId),
      workspaceId: uuidSchema.parse(
        queryValue(request, "workspaceId"),
      ) as never,
      athleteId: uuidSchema.parse(queryValue(request, "athleteId")) as never,
    });
    return response({ data: assessments }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const body = await parseJson(request, createAssessmentRequestSchema);
    const assessment = await getRuntime().assessments.createAssessment({
      ...apiRequestMetadata(request, principalId),
      workspaceId: body.workspaceId as never,
      athleteId: body.athleteId as never,
      assessmentType: body.assessmentType,
      ...(body.purpose === undefined ? {} : { purpose: body.purpose }),
      occurrenceDate: body.occurrenceDate as never,
      ...(body.assessmentOccurredAt === undefined
        ? {}
        : { assessmentOccurredAt: body.assessmentOccurredAt as never }),
      timeZone: body.timeZone as never,
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
      idempotencyKey: idempotencyKey(request),
    });
    return response({ data: assessment }, request, 201);
  } catch (error) {
    return problemResponse(error, request);
  }
}
