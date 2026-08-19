import { updateTrainingGoalRequestSchema } from "../../../../../../../lib/contracts";
import {
  apiRequestMetadata,
  idempotencyKey,
  parseJson,
  problemResponse,
  queryValue,
  requirePrincipal,
  response,
  uuidSchema,
} from "../../../../../../../lib/http";
import { getRuntime } from "../../../../../../../lib/workoutpal";

export const dynamic = "force-dynamic";

async function goalIdFrom(context: {
  readonly params: Promise<{ readonly goalId: string }>;
}) {
  return uuidSchema.parse((await context.params).goalId);
}

export async function GET(
  request: Request,
  context: { readonly params: Promise<{ readonly goalId: string }> },
): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const goal = await getRuntime().trainingDesign.getTrainingGoal({
      ...apiRequestMetadata(request, principalId),
      workspaceId: uuidSchema.parse(
        queryValue(request, "workspaceId"),
      ) as never,
      goalId: (await goalIdFrom(context)) as never,
    });
    return response({ data: goal }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}

export async function PATCH(
  request: Request,
  context: { readonly params: Promise<{ readonly goalId: string }> },
): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const body = await parseJson(request, updateTrainingGoalRequestSchema);
    const goal = await getRuntime().trainingDesign.updateTrainingGoal({
      ...apiRequestMetadata(request, principalId),
      workspaceId: body.workspaceId as never,
      goalId: (await goalIdFrom(context)) as never,
      expectedVersion: body.expectedVersion,
      ...(body.title === undefined ? {} : { title: body.title }),
      ...(body.description === undefined
        ? {}
        : { description: body.description }),
      ...(body.targetDate === undefined
        ? {}
        : { targetDate: body.targetDate as never }),
      ...(body.startsOn === undefined
        ? {}
        : { startsOn: body.startsOn as never }),
      ...(body.endsOn === undefined ? {} : { endsOn: body.endsOn as never }),
      idempotencyKey: idempotencyKey(request),
    });
    return response({ data: goal }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}
