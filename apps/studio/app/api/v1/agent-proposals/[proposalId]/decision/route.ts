import { ApplicationError } from "@workoutpal/application";
import { agentProposalDecisionRequestSchema } from "../../../../../../lib/contracts";
import {
  apiRequestMetadata,
  parseJson,
  problemResponse,
  requirePrincipal,
  response,
  uuidSchema,
} from "../../../../../../lib/http";
import { getRuntime } from "../../../../../../lib/workoutpal";

export const dynamic = "force-dynamic";

function workspaceIdFrom(request: Request) {
  return uuidSchema.parse(
    request.headers.get("x-workoutpal-workspace-id"),
  ) as never;
}

function agentSessionIdFrom(request: Request): string {
  const value = request.headers.get("x-workoutpal-agent-session-id")?.trim();
  if (value === undefined || value.length === 0 || value.length > 200) {
    throw new ApplicationError(
      "VALIDATION_FAILED",
      "The Eve agent session identity is required.",
    );
  }
  return value;
}

async function proposalIdFrom(context: {
  readonly params: Promise<{ readonly proposalId: string }>;
}) {
  return uuidSchema.parse((await context.params).proposalId) as never;
}

export async function POST(
  request: Request,
  context: { readonly params: Promise<{ readonly proposalId: string }> },
): Promise<Response> {
  try {
    const principalId = await requirePrincipal(request);
    const body = await parseJson(request, agentProposalDecisionRequestSchema);
    const workspaceId = workspaceIdFrom(request);
    const agentSessionId = agentSessionIdFrom(request);
    const proposal = await getRuntime().agentOperations.decideProposal({
      ...apiRequestMetadata(request, principalId),
      workspaceId,
      proposalId: await proposalIdFrom(context),
      decision: body.decision,
      proposalDigest: body.proposalDigest,
      ...(body.approvalRequestId === undefined
        ? {}
        : { approvalRequestId: body.approvalRequestId }),
      agentSessionId,
    });
    console.info("workoutpal.agent.approval.decision", {
      workspaceId,
      principalId,
      agentSessionId,
      proposalId: proposal.proposalId,
      operationKind: proposal.operationKind,
      decision: body.decision,
      proposalStatus: proposal.status,
      ...(body.approvalRequestId === undefined
        ? {}
        : { approvalRequestId: body.approvalRequestId }),
    });
    return response({ data: proposal }, request);
  } catch (error) {
    return problemResponse(error, request);
  }
}
