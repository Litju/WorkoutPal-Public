import { createMovementRequestSchema } from "../../../../lib/contracts";
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
    const movements = await getRuntime().trainingDesign.listVisibleMovements({
      ...apiRequestMetadata(request, principalId),
      workspaceId: workspaceId as never,
      includeArchived:
        new URL(request.url).searchParams.get("includeArchived") === "true",
    });
    return response({ data: movements }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const body = await parseJson(request, createMovementRequestSchema);
    const movement = await getRuntime().trainingDesign.createWorkspaceMovement({
      ...apiRequestMetadata(request, principalId),
      workspaceId: body.workspaceId as never,
      canonicalName: body.canonicalName,
      modality: body.modality,
      ...(body.movementPattern === undefined
        ? {}
        : { movementPattern: body.movementPattern }),
      ...(body.laterality === undefined ? {} : { laterality: body.laterality }),
      ...(body.equipmentTags === undefined
        ? {}
        : { equipmentTags: body.equipmentTags }),
      idempotencyKey: idempotencyKey(request),
    });
    return response({ data: movement }, request, 201);
  } catch (error) {
    return problemResponse(error, request);
  }
}
