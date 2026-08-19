import {
  apiRequestMetadata,
  problemResponse,
  queryValue,
  requirePrincipal,
  response,
  uuidSchema,
} from "../../../../../lib/http";
import { getRuntime } from "../../../../../lib/workoutpal";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { readonly params: Promise<{ readonly executionId: string }> },
): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const review = await getRuntime().execution.getExecutionReview({
      ...apiRequestMetadata(request, principalId),
      workspaceId: uuidSchema.parse(
        queryValue(request, "workspaceId"),
      ) as never,
      executionId: uuidSchema.parse(
        (await context.params).executionId,
      ) as never,
    });
    return response({ data: review }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}
