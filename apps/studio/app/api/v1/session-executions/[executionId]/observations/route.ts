import { recordSessionObservationRequestSchema } from "../../../../../../lib/contracts";
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
    const body = await parseJson(
      request,
      recordSessionObservationRequestSchema,
    );
    const review = await getRuntime().execution.recordSessionObservation({
      ...apiRequestMetadata(request, principalId),
      workspaceId: body.workspaceId as never,
      executionId: uuidSchema.parse(
        (await context.params).executionId,
      ) as never,
      expectedVersion: body.expectedVersion,
      ...(body.observedAt === undefined
        ? {}
        : { observedAt: body.observedAt as never }),
      kind: body.kind,
      ...(body.valueText === undefined ? {} : { valueText: body.valueText }),
      ...(body.valueNumber === undefined
        ? {}
        : { valueNumber: body.valueNumber }),
      ...(body.unit === undefined ? {} : { unit: body.unit }),
      ...(body.notes === undefined ? {} : { notes: body.notes }),
      idempotencyKey: idempotencyKey(request),
    });
    return response({ data: review }, request, 201);
  } catch (error) {
    return problemResponse(error, request);
  }
}
