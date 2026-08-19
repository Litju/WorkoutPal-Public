import { RouteScreen } from "../../../../../../route-screen";

export default async function SurfacePage({
  params,
}: {
  readonly params: Promise<{
    readonly workspaceId: string;
    readonly athleteId: string;
    readonly goalId: string;
  }>;
}) {
  const { workspaceId, athleteId, goalId } = await params;
  return (
    <RouteScreen
      surfaceId="ATH-06"
      workspaceId={workspaceId}
      athleteId={athleteId}
      goalId={goalId}
    />
  );
}
