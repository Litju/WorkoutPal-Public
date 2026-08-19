import { monitoringWindowQuerySchema } from "../../../../../../lib/contracts";
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
  context: { readonly params: Promise<{ readonly athleteId: string }> },
): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const params = await context.params;
    const search = new URL(request.url).searchParams;
    const raw = {
      workspaceId: queryValue(request, "workspaceId"),
      startDate: queryValue(request, "startDate"),
      ...(search.get("endDate") === null
        ? {}
        : { endDate: search.get("endDate") as string }),
      timeZone: queryValue(request, "timeZone"),
    };
    const query = monitoringWindowQuerySchema.parse(raw);
    const overview = await getRuntime().monitoring.getAthleteMonitoringOverview(
      {
        ...apiRequestMetadata(request, principalId),
        workspaceId: query.workspaceId as never,
        athleteId: uuidSchema.parse(params.athleteId) as never,
        startDate: query.startDate as never,
        endDate: (query.endDate ?? query.startDate) as never,
        timeZone: query.timeZone as never,
      },
    );
    return response({ data: overview }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}
