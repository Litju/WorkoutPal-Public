import { workspaceSearchQuerySchema } from "../../../../lib/contracts";
import {
  apiRequestMetadata,
  problemResponse,
  requirePrincipal,
  response,
} from "../../../../lib/http";
import { getRuntime } from "../../../../lib/workoutpal";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const params = Object.fromEntries(new URL(request.url).searchParams);
    const query = workspaceSearchQuerySchema.parse(params);
    const results = await getRuntime().search.search({
      ...apiRequestMetadata(request, principalId),
      workspaceId: query.workspaceId as never,
      query: query.q,
      limit: query.limit,
    });
    return response({ data: results }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}
