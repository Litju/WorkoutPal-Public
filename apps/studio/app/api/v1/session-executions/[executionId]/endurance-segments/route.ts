import { recordPerformedEnduranceSegmentRequestSchema } from "../../../../../../lib/contracts";
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
      recordPerformedEnduranceSegmentRequestSchema,
    );
    const review = await getRuntime().execution.recordPerformedEnduranceSegment(
      {
        ...apiRequestMetadata(request, principalId),
        workspaceId: body.workspaceId as never,
        executionId: uuidSchema.parse(
          (await context.params).executionId,
        ) as never,
        expectedVersion: body.expectedVersion,
        ...(body.prescriptionSegmentId === undefined
          ? {}
          : { prescriptionSegmentId: body.prescriptionSegmentId as never }),
        ...(body.observedAt === undefined
          ? {}
          : { observedAt: body.observedAt as never }),
        ...(body.modality === undefined ? {} : { modality: body.modality }),
        ...(body.durationSeconds === undefined
          ? {}
          : { durationSeconds: body.durationSeconds }),
        ...(body.distanceMeters === undefined
          ? {}
          : { distanceMeters: body.distanceMeters }),
        ...(body.averageSpeedMps === undefined
          ? {}
          : { averageSpeedMps: body.averageSpeedMps }),
        ...(body.averageHeartRateBpm === undefined
          ? {}
          : { averageHeartRateBpm: body.averageHeartRateBpm }),
        ...(body.averagePowerWatts === undefined
          ? {}
          : { averagePowerWatts: body.averagePowerWatts }),
        ...(body.rpe === undefined ? {} : { rpe: body.rpe }),
        ...(body.notes === undefined ? {} : { notes: body.notes }),
        idempotencyKey: idempotencyKey(request),
      },
    );
    return response({ data: review }, request, 201);
  } catch (error) {
    return problemResponse(error, request);
  }
}
