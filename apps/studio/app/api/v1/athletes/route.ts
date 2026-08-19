import { createAthleteRequestSchema } from "../../../../lib/contracts";
import {
  apiRequestMetadata,
  idempotencyKey,
  parseJson,
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
    const athletes = await getRuntime().application.listAthletes({
      ...apiRequestMetadata(request, principalId),
      workspaceId: workspaceId as never,
    });
    return response({ data: athletes }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const body = await parseJson(request, createAthleteRequestSchema);
    const athlete = await getRuntime().application.createAthlete({
      ...apiRequestMetadata(request, principalId),
      workspaceId: body.workspaceId as never,
      displayName: body.displayName,
      ...(body.linkedUserId === null || body.linkedUserId === undefined
        ? {}
        : { linkedUserId: body.linkedUserId as never }),
      idempotencyKey: idempotencyKey(request),
    });
    return response({ data: athlete }, request, 201);
  } catch (error) {
    return problemResponse(error, request);
  }
}
