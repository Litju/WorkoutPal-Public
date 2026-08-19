import {
  apiRequestMetadata,
  problemResponse,
  response,
  uuidSchema,
} from "../../../../../../lib/http";
import { getRuntime } from "../../../../../../lib/workoutpal";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { readonly params: Promise<{ readonly workspaceId: string }> },
): Promise<Response> {
  try {
    const actor = await getRuntime().auth.identity.requireActor(request);
    const workspaceId = uuidSchema.parse((await context.params).workspaceId);
    await getRuntime().application.getActorWorkspaceAccess({
      ...apiRequestMetadata(request, actor.principalId),
      workspaceId: workspaceId as never,
    });
    return response(
      {
        data: {
          provider: "better-auth",
          principalId: actor.principalId,
          name: actor.name,
          email: actor.email,
          currentRequestAuthenticated: true,
          sessionListingSupported: false,
          sessionRevocationSupported: false,
        },
      },
      request,
    );
  } catch (error) {
    return problemResponse(error, request);
  }
}
