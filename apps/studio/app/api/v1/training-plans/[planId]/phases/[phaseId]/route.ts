import { updatePlanPhaseRequestSchema } from "../../../../../../../lib/contracts";
import {
  apiRequestMetadata,
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
  context: { readonly params: Promise<{ readonly phaseId: string }> },
): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const body = await parseJson(request, updatePlanPhaseRequestSchema);
    const phase = await getRuntime().trainingDesign.updatePlanPhase({
      ...apiRequestMetadata(request, principalId),
      workspaceId: body.workspaceId as never,
      phaseId: uuidSchema.parse((await context.params).phaseId) as never,
      expectedVersion: body.expectedVersion,
      ...(body.parentPhaseId === undefined
        ? {}
        : { parentPhaseId: body.parentPhaseId as never }),
      ...(body.ordinal === undefined ? {} : { ordinal: body.ordinal }),
      ...(body.name === undefined ? {} : { name: body.name }),
      ...(body.classification === undefined
        ? {}
        : { classification: body.classification }),
      ...(body.startsOn === undefined
        ? {}
        : { startsOn: body.startsOn as never }),
      ...(body.endsOn === undefined ? {} : { endsOn: body.endsOn as never }),
    });
    return response({ data: phase }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}
