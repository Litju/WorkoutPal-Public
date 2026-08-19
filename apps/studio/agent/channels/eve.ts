import { ApplicationError } from "@workoutpal/application";
import type { AuthenticatedActor } from "@workoutpal/auth-better-auth";
import { AuthenticationRequiredError } from "@workoutpal/auth-better-auth";
import type { WorkspaceId } from "@workoutpal/shared-kernel";
import { type AuthFn, ForbiddenError } from "eve/channels/auth";
import { defaultEveAuth, eveChannel } from "eve/channels/eve";
import { getRuntime, requestId } from "../../lib/workoutpal";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

const workoutPalAuth: AuthFn<Request> = async (request) => {
  let actor: AuthenticatedActor;
  try {
    actor = await getRuntime().auth.identity.requireActor(request);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return null;
    throw error;
  }

  const workspaceHeader = request.headers.get("x-workoutpal-workspace-id");
  if (workspaceHeader === null || !isUuid(workspaceHeader)) {
    throw new ForbiddenError({
      code: "workspace_scope_required",
      message: "An authorized workspace scope is required.",
    });
  }

  try {
    const access = await getRuntime().application.getActorWorkspaceAccess({
      principalId: actor.principalId,
      workspaceId: workspaceHeader as WorkspaceId,
      requestId: requestId(request),
    });
    const auth = {
      authenticator: "workoutpal-better-auth",
      issuer: "workoutpal",
      principalId: actor.principalId,
      principalType: "user",
      subject: actor.principalId,
      attributes: {
        workspaceId: access.membership.workspaceId,
        role: access.membership.role,
      },
    };
    return auth;
  } catch (error) {
    if (
      error instanceof ApplicationError &&
      (error.code === "FORBIDDEN" ||
        error.code === "NOT_FOUND" ||
        error.code === "RESOURCE_NOT_FOUND")
    ) {
      throw new ForbiddenError({
        code: "workspace_access_denied",
        message:
          "The authenticated actor is not authorized for this workspace.",
      });
    }
    throw error;
  }
};

export default eveChannel({
  // No localDev(), none(), or Vercel runtime bypass: the Studio agent is
  // authenticated through the same Better Auth session as the application.
  auth: workoutPalAuth,
  onMessage: (context) => ({ auth: defaultEveAuth(context) }),
});
