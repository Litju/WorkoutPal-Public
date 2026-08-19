import { z } from "zod";
import {
  apiRequestMetadata,
  problemResponse,
  requirePrincipal,
  response,
} from "../../../../../lib/http";
import { getRuntime } from "../../../../../lib/workoutpal";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { readonly params: Promise<{ readonly workspaceId: string }> },
): Promise<Response> {
  try {
    const { workspaceId } = await context.params;
    const parsedWorkspaceId = z.string().uuid().parse(workspaceId);
    const principalId = await requirePrincipal(request);
    const workspace = await getRuntime().application.getWorkspace({
      ...apiRequestMetadata(request, principalId),
      workspaceId: parsedWorkspaceId as never,
    });
    return response({ data: workspace }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}
