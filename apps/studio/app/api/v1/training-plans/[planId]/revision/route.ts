import { createPlanRevisionRequestSchema } from "../../../../../../lib/contracts";
import {
  apiRequestMetadata,
  parseJson,
  problemResponse,
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
    const revisions =
      await getRuntime().trainingDesign.listTrainingPlanRevisions({
        ...apiRequestMetadata(request, principalId),
        workspaceId: uuidSchema.parse(
          new URL(request.url).searchParams.get("workspaceId") ?? "",
        ) as never,
        planId: uuidSchema.parse((await context.params).planId) as never,
      });
    return response({ data: revisions }, request);
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
    const body = await parseJson(request, createPlanRevisionRequestSchema);
    const plan = await getRuntime().trainingDesign.createPlanRevision({
      ...apiRequestMetadata(request, principalId),
      workspaceId: body.workspaceId as never,
      planId: uuidSchema.parse((await context.params).planId) as never,
      expectedVersion: body.expectedVersion,
    });
    return response({ data: plan }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}
