import {
  localDateSchema,
  timeZoneSchema,
  uuidSchema,
} from "../../../../../../../lib/contracts";
import {
  apiRequestMetadata,
  problemResponse,
  queryValue,
  requirePrincipal,
  response,
} from "../../../../../../../lib/http";
import { getRuntime } from "../../../../../../../lib/workoutpal";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { readonly params: Promise<{ readonly athleteId: string }> },
): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const params = await context.params;
    const overview = await getRuntime().monitoring.getAthleteWeekMonitoring({
      ...apiRequestMetadata(request, principalId),
      workspaceId: uuidSchema.parse(
        queryValue(request, "workspaceId"),
      ) as never,
      athleteId: uuidSchema.parse(params.athleteId) as never,
      startDate: localDateSchema.parse(
        queryValue(request, "weekStart"),
      ) as never,
      endDate: localDateSchema.parse(queryValue(request, "weekStart")) as never,
      weekStart: localDateSchema.parse(
        queryValue(request, "weekStart"),
      ) as never,
      timeZone: timeZoneSchema.parse(queryValue(request, "timeZone")) as never,
    });
    return response({ data: overview }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}
