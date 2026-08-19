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
    const date = localDateSchema.parse(queryValue(request, "date"));
    const overview = await getRuntime().monitoring.getAthleteDayMonitoring({
      ...apiRequestMetadata(request, principalId),
      workspaceId: uuidSchema.parse(
        queryValue(request, "workspaceId"),
      ) as never,
      athleteId: uuidSchema.parse(params.athleteId) as never,
      date: date as never,
      startDate: date as never,
      endDate: date as never,
      timeZone: timeZoneSchema.parse(queryValue(request, "timeZone")) as never,
    });
    return response({ data: overview }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}
