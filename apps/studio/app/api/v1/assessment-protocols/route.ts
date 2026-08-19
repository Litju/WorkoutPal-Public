import { createAssessmentProtocolRequestSchema } from "../../../../lib/contracts";
import {
  apiRequestMetadata,
  idempotencyKey,
  parseJson,
  problemResponse,
  queryValue,
  requirePrincipal,
  response,
  uuidSchema,
} from "../../../../lib/http";
import { getRuntime } from "../../../../lib/workoutpal";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const protocols = await getRuntime().assessments.listProtocols({
      ...apiRequestMetadata(request, principalId),
      workspaceId: uuidSchema.parse(
        queryValue(request, "workspaceId"),
      ) as never,
    });
    return response({ data: protocols }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const body = await parseJson(
      request,
      createAssessmentProtocolRequestSchema,
    );
    const protocol = await getRuntime().assessments.createProtocol({
      ...apiRequestMetadata(request, principalId),
      workspaceId: body.workspaceId as never,
      key: body.key,
      name: body.name,
      ...(body.description === undefined
        ? {}
        : { description: body.description }),
      idempotencyKey: idempotencyKey(request),
    });
    return response({ data: protocol }, request, 201);
  } catch (error) {
    return problemResponse(error, request);
  }
}
