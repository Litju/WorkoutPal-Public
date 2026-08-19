import { workspacePreferencesUpdateRequestSchema } from "../../../../../../lib/contracts";
import {
  apiRequestMetadata,
  idempotencyKey,
  parseJson,
  problemResponse,
  requirePrincipal,
  response,
  uuidSchema,
} from "../../../../../../lib/http";
import { getRuntime } from "../../../../../../lib/workoutpal";

export const dynamic = "force-dynamic";

async function workspaceIdFrom(context: {
  readonly params: Promise<{ readonly workspaceId: string }>;
}) {
  return uuidSchema.parse((await context.params).workspaceId);
}

export async function GET(
  request: Request,
  context: { readonly params: Promise<{ readonly workspaceId: string }> },
): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const preferences = await getRuntime().application.getWorkspacePreferences({
      ...apiRequestMetadata(request, principalId),
      workspaceId: (await workspaceIdFrom(context)) as never,
    });
    return response({ data: preferences }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}

export async function PATCH(
  request: Request,
  context: { readonly params: Promise<{ readonly workspaceId: string }> },
): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const body = await parseJson(
      request,
      workspacePreferencesUpdateRequestSchema,
    );
    const preferences =
      await getRuntime().application.updateWorkspacePreferences({
        ...apiRequestMetadata(request, principalId),
        workspaceId: (await workspaceIdFrom(context)) as never,
        expectedVersion: body.expectedVersion,
        ...(body.massUnit === undefined ? {} : { massUnit: body.massUnit }),
        ...(body.distanceUnit === undefined
          ? {}
          : { distanceUnit: body.distanceUnit }),
        ...(body.paceUnit === undefined ? {} : { paceUnit: body.paceUnit }),
        idempotencyKey: idempotencyKey(request),
      });
    return response({ data: preferences }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}
