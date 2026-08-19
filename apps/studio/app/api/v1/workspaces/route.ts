import { createWorkspaceRequestSchema } from "../../../../lib/contracts";
import {
  apiRequestMetadata,
  parseJson,
  problemResponse,
  requirePrincipal,
  response,
} from "../../../../lib/http";
import { getRuntime } from "../../../../lib/workoutpal";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const workspaces = await getRuntime().application.listActorWorkspaces(
      apiRequestMetadata(request, principalId),
    );
    return response({ data: workspaces }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const body = await parseJson(request, createWorkspaceRequestSchema);
    const workspace = await getRuntime().application.createWorkspace({
      ...apiRequestMetadata(request, principalId),
      name: body.name,
    });
    return response({ data: workspace }, request, 201);
  } catch (error) {
    return problemResponse(error, request);
  }
}
