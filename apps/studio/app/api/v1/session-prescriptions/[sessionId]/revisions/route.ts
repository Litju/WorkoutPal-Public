import {
  apiRequestMetadata,
  problemResponse,
  queryValue,
  requirePrincipal,
  response,
  uuidSchema,
} from "../../../../../../lib/http";
import { getRuntime } from "../../../../../../lib/workoutpal";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { readonly params: Promise<{ readonly sessionId: string }> },
): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const revisions =
      await getRuntime().trainingDesign.listSessionPrescriptionRevisions({
        ...apiRequestMetadata(request, principalId),
        workspaceId: uuidSchema.parse(
          queryValue(request, "workspaceId"),
        ) as never,
        sessionId: uuidSchema.parse((await context.params).sessionId) as never,
      });
    return response({ data: revisions }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}
