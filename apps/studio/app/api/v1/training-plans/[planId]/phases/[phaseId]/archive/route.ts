import { archiveAthleteRequestSchema } from "../../../../../../../../lib/contracts";
import {
  apiRequestMetadata,
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
  context: { readonly params: Promise<{ readonly phaseId: string }> },
): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const body = await parseJson(request, archiveAthleteRequestSchema);
    const phase = await getRuntime().trainingDesign.archivePlanPhase({
      ...apiRequestMetadata(request, principalId),
      workspaceId: body.workspaceId as never,
      phaseId: uuidSchema.parse((await context.params).phaseId) as never,
      expectedVersion: body.expectedVersion,
    });
    return response({ data: phase }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}
