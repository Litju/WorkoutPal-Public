import { RouteScreen } from "../../route-screen";

export default async function SurfacePage({
  params,
}: {
  readonly params: Promise<{ readonly workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  return <RouteScreen surfaceId="GLB-01" workspaceId={workspaceId} />;
}
