import { RouteScreen } from "../../../../../route-screen";

export default async function SurfacePage({
  params,
}: {
  readonly params: Promise<{
    readonly workspaceId: string;
    readonly movementId: string;
  }>;
}) {
  const { workspaceId, movementId } = await params;
  return (
    <RouteScreen
      surfaceId="LIB-02"
      workspaceId={workspaceId}
      movementId={movementId}
    />
  );
}
