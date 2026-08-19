import { RouteScreen } from "../../../../route-screen";

export default async function SurfacePage({
  params,
}: {
  readonly params: Promise<{ readonly workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  return <RouteScreen surfaceId="RPT-02" workspaceId={workspaceId} />;
}
