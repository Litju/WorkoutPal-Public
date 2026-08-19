import { amendPerformedFactRequestSchema } from "../../../../../../lib/contracts";
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
    const body = await parseJson(request, amendPerformedFactRequestSchema);
    const review = await getRuntime().execution.amendPerformedFact({
      ...apiRequestMetadata(request, principalId),
      workspaceId: body.workspaceId as never,
      executionId: uuidSchema.parse(
        (await context.params).executionId,
      ) as never,
      expectedVersion: body.expectedVersion,
      factKind: body.factKind,
      factId: body.factId as never,
      reason: body.reason,
      correctedFields: body.correctedFields,
      idempotencyKey: idempotencyKey(request),
    });
    return response({ data: review }, request, 201);
  } catch (error) {
    return problemResponse(error, request);
  }
}
