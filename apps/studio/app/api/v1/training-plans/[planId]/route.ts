import { updateTrainingPlanRequestSchema } from "../../../../../lib/contracts";
import {
  apiRequestMetadata,
  parseJson,
  problemResponse,
  queryValue,
  requirePrincipal,
  response,
  uuidSchema,
} from "../../../../../lib/http";
import { getRuntime } from "../../../../../lib/workoutpal";

export const dynamic = "force-dynamic";

async function planIdFrom(context: {
  readonly params: Promise<{ readonly planId: string }>;
}) {
  return uuidSchema.parse((await context.params).planId);
}

export async function GET(
  request: Request,
  context: { readonly params: Promise<{ readonly planId: string }> },
): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const details = await getRuntime().trainingDesign.getTrainingPlan({
      ...apiRequestMetadata(request, principalId),
      workspaceId: uuidSchema.parse(
        queryValue(request, "workspaceId"),
      ) as never,
      planId: (await planIdFrom(context)) as never,
    });
    return response({ data: details }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}

export async function PATCH(
  request: Request,
  context: { readonly params: Promise<{ readonly planId: string }> },
): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const body = await parseJson(request, updateTrainingPlanRequestSchema);
    const plan = await getRuntime().trainingDesign.updateTrainingPlan({
      ...apiRequestMetadata(request, principalId),
      workspaceId: body.workspaceId as never,
      planId: (await planIdFrom(context)) as never,
      expectedVersion: body.expectedVersion,
      ...(body.title === undefined ? {} : { title: body.title }),
      ...(body.description === undefined
        ? {}
        : { description: body.description }),
      ...(body.startsOn === undefined
        ? {}
        : { startsOn: body.startsOn as never }),
      ...(body.endsOn === undefined ? {} : { endsOn: body.endsOn as never }),
      ...(body.timeZone === undefined
        ? {}
        : { timeZone: body.timeZone as never }),
      ...(body.goalIds === undefined ? {} : { goalIds: body.goalIds as never }),
      ...(body.createRevision === undefined
        ? {}
        : { createRevision: body.createRevision }),
    });
    return response({ data: plan }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}
