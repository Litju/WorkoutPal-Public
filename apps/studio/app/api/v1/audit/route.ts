import {
  apiRequestMetadata,
  problemResponse,
  queryValue,
  requirePrincipal,
  response,
  uuidSchema,
} from "../../../../lib/http";
import { getRuntime } from "../../../../lib/workoutpal";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const workspaceId = uuidSchema.parse(queryValue(request, "workspaceId"));
    const aggregateIdValue = new URL(request.url).searchParams.get(
      "aggregateId",
    );
    const events = await getRuntime().application.listAudit({
      ...apiRequestMetadata(request, principalId),
      workspaceId: workspaceId as never,
      ...(aggregateIdValue === null
        ? {}
        : { aggregateId: uuidSchema.parse(aggregateIdValue) as never }),
    });
    return response({ data: events }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}
