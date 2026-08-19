import { createTrainingGoalRequestSchema } from "../../../../../../lib/contracts";
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
    const goals = await getRuntime().trainingDesign.listAthleteGoals({
      ...apiRequestMetadata(request, principalId),
      workspaceId: uuidSchema.parse(
        queryValue(request, "workspaceId"),
      ) as never,
      athleteId: (await athleteIdFrom(context)) as never,
      includeArchived:
        new URL(request.url).searchParams.get("includeArchived") === "true",
    });
    return response({ data: goals }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}

export async function POST(
  request: Request,
  context: { readonly params: Promise<{ readonly athleteId: string }> },
): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const body = await parseJson(request, createTrainingGoalRequestSchema);
    const goal = await getRuntime().trainingDesign.createTrainingGoal({
      ...apiRequestMetadata(request, principalId),
      workspaceId: body.workspaceId as never,
      athleteId: (await athleteIdFrom(context)) as never,
      title: body.title,
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
    return response({ data: goal }, request, 201);
  } catch (error) {
    return problemResponse(error, request);
  }
}
