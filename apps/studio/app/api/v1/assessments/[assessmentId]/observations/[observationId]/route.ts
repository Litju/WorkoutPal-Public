import { amendAssessmentObservationRequestSchema } from "../../../../../../../lib/contracts";
import {
  apiRequestMetadata,
  idempotencyKey,
  parseJson,
  problemResponse,
  requirePrincipal,
  response,
  uuidSchema,
} from "../../../../../../../lib/http";
import { getRuntime } from "../../../../../../../lib/workoutpal";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: {
    readonly params: Promise<{
      readonly assessmentId: string;
      readonly observationId: string;
    }>;
  },
): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const body = await parseJson(
      request,
      amendAssessmentObservationRequestSchema,
    );
    const params = await context.params;
    const observation = await getRuntime().assessments.amendRawObservation({
      ...apiRequestMetadata(request, principalId),
      workspaceId: body.workspaceId as never,
      assessmentId: uuidSchema.parse(params.assessmentId) as never,
      observationId: uuidSchema.parse(params.observationId) as never,
      value: body.value as never,
      ...(body.observedAt === undefined
        ? {}
        : { observedAt: body.observedAt as never }),
      reason: body.reason,
      ...(body.metadata === undefined ? {} : { metadata: body.metadata }),
      idempotencyKey: idempotencyKey(request),
    });
    return response({ data: observation }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}
