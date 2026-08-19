import { createTrialRequestSchema } from "../../../../../../lib/contracts";
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
  context: { readonly params: Promise<{ readonly assessmentId: string }> },
): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const body = await parseJson(request, createTrialRequestSchema);
    const trial = await getRuntime().assessments.createTrial({
      ...apiRequestMetadata(request, principalId),
      workspaceId: body.workspaceId as never,
      assessmentId: uuidSchema.parse(
        (await context.params).assessmentId,
      ) as never,
      ...(body.ordinal === undefined ? {} : { ordinal: body.ordinal }),
      ...(body.validity === undefined ? {} : { validity: body.validity }),
      ...(body.exclusion === undefined ? {} : { exclusion: body.exclusion }),
      ...(body.exclusionReason === undefined
        ? {}
        : { exclusionReason: body.exclusionReason }),
      ...(body.provenance === undefined
        ? {}
        : { provenance: body.provenance as never }),
      idempotencyKey: idempotencyKey(request),
    });
    return response({ data: trial }, request, 201);
  } catch (error) {
    return problemResponse(error, request);
  }
}
