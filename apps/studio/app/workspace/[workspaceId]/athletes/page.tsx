import { AthleteListScreen } from "../../../f2-client";

export default async function AthleteListPage({
  params,
}: {
  readonly params: Promise<{ readonly workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  return <AthleteListScreen workspaceId={workspaceId} />;
}
