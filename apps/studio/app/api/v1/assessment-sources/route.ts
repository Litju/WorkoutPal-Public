import { createAssessmentSourceRequestSchema } from "../../../../lib/contracts";
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
    const sources = await getRuntime().assessments.listAcquisitionSources({
      ...apiRequestMetadata(request, principalId),
      workspaceId: uuidSchema.parse(
        queryValue(request, "workspaceId"),
      ) as never,
    });
    return response({ data: sources }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const body = await parseJson(request, createAssessmentSourceRequestSchema);
    const source = await getRuntime().assessments.createAcquisitionSource({
      ...apiRequestMetadata(request, principalId),
      workspaceId: body.workspaceId as never,
      sourceClass: body.sourceClass,
      label: body.label,
      ...(body.manufacturer === undefined
        ? {}
        : { manufacturer: body.manufacturer }),
      ...(body.model === undefined ? {} : { model: body.model }),
      ...(body.serialNumber === undefined
        ? {}
        : { serialNumber: body.serialNumber }),
      ...(body.firmwareVersion === undefined
        ? {}
        : { firmwareVersion: body.firmwareVersion }),
      ...(body.softwareVersion === undefined
        ? {}
        : { softwareVersion: body.softwareVersion }),
      ...(body.configurationMetadata === undefined
        ? {}
        : { configurationMetadata: body.configurationMetadata }),
      idempotencyKey: idempotencyKey(request),
    });
    return response({ data: source }, request, 201);
  } catch (error) {
    return problemResponse(error, request);
  }
}
