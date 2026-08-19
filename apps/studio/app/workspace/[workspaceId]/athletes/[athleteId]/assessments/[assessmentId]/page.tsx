import { RouteScreen } from "../../../../../../route-screen";

export default async function SurfacePage({
  params,
}: {
  readonly params: Promise<{
    readonly workspaceId: string;
    readonly athleteId: string;
    readonly assessmentId: string;
  }>;
}) {
  const { workspaceId, athleteId, assessmentId } = await params;
  return (
    <RouteScreen
      surfaceId="ASM-03"
      workspaceId={workspaceId}
      athleteId={athleteId}
      assessmentId={assessmentId}
    />
  );
}
