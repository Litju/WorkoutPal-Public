import { updateSessionPrescriptionRequestSchema } from "../../../../../lib/contracts";
import { materializePrescriptionBlocks } from "../../../../../lib/f3";
import {
  apiRequestMetadata,
  parseJson,
  problemResponse,
  queryValue,
  requirePrincipal,
  response,
  uuidSchema,
} from "../../../../../lib/http";
import { getRuntime } from "../../../../../lib/workoutpal";

export const dynamic = "force-dynamic";

async function sessionIdFrom(context: {
  readonly params: Promise<{ readonly sessionId: string }>;
}) {
  return uuidSchema.parse((await context.params).sessionId);
}

export async function GET(
  request: Request,
  context: { readonly params: Promise<{ readonly sessionId: string }> },
): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const session = await getRuntime().trainingDesign.getSessionPrescription({
      ...apiRequestMetadata(request, principalId),
      workspaceId: uuidSchema.parse(
        queryValue(request, "workspaceId"),
      ) as never,
      sessionId: (await sessionIdFrom(context)) as never,
    });
    return response({ data: session }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}

export async function PATCH(
  request: Request,
  context: { readonly params: Promise<{ readonly sessionId: string }> },
): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const body = await parseJson(
      request,
      updateSessionPrescriptionRequestSchema,
    );
    const blocks = materializePrescriptionBlocks(body.blocks);
    const session = await getRuntime().trainingDesign.updateSessionPrescription(
      {
        ...apiRequestMetadata(request, principalId),
        workspaceId: body.workspaceId as never,
        sessionId: (await sessionIdFrom(context)) as never,
        expectedVersion: body.expectedVersion,
        ...(body.phaseId === undefined
          ? {}
          : { phaseId: body.phaseId as never }),
        ...(body.scheduledLocalDate === undefined
          ? {}
          : { scheduledLocalDate: body.scheduledLocalDate as never }),
        ...(body.timeZone === undefined
          ? {}
          : { timeZone: body.timeZone as never }),
        ...(body.title === undefined ? {} : { title: body.title }),
        ...(blocks === undefined ? {} : { blocks }),
        ...(body.createRevision === undefined
          ? {}
          : { createRevision: body.createRevision }),
      },
    );
    return response({ data: session }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}
