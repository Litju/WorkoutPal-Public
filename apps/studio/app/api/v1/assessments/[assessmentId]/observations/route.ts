import { createAssessmentObservationRequestSchema } from "../../../../../../lib/contracts";
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
    const body = await parseJson(
      request,
      createAssessmentObservationRequestSchema,
    );
    const observation = await getRuntime().assessments.createRawObservation({
      ...apiRequestMetadata(request, principalId),
      workspaceId: body.workspaceId as never,
      assessmentId: uuidSchema.parse(
        (await context.params).assessmentId,
      ) as never,
      trialId: body.trialId as never,
      observationKey: body.observationKey,
      value: body.value as never,
      ...(body.observedAt === undefined
        ? {}
        : { observedAt: body.observedAt as never }),
      ...(body.provenance === undefined
        ? {}
        : { provenance: body.provenance as never }),
      ...(body.metadata === undefined ? {} : { metadata: body.metadata }),
      idempotencyKey: idempotencyKey(request),
    });
    return response({ data: observation }, request, 201);
  } catch (error) {
    return problemResponse(error, request);
  }
}
