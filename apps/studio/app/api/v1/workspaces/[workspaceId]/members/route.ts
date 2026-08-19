import {
  apiRequestMetadata,
  problemResponse,
  requirePrincipal,
  response,
  uuidSchema,
} from "../../../../../../lib/http";
import { getRuntime } from "../../../../../../lib/workoutpal";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { readonly params: Promise<{ readonly workspaceId: string }> },
): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const workspaceId = uuidSchema.parse((await context.params).workspaceId);
    const members = await getRuntime().application.listWorkspaceMembers({
      ...apiRequestMetadata(request, principalId),
      workspaceId: workspaceId as never,
    });
    return response({ data: members }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}
