import { publishTrainingPlanRequestSchema } from "../../../../../../lib/contracts";
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
  context: { readonly params: Promise<{ readonly planId: string }> },
): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const body = await parseJson(request, publishTrainingPlanRequestSchema);
    const plan = await getRuntime().trainingDesign.publishTrainingPlan({
      ...apiRequestMetadata(request, principalId),
      workspaceId: body.workspaceId as never,
      planId: uuidSchema.parse((await context.params).planId) as never,
      expectedVersion: body.expectedVersion,
      idempotencyKey: idempotencyKey(request),
    });
    return response({ data: plan }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}
