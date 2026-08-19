import { recordPerformedStrengthSetRequestSchema } from "../../../../../../lib/contracts";
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
      recordPerformedStrengthSetRequestSchema,
    );
    const review = await getRuntime().execution.recordPerformedStrengthSet({
      ...apiRequestMetadata(request, principalId),
      workspaceId: body.workspaceId as never,
      executionId: uuidSchema.parse(
        (await context.params).executionId,
      ) as never,
      expectedVersion: body.expectedVersion,
      movementId: body.movementId as never,
      ...(body.prescriptionExerciseId === undefined
        ? {}
        : { prescriptionExerciseId: body.prescriptionExerciseId as never }),
      ...(body.prescriptionSetId === undefined
        ? {}
        : { prescriptionSetId: body.prescriptionSetId as never }),
      ...(body.observedAt === undefined
        ? {}
        : { observedAt: body.observedAt as never }),
      ...(body.repetitions === undefined
        ? {}
        : { repetitions: body.repetitions }),
      ...(body.loadKg === undefined ? {} : { loadKg: body.loadKg }),
      ...(body.rpe === undefined ? {} : { rpe: body.rpe }),
      ...(body.rir === undefined ? {} : { rir: body.rir }),
      ...(body.durationSeconds === undefined
        ? {}
        : { durationSeconds: body.durationSeconds }),
      ...(body.notes === undefined ? {} : { notes: body.notes }),
      idempotencyKey: idempotencyKey(request),
    });
    return response({ data: review }, request, 201);
  } catch (error) {
    return problemResponse(error, request);
  }
}
