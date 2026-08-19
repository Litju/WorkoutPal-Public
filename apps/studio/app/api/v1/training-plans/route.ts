import { createTrainingPlanRequestSchema } from "../../../../lib/contracts";
import {
  apiRequestMetadata,
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
    const plans = await getRuntime().trainingDesign.listAthleteTrainingPlans({
      ...apiRequestMetadata(request, principalId),
      workspaceId: uuidSchema.parse(
        queryValue(request, "workspaceId"),
      ) as never,
      athleteId: uuidSchema.parse(queryValue(request, "athleteId")) as never,
      includeArchived:
        new URL(request.url).searchParams.get("includeArchived") === "true",
    });
    return response({ data: plans }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const body = await parseJson(request, createTrainingPlanRequestSchema);
    const plan = await getRuntime().trainingDesign.createTrainingPlan({
      ...apiRequestMetadata(request, principalId),
      workspaceId: body.workspaceId as never,
      athleteId: body.athleteId as never,
      title: body.title,
      ...(body.description === undefined
        ? {}
        : { description: body.description }),
      startsOn: body.startsOn as never,
      endsOn: body.endsOn as never,
      timeZone: body.timeZone as never,
      ...(body.goalIds === undefined ? {} : { goalIds: body.goalIds as never }),
    });
    return response({ data: plan }, request, 201);
  } catch (error) {
    return problemResponse(error, request);
  }
}
