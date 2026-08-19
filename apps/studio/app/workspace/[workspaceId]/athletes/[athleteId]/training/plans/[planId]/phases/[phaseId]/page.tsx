import { RouteScreen } from "../../../../../../../../../route-screen";

export default async function SurfacePage({
  params,
}: {
  readonly params: Promise<{
    readonly workspaceId: string;
    readonly athleteId: string;
    readonly planId: string;
    readonly phaseId: string;
  }>;
}) {
  const { workspaceId, athleteId, planId, phaseId } = await params;
  return (
    <RouteScreen
      surfaceId="TRN-04"
      workspaceId={workspaceId}
      athleteId={athleteId}
      planId={planId}
      phaseId={phaseId}
    />
  );
}
