import { createAssessmentArtifactRequestSchema } from "../../../../lib/contracts";
import {
  apiRequestMetadata,
  idempotencyKey,
  parseJson,
  problemResponse,
  requirePrincipal,
  response,
} from "../../../../lib/http";
import { getRuntime } from "../../../../lib/workoutpal";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const body = await parseJson(
      request,
      createAssessmentArtifactRequestSchema,
    );
    const artifact = await getRuntime().assessments.createSourceArtifact({
      ...apiRequestMetadata(request, principalId),
      workspaceId: body.workspaceId as never,
      storageObjectReference: body.storageObjectReference,
      mediaType: body.mediaType,
      sizeBytes: body.sizeBytes,
      checksumSha256: body.checksumSha256,
      ...(body.originalFilename === undefined
        ? {}
        : { originalFilename: body.originalFilename }),
      ...(body.sourceInformation === undefined
        ? {}
        : { sourceInformation: body.sourceInformation }),
      idempotencyKey: idempotencyKey(request),
    });
    return response({ data: artifact }, request, 201);
  } catch (error) {
    return problemResponse(error, request);
  }
}
