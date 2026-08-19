import { RouteScreen } from "../../../../route-screen";

export default async function SurfacePage({
  params,
}: {
  readonly params: Promise<{
    readonly workspaceId: string;
    readonly reportId: string;
  }>;
}) {
  const { workspaceId, reportId } = await params;
  return (
    <RouteScreen
      surfaceId="RPT-03"
      workspaceId={workspaceId}
      reportId={reportId}
    />
  );
}
