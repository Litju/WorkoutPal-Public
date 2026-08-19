import { completeExecutedSessionRequestSchema } from "../../../../../../lib/contracts";
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

export async function POST(
  request: Request,
  context: { readonly params: Promise<{ readonly executionId: string }> },
): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const body = await parseJson(request, completeExecutedSessionRequestSchema);
    const review = await getRuntime().execution.completeExecutedSession({
      ...apiRequestMetadata(request, principalId),
      workspaceId: body.workspaceId as never,
      executionId: uuidSchema.parse(
        (await context.params).executionId,
      ) as never,
      expectedVersion: body.expectedVersion,
      idempotencyKey: idempotencyKey(request),
    });
    return response({ data: review }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}
