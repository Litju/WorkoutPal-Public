import { archiveAthleteRequestSchema } from "../../../../../../lib/contracts";
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
  context: { readonly params: Promise<{ readonly movementId: string }> },
): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const body = await parseJson(request, archiveAthleteRequestSchema);
    const movement = await getRuntime().trainingDesign.archiveWorkspaceMovement(
      {
        ...apiRequestMetadata(request, principalId),
        workspaceId: body.workspaceId as never,
        movementId: uuidSchema.parse(
          (await context.params).movementId,
        ) as never,
        expectedVersion: body.expectedVersion,
        idempotencyKey: idempotencyKey(request),
      },
    );
    return response({ data: movement }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}
