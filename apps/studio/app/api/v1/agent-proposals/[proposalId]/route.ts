import {
  apiRequestMetadata,
  problemResponse,
  requirePrincipal,
  response,
  uuidSchema,
} from "../../../../../lib/http";
import { getRuntime } from "../../../../../lib/workoutpal";

export const dynamic = "force-dynamic";

function workspaceIdFrom(request: Request) {
  return uuidSchema.parse(
    request.headers.get("x-workoutpal-workspace-id"),
  ) as never;
}

async function proposalIdFrom(context: {
  readonly params: Promise<{ readonly proposalId: string }>;
}) {
  return uuidSchema.parse((await context.params).proposalId) as never;
}

export async function GET(
  request: Request,
  context: { readonly params: Promise<{ readonly proposalId: string }> },
): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const proposal = await getRuntime().agentOperations.getProposal({
      ...apiRequestMetadata(request, principalId),
      workspaceId: workspaceIdFrom(request),
      proposalId: await proposalIdFrom(context),
    });
    return response({ data: proposal }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}
