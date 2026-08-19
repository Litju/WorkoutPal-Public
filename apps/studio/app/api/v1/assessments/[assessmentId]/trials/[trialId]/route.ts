import { updateTrialRequestSchema } from "../../../../../../../lib/contracts";
import {
  apiRequestMetadata,
  idempotencyKey,
  parseJson,
  problemResponse,
  requirePrincipal,
  response,
  uuidSchema,
} from "../../../../../../../lib/http";
import { getRuntime } from "../../../../../../../lib/workoutpal";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: {
    readonly params: Promise<{
      readonly assessmentId: string;
      readonly trialId: string;
    }>;
  },
): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const body = await parseJson(request, updateTrialRequestSchema);
    const params = await context.params;
    const trial = await getRuntime().assessments.updateTrial({
      ...apiRequestMetadata(request, principalId),
      workspaceId: body.workspaceId as never,
      assessmentId: uuidSchema.parse(params.assessmentId) as never,
      trialId: uuidSchema.parse(params.trialId) as never,
      expectedVersion: body.expectedVersion,
      ...(body.validity === undefined ? {} : { validity: body.validity }),
      ...(body.exclusion === undefined ? {} : { exclusion: body.exclusion }),
      ...(body.exclusionReason === undefined
        ? {}
        : { exclusionReason: body.exclusionReason }),
      idempotencyKey: idempotencyKey(request),
    });
    return response({ data: trial }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}
