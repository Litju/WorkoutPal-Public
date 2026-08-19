import { archiveAthleteRequestSchema } from "../../../../../../lib/contracts";
import {
  apiRequestMetadata,
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
  context: { readonly params: Promise<{ readonly sessionId: string }> },
): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const body = await parseJson(request, archiveAthleteRequestSchema);
    const session =
      await getRuntime().trainingDesign.archiveSessionPrescription({
        ...apiRequestMetadata(request, principalId),
        workspaceId: body.workspaceId as never,
        sessionId: uuidSchema.parse((await context.params).sessionId) as never,
        expectedVersion: body.expectedVersion,
      });
    return response({ data: session }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}
