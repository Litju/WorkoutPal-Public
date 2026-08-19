import { RouteScreen } from "../../../../../../../route-screen";

export default async function SurfacePage({
  params,
}: {
  readonly params: Promise<{
    readonly workspaceId: string;
    readonly athleteId: string;
    readonly planId: string;
  }>;
}) {
  const { workspaceId, athleteId, planId } = await params;
  return (
    <RouteScreen
      surfaceId="TRN-03"
      workspaceId={workspaceId}
      athleteId={athleteId}
      planId={planId}
    />
  );
}
