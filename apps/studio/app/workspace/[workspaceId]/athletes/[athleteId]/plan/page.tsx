import { F3TrainingDesignScreen } from "../../../../../f3-client";

export default async function TrainingDesignPage({
  params,
}: {
  readonly params: Promise<{ workspaceId: string; athleteId: string }>;
}) {
  const { workspaceId, athleteId } = await params;
  return (
    <F3TrainingDesignScreen workspaceId={workspaceId} athleteId={athleteId} />
  );
}
