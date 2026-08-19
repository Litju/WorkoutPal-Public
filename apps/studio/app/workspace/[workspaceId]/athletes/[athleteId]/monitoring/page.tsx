import { F5MonitoringScreen } from "../../../../../f5-client";

export default async function MonitoringPage({
  params,
}: {
  readonly params: Promise<{ workspaceId: string; athleteId: string }>;
}) {
  const { workspaceId, athleteId } = await params;
  return <F5MonitoringScreen workspaceId={workspaceId} athleteId={athleteId} />;
}
