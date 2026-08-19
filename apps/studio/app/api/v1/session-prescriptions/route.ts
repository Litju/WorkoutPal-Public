import { createSessionPrescriptionRequestSchema } from "../../../../lib/contracts";
import { materializePrescriptionBlocks } from "../../../../lib/f3";
import {
  apiRequestMetadata,
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
    const sessions = await getRuntime().trainingDesign.listSessionPrescriptions(
      {
        ...apiRequestMetadata(request, principalId),
        workspaceId: uuidSchema.parse(
          queryValue(request, "workspaceId"),
        ) as never,
        planId: uuidSchema.parse(queryValue(request, "planId")) as never,
        includeArchived:
          new URL(request.url).searchParams.get("includeArchived") === "true",
      },
    );
    return response({ data: sessions }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const body = await parseJson(
      request,
      createSessionPrescriptionRequestSchema,
    );
    const blocks = materializePrescriptionBlocks(body.blocks);
    const session = await getRuntime().trainingDesign.createSessionPrescription(
      {
        ...apiRequestMetadata(request, principalId),
        workspaceId: body.workspaceId as never,
        planId: body.planId as never,
        ...(body.phaseId === undefined
          ? {}
          : { phaseId: body.phaseId as never }),
        scheduledLocalDate: body.scheduledLocalDate as never,
        timeZone: body.timeZone as never,
        title: body.title,
        ...(blocks === undefined ? {} : { blocks }),
      },
    );
    return response({ data: session }, request, 201);
  } catch (error) {
    return problemResponse(error, request);
  }
}
