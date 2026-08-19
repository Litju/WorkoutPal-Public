import { startExecutedSessionRequestSchema } from "../../../../lib/contracts";
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
    const sessions = await getRuntime().execution.listExecutedSessions({
      ...apiRequestMetadata(request, principalId),
      workspaceId: uuidSchema.parse(
        queryValue(request, "workspaceId"),
      ) as never,
      athleteId: uuidSchema.parse(queryValue(request, "athleteId")) as never,
    });
    return response({ data: sessions }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const body = await parseJson(request, startExecutedSessionRequestSchema);
    const session = await getRuntime().execution.startExecutedSession({
      ...apiRequestMetadata(request, principalId),
      workspaceId: body.workspaceId as never,
      ...(body.prescriptionId === undefined
        ? {}
        : { prescriptionId: body.prescriptionId as never }),
      ...(body.athleteId === undefined
        ? {}
        : { athleteId: body.athleteId as never }),
      ...(body.prescriptionRevision === undefined
        ? {}
        : { prescriptionRevision: body.prescriptionRevision }),
      ...(body.timeZone === undefined
        ? {}
        : { timeZone: body.timeZone as never }),
      idempotencyKey: idempotencyKey(request),
    });
    return response({ data: session }, request, 201);
  } catch (error) {
    return problemResponse(error, request);
  }
}
