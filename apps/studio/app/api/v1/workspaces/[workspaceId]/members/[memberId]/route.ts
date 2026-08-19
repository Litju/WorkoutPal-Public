import { workspaceMemberRoleUpdateRequestSchema } from "../../../../../../../lib/contracts";
import {
  apiRequestMetadata,
  idempotencyKey,
  parseJson,
  problemResponse,
  requirePrincipal,
  response,
  uuidSchema,
} from "../../../../../../../lib/http";
import { getRuntime } from "../../../../../../../lib/workoutpal";

export const dynamic = "force-dynamic";

async function idsFrom(context: {
  readonly params: Promise<{
    readonly workspaceId: string;
    readonly memberId: string;
  }>;
}) {
  const params = await context.params;
  return {
    workspaceId: uuidSchema.parse(params.workspaceId),
    memberId: uuidSchema.parse(params.memberId),
  };
}

export async function PATCH(
  request: Request,
  context: {
    readonly params: Promise<{
      readonly workspaceId: string;
      readonly memberId: string;
    }>;
  },
): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const body = await parseJson(
      request,
      workspaceMemberRoleUpdateRequestSchema,
    );
    const ids = await idsFrom(context);
    const member = await getRuntime().application.updateWorkspaceMemberRole({
      ...apiRequestMetadata(request, principalId),
      workspaceId: ids.workspaceId as never,
      memberId: ids.memberId as never,
      role: body.role,
      idempotencyKey: idempotencyKey(request),
    });
    return response({ data: member }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}

export async function DELETE(
  request: Request,
  context: {
    readonly params: Promise<{
      readonly workspaceId: string;
      readonly memberId: string;
    }>;
  },
): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const ids = await idsFrom(context);
    const member = await getRuntime().application.suspendWorkspaceMember({
      ...apiRequestMetadata(request, principalId),
      workspaceId: ids.workspaceId as never,
      memberId: ids.memberId as never,
      idempotencyKey: idempotencyKey(request),
    });
    return response({ data: member }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}
