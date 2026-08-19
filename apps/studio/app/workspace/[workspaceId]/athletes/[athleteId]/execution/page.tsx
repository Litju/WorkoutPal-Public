import { F4TrainingExecutionScreen } from "../../../../../f4-client";

export default async function TrainingExecutionPage({
  params,
}: {
  readonly params: Promise<{ workspaceId: string; athleteId: string }>;
}) {
  const { workspaceId, athleteId } = await params;
  return (
    <F4TrainingExecutionScreen
      workspaceId={workspaceId}
      athleteId={athleteId}
    />
  );
}
