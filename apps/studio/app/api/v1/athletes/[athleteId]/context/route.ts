import { updateAthleteTrainingContextRequestSchema } from "../../../../../../lib/contracts";
import {
  apiRequestMetadata,
  idempotencyKey,
  parseJson,
  problemResponse,
  queryValue,
  requirePrincipal,
  response,
  uuidSchema,
} from "../../../../../../lib/http";
import { getRuntime } from "../../../../../../lib/workoutpal";

export const dynamic = "force-dynamic";

async function athleteIdFrom(context: {
  readonly params: Promise<{ readonly athleteId: string }>;
}) {
  return uuidSchema.parse((await context.params).athleteId);
}

export async function GET(
  request: Request,
  context: { readonly params: Promise<{ readonly athleteId: string }> },
): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const contextRecord =
      await getRuntime().application.getAthleteTrainingContext({
        ...apiRequestMetadata(request, principalId),
        workspaceId: uuidSchema.parse(
          queryValue(request, "workspaceId"),
        ) as never,
        athleteId: (await athleteIdFrom(context)) as never,
      });
    return response({ data: contextRecord }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}

export async function PATCH(
  request: Request,
  context: { readonly params: Promise<{ readonly athleteId: string }> },
): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const body = await parseJson(
      request,
      updateAthleteTrainingContextRequestSchema,
    );
    const contextRecord =
      await getRuntime().application.updateAthleteTrainingContext({
        ...apiRequestMetadata(request, principalId),
        workspaceId: body.workspaceId as never,
        athleteId: (await athleteIdFrom(context)) as never,
        expectedVersion: body.expectedVersion,
        ...(body.trainingAgeMonths === undefined
          ? {}
          : { trainingAgeMonths: body.trainingAgeMonths }),
        ...(body.availabilityNotes === undefined
          ? {}
          : { availabilityNotes: body.availabilityNotes }),
        ...(body.operationalConstraints === undefined
          ? {}
          : { operationalConstraints: body.operationalConstraints }),
        ...(body.equipmentAccess === undefined
          ? {}
          : { equipmentAccess: body.equipmentAccess }),
        ...(body.trainingPreferences === undefined
          ? {}
          : { trainingPreferences: body.trainingPreferences }),
        ...(body.practitionerNotes === undefined
          ? {}
          : { practitionerNotes: body.practitionerNotes }),
        idempotencyKey: idempotencyKey(request),
      });
    return response({ data: contextRecord }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}
