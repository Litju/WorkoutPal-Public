import { ApplicationError } from "@workoutpal/application";
import {
  archiveAthleteRequestSchema,
  updateAthleteRequestSchema,
} from "../../../../../lib/contracts";
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
    const workspaceId = uuidSchema.parse(queryValue(request, "workspaceId"));
    const athlete = await getRuntime().application.getAthlete({
      ...apiRequestMetadata(request, principalId),
      workspaceId: workspaceId as never,
      athleteId: (await athleteIdFrom(context)) as never,
    });
    return response({ data: athlete }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}

export async function PATCH(
  request: Request,
  context: { readonly params: Promise<{ readonly athleteId: string }> },
): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const body = await parseJson(request, updateAthleteRequestSchema);
    const athlete = await getRuntime().application.updateAthlete({
      ...apiRequestMetadata(request, principalId),
      workspaceId: body.workspaceId as never,
      athleteId: (await athleteIdFrom(context)) as never,
      expectedVersion: body.expectedVersion,
      ...(body.displayName === undefined
        ? {}
        : { displayName: body.displayName }),
      ...(body.linkedUserId === undefined
        ? {}
        : { linkedUserId: body.linkedUserId as never }),
    });
    return response({ data: athlete }, request);
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
    const action = new URL(request.url).pathname.endsWith("/archive");
    if (!action) {
      return problemResponse(
        new ApplicationError(
          "VALIDATION_FAILED",
          "Use the archive action subresource for archival mutations.",
        ),
        request,
      );
    }
    const body = await parseJson(request, archiveAthleteRequestSchema);
    const athlete = await getRuntime().application.archiveAthlete({
      ...apiRequestMetadata(request, principalId),
      workspaceId: body.workspaceId as never,
      athleteId: (await athleteIdFrom(context)) as never,
      expectedVersion: body.expectedVersion,
    });
    return response({ data: athlete }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}
