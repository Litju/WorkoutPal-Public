import { RouteScreen } from "../../../../../../../route-screen";

export default async function SurfacePage({
  params,
}: {
  readonly params: Promise<{
    readonly workspaceId: string;
    readonly athleteId: string;
    readonly sessionId: string;
  }>;
}) {
  const { workspaceId, athleteId, sessionId } = await params;
  return (
    <RouteScreen
      surfaceId="EXE-06"
      workspaceId={workspaceId}
      athleteId={athleteId}
      executionId={sessionId}
    />
  );
}
