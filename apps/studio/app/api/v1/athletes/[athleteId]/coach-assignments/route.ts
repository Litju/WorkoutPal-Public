import { coachAssignmentRequestSchema } from "../../../../../../lib/contracts";
import {
  apiRequestMetadata,
  parseJson,
  problemResponse,
  queryValue,
  requirePrincipal,
  response,
  uuidSchema,
} from "../../../../../../lib/http";
import { getRuntime } from "../../../../../../lib/workoutpal";

export const dynamic = "force-dynamic";

async function athleteIdFrom(context: {
  readonly params: Promise<{ readonly athleteId: string }>;
}) {
  const { athleteId } = await context.params;
  return uuidSchema.parse(athleteId);
}

export async function GET(
  request: Request,
  context: { readonly params: Promise<{ readonly athleteId: string }> },
): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const assignments = await getRuntime().application.listCoachAssignments({
      ...apiRequestMetadata(request, principalId),
      workspaceId: uuidSchema.parse(
        queryValue(request, "workspaceId"),
      ) as never,
      athleteId: (await athleteIdFrom(context)) as never,
    });
    return response({ data: assignments }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}

export async function POST(
  request: Request,
  context: { readonly params: Promise<{ readonly athleteId: string }> },
): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const body = await parseJson(request, coachAssignmentRequestSchema);
    const assignment = await getRuntime().application.assignCoach({
      ...apiRequestMetadata(request, principalId),
      workspaceId: body.workspaceId as never,
      athleteId: (await athleteIdFrom(context)) as never,
      coachPrincipalId: body.coachPrincipalId as never,
    });
    return response({ data: assignment }, request, 201);
  } catch (error) {
    return problemResponse(error, request);
  }
}

export async function DELETE(
  request: Request,
  context: { readonly params: Promise<{ readonly athleteId: string }> },
): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const body = await parseJson(request, coachAssignmentRequestSchema);
    await getRuntime().application.removeCoachAssignment({
      ...apiRequestMetadata(request, principalId),
      workspaceId: body.workspaceId as never,
      athleteId: (await athleteIdFrom(context)) as never,
      coachPrincipalId: body.coachPrincipalId as never,
    });
    return response({ data: null }, request, 200);
  } catch (error) {
    return problemResponse(error, request);
  }
}
