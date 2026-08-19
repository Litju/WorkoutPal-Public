import { AthleteDetailScreen } from "../../../../f2-client";

export default async function AthleteDetailPage({
  params,
}: {
  readonly params: Promise<{
    readonly workspaceId: string;
    readonly athleteId: string;
  }>;
}) {
  const { workspaceId, athleteId } = await params;
  return (
    <AthleteDetailScreen workspaceId={workspaceId} athleteId={athleteId} />
  );
}
