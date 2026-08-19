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
      surfaceId="TRN-12"
      workspaceId={workspaceId}
      athleteId={athleteId}
    />
  );
}
