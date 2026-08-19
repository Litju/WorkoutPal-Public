import { archiveAthleteRequestSchema } from "../../../../../../../../lib/contracts";
import {
  apiRequestMetadata,
  idempotencyKey,
  parseJson,
  problemResponse,
  requirePrincipal,
  response,
  uuidSchema,
} from "../../../../../../../../lib/http";
import { getRuntime } from "../../../../../../../../lib/workoutpal";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { readonly params: Promise<{ readonly goalId: string }> },
): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const body = await parseJson(request, archiveAthleteRequestSchema);
    const goal = await getRuntime().trainingDesign.archiveTrainingGoal({
      ...apiRequestMetadata(request, principalId),
      workspaceId: body.workspaceId as never,
      goalId: uuidSchema.parse((await context.params).goalId) as never,
      expectedVersion: body.expectedVersion,
      idempotencyKey: idempotencyKey(request),
    });
    return response({ data: goal }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}
