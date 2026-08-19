import { recordPerformedMobilityItemRequestSchema } from "../../../../../../lib/contracts";
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
      recordPerformedMobilityItemRequestSchema,
    );
    const review = await getRuntime().execution.recordPerformedMobilityItem({
      ...apiRequestMetadata(request, principalId),
      workspaceId: body.workspaceId as never,
      executionId: uuidSchema.parse(
        (await context.params).executionId,
      ) as never,
      expectedVersion: body.expectedVersion,
      movementId: body.movementId as never,
      ...(body.prescriptionItemId === undefined
        ? {}
        : { prescriptionItemId: body.prescriptionItemId as never }),
      ...(body.observedAt === undefined
        ? {}
        : { observedAt: body.observedAt as never }),
      ...(body.sets === undefined ? {} : { sets: body.sets }),
      ...(body.repetitions === undefined
        ? {}
        : { repetitions: body.repetitions }),
      ...(body.durationSeconds === undefined
        ? {}
        : { durationSeconds: body.durationSeconds }),
      ...(body.side === undefined ? {} : { side: body.side }),
      ...(body.rpe === undefined ? {} : { rpe: body.rpe }),
      ...(body.notes === undefined ? {} : { notes: body.notes }),
      idempotencyKey: idempotencyKey(request),
    });
    return response({ data: review }, request, 201);
  } catch (error) {
    return problemResponse(error, request);
  }
}
