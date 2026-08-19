import { updateMovementRequestSchema } from "../../../../../lib/contracts";
import {
  apiRequestMetadata,
  idempotencyKey,
  parseJson,
  problemResponse,
  queryValue,
  requirePrincipal,
  response,
  uuidSchema,
} from "../../../../../lib/http";
import { getRuntime } from "../../../../../lib/workoutpal";

export const dynamic = "force-dynamic";

async function movementIdFrom(context: {
  readonly params: Promise<{ readonly movementId: string }>;
}) {
  return uuidSchema.parse((await context.params).movementId);
}

export async function GET(
  request: Request,
  context: { readonly params: Promise<{ readonly movementId: string }> },
): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const movement = await getRuntime().trainingDesign.getMovement({
      ...apiRequestMetadata(request, principalId),
      workspaceId: uuidSchema.parse(
        queryValue(request, "workspaceId"),
      ) as never,
      movementId: (await movementIdFrom(context)) as never,
    });
    return response({ data: movement }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}

export async function PATCH(
  request: Request,
  context: { readonly params: Promise<{ readonly movementId: string }> },
): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const body = await parseJson(request, updateMovementRequestSchema);
    const movement = await getRuntime().trainingDesign.updateWorkspaceMovement({
      ...apiRequestMetadata(request, principalId),
      workspaceId: body.workspaceId as never,
      movementId: (await movementIdFrom(context)) as never,
      expectedVersion: body.expectedVersion,
      ...(body.canonicalName === undefined
        ? {}
        : { canonicalName: body.canonicalName }),
      ...(body.modality === undefined ? {} : { modality: body.modality }),
      ...(body.movementPattern === undefined
        ? {}
        : { movementPattern: body.movementPattern }),
      ...(body.laterality === undefined ? {} : { laterality: body.laterality }),
      ...(body.equipmentTags === undefined
        ? {}
        : { equipmentTags: body.equipmentTags }),
      idempotencyKey: idempotencyKey(request),
    });
    return response({ data: movement }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}
