import { createPlanPhaseRequestSchema } from "../../../../../../lib/contracts";
import {
  apiRequestMetadata,
  parseJson,
  problemResponse,
  queryValue,
  requirePrincipal,
  response,
  uuidSchema,
} from "../../../../../../lib/http";
import { getRuntime } from "../../../../../../lib/workoutpal";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { readonly params: Promise<{ readonly planId: string }> },
): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const phases = await getRuntime().trainingDesign.listPlanPhases({
      ...apiRequestMetadata(request, principalId),
      workspaceId: uuidSchema.parse(
        queryValue(request, "workspaceId"),
      ) as never,
      planId: uuidSchema.parse((await context.params).planId) as never,
      includeArchived:
        new URL(request.url).searchParams.get("includeArchived") === "true",
    });
    return response({ data: phases }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}

export async function POST(
  request: Request,
  context: { readonly params: Promise<{ readonly planId: string }> },
): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const body = await parseJson(request, createPlanPhaseRequestSchema);
    const phase = await getRuntime().trainingDesign.createPlanPhase({
      ...apiRequestMetadata(request, principalId),
      workspaceId: body.workspaceId as never,
      planId: uuidSchema.parse((await context.params).planId) as never,
      ...(body.parentPhaseId === undefined
        ? {}
        : { parentPhaseId: body.parentPhaseId as never }),
      ordinal: body.ordinal,
      name: body.name,
      ...(body.classification === undefined
        ? {}
        : { classification: body.classification }),
      startsOn: body.startsOn as never,
      endsOn: body.endsOn as never,
    });
    return response({ data: phase }, request, 201);
  } catch (error) {
    return problemResponse(error, request);
  }
}
