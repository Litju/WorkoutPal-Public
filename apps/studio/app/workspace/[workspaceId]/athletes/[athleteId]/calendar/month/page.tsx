import { RouteScreen } from "../../../../../../route-screen";

export default async function SurfacePage({
  params,
}: {
  readonly params: Promise<{
    readonly workspaceId: string;
    readonly athleteId: string;
  }>;
}) {
  const { workspaceId, athleteId } = await params;
  return (
    <RouteScreen
      surfaceId="TRN-06"
      workspaceId={workspaceId}
      athleteId={athleteId}
    />
  );
}
