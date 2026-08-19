import { createAssessmentProtocolRevisionRequestSchema } from "../../../../../../lib/contracts";
import {
  apiRequestMetadata,
  idempotencyKey,
  parseJson,
  problemResponse,
  queryValue,
  requirePrincipal,
  response,
  uuidSchema,
} from "../../../../../../lib/http";
import { getRuntime } from "../../../../../../lib/workoutpal";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { readonly params: Promise<{ readonly protocolId: string }> },
): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const revisions = await getRuntime().assessments.listProtocolRevisions({
      ...apiRequestMetadata(request, principalId),
      workspaceId: uuidSchema.parse(
        queryValue(request, "workspaceId"),
      ) as never,
      protocolId: uuidSchema.parse((await context.params).protocolId) as never,
    });
    return response({ data: revisions }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}

export async function POST(
  request: Request,
  context: { readonly params: Promise<{ readonly protocolId: string }> },
): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const body = await parseJson(
      request,
      createAssessmentProtocolRevisionRequestSchema,
    );
    const revision = await getRuntime().assessments.createProtocolRevision({
      ...apiRequestMetadata(request, principalId),
      workspaceId: body.workspaceId as never,
      protocolId: uuidSchema.parse((await context.params).protocolId) as never,
      name: body.name,
      ...(body.description === undefined
        ? {}
        : { description: body.description }),
      ...(body.metadata === undefined ? {} : { metadata: body.metadata }),
      expectedVersion: body.expectedVersion,
      idempotencyKey: idempotencyKey(request),
    });
    return response({ data: revision }, request, 201);
  } catch (error) {
    return problemResponse(error, request);
  }
}
