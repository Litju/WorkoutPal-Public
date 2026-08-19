import { createAssessmentMetricDefinitionRequestSchema } from "../../../../lib/contracts";
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
    const definitions = await getRuntime().assessments.listMetricDefinitions({
      ...apiRequestMetadata(request, principalId),
      workspaceId: uuidSchema.parse(
        queryValue(request, "workspaceId"),
      ) as never,
    });
    return response({ data: definitions }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const body = await parseJson(
      request,
      createAssessmentMetricDefinitionRequestSchema,
    );
    const definition = await getRuntime().assessments.createMetricDefinition({
      ...apiRequestMetadata(request, principalId),
      workspaceId: body.workspaceId as never,
      key: body.key,
      revision: body.revision,
      displayName: body.displayName,
      ...(body.description === undefined
        ? {}
        : { description: body.description }),
      ...(body.expectedDimension === undefined
        ? {}
        : { expectedDimension: body.expectedDimension }),
      ...(body.methodProtocolRevisionId === undefined
        ? {}
        : { methodProtocolRevisionId: body.methodProtocolRevisionId as never }),
      resultScope: body.resultScope,
      idempotencyKey: idempotencyKey(request),
    });
    return response({ data: definition }, request, 201);
  } catch (error) {
    return problemResponse(error, request);
  }
}
