"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { FactualTable } from "@/components/workoutpal/factual-table";
import {
  SurfaceInspector,
  type SurfaceViewSettings,
} from "@/components/workoutpal/surface-inspector";
import type { RouteContext } from "./route-context";
import {
  AppShell,
  BackendGap,
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  Icon,
  LoadingState,
  Metric,
  PageHeader,
  SectionHeader,
  StatusBadge,
  Surface,
  Timeline,
} from "./studio-ui";

interface Workspace {
  readonly id: string;
  readonly name: string;
  readonly createdAt?: string;
}

interface ProtocolRevisionRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly protocolId: string;
  readonly revision: number;
  readonly name: string;
  readonly description: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
  readonly createdBy: string;
}

interface ProtocolRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: "ACTIVE" | "RETIRED";
  readonly currentRevision: number;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly updatedAt: string;
  readonly updatedBy: string;
  readonly version: number;
}

type AssessmentSourceClass =
  | "MANUAL_ENTRY"
  | "DEVICE_CAPTURE"
  | "IMPORT"
  | "SYSTEM_DERIVED_NEUTRAL";

interface AcquisitionSourceRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly sourceClass: AssessmentSourceClass;
  readonly label: string;
  readonly manufacturer: string | null;
  readonly model: string | null;
  readonly serialNumber: string | null;
  readonly firmwareVersion: string | null;
  readonly softwareVersion: string | null;
  readonly configurationMetadata: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly updatedAt: string;
  readonly updatedBy: string;
  readonly version: number;
}

interface AssessmentRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly athleteId: string;
  readonly assessmentType: string;
  readonly purpose: string | null;
  readonly status: "DRAFT" | "RECORDED" | "AMENDED" | "ARCHIVED";
  readonly occurrenceDate: string;
  readonly occurredAt: string | null;
  readonly timeZone: string;
  readonly protocolRevision: ProtocolRevisionRecord | null;
  readonly source: AcquisitionSourceRecord | null;
  readonly sourceVersion: number | null;
  readonly artifactIds: readonly string[];
  readonly notes: string | null;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly updatedAt: string;
  readonly updatedBy: string;
  readonly version: number;
}

interface TrialRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly assessmentId: string;
  readonly ordinal: number;
  readonly status: "RECORDED" | "AMENDED" | "ARCHIVED";
  readonly validity: "UNASSESSED" | "VALID" | "INVALID";
  readonly exclusion: "INCLUDED" | "EXCLUDED";
  readonly exclusionReason: string | null;
  readonly provenance: EvidenceLineageRecord;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly updatedAt: string;
  readonly updatedBy: string;
  readonly version: number;
}

interface EvidenceLineageRecord {
  readonly sourceClass: AssessmentSourceClass;
  readonly sourceReference: string | null;
  readonly sourceId: string | null;
  readonly sourceArtifactIds: readonly string[];
  readonly protocolRevision: {
    readonly protocolId: string;
    readonly revisionId: string;
    readonly revision: number;
  } | null;
  readonly origin: "HUMAN" | "DEVICE" | "SYSTEM";
  readonly actorId: string | null;
  readonly capturedAt: string | null;
  readonly ingestedAt: string;
  readonly createdAt: string;
  readonly parentEvidenceIds: readonly string[];
  readonly supersedesEvidenceId: string | null;
}

interface QuantityRecord {
  readonly value: number;
  readonly unit: string;
  readonly dimension: string;
}

type EvidenceValueRecord =
  | { readonly kind: "PRESENT"; readonly value: QuantityRecord }
  | {
      readonly kind: "MISSING";
      readonly reason:
        | "NOT_RECORDED"
        | "NOT_APPLICABLE"
        | "INVALID"
        | "EXCLUDED"
        | "UNKNOWN";
    };

interface ObservationRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly assessmentId: string;
  readonly trialId: string;
  readonly observationKey: string;
  readonly value: EvidenceValueRecord;
  readonly observedAt: string | null;
  readonly provenance: EvidenceLineageRecord;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly supersedesObservationId: string | null;
  readonly recordedAt: string;
  readonly recordedBy: string;
}

interface MetricDefinitionRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly key: string;
  readonly revision: number;
  readonly displayName: string;
  readonly description: string | null;
  readonly expectedDimension: string | null;
  readonly methodProtocolRevision: ProtocolRevisionRecord | null;
  readonly resultScope: "ASSESSMENT" | "TRIAL";
  readonly createdAt: string;
  readonly createdBy: string;
}

interface NeutralResultRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly assessmentId: string;
  readonly trialId: string | null;
  readonly metricDefinition: MetricDefinitionRecord;
  readonly value: EvidenceValueRecord;
  readonly origin: "MANUAL" | "MEASURED" | "IMPORTED" | "DERIVED_NEUTRAL";
  readonly sourceClass: AssessmentSourceClass;
  readonly methodProtocolRevision: ProtocolRevisionRecord | null;
  readonly provenance: EvidenceLineageRecord;
  readonly recordedAt: string;
  readonly recordedBy: string;
  readonly supersedesResultId: string | null;
}

interface AssessmentAmendmentRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly assessmentId: string;
  readonly targetType: "ASSESSMENT" | "TRIAL" | "OBSERVATION" | "RESULT";
  readonly targetId: string;
  readonly reason: string;
  readonly originalState: Readonly<Record<string, unknown>>;
  readonly correctedFields: Readonly<Record<string, unknown>>;
  readonly supersedesAmendmentId: string | null;
  readonly occurredAt: string;
  readonly actorId: string;
}

interface AssessmentDetailsRecord {
  readonly assessment: AssessmentRecord;
  readonly trials: readonly TrialRecord[];
  readonly observations: readonly ObservationRecord[];
  readonly results: readonly NeutralResultRecord[];
  readonly amendments: readonly AssessmentAmendmentRecord[];
}

interface Athlete {
  readonly id: string;
  readonly displayName: string;
  readonly linkedUserId?: string | null;
  readonly archivedAt?: string | null;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly version: number;
  readonly assignedCoachCount?: number;
}

interface AthleteTrainingContext {
  readonly trainingAgeMonths: number | null;
  readonly availabilityNotes: string | null;
  readonly operationalConstraints: string | null;
  readonly equipmentAccess: readonly string[];
  readonly trainingPreferences: string | null;
  readonly practitionerNotes: string | null;
  readonly version: number;
}

interface Goal {
  readonly id: string;
  readonly title: string;
  readonly description?: string | null;
  readonly targetDate?: string | null;
  readonly startsOn?: string | null;
  readonly endsOn?: string | null;
  readonly version: number;
  readonly archivedAt?: string | null;
}

interface Movement {
  readonly id: string;
  readonly canonicalName: string;
  readonly modality: "strength" | "endurance" | "mobility" | "general";
  readonly scope: "global" | "workspace";
  readonly archivedAt: string | null;
  readonly version: number;
  readonly movementPattern?: string | null;
  readonly laterality?: string | null;
  readonly equipmentTags?: readonly string[];
}

interface Plan {
  readonly id: string;
  readonly title: string;
  readonly description?: string | null;
  readonly startsOn?: string;
  readonly endsOn?: string;
  readonly timeZone?: string;
  readonly status: "draft" | "published" | "archived";
  readonly version: number;
  readonly publishedRevision: number | null;
}

interface AuditEvent {
  readonly id: string;
  readonly occurredAt: string;
  readonly action: string;
  readonly aggregateId?: string | null;
  readonly requestId?: string;
}

interface WorkspaceMember {
  readonly id: string;
  readonly principalId: string;
  readonly role: "owner" | "coach" | "athlete" | "viewer";
  readonly status: "active" | "suspended";
  readonly displayName: string | null;
  readonly email: string | null;
}

interface WorkspacePreferences {
  readonly id: string;
  readonly massUnit: "kg" | "lb";
  readonly distanceUnit: "m" | "km" | "mi";
  readonly paceUnit: "per-km" | "per-mi";
  readonly version: number;
}

interface WorkspaceSecurity {
  readonly provider: string;
  readonly principalId: string;
  readonly name: string;
  readonly email: string;
  readonly currentRequestAuthenticated: boolean;
  readonly sessionListingSupported: boolean;
  readonly sessionRevocationSupported: boolean;
}

interface WorkspaceSearchResult {
  readonly kind:
    | "athlete"
    | "goal"
    | "movement"
    | "plan"
    | "session"
    | "execution";
  readonly id: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly athleteId: string | null;
  readonly parentId: string | null;
  readonly archivedAt: string | null;
}

interface SurfaceData {
  readonly workspace: Workspace;
  readonly athlete: Athlete | null;
  readonly athleteContext: AthleteTrainingContext | null;
  readonly athletes: readonly Athlete[];
  readonly goals: readonly Goal[];
  readonly goal: Goal | null;
  readonly movements: readonly Movement[];
  readonly movement: Movement | null;
  readonly plans: readonly Plan[];
  readonly audit: readonly AuditEvent[];
  readonly members: readonly WorkspaceMember[];
  readonly preferences: WorkspacePreferences | null;
  readonly security: WorkspaceSecurity | null;
  readonly assessments: readonly AssessmentRecord[];
  readonly assessment: AssessmentDetailsRecord | null;
  readonly assessmentProtocols: readonly ProtocolRecord[];
  readonly assessmentProtocolRevisions: readonly ProtocolRevisionRecord[];
  readonly assessmentSources: readonly AcquisitionSourceRecord[];
  readonly assessmentMetricDefinitions: readonly MetricDefinitionRecord[];
}

type DataState =
  | { readonly status: "loading"; readonly data: null }
  | { readonly status: "ready"; readonly data: SurfaceData }
  | {
      readonly status: "unauthorized";
      readonly data: null;
      readonly message: string;
    }
  | { readonly status: "error"; readonly data: null; readonly message: string };

class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function requestData<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, { ...init, cache: "no-store" });
  const payload = (await response.json().catch(() => null)) as
    | { readonly data?: T; readonly title?: string; readonly message?: string }
    | T
    | null;
  if (!response.ok) {
    const message =
      payload !== null && typeof payload === "object" && "title" in payload
        ? payload.title
        : payload !== null &&
            typeof payload === "object" &&
            "message" in payload
          ? payload.message
          : "The request could not be completed.";
    throw new ApiError(
      response.status,
      message ?? "The request could not be completed.",
    );
  }
  if (payload !== null && typeof payload === "object" && "data" in payload) {
    return payload.data as T;
  }
  return payload as T;
}

function encode(value: string): string {
  return encodeURIComponent(value);
}

function athleteHref(
  workspaceId: string,
  athleteId: string,
  suffix = "",
): string {
  return `/workspace/${workspaceId}/athletes/${athleteId}${suffix}`;
}

function capabilityTone(capability: string) {
  if (capability === "REAL_CONNECTED" || capability === "REAL_MUTATION")
    return "success" as const;
  if (capability === "REAL_READ_ONLY") return "info" as const;
  if (
    capability === "SCIENCE_CONTRACT_REQUIRED" ||
    capability === "BACKEND_GAP"
  )
    return "warning" as const;
  return "neutral" as const;
}

function CapabilityStrip({
  capability,
  note,
}: {
  readonly capability: string;
  readonly note: string;
}) {
  return (
    <div className="wp-capability-strip">
      <StatusBadge tone={capabilityTone(capability)}>{capability}</StatusBadge>
      <span>{note}</span>
    </div>
  );
}

function useSurfaceData({
  surfaceId,
  workspaceId,
  athleteId,
  goalId,
  movementId,
  assessmentId,
  refreshNonce,
}: {
  readonly surfaceId: string;
  readonly workspaceId: string;
  readonly athleteId: string | undefined;
  readonly goalId: string | undefined;
  readonly movementId: string | undefined;
  readonly assessmentId: string | undefined;
  readonly refreshNonce: number;
}): DataState {
  const [state, setState] = useState<DataState>({
    status: "loading",
    data: null,
  });
  const needsAthletes = ["GLB-01", "GLB-02", "GLB-03"].includes(surfaceId);
  const needsAthleteContext = surfaceId === "ATH-04";
  const needsGoals = surfaceId === "ATH-05" || surfaceId === "ATH-06";
  const needsMovements =
    surfaceId === "LIB-01" || surfaceId === "LIB-02" || surfaceId === "GLB-03";
  const needsPlans = surfaceId.startsWith("TRN-") || surfaceId === "GLB-03";
  const needsAudit =
    surfaceId === "GLB-01" || surfaceId === "GLB-02" || surfaceId === "HIS-01";
  const needsMembers = surfaceId === "SET-02";
  const needsPreferences = surfaceId === "SET-03";
  const needsSecurity = surfaceId === "SET-04";
  const needsAssessments = surfaceId.startsWith("ASM-");
  const needsAssessmentDetail =
    (surfaceId === "ASM-03" || surfaceId === "ASM-04") &&
    assessmentId !== undefined;

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading", data: null });
    async function load() {
      try {
        const workspace = await requestData<Workspace>(
          `/api/v1/workspaces/${encode(workspaceId)}`,
        );
        const athlete =
          athleteId === undefined
            ? null
            : await requestData<Athlete>(
                `/api/v1/athletes/${encode(athleteId)}?workspaceId=${encode(workspaceId)}`,
              );
        const athleteContext =
          needsAthleteContext && athleteId !== undefined
            ? await requestData<AthleteTrainingContext | null>(
                `/api/v1/athletes/${encode(athleteId)}/context?workspaceId=${encode(workspaceId)}`,
              )
            : null;
        const athletes = needsAthletes
          ? await requestData<readonly Athlete[]>(
              `/api/v1/athletes?workspaceId=${encode(workspaceId)}`,
            )
          : [];
        const goals =
          needsGoals && athleteId !== undefined
            ? await requestData<readonly Goal[]>(
                `/api/v1/athletes/${encode(athleteId)}/goals?workspaceId=${encode(workspaceId)}`,
              )
            : [];
        const goal =
          needsGoals && athleteId !== undefined && goalId !== undefined
            ? await requestData<Goal>(
                `/api/v1/athletes/${encode(athleteId)}/goals/${encode(goalId)}?workspaceId=${encode(workspaceId)}`,
              )
            : null;
        const movements = needsMovements
          ? await requestData<readonly Movement[]>(
              `/api/v1/movements?workspaceId=${encode(workspaceId)}`,
            )
          : [];
        const movement =
          needsMovements && movementId !== undefined
            ? await requestData<Movement>(
                `/api/v1/movements/${encode(movementId)}?workspaceId=${encode(workspaceId)}`,
              )
            : null;
        const plans =
          needsPlans && athleteId !== undefined
            ? await requestData<readonly Plan[]>(
                `/api/v1/training-plans?workspaceId=${encode(workspaceId)}&athleteId=${encode(athleteId)}`,
              )
            : [];
        const audit = needsAudit
          ? await requestData<readonly AuditEvent[]>(
              `/api/v1/audit?workspaceId=${encode(workspaceId)}`,
            )
          : [];
        const members = needsMembers
          ? await requestData<readonly WorkspaceMember[]>(
              `/api/v1/workspaces/${encode(workspaceId)}/members`,
            )
          : [];
        const preferences = needsPreferences
          ? await requestData<WorkspacePreferences | null>(
              `/api/v1/workspaces/${encode(workspaceId)}/preferences`,
            )
          : null;
        const security = needsSecurity
          ? await requestData<WorkspaceSecurity>(
              `/api/v1/workspaces/${encode(workspaceId)}/security`,
            )
          : null;
        const assessments =
          needsAssessments && athleteId !== undefined
            ? await requestData<readonly AssessmentRecord[]>(
                `/api/v1/assessments?workspaceId=${encode(workspaceId)}&athleteId=${encode(athleteId)}&refresh=${refreshNonce}`,
              )
            : [];
        const assessmentProtocols = needsAssessments
          ? await requestData<readonly ProtocolRecord[]>(
              `/api/v1/assessment-protocols?workspaceId=${encode(workspaceId)}`,
            )
          : [];
        const assessmentProtocolRevisions = needsAssessments
          ? (
              await Promise.all(
                assessmentProtocols.map((protocol) =>
                  requestData<readonly ProtocolRevisionRecord[]>(
                    `/api/v1/assessment-protocols/${encode(protocol.id)}/revisions?workspaceId=${encode(workspaceId)}`,
                  ),
                ),
              )
            ).flat()
          : [];
        const assessmentSources = needsAssessments
          ? await requestData<readonly AcquisitionSourceRecord[]>(
              `/api/v1/assessment-sources?workspaceId=${encode(workspaceId)}`,
            )
          : [];
        const assessmentMetricDefinitions = needsAssessments
          ? await requestData<readonly MetricDefinitionRecord[]>(
              `/api/v1/assessment-metric-definitions?workspaceId=${encode(workspaceId)}`,
            )
          : [];
        const assessment =
          needsAssessmentDetail && assessmentId !== undefined
            ? await requestData<AssessmentDetailsRecord>(
                `/api/v1/assessments/${encode(assessmentId)}?workspaceId=${encode(workspaceId)}&athleteId=${encode(athleteId ?? "")}&refresh=${refreshNonce}`,
              )
            : null;
        if (!cancelled) {
          setState({
            status: "ready",
            data: {
              workspace,
              athlete,
              athleteContext,
              athletes,
              goals,
              goal,
              movements,
              movement,
              plans,
              audit,
              members,
              preferences,
              security,
              assessments,
              assessment,
              assessmentProtocols,
              assessmentProtocolRevisions,
              assessmentSources,
              assessmentMetricDefinitions,
            },
          });
        }
      } catch (error) {
        if (cancelled) return;
        if (
          error instanceof ApiError &&
          (error.status === 401 || error.status === 403)
        ) {
          setState({
            status: "unauthorized",
            data: null,
            message: error.message,
          });
        } else {
          setState({
            status: "error",
            data: null,
            message:
              error instanceof Error
                ? error.message
                : "The workspace data could not be loaded.",
          });
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [
    athleteId,
    goalId,
    movementId,
    assessmentId,
    refreshNonce,
    needsAthletes,
    needsAthleteContext,
    needsAudit,
    needsGoals,
    needsMovements,
    needsPlans,
    needsMembers,
    needsPreferences,
    needsSecurity,
    needsAssessments,
    needsAssessmentDetail,
    workspaceId,
  ]);

  return state;
}

interface SurfaceMeta {
  readonly area: string;
  readonly title: string;
  readonly description: string;
  readonly priority: "P0" | "P1" | "P2";
  readonly state: string;
  readonly science: "NO" | "SCIENCE_PLACEHOLDERS";
  readonly capability: string;
  readonly capabilityNote: string;
}

function metaFor(surfaceId: string): SurfaceMeta {
  const training: SurfaceMeta = {
    area: "Training",
    title: "Training workspace",
    description:
      "Build the prescription from plan to phase to session without losing revision context.",
    priority: "P0",
    state: "READY",
    science: "NO",
    capability: "REAL_CONNECTED",
    capabilityNote: "Training design uses the existing F3 application path.",
  };
  const execution: SurfaceMeta = {
    area: "Execution",
    title: "Execution workspace",
    description:
      "Record performed facts against the immutable prescription snapshot.",
    priority: "P0",
    state: "READY",
    science: "NO",
    capability: "REAL_CONNECTED",
    capabilityNote:
      "Execution and amendment writes use the existing F4 application path.",
  };
  const scienceTraining: SurfaceMeta = {
    ...training,
    science: "SCIENCE_PLACEHOLDERS",
    capability: "SCIENCE_CONTRACT_REQUIRED",
    capabilityNote:
      "Endurance prescription values remain explicit placeholders until scientific authority qualifies the interpretation.",
  };
  const scienceExecution: SurfaceMeta = {
    ...execution,
    science: "SCIENCE_PLACEHOLDERS",
    capability: "SCIENCE_CONTRACT_REQUIRED",
    capabilityNote:
      "Endurance execution records remain factual; no unsupported physiological interpretation is generated.",
  };
  const monitoring: SurfaceMeta = {
    area: "Monitoring",
    title: "Monitoring workspace",
    description:
      "Compare what was prescribed, what was performed, and what is effectively recorded.",
    priority: "P0",
    state: "READY",
    science: "SCIENCE_PLACEHOLDERS",
    capability: "REAL_READ_ONLY",
    capabilityNote:
      "The monitoring layer remains factual; unsupported interpretation stays explicit.",
  };
  if (surfaceId === "GLB-01")
    return {
      area: "Global",
      title: "Today",
      description:
        "A factual command center for current workspace attention and recorded work.",
      priority: "P0",
      state: "READY",
      science: "NO",
      capability: "REAL_CONNECTED",
      capabilityNote:
        "Workspace, athlete, and audit data are loaded from the connected application paths.",
    };
  if (surfaceId === "GLB-02")
    return {
      area: "Global",
      title: "Attention center",
      description:
        "Review recorded operational events that may need a practitioner decision.",
      priority: "P1",
      state: "READY",
      science: "NO",
      capability: "REAL_READ_ONLY",
      capabilityNote:
        "Attention items are derived from factual audit events; no readiness judgment is generated.",
    };
  if (surfaceId === "GLB-03")
    return {
      area: "Global",
      title: "Global search",
      description:
        "Find athletes, plans, and movements across the current workspace.",
      priority: "P1",
      state: "READY",
      science: "NO",
      capability: "REAL_READ_ONLY",
      capabilityNote: "Search runs against connected workspace-scoped records.",
    };
  if (surfaceId === "ATH-02")
    return {
      area: "Athletes",
      title: "New athlete",
      description:
        "Create a workspace-scoped athlete profile. A login is optional.",
      priority: "P0",
      state: "READY",
      science: "NO",
      capability: "REAL_MUTATION",
      capabilityNote:
        "The create action uses the authenticated F2 application path.",
    };
  if (surfaceId === "ATH-04")
    return {
      area: "Athletes",
      title: "Profile & constraints",
      description:
        "Keep athlete identity and supported profile fields compact, current, and auditable.",
      priority: "P1",
      state: "READY",
      science: "NO",
      capability: "REAL_MUTATION",
      capabilityNote:
        "Display-name edits use optimistic version checks through F2.",
    };
  if (surfaceId === "ATH-05")
    return {
      area: "Athletes",
      title: "Goals",
      description:
        "Track the athlete’s stated training goals without turning them into invented scores.",
      priority: "P1",
      state: "READY",
      science: "NO",
      capability: "REAL_MUTATION",
      capabilityNote:
        "Goal creation and reads use the connected F3 application path.",
    };
  if (surfaceId === "ATH-06")
    return {
      area: "Athletes",
      title: "Goal detail",
      description:
        "Inspect one goal’s dates, description, version, and archive state.",
      priority: "P1",
      state: "READY",
      science: "NO",
      capability: "REAL_MUTATION",
      capabilityNote: "Goal updates remain version-aware and workspace-scoped.",
    };
  if (surfaceId === "TRN-09") return scienceTraining;
  if (surfaceId === "EXE-03") return scienceExecution;
  if (surfaceId.startsWith("TRN-")) return training;
  if (surfaceId.startsWith("EXE-")) return execution;
  if (surfaceId.startsWith("MON-")) return monitoring;
  if (surfaceId.startsWith("ASM-"))
    return {
      area: "Assessments",
      title: "Assessment workspace",
      description:
        "Record protocol context, ordered trials, raw evidence, units, and provenance without interpretation.",
      priority: surfaceId === "ASM-01" || surfaceId === "ASM-03" ? "P0" : "P1",
      state: "READY",
      science: "NO",
      capability:
        surfaceId === "ASM-01" || surfaceId === "ASM-03"
          ? "REAL_CONNECTED"
          : "REAL_MUTATION",
      capabilityNote:
        "Assessment context, trials, raw observations, and neutral results use the connected workspace-scoped persistence path; no interpretation is generated.",
    };
  if (surfaceId.startsWith("LIB-"))
    return {
      area: "Library",
      title: "Movement library",
      description:
        "Search and maintain the movement vocabulary used by prescription builders.",
      priority: "P1",
      state: "READY",
      science: "NO",
      capability: "REAL_MUTATION",
      capabilityNote:
        "Workspace movement records use the connected F3 application path.",
    };
  if (surfaceId.startsWith("RPT-"))
    return {
      area: "Reports",
      title: "Reports",
      description:
        "Configure evidence-backed report views without masking provenance or unsupported science.",
      priority: "P1",
      state: "READY",
      science: "SCIENCE_PLACEHOLDERS",
      capability: "BACKEND_GAP",
      capabilityNote:
        "Report persistence and export are not available in the current application slice.",
    };
  if (surfaceId === "HIS-01")
    return {
      area: "History",
      title: "History & audit",
      description:
        "Review a human-usable chronology of manual and governed Agent activity.",
      priority: "P0",
      state: "READY",
      science: "NO",
      capability: "REAL_READ_ONLY",
      capabilityNote:
        "Audit events are read from the append-only application record.",
    };
  if (surfaceId.startsWith("SET-"))
    return {
      area: "Settings",
      title: "Workspace settings",
      description:
        "Review workspace access, preferences, and security without hiding which controls are not connected yet.",
      priority: "P1",
      state: "READY",
      science: "NO",
      capability: "REAL_READ_ONLY",
      capabilityNote:
        "Workspace identity is connected; member, preference, and session mutations are explicit gaps.",
    };
  return {
    area: "Workspace",
    title: "Workspace surface",
    description: "A structured WorkoutPal operating surface.",
    priority: "P1",
    state: "READY",
    science: "NO",
    capability: "REAL_READ_ONLY",
    capabilityNote:
      "Connected records remain visibly distinct from capability gaps.",
  };
}

function HeaderBadges({ meta }: { readonly meta: SurfaceMeta }) {
  return [
    <StatusBadge
      key="state"
      tone={meta.state === "READY" ? "success" : "warning"}
    >
      {meta.state}
    </StatusBadge>,
    <StatusBadge key="priority">{meta.priority}</StatusBadge>,
    <StatusBadge
      key="science"
      tone={meta.science === "NO" ? "neutral" : "warning"}
    >
      {meta.science}
    </StatusBadge>,
  ];
}

function SurfaceNavigator({
  athleteId,
  surfaceId,
  workspaceId,
}: {
  readonly athleteId: string | undefined;
  readonly surfaceId: string;
  readonly workspaceId: string;
}) {
  const workspaceBase = `/workspace/${workspaceId}`;
  const athleteBase =
    athleteId === undefined
      ? undefined
      : `${workspaceBase}/athletes/${athleteId}`;
  const items =
    athleteBase === undefined
      ? [
          {
            label: "Today",
            href: workspaceBase,
            active: surfaceId === "GLB-01",
          },
          {
            label: "Attention",
            href: `${workspaceBase}/attention`,
            active: surfaceId === "GLB-02",
          },
          {
            label: "Search",
            href: `${workspaceBase}/search`,
            active: surfaceId === "GLB-03",
          },
          {
            label: "Athletes",
            href: `${workspaceBase}/athletes`,
            active: surfaceId.startsWith("ATH-"),
          },
          {
            label: "Library",
            href: `${workspaceBase}/library/movements`,
            active: surfaceId.startsWith("LIB-"),
          },
          {
            label: "Reports",
            href: `${workspaceBase}/reports`,
            active: surfaceId.startsWith("RPT-"),
          },
        ]
      : [
          {
            label: "Overview",
            href: athleteBase,
            active: surfaceId === "ATH-03",
          },
          {
            label: "Profile",
            href: `${athleteBase}/profile`,
            active: surfaceId === "ATH-04",
          },
          {
            label: "Goals",
            href: `${athleteBase}/goals`,
            active: surfaceId.startsWith("ATH-05") || surfaceId === "ATH-06",
          },
          {
            label: "Design",
            href: `${athleteBase}/training`,
            active: surfaceId.startsWith("TRN-"),
          },
          {
            label: "Execution",
            href: `${athleteBase}/execution`,
            active: surfaceId.startsWith("EXE-"),
          },
          {
            label: "Monitoring",
            href: `${athleteBase}/monitoring`,
            active: surfaceId.startsWith("MON-"),
          },
          {
            label: "Assessments",
            href: `${athleteBase}/assessments`,
            active: surfaceId.startsWith("ASM-"),
          },
        ];
  return (
    <nav aria-label="Surface workbench" className="wp-surface-navigator">
      <span className="wp-surface-navigator-label">Workbench</span>
      <div className="wp-surface-navigator-links">
        {items.map((item) => (
          <a
            aria-current={item.active ? "page" : undefined}
            className={`wp-surface-navigator-link ${item.active ? "is-active" : ""}`}
            href={item.href}
            key={item.label}
          >
            {item.label}
          </a>
        ))}
      </div>
      <span className="wp-surface-navigator-id">{surfaceId}</span>
    </nav>
  );
}

function PageNotes({
  surfaceId,
  meta,
}: {
  readonly surfaceId: string;
  readonly meta: SurfaceMeta;
}) {
  const [viewSettings, setViewSettings] = useState<SurfaceViewSettings>({
    density: "comfortable",
    showProvenance: true,
  });
  const notesClassName = `wp-page-notes ${viewSettings.density === "compact" ? "is-compact" : ""}`;
  return (
    <Surface className={notesClassName}>
      <span className="wp-overline">Implementation contract</span>
      <div className="wp-page-notes-row">
        {viewSettings.showProvenance ? (
          <div className="wp-page-notes-grid">
            <span>
              <strong>Screen</strong>
              {surfaceId}
            </span>
            <span>
              <strong>Capability</strong>
              {meta.capability}
            </span>
            <span>
              <strong>Agent</strong>Persistent dock
            </span>
            <span>
              <strong>Authority</strong>Manual path remains available
            </span>
          </div>
        ) : (
          <p className="wp-component-note">
            Provenance notes hidden for this local view; stored records and
            authorization are unchanged.
          </p>
        )}
        <SurfaceInspector onApply={setViewSettings} surfaceId={surfaceId} />
      </div>
    </Surface>
  );
}

function TodaySurface({
  data,
  workspaceId,
}: {
  readonly data: SurfaceData;
  readonly workspaceId: string;
}) {
  const router = useRouter();
  const recordedEvents = data.audit.slice(0, 6);
  return (
    <div className="wp-surface-stack">
      <CapabilityStrip
        capability="REAL_CONNECTED"
        note="Workspace and athlete facts are current application data."
      />
      <div className="wp-metric-grid">
        <Metric
          label="Athletes"
          value={String(data.athletes.length)}
          detail="Active workspace roster"
          tone="info"
        />
        <Metric
          label="Recorded events"
          value={String(data.audit.length)}
          detail="Append-only audit facts"
        />
        <Metric
          label="Attention"
          value="Review"
          detail="Open the factual attention surface"
          tone="warning"
        />
        <Metric
          label="Agent"
          value="Ready"
          detail="Read-grounded, approval-gated"
          tone="success"
        />
      </div>
      <div className="wp-dashboard-grid">
        <Surface className="wp-dashboard-main">
          <SectionHeader
            title="Operational queue"
            description="Current workspace facts that may need a practitioner decision."
            action={
              <Button
                onClick={() =>
                  router.push(`/workspace/${workspaceId}/attention`)
                }
                variant="secondary"
              >
                Open attention
              </Button>
            }
          />
          {recordedEvents.length === 0 ? (
            <EmptyState
              icon="flag"
              title="No recorded attention items"
              description="No audit events are available for this workspace yet. This surface will stay factual as work is recorded."
            />
          ) : (
            <Timeline
              events={recordedEvents.map((event) => ({
                title: event.action,
                detail:
                  event.aggregateId === null || event.aggregateId === undefined
                    ? "Workspace event"
                    : `Aggregate ${event.aggregateId.slice(0, 8)}…`,
                time: new Date(event.occurredAt).toLocaleString(),
                tone: "info" as const,
              }))}
            />
          )}
        </Surface>
        <Surface className="wp-dashboard-rail">
          <SectionHeader
            title="Workspace context"
            description="Scope before action."
          />
          <dl className="wp-detail-list">
            <div>
              <dt>Workspace</dt>
              <dd>{data.workspace.name}</dd>
            </div>
            <div>
              <dt>Roster boundary</dt>
              <dd>{data.athletes.length} active athletes</dd>
            </div>
            <div>
              <dt>Science layer</dt>
              <dd>Not inferred here</dd>
            </div>
            <div>
              <dt>Authorization</dt>
              <dd>Server-derived</dd>
            </div>
          </dl>
        </Surface>
      </div>
      <Surface className="wp-factual-table-surface">
        <SectionHeader
          title="Recent stored events"
          description="Sortable stored audit facts; larger result sets use a virtualized viewport."
        />
        <FactualTable
          caption="Recent stored workspace events"
          rows={recordedEvents.map((event) => ({
            detail: new Date(event.occurredAt).toLocaleString(),
            label: event.action,
            status: "Recorded",
            value: event.aggregateId ?? "Workspace event",
          }))}
        />
      </Surface>
    </div>
  );
}

function AttentionSurface({
  data,
  workspaceId,
}: {
  readonly data: SurfaceData;
  readonly workspaceId: string;
}) {
  const router = useRouter();
  return (
    <div className="wp-surface-stack">
      <CapabilityStrip
        capability="REAL_READ_ONLY"
        note="Attention is grounded in recorded audit events, not readiness or fatigue inference."
      />
      <Surface>
        <SectionHeader
          title="Recorded attention"
          description="Open a source record to decide the next manual action."
        />
        {data.audit.length === 0 ? (
          <EmptyState
            icon="flag"
            title="Nothing needs review yet"
            description="The workspace has no audit events available for attention review."
          />
        ) : (
          <DataTable
            caption="Workspace attention events"
            columns={["Event", "Recorded", "Source", "Action"]}
            rows={data.audit.map((event) => [
              <strong key="event">{event.action}</strong>,
              new Date(event.occurredAt).toLocaleString(),
              event.aggregateId === null || event.aggregateId === undefined
                ? "Workspace"
                : `${event.aggregateId.slice(0, 12)}…`,
              <Button
                key="action"
                onClick={() => router.push(`/workspace/${workspaceId}/history`)}
                variant="quiet"
              >
                Open history
              </Button>,
            ])}
            empty={null}
          />
        )}
      </Surface>
    </div>
  );
}

function SearchSurface({ workspaceId }: { readonly workspaceId: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<readonly WorkspaceSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const normalized = query.trim().toLowerCase();
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void requestData<readonly WorkspaceSearchResult[]>(
        `/api/v1/search?workspaceId=${encode(workspaceId)}&q=${encode(query)}&limit=50`,
        { signal: controller.signal },
      )
        .then(setResults)
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === "AbortError")
            return;
          setError(
            cause instanceof Error
              ? cause.message
              : "Workspace search could not be loaded.",
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, workspaceId]);

  function hrefFor(result: WorkspaceSearchResult): string {
    if (result.kind === "athlete") return athleteHref(workspaceId, result.id);
    if (result.kind === "movement")
      return `/workspace/${workspaceId}/library/movements/${result.id}`;
    if (result.athleteId === null) return `/workspace/${workspaceId}/athletes`;
    if (result.kind === "goal")
      return athleteHref(workspaceId, result.athleteId, `/goals/${result.id}`);
    if (result.kind === "plan")
      return athleteHref(
        workspaceId,
        result.athleteId,
        `/training/plans/${result.id}`,
      );
    if (result.kind === "session")
      return athleteHref(
        workspaceId,
        result.athleteId,
        `/training/sessions/${result.id}`,
      );
    return athleteHref(
      workspaceId,
      result.athleteId,
      `/execution/${result.id}`,
    );
  }
  return (
    <div className="wp-surface-stack">
      <CapabilityStrip
        capability="REAL_READ_ONLY"
        note="Results are limited to records visible in the authenticated workspace."
      />
      <Surface>
        <label className="wp-field">
          <span>Search workspace records</span>
          <div className="wp-input-with-icon">
            <Icon name="search" size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Athlete, plan, or movement"
            />
          </div>
        </label>
      </Surface>
      <Surface>
        <SectionHeader
          title={
            normalized.length === 0
              ? "Recent records"
              : `${results.length} matching records`
          }
          description="Results are returned by the authenticated workspace search endpoint and capped at 50 records."
        />
        {error !== null ? (
          <div className="wp-inline-error" role="alert">
            {error}
          </div>
        ) : loading ? (
          <LoadingState />
        ) : results.length === 0 ? (
          <EmptyState
            icon="search"
            title="No matching records"
            description="Try an athlete, goal, plan, session, execution, or movement from this workspace."
          />
        ) : (
          <ul className="wp-result-list">
            {results.map((result) => (
              <li key={`${result.kind}-${result.id}`}>
                <a href={hrefFor(result)}>
                  <span className="wp-result-type">{result.kind}</span>
                  <strong>{result.title}</strong>
                  {result.subtitle === null ? null : (
                    <small>{result.subtitle}</small>
                  )}
                  <Icon name="arrow-right" size={16} />
                </a>
              </li>
            ))}
          </ul>
        )}
      </Surface>
    </div>
  );
}

function NewAthleteSurface({
  workspaceId,
  onboarding = false,
}: {
  readonly workspaceId: string;
  readonly onboarding?: boolean;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const athlete = await requestData<Athlete>("/api/v1/athletes", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({ workspaceId, displayName }),
      });
      router.push(athleteHref(workspaceId, athlete.id));
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "The athlete could not be created.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="wp-form-layout">
      <Surface className="wp-form-panel">
        <div className="wp-form-intro">
          <span className="wp-state-icon">
            <Icon name="users" size={22} />
          </span>
          <div>
            <span className="wp-overline">
              {onboarding ? "First athlete" : "Athlete registry"}
            </span>
            <h2>
              {onboarding
                ? "Create the first profile"
                : "Create an athlete profile"}
            </h2>
            <p>
              The profile can exist before the athlete has a WorkoutPal login.
            </p>
          </div>
        </div>
        {error === null ? null : (
          <div className="wp-inline-error" role="alert">
            {error}
          </div>
        )}
        <form className="wp-form" onSubmit={(event) => void submit(event)}>
          <label className="wp-field">
            <span>Display name</span>
            <input
              id="display-name"
              maxLength={120}
              minLength={2}
              onChange={(event) => setDisplayName(event.target.value)}
              required
              value={displayName}
            />
          </label>
          <div className="wp-form-actions">
            <Button disabled={busy} type="submit" variant="primary">
              {busy ? "Creating…" : "Create athlete"}
            </Button>
            <a
              className="wp-button wp-button-quiet"
              href={`/workspace/${workspaceId}/athletes`}
            >
              Cancel
            </a>
          </div>
        </form>
      </Surface>
      <Surface className="wp-form-side">
        <SectionHeader
          title="What is recorded"
          description="Identity is separate from authentication."
        />
        <ul className="wp-check-list">
          <li>
            <Icon name="check" size={16} />
            Workspace scope and creator
          </li>
          <li>
            <Icon name="check" size={16} />
            Versioned display name
          </li>
          <li>
            <Icon name="check" size={16} />
            Optional linked user identity
          </li>
          <li>
            <Icon name="check" size={16} />
            Audit evidence for the mutation
          </li>
        </ul>
      </Surface>
    </div>
  );
}

function AthleteProfileSurface({
  data,
  workspaceId,
}: {
  readonly data: SurfaceData;
  readonly workspaceId: string;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(
    data.athlete?.displayName ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const context = data.athleteContext;
  const [trainingAgeMonths, setTrainingAgeMonths] = useState(
    context?.trainingAgeMonths === null ||
      context?.trainingAgeMonths === undefined
      ? ""
      : String(context.trainingAgeMonths),
  );
  const [availabilityNotes, setAvailabilityNotes] = useState(
    context?.availabilityNotes ?? "",
  );
  const [operationalConstraints, setOperationalConstraints] = useState(
    context?.operationalConstraints ?? "",
  );
  const [equipmentAccess, setEquipmentAccess] = useState(
    context?.equipmentAccess.join(", ") ?? "",
  );
  const [trainingPreferences, setTrainingPreferences] = useState(
    context?.trainingPreferences ?? "",
  );
  const [practitionerNotes, setPractitionerNotes] = useState(
    context?.practitionerNotes ?? "",
  );
  const athlete = data.athlete;
  if (athlete === null)
    return (
      <EmptyState
        icon="users"
        title="Athlete not found"
        description="The athlete may be archived, outside this workspace, or no longer available."
      />
    );
  const currentAthlete = athlete;
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      await requestData<Athlete>(
        `/api/v1/athletes/${encode(currentAthlete.id)}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "idempotency-key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            workspaceId,
            expectedVersion: currentAthlete.version,
            displayName,
          }),
        },
      );
      await requestData<AthleteTrainingContext>(
        `/api/v1/athletes/${encode(currentAthlete.id)}/context`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "idempotency-key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            workspaceId,
            expectedVersion: context?.version ?? 0,
            trainingAgeMonths:
              trainingAgeMonths.trim().length === 0
                ? null
                : Number(trainingAgeMonths),
            availabilityNotes,
            operationalConstraints,
            equipmentAccess: equipmentAccess
              .split(",")
              .map((value) => value.trim())
              .filter((value) => value.length > 0),
            trainingPreferences,
            practitionerNotes,
          }),
        },
      );
      router.refresh();
      setNotice("Profile saved. The version-aware update was accepted.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "The profile could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="wp-surface-stack">
      <CapabilityStrip
        capability="REAL_MUTATION"
        note="Edits use the authenticated F2 application path and optimistic version checks."
      />
      <div className="wp-two-column">
        <Surface className="wp-form-panel">
          <SectionHeader
            title="Identity"
            description="The minimum profile surface stays explicit and auditable."
          />
          {notice === null ? null : (
            <div className="wp-inline-success" role="status">
              {notice}
            </div>
          )}
          {error === null ? null : (
            <div className="wp-inline-error" role="alert">
              {error}
            </div>
          )}
          <form className="wp-form" onSubmit={(event) => void save(event)}>
            <label className="wp-field">
              <span>Display name</span>
              <input
                aria-describedby="profile-version"
                id="profile-display-name"
                onChange={(event) => setDisplayName(event.target.value)}
                required
                value={displayName}
              />
            </label>
            <span className="wp-helper" id="profile-version">
              Current record version: v{currentAthlete.version}
            </span>
            <div className="wp-form-actions">
              <Button disabled={busy} type="submit" variant="primary">
                {busy ? "Saving…" : "Save profile"}
              </Button>
              <a
                className="wp-button wp-button-secondary"
                href={athleteHref(workspaceId, currentAthlete.id)}
              >
                Back to overview
              </a>
            </div>
          </form>
        </Surface>
        <Surface>
          <SectionHeader
            title="Training context"
            description="Operational context is stored separately from identity and remains descriptive."
          />
          <form className="wp-form" onSubmit={(event) => void save(event)}>
            <label className="wp-field">
              <span>Training age (months)</span>
              <input
                min="0"
                onChange={(event) => setTrainingAgeMonths(event.target.value)}
                type="number"
                value={trainingAgeMonths}
              />
            </label>
            <label className="wp-field">
              <span>Availability notes</span>
              <textarea
                onChange={(event) => setAvailabilityNotes(event.target.value)}
                rows={2}
                value={availabilityNotes}
              />
            </label>
            <label className="wp-field">
              <span>Operational constraints</span>
              <textarea
                onChange={(event) =>
                  setOperationalConstraints(event.target.value)
                }
                rows={2}
                value={operationalConstraints}
              />
            </label>
            <label className="wp-field">
              <span>Equipment access</span>
              <input
                onChange={(event) => setEquipmentAccess(event.target.value)}
                placeholder="barbell, bands, treadmill"
                value={equipmentAccess}
              />
              <small className="wp-helper">Separate items with commas.</small>
            </label>
            <label className="wp-field">
              <span>Training preferences</span>
              <textarea
                onChange={(event) => setTrainingPreferences(event.target.value)}
                rows={2}
                value={trainingPreferences}
              />
            </label>
            <label className="wp-field">
              <span>Practitioner notes</span>
              <textarea
                onChange={(event) => setPractitionerNotes(event.target.value)}
                rows={3}
                value={practitionerNotes}
              />
            </label>
            <Button disabled={busy} type="submit" variant="primary">
              {busy ? "Saving…" : "Save training context"}
            </Button>
          </form>
          <dl className="wp-detail-list">
            <div>
              <dt>Linked user</dt>
              <dd>
                {currentAthlete.linkedUserId === null ||
                currentAthlete.linkedUserId === undefined
                  ? "Not linked"
                  : "Linked identity"}
              </dd>
            </div>
            <div>
              <dt>Context version</dt>
              <dd>v{context?.version ?? 0}</dd>
            </div>
            <div>
              <dt>Record status</dt>
              <dd>
                {currentAthlete.archivedAt === null ||
                currentAthlete.archivedAt === undefined
                  ? "Active"
                  : "Archived"}
              </dd>
            </div>
          </dl>
        </Surface>
      </div>
    </div>
  );
}

function GoalsSurface({
  data,
  workspaceId,
  athleteId,
  detail,
}: {
  readonly data: SurfaceData;
  readonly workspaceId: string;
  readonly athleteId: string;
  readonly detail: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = data.goal;
  const [editTitle, setEditTitle] = useState(selected?.title ?? "");
  const [editDescription, setEditDescription] = useState(
    selected?.description ?? "",
  );
  const [editTargetDate, setEditTargetDate] = useState(
    selected?.targetDate ?? "",
  );
  const [editStartsOn, setEditStartsOn] = useState(selected?.startsOn ?? "");
  const [editEndsOn, setEditEndsOn] = useState(selected?.endsOn ?? "");
  async function createGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await requestData<Goal>(`/api/v1/athletes/${encode(athleteId)}/goals`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({ workspaceId, title, description }),
      });
      setTitle("");
      setDescription("");
      router.refresh();
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "The goal could not be created.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function saveGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selected === null) return;
    setBusy(true);
    setError(null);
    try {
      await requestData<Goal>(
        `/api/v1/athletes/${encode(athleteId)}/goals/${encode(selected.id)}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "idempotency-key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            workspaceId,
            expectedVersion: selected.version,
            title: editTitle,
            description: editDescription,
            targetDate: editTargetDate || null,
            startsOn: editStartsOn || null,
            endsOn: editEndsOn || null,
          }),
        },
      );
      router.refresh();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "The goal could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function archiveGoal() {
    if (selected === null) return;
    setBusy(true);
    setError(null);
    try {
      await requestData<Goal>(
        `/api/v1/athletes/${encode(athleteId)}/goals/${encode(selected.id)}/archive`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            workspaceId,
            expectedVersion: selected.version,
          }),
        },
      );
      router.refresh();
    } catch (archiveError) {
      setError(
        archiveError instanceof Error
          ? archiveError.message
          : "The goal could not be archived.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (detail) {
    if (selected === null)
      return (
        <EmptyState
          icon="target"
          title="Goal not found"
          description="The goal may be archived or outside this workspace."
        />
      );
    return (
      <div className="wp-surface-stack">
        <CapabilityStrip
          capability="REAL_MUTATION"
          note="The goal record remains versioned and workspace-scoped."
        />
        <Surface className="wp-form-panel">
          <SectionHeader
            title={selected.title}
            description={selected.description ?? "No description recorded."}
            action={
              <StatusBadge
                tone={
                  selected.archivedAt === null ||
                  selected.archivedAt === undefined
                    ? "success"
                    : "neutral"
                }
              >
                {selected.archivedAt === null ||
                selected.archivedAt === undefined
                  ? "ACTIVE"
                  : "ARCHIVED"}
              </StatusBadge>
            }
          />
          {error === null ? null : (
            <div className="wp-inline-error" role="alert">
              {error}
            </div>
          )}
          <form className="wp-form" onSubmit={(event) => void saveGoal(event)}>
            <label className="wp-field">
              <span>Goal title</span>
              <input
                onChange={(event) => setEditTitle(event.target.value)}
                required
                value={editTitle}
              />
            </label>
            <label className="wp-field">
              <span>Description</span>
              <textarea
                onChange={(event) => setEditDescription(event.target.value)}
                rows={3}
                value={editDescription}
              />
            </label>
            <div className="wp-form-grid">
              <label className="wp-field">
                <span>Target date</span>
                <input
                  onChange={(event) => setEditTargetDate(event.target.value)}
                  type="date"
                  value={editTargetDate}
                />
              </label>
              <label className="wp-field">
                <span>Start</span>
                <input
                  onChange={(event) => setEditStartsOn(event.target.value)}
                  type="date"
                  value={editStartsOn}
                />
              </label>
              <label className="wp-field">
                <span>End</span>
                <input
                  onChange={(event) => setEditEndsOn(event.target.value)}
                  type="date"
                  value={editEndsOn}
                />
              </label>
            </div>
            <div className="wp-form-actions">
              <Button disabled={busy} type="submit" variant="primary">
                {busy ? "Saving…" : "Save goal"}
              </Button>
              {selected.archivedAt === null ||
              selected.archivedAt === undefined ? (
                <Button
                  disabled={busy}
                  onClick={() => void archiveGoal()}
                  type="button"
                  variant="quiet"
                >
                  Archive goal
                </Button>
              ) : null}
            </div>
          </form>
          <dl className="wp-detail-grid">
            <div>
              <dt>Target date</dt>
              <dd>{selected.targetDate ?? "Not set"}</dd>
            </div>
            <div>
              <dt>Start</dt>
              <dd>{selected.startsOn ?? "Not set"}</dd>
            </div>
            <div>
              <dt>End</dt>
              <dd>{selected.endsOn ?? "Not set"}</dd>
            </div>
            <div>
              <dt>Version</dt>
              <dd>v{selected.version}</dd>
            </div>
          </dl>
        </Surface>
      </div>
    );
  }
  return (
    <div className="wp-surface-stack">
      <CapabilityStrip
        capability="REAL_MUTATION"
        note="Create goal is connected; detailed editing remains version-aware."
      />
      <div className="wp-two-column">
        <Surface className="wp-form-panel">
          <SectionHeader
            title="Add a goal"
            description="Capture intent without inventing progress or readiness."
          />
          {error === null ? null : (
            <div className="wp-inline-error" role="alert">
              {error}
            </div>
          )}
          <form
            className="wp-form"
            onSubmit={(event) => void createGoal(event)}
          >
            <label className="wp-field">
              <span>Goal title</span>
              <input
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Increase squat strength"
                required
                value={title}
              />
            </label>
            <label className="wp-field">
              <span>Description</span>
              <textarea
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
                value={description}
              />
            </label>
            <Button disabled={busy} type="submit" variant="primary">
              {busy ? "Adding…" : "Add goal"}
            </Button>
          </form>
        </Surface>
        <Surface>
          <SectionHeader
            title="Current goals"
            description="Goals are source context for later planning."
          />
          {data.goals.length === 0 ? (
            <EmptyState
              icon="target"
              title="No goals recorded"
              description="Add the first goal to give the training plan a clear source of intent."
            />
          ) : (
            <ul className="wp-record-list">
              {data.goals.map((goal) => (
                <li key={goal.id}>
                  <a
                    href={athleteHref(
                      workspaceId,
                      athleteId,
                      `/goals/${goal.id}`,
                    )}
                  >
                    <span>
                      <strong>{goal.title}</strong>
                      <small>
                        {goal.targetDate === null ||
                        goal.targetDate === undefined
                          ? "No target date"
                          : `Target ${goal.targetDate}`}
                      </small>
                    </span>
                    <StatusBadge
                      tone={
                        goal.archivedAt === null ||
                        goal.archivedAt === undefined
                          ? "success"
                          : "neutral"
                      }
                    >
                      {goal.archivedAt === null || goal.archivedAt === undefined
                        ? "ACTIVE"
                        : "ARCHIVED"}
                    </StatusBadge>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Surface>
      </div>
    </div>
  );
}

function TrainingSurface({
  data,
  workspaceId,
  athleteId,
  surfaceId,
}: {
  readonly data: SurfaceData;
  readonly workspaceId: string;
  readonly athleteId: string;
  readonly surfaceId: string;
}) {
  const legacyHref = athleteHref(workspaceId, athleteId, "/plan");
  const isCalendar = surfaceId === "TRN-05" || surfaceId === "TRN-06";
  const isEndurance = surfaceId === "TRN-09";
  return (
    <div className="wp-surface-stack">
      <CapabilityStrip
        capability={
          isEndurance
            ? "SCIENCE_CONTRACT_REQUIRED"
            : data.plans.length > 0
              ? "REAL_CONNECTED"
              : "REAL_READ_ONLY"
        }
        note={
          isEndurance
            ? "Endurance prescription values are held as explicit placeholders until scientific authority qualifies the interpretation."
            : "Plan records are connected. The F3 authoring workspace remains the canonical mutation path."
        }
      />
      {isEndurance ? (
        <BackendGap
          capability="Endurance prescription interpretation"
          description="The session route can preserve and display factual prescription fields, but no physiological target or derived training claim is generated here."
          science
        />
      ) : null}
      <Surface className="wp-training-hero">
        <div>
          <span className="wp-overline">
            {isCalendar ? "Projection" : "Training design"}
          </span>
          <h2>{isCalendar ? "Calendar projection" : "Plan registry"}</h2>
          <p>
            {isCalendar
              ? "Week and month views project session prescriptions; Week is not a new domain aggregate."
              : "Plan → phase → session → modality block remains the visible progression."}
          </p>
        </div>
        <a className="wp-button wp-button-primary" href={legacyHref}>
          Open training authoring
        </a>
      </Surface>
      <div className="wp-two-column">
        <Surface>
          <SectionHeader
            title={isCalendar ? "Projected plans" : "Plans"}
            description="Connected plan records with explicit status and revision."
          />
          {data.plans.length === 0 ? (
            <EmptyState
              icon="target"
              title="No plans recorded"
              description="Open the training authoring workspace to create the first draft plan."
              action={
                <a className="wp-button wp-button-primary" href={legacyHref}>
                  Create draft plan
                </a>
              }
            />
          ) : (
            <DataTable
              caption="Training plans"
              columns={["Plan", "Status", "Revision", "Window", "Open"]}
              rows={data.plans.map((plan) => [
                <strong key="title">{plan.title}</strong>,
                <StatusBadge
                  key="status"
                  tone={
                    plan.status === "published"
                      ? "success"
                      : plan.status === "draft"
                        ? "warning"
                        : "neutral"
                  }
                >
                  {plan.status}
                </StatusBadge>,
                plan.publishedRevision === null
                  ? "Draft"
                  : `Revision ${plan.publishedRevision}`,
                plan.startsOn === undefined
                  ? "Not scheduled"
                  : `${plan.startsOn} → ${plan.endsOn ?? ""}`,
                <a key="open" className="wp-table-link" href={legacyHref}>
                  Open authoring
                </a>,
              ])}
              empty={null}
            />
          )}
        </Surface>
        <Surface>
          <SectionHeader
            title="Revision discipline"
            description="Prescriptions stay distinct from performed evidence."
          />
          <ul className="wp-check-list">
            <li>
              <Icon name="check" size={16} />
              Draft and published states remain visible
            </li>
            <li>
              <Icon name="check" size={16} />
              Sessions are projections on the calendar
            </li>
            <li>
              <Icon name="check" size={16} />
              Mixed modality blocks are explicit
            </li>
            <li>
              <Icon name="check" size={16} />
              Publish is a deliberate action
            </li>
          </ul>
          <BackendGap
            capability="Specialized route mutation"
            description="This route is a structured authority surface. The connected F3 editor is the current mutation seam, so no local-only save is implied here."
          />
        </Surface>
      </div>
    </div>
  );
}

function ExecutionSurface({
  meta,
  surfaceId,
}: {
  readonly meta: SurfaceMeta;
  readonly surfaceId: string;
}) {
  return (
    <div className="wp-surface-stack">
      <CapabilityStrip
        capability={meta.capability}
        note={meta.capabilityNote}
      />
      <Surface className="wp-training-hero">
        <div>
          <span className="wp-overline">Execution evidence</span>
          <h2>Endurance execution</h2>
          <p>
            Performed segments remain factual records. This surface does not
            infer physiological meaning from them.
          </p>
        </div>
        <StatusBadge tone="warning">{surfaceId}</StatusBadge>
      </Surface>
      <Surface>
        <SectionHeader
          title="Performed record boundary"
          description="The execution seam is visible while the science contract is pending."
        />
        <BackendGap
          capability="Endurance execution interpretation"
          description="Persisted performed segments may be reviewed once the connected execution record is selected. Derived load, readiness, or adaptation claims are intentionally unavailable."
          science
        />
        <ul className="wp-check-list">
          <li>
            <Icon name="check" size={16} />
            Prescribed and performed facts remain separate
          </li>
          <li>
            <Icon name="check" size={16} />
            Original records are not destructively rewritten
          </li>
          <li>
            <Icon name="check" size={16} />
            Scientific interpretation requires a qualified contract
          </li>
        </ul>
      </Surface>
    </div>
  );
}

function MovementLibrarySurface({
  data,
  workspaceId,
  detail,
}: {
  readonly data: SurfaceData;
  readonly workspaceId: string;
  readonly detail: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [modality, setModality] = useState<Movement["modality"]>("strength");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedMovement = data.movement;
  const [editMovementName, setEditMovementName] = useState(
    selectedMovement?.canonicalName ?? "",
  );
  const [editMovementModality, setEditMovementModality] = useState<
    Movement["modality"]
  >(selectedMovement?.modality ?? "strength");
  const [editMovementPattern, setEditMovementPattern] = useState(
    selectedMovement?.movementPattern ?? "",
  );
  const [editLaterality, setEditLaterality] = useState(
    selectedMovement?.laterality ?? "",
  );
  const [editEquipmentTags, setEditEquipmentTags] = useState(
    selectedMovement?.equipmentTags?.join(", ") ?? "",
  );
  const filtered = data.movements.filter((movement) =>
    movement.canonicalName.toLowerCase().includes(query.trim().toLowerCase()),
  );
  if (detail) {
    const movement = selectedMovement;
    if (movement === null)
      return (
        <EmptyState
          icon="grid"
          title="Movement not found"
          description="The movement may be archived or outside this workspace."
        />
      );
    return (
      <div className="wp-surface-stack">
        <CapabilityStrip
          capability="REAL_MUTATION"
          note="Movement definition reads and updates use the connected F3 application path."
        />
        <Surface className="wp-form-panel">
          <SectionHeader
            title={movement.canonicalName}
            description="Edit the descriptive movement definition without changing historical facts."
          />
          {error === null ? null : (
            <div className="wp-inline-error" role="alert">
              {error}
            </div>
          )}
          <form
            className="wp-form"
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError(null);
              try {
                await requestData<Movement>(
                  `/api/v1/movements/${encode(movement.id)}`,
                  {
                    method: "PATCH",
                    headers: {
                      "content-type": "application/json",
                      "idempotency-key": crypto.randomUUID(),
                    },
                    body: JSON.stringify({
                      workspaceId,
                      expectedVersion: movement.version,
                      canonicalName: editMovementName,
                      modality: editMovementModality,
                      movementPattern: editMovementPattern || null,
                      laterality: editLaterality || null,
                      equipmentTags: editEquipmentTags
                        .split(",")
                        .map((value) => value.trim())
                        .filter((value) => value.length > 0),
                    }),
                  },
                );
                router.refresh();
              } catch (saveError) {
                setError(
                  saveError instanceof Error
                    ? saveError.message
                    : "The movement could not be saved.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="wp-field">
              <span>Canonical name</span>
              <input
                onChange={(event) => setEditMovementName(event.target.value)}
                required
                value={editMovementName}
              />
            </label>
            <label className="wp-field">
              <span>Modality</span>
              <select
                onChange={(event) =>
                  setEditMovementModality(
                    event.target.value as Movement["modality"],
                  )
                }
                value={editMovementModality}
              >
                <option value="strength">Strength</option>
                <option value="endurance">Endurance</option>
                <option value="mobility">Mobility</option>
                <option value="general">General</option>
              </select>
            </label>
            <label className="wp-field">
              <span>Movement pattern</span>
              <input
                onChange={(event) => setEditMovementPattern(event.target.value)}
                value={editMovementPattern}
              />
            </label>
            <label className="wp-field">
              <span>Laterality</span>
              <input
                onChange={(event) => setEditLaterality(event.target.value)}
                value={editLaterality}
              />
            </label>
            <label className="wp-field">
              <span>Equipment tags</span>
              <input
                onChange={(event) => setEditEquipmentTags(event.target.value)}
                placeholder="barbell, rack"
                value={editEquipmentTags}
              />
              <small className="wp-helper">Separate tags with commas.</small>
            </label>
            <div className="wp-form-actions">
              <Button
                disabled={busy || movement.scope === "global"}
                type="submit"
                variant="primary"
              >
                {busy ? "Saving…" : "Save movement"}
              </Button>
              {movement.scope === "workspace" &&
              movement.archivedAt === null ? (
                <Button
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError(null);
                    try {
                      await requestData<Movement>(
                        `/api/v1/movements/${encode(movement.id)}/archive`,
                        {
                          method: "POST",
                          headers: {
                            "content-type": "application/json",
                            "idempotency-key": crypto.randomUUID(),
                          },
                          body: JSON.stringify({
                            workspaceId,
                            expectedVersion: movement.version,
                          }),
                        },
                      );
                      router.refresh();
                    } catch (archiveError) {
                      setError(
                        archiveError instanceof Error
                          ? archiveError.message
                          : "The movement could not be archived.",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                  type="button"
                  variant="quiet"
                >
                  Archive movement
                </Button>
              ) : null}
            </div>
          </form>
          <dl className="wp-detail-grid">
            <div>
              <dt>Modality</dt>
              <dd>{movement.modality}</dd>
            </div>
            <div>
              <dt>Scope</dt>
              <dd>{movement.scope}</dd>
            </div>
            <div>
              <dt>Version</dt>
              <dd>v{movement.version}</dd>
            </div>
            <div>
              <dt>Record state</dt>
              <dd>{movement.archivedAt === null ? "Active" : "Archived"}</dd>
            </div>
          </dl>
          <a
            className="wp-button wp-button-secondary"
            href={`/workspace/${workspaceId}/library/movements`}
          >
            Back to library
          </a>
        </Surface>
      </div>
    );
  }
  async function createMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await requestData<Movement>("/api/v1/movements", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({ workspaceId, canonicalName: name, modality }),
      });
      setName("");
      router.refresh();
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "The movement could not be created.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="wp-surface-stack">
      <CapabilityStrip
        capability="REAL_MUTATION"
        note="Search and workspace movement creation are connected; global records remain read-only."
      />
      <div className="wp-two-column">
        <Surface className="wp-form-panel">
          <SectionHeader
            title="Movement library"
            description="Fast lookup for structured exercise selection."
          />
          <label className="wp-field">
            <span>Search movements</span>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Back squat"
              value={query}
            />
          </label>
          <div className="wp-library-list">
            {filtered.length === 0 ? (
              <EmptyState
                icon="search"
                title="No movements found"
                description="Create a workspace movement or change the search."
              />
            ) : (
              filtered.map((movement) => (
                <a
                  className="wp-library-item"
                  href={`/workspace/${workspaceId}/library/movements/${movement.id}`}
                  key={movement.id}
                >
                  <span className="wp-library-icon">
                    <Icon
                      name={
                        movement.modality === "endurance"
                          ? "wave"
                          : movement.modality === "mobility"
                            ? "activity"
                            : "target"
                      }
                      size={17}
                    />
                  </span>
                  <span>
                    <strong>{movement.canonicalName}</strong>
                    <small>
                      {movement.modality} · {movement.scope} · v
                      {movement.version}
                    </small>
                  </span>
                  <Icon name="arrow-right" size={15} />
                </a>
              ))
            )}
          </div>
        </Surface>
        <Surface className="wp-form-panel">
          <SectionHeader
            title="Add workspace movement"
            description="Workspace-owned catalog records are persisted through F3."
          />
          {error === null ? null : (
            <div className="wp-inline-error" role="alert">
              {error}
            </div>
          )}
          <form
            className="wp-form"
            onSubmit={(event) => void createMovement(event)}
          >
            <label className="wp-field">
              <span>Canonical name</span>
              <input
                onChange={(event) => setName(event.target.value)}
                placeholder="Back squat"
                required
                value={name}
              />
            </label>
            <label className="wp-field">
              <span>Modality</span>
              <select
                onChange={(event) =>
                  setModality(event.target.value as Movement["modality"])
                }
                value={modality}
              >
                <option value="strength">Strength</option>
                <option value="endurance">Endurance</option>
                <option value="mobility">Mobility</option>
                <option value="general">General</option>
              </select>
            </label>
            <Button disabled={busy} type="submit" variant="primary">
              {busy ? "Adding…" : "Add movement"}
            </Button>
          </form>
        </Surface>
      </div>
    </div>
  );
}

function HistorySurface({ data }: { readonly data: SurfaceData }) {
  return (
    <div className="wp-surface-stack">
      <CapabilityStrip
        capability="REAL_READ_ONLY"
        note="Manual and governed activity is presented as append-only audit evidence."
      />
      <Surface>
        <SectionHeader
          title="Chronological record"
          description="Source request ids remain available for inspection."
        />
        {data.audit.length === 0 ? (
          <EmptyState
            icon="history"
            title="No history yet"
            description="Workspace events will appear here as identities, athletes, plans, and executions change."
          />
        ) : (
          <DataTable
            caption="History and audit events"
            columns={["Action", "Occurred", "Aggregate", "Request"]}
            rows={data.audit.map((event) => [
              <strong key="action">{event.action}</strong>,
              new Date(event.occurredAt).toLocaleString(),
              event.aggregateId === null || event.aggregateId === undefined
                ? "Workspace"
                : event.aggregateId,
              event.requestId ?? "Not returned",
            ])}
            empty={null}
          />
        )}
      </Surface>
    </div>
  );
}

function assessmentHref(
  workspaceId: string,
  athleteId: string,
  assessmentId?: string,
  suffix = "",
): string {
  const base = `${athleteHref(workspaceId, athleteId, "/assessments")}`;
  return assessmentId === undefined
    ? `${base}${suffix}`
    : `${base}/${encode(assessmentId)}${suffix}`;
}

function mutationInit(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  };
}

function patchInit(body: unknown): RequestInit {
  return {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "idempotency-key": crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  };
}

function evidenceValueLabel(value: EvidenceValueRecord): React.ReactNode {
  if (value.kind === "PRESENT") {
    return (
      <span>
        {value.value.value} {value.value.unit}
      </span>
    );
  }
  return <StatusBadge tone="warning">{value.reason}</StatusBadge>;
}

function protocolRevisionLabel(
  revision: ProtocolRevisionRecord | null,
): string {
  return revision === null
    ? "Not recorded"
    : `${revision.name} · revision ${revision.revision}`;
}

function sourceLabel(source: AcquisitionSourceRecord | null): string {
  return source === null
    ? "Not recorded"
    : `${source.label} · ${source.sourceClass}`;
}

const assessmentUnitOptions = [
  ["kg", "mass"],
  ["m", "length"],
  ["s", "time"],
  ["m/s", "speed"],
  ["N", "force"],
  ["W", "power"],
  ["J", "energy"],
  ["bpm", "frequency"],
  ["rep", "count"],
  ["deg", "angle"],
  ["L", "volume"],
  ["°C", "temperature"],
] as const;

const assessmentMissingReasons = [
  "NOT_RECORDED",
  "NOT_APPLICABLE",
  "INVALID",
  "EXCLUDED",
  "UNKNOWN",
] as const;

function AssessmentEvidenceFormFields({
  evidenceKind,
  onEvidenceKindChange,
  value,
  onValueChange,
  unitDimension,
  onUnitDimensionChange,
  missingReason,
  onMissingReasonChange,
}: {
  readonly evidenceKind: "PRESENT" | "MISSING";
  readonly onEvidenceKindChange: (value: "PRESENT" | "MISSING") => void;
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly unitDimension: string;
  readonly onUnitDimensionChange: (value: string) => void;
  readonly missingReason: (typeof assessmentMissingReasons)[number];
  readonly onMissingReasonChange: (
    value: (typeof assessmentMissingReasons)[number],
  ) => void;
}) {
  return (
    <>
      <label className="wp-field">
        <span>Evidence state</span>
        <select
          onChange={(event) =>
            onEvidenceKindChange(event.target.value as "PRESENT" | "MISSING")
          }
          value={evidenceKind}
        >
          <option value="PRESENT">PRESENT</option>
          <option value="MISSING">Missingness recorded</option>
        </select>
      </label>
      {evidenceKind === "PRESENT" ? (
        <>
          <label className="wp-field">
            <span>Quantity value</span>
            <input
              inputMode="decimal"
              onChange={(event) => onValueChange(event.target.value)}
              required
              step="any"
              type="number"
              value={value}
            />
          </label>
          <label className="wp-field">
            <span>Unit and dimension</span>
            <select
              onChange={(event) => onUnitDimensionChange(event.target.value)}
              value={unitDimension}
            >
              {assessmentUnitOptions.map(([unit, dimension]) => (
                <option
                  key={`${unit}-${dimension}`}
                  value={`${unit}|${dimension}`}
                >
                  {unit} · {dimension}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : (
        <label className="wp-field">
          <span>Missingness reason</span>
          <select
            onChange={(event) =>
              onMissingReasonChange(
                event.target.value as (typeof assessmentMissingReasons)[number],
              )
            }
            value={missingReason}
          >
            {assessmentMissingReasons.map((reason) => (
              <option key={reason} value={reason}>
                {reason}
              </option>
            ))}
          </select>
        </label>
      )}
    </>
  );
}

function AssessmentRegistrySurface({
  data,
  workspaceId,
  athleteId,
}: {
  readonly data: SurfaceData;
  readonly workspaceId: string;
  readonly athleteId: string;
}) {
  const router = useRouter();
  return (
    <div className="wp-surface-stack">
      <CapabilityStrip
        capability="REAL_CONNECTED"
        note="Assessment records are loaded from the workspace-scoped evidence substrate."
      />
      <Surface>
        <SectionHeader
          title="Assessment registry"
          description="Recorded assessment context is listed without interpreting performance."
          action={
            <Button
              onClick={() =>
                router.push(
                  assessmentHref(workspaceId, athleteId, undefined, "/new"),
                )
              }
              variant="primary"
            >
              New assessment
            </Button>
          }
        />
        <DataTable
          caption="Assessment registry"
          columns={[
            "Type",
            "Occurrence",
            "Status",
            "Protocol",
            "Source",
            "Artifacts",
            "Open",
          ]}
          rows={data.assessments.map((assessment) => [
            <strong key={`${assessment.id}-type`}>
              {assessment.assessmentType}
            </strong>,
            assessment.occurrenceDate,
            <StatusBadge key={`${assessment.id}-status`} tone="neutral">
              {assessment.status}
            </StatusBadge>,
            assessment.protocolRevision === null
              ? "Not recorded"
              : `Revision ${assessment.protocolRevision.revision}`,
            assessment.source?.label ?? "Not recorded",
            assessment.artifactIds.length === 0
              ? "None linked"
              : assessment.artifactIds.length.toString(),
            <Button
              key={`${assessment.id}-open`}
              onClick={() =>
                router.push(
                  assessmentHref(workspaceId, athleteId, assessment.id),
                )
              }
              variant="quiet"
            >
              Open
            </Button>,
          ])}
          empty={
            <EmptyState
              icon="activity"
              title="No assessments recorded"
              description="Create the first assessment to establish its date, protocol, source, and evidence context."
              action={
                <Button
                  onClick={() =>
                    router.push(
                      assessmentHref(workspaceId, athleteId, undefined, "/new"),
                    )
                  }
                  variant="primary"
                >
                  New assessment
                </Button>
              }
            />
          }
        />
      </Surface>
      <Surface>
        <SectionHeader
          title="Evidence fields"
          description="The registry stores context; trial and result screens store explicit evidence state."
        />
        <DataTable
          caption="Assessment evidence fields"
          columns={["Field", "Stored as", "Interpretation"]}
          rows={[
            [
              "Protocol",
              "Immutable revision reference",
              "Historical method context",
            ],
            [
              "Source",
              "Vendor-neutral acquisition record",
              "Recorded source identity",
            ],
            [
              "Trial state",
              "Validity and exclusion separately",
              "Recorded judgement only",
            ],
            [
              "Quantity",
              "Value, unit, dimension",
              "Dimension-checked evidence",
            ],
            ["Missingness", "Explicit reason", "Never rendered as zero"],
          ]}
          empty={null}
        />
      </Surface>
    </div>
  );
}

function AssessmentCreateSurface({
  data,
  workspaceId,
  athleteId,
}: {
  readonly data: SurfaceData;
  readonly workspaceId: string;
  readonly athleteId: string;
}) {
  const router = useRouter();
  const [assessmentType, setAssessmentType] = useState("");
  const [purpose, setPurpose] = useState("");
  const [occurrenceDate, setOccurrenceDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [assessmentOccurredAt, setAssessmentOccurredAt] = useState("");
  const [timeZone, setTimeZone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  );
  const [protocolRevisionId, setProtocolRevisionId] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const assessment = await requestData<AssessmentRecord>(
        "/api/v1/assessments",
        mutationInit({
          workspaceId,
          athleteId,
          assessmentType,
          ...(purpose.trim().length === 0 ? {} : { purpose }),
          occurrenceDate,
          ...(assessmentOccurredAt.length === 0
            ? {}
            : {
                assessmentOccurredAt: new Date(
                  assessmentOccurredAt,
                ).toISOString(),
              }),
          timeZone,
          ...(protocolRevisionId.length === 0 ? {} : { protocolRevisionId }),
          ...(sourceId.length === 0 ? {} : { sourceId }),
          ...(notes.trim().length === 0 ? {} : { notes }),
        }),
      );
      router.push(assessmentHref(workspaceId, athleteId, assessment.id));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The assessment could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wp-surface-stack">
      <CapabilityStrip
        capability="REAL_MUTATION"
        note="Creation writes an assessment record and preserves the selected protocol/source references."
      />
      <div className="wp-form-layout">
        <Surface className="wp-form-panel">
          <div className="wp-form-intro">
            <span className="wp-state-icon">
              <Icon name="activity" size={22} />
            </span>
            <div>
              <h2>New assessment</h2>
              <p>
                Record acquisition context first; evidence is added to ordered
                trials afterwards.
              </p>
            </div>
          </div>
          {error === null ? null : (
            <div className="wp-inline-error" role="alert">
              {error}
            </div>
          )}
          <form className="wp-form" onSubmit={(event) => void submit(event)}>
            <label className="wp-field">
              <span>Assessment type</span>
              <input
                onChange={(event) => setAssessmentType(event.target.value)}
                placeholder="e.g. field assessment"
                required
                value={assessmentType}
              />
            </label>
            <label className="wp-field">
              <span>
                Purpose <small>(optional)</small>
              </span>
              <textarea
                onChange={(event) => setPurpose(event.target.value)}
                value={purpose}
              />
            </label>
            <div className="wp-detail-grid">
              <label className="wp-field">
                <span>Occurrence date</span>
                <input
                  onChange={(event) => setOccurrenceDate(event.target.value)}
                  required
                  type="date"
                  value={occurrenceDate}
                />
              </label>
              <label className="wp-field">
                <span>Timezone</span>
                <input
                  onChange={(event) => setTimeZone(event.target.value)}
                  required
                  value={timeZone}
                />
              </label>
            </div>
            <label className="wp-field">
              <span>
                Occurrence time <small>(optional)</small>
              </span>
              <input
                onChange={(event) =>
                  setAssessmentOccurredAt(event.target.value)
                }
                type="datetime-local"
                value={assessmentOccurredAt}
              />
            </label>
            <label className="wp-field">
              <span>
                Protocol revision <small>(optional)</small>
              </span>
              <select
                onChange={(event) => setProtocolRevisionId(event.target.value)}
                value={protocolRevisionId}
              >
                <option value="">Not recorded</option>
                {data.assessmentProtocolRevisions.map((revision) => (
                  <option key={revision.id} value={revision.id}>
                    {revision.name} · revision {revision.revision}
                  </option>
                ))}
              </select>
            </label>
            <label className="wp-field">
              <span>
                Acquisition source <small>(optional)</small>
              </span>
              <select
                onChange={(event) => setSourceId(event.target.value)}
                value={sourceId}
              >
                <option value="">Not recorded</option>
                {data.assessmentSources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.label} · {source.sourceClass}
                  </option>
                ))}
              </select>
            </label>
            <label className="wp-field">
              <span>
                Notes <small>(optional)</small>
              </span>
              <textarea
                onChange={(event) => setNotes(event.target.value)}
                value={notes}
              />
            </label>
            <div className="wp-form-actions">
              <Button disabled={busy} type="submit" variant="primary">
                {busy ? "Saving…" : "Create assessment"}
              </Button>
              <Button
                onClick={() =>
                  router.push(assessmentHref(workspaceId, athleteId))
                }
                variant="quiet"
              >
                Cancel
              </Button>
            </div>
          </form>
        </Surface>
        <Surface className="wp-form-side">
          <SectionHeader
            title="Recorded context"
            description="Only explicit values are saved. No metric or scientific interpretation is generated here."
          />
          <ul className="wp-check-list">
            <li>
              <Icon name="check" size={15} /> Date and IANA timezone are
              validated.
            </li>
            <li>
              <Icon name="check" size={15} /> Protocol revisions remain
              immutable references.
            </li>
            <li>
              <Icon name="check" size={15} /> Source identity is vendor-neutral.
            </li>
            <li>
              <Icon name="check" size={15} /> Trials and observations are added
              after creation.
            </li>
          </ul>
          {data.assessmentProtocolRevisions.length === 0 ? (
            <p className="wp-helper">
              No protocol revisions are available for selection.
            </p>
          ) : null}
          {data.assessmentSources.length === 0 ? (
            <p className="wp-helper">
              No acquisition sources are available for selection.
            </p>
          ) : null}
        </Surface>
      </div>
    </div>
  );
}

function AssessmentEditForm({
  assessment,
  data,
  workspaceId,
  onSaved,
}: {
  readonly assessment: AssessmentRecord;
  readonly data: SurfaceData;
  readonly workspaceId: string;
  readonly onSaved: () => void;
}) {
  const [assessmentType, setAssessmentType] = useState(
    assessment.assessmentType,
  );
  const [purpose, setPurpose] = useState(assessment.purpose ?? "");
  const [occurrenceDate, setOccurrenceDate] = useState(
    assessment.occurrenceDate,
  );
  const [assessmentOccurredAt, setAssessmentOccurredAt] = useState(
    assessment.occurredAt === null
      ? ""
      : new Date(assessment.occurredAt).toISOString().slice(0, 16),
  );
  const [timeZone, setTimeZone] = useState(assessment.timeZone);
  const [protocolRevisionId, setProtocolRevisionId] = useState(
    assessment.protocolRevision?.id ?? "",
  );
  const [sourceId, setSourceId] = useState(assessment.source?.id ?? "");
  const [notes, setNotes] = useState(assessment.notes ?? "");
  const [reason, setReason] = useState("Recorded correction");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await requestData<AssessmentRecord>(
        `/api/v1/assessments/${encode(assessment.id)}`,
        patchInit({
          workspaceId,
          expectedVersion: assessment.version,
          assessmentType,
          purpose: purpose.trim().length === 0 ? null : purpose,
          occurrenceDate,
          assessmentOccurredAt:
            assessmentOccurredAt.length === 0
              ? null
              : new Date(assessmentOccurredAt).toISOString(),
          timeZone,
          protocolRevisionId:
            protocolRevisionId.length === 0 ? null : protocolRevisionId,
          sourceId: sourceId.length === 0 ? null : sourceId,
          notes: notes.trim().length === 0 ? null : notes,
          reason,
        }),
      );
      onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The assessment amendment could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="wp-form" onSubmit={(event) => void submit(event)}>
      {error === null ? null : (
        <div className="wp-inline-error" role="alert">
          {error}
        </div>
      )}
      <label className="wp-field">
        <span>Assessment type</span>
        <input
          onChange={(event) => setAssessmentType(event.target.value)}
          required
          value={assessmentType}
        />
      </label>
      <label className="wp-field">
        <span>Purpose</span>
        <textarea
          onChange={(event) => setPurpose(event.target.value)}
          value={purpose}
        />
      </label>
      <div className="wp-detail-grid">
        <label className="wp-field">
          <span>Occurrence date</span>
          <input
            onChange={(event) => setOccurrenceDate(event.target.value)}
            required
            type="date"
            value={occurrenceDate}
          />
        </label>
        <label className="wp-field">
          <span>Timezone</span>
          <input
            onChange={(event) => setTimeZone(event.target.value)}
            required
            value={timeZone}
          />
        </label>
      </div>
      <label className="wp-field">
        <span>Occurrence time</span>
        <input
          onChange={(event) => setAssessmentOccurredAt(event.target.value)}
          type="datetime-local"
          value={assessmentOccurredAt}
        />
      </label>
      <label className="wp-field">
        <span>Protocol revision</span>
        <select
          onChange={(event) => setProtocolRevisionId(event.target.value)}
          value={protocolRevisionId}
        >
          <option value="">Not recorded</option>
          {data.assessmentProtocolRevisions.map((revision) => (
            <option key={revision.id} value={revision.id}>
              {revision.name} · revision {revision.revision}
            </option>
          ))}
        </select>
      </label>
      <label className="wp-field">
        <span>Acquisition source</span>
        <select
          onChange={(event) => setSourceId(event.target.value)}
          value={sourceId}
        >
          <option value="">Not recorded</option>
          {data.assessmentSources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.label} · {source.sourceClass}
            </option>
          ))}
        </select>
      </label>
      <label className="wp-field">
        <span>Amendment reason</span>
        <input
          onChange={(event) => setReason(event.target.value)}
          required
          value={reason}
        />
      </label>
      <label className="wp-field">
        <span>Notes</span>
        <textarea
          onChange={(event) => setNotes(event.target.value)}
          value={notes}
        />
      </label>
      <div className="wp-form-actions">
        <Button disabled={busy} type="submit" variant="primary">
          {busy ? "Saving…" : "Save amendment"}
        </Button>
      </div>
    </form>
  );
}

function AssessmentDetailsSurface({
  data,
  workspaceId,
  athleteId,
  onRefresh,
}: {
  readonly data: SurfaceData;
  readonly workspaceId: string;
  readonly athleteId: string;
  readonly onRefresh: () => void;
}) {
  const router = useRouter();
  const details = data.assessment;
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  if (details === null) {
    return (
      <ErrorState
        title="Assessment not available"
        description="The requested assessment was not returned for this athlete."
      />
    );
  }
  const assessment = details.assessment;
  function saved() {
    setEditing(false);
    setNotice(
      "Assessment amendment saved. Historical evidence remains available.",
    );
    onRefresh();
  }
  const trialById = new Map(details.trials.map((trial) => [trial.id, trial]));
  return (
    <div className="wp-surface-stack">
      <CapabilityStrip
        capability="REAL_MUTATION"
        note="Assessment context, trials, observations, and neutral results are persisted with explicit versions."
      />
      {notice === null ? null : (
        <div className="wp-inline-success" role="status">
          {notice}
        </div>
      )}
      <Surface>
        <SectionHeader
          title={assessment.assessmentType}
          description="Assessment context is recorded separately from any later scientific interpretation."
          action={
            <div className="wp-form-actions">
              <Button
                onClick={() => setEditing((value) => !value)}
                variant="secondary"
              >
                {editing ? "Close editor" : "Edit assessment"}
              </Button>
              <Button
                onClick={() =>
                  router.push(
                    assessmentHref(
                      workspaceId,
                      athleteId,
                      assessment.id,
                      "/trials",
                    ),
                  )
                }
                variant="primary"
              >
                Manage trials
              </Button>
            </div>
          }
        />
        {editing ? (
          <AssessmentEditForm
            assessment={assessment}
            data={data}
            onSaved={saved}
            workspaceId={workspaceId}
          />
        ) : (
          <dl className="wp-detail-grid">
            <div>
              <dt>Status</dt>
              <dd>
                <StatusBadge>{assessment.status}</StatusBadge>
              </dd>
            </div>
            <div>
              <dt>Version</dt>
              <dd>{assessment.version}</dd>
            </div>
            <div>
              <dt>Occurrence date</dt>
              <dd>{assessment.occurrenceDate}</dd>
            </div>
            <div>
              <dt>Occurrence time</dt>
              <dd>{assessment.occurredAt ?? "Not recorded"}</dd>
            </div>
            <div>
              <dt>Timezone</dt>
              <dd>{assessment.timeZone}</dd>
            </div>
            <div>
              <dt>Protocol</dt>
              <dd>{protocolRevisionLabel(assessment.protocolRevision)}</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>{sourceLabel(assessment.source)}</dd>
            </div>
            <div>
              <dt>Artifacts</dt>
              <dd>
                {assessment.artifactIds.length === 0
                  ? "None linked"
                  : assessment.artifactIds.length.toString()}
              </dd>
            </div>
            <div>
              <dt>Purpose</dt>
              <dd>{assessment.purpose ?? "Not recorded"}</dd>
            </div>
            <div>
              <dt>Notes</dt>
              <dd>{assessment.notes ?? "Not recorded"}</dd>
            </div>
          </dl>
        )}
      </Surface>
      <div className="wp-two-column">
        <Surface>
          <SectionHeader
            title="Trials"
            description="Order, validity, and exclusion remain separate recorded fields."
          />
          <DataTable
            caption="Assessment trials"
            columns={[
              "Order",
              "Lifecycle",
              "Validity",
              "Exclusion",
              "Evidence",
            ]}
            rows={details.trials.map((trial) => [
              `Trial ${trial.ordinal}`,
              trial.status,
              trial.validity,
              trial.exclusion === "EXCLUDED"
                ? `EXCLUDED · ${trial.exclusionReason ?? "Reason not recorded"}`
                : "INCLUDED",
              trial.provenance.sourceClass,
            ])}
            empty={
              <EmptyState
                icon="activity"
                title="No trials recorded"
                description="Add an ordered trial from the trial workspace before entering raw observations."
              />
            }
          />
        </Surface>
        <Surface>
          <SectionHeader
            title="Lineage"
            description="Historical references remain attached to the record that used them."
          />
          <dl className="wp-detail-list">
            <div>
              <dt>Protocol revision</dt>
              <dd>{protocolRevisionLabel(assessment.protocolRevision)}</dd>
            </div>
            <div>
              <dt>Source class</dt>
              <dd>{assessment.source?.sourceClass ?? "Not recorded"}</dd>
            </div>
            <div>
              <dt>Source version</dt>
              <dd>{assessment.sourceVersion ?? "Not recorded"}</dd>
            </div>
            <div>
              <dt>Amendments</dt>
              <dd>{details.amendments.length}</dd>
            </div>
            <div>
              <dt>Artifact references</dt>
              <dd>{assessment.artifactIds.length}</dd>
            </div>
          </dl>
        </Surface>
      </div>
      <Surface>
        <SectionHeader
          title="Raw observations"
          description="Values carry units and dimensions; missingness is displayed as a recorded state."
        />
        <DataTable
          caption="Assessment raw observations"
          columns={["Trial", "Key", "Value", "Observed", "Lineage"]}
          rows={details.observations.map((observation) => [
            `Trial ${trialById.get(observation.trialId)?.ordinal ?? "?"}`,
            observation.observationKey,
            evidenceValueLabel(observation.value),
            observation.observedAt ?? "Not recorded",
            observation.provenance.sourceClass,
          ])}
          empty={
            <EmptyState
              icon="activity"
              title="No raw observations recorded"
              description="Raw observations will appear after a trial entry is saved."
            />
          }
        />
      </Surface>
      <Surface>
        <SectionHeader
          title="Neutral results"
          description="Results retain their metric-definition revision and source lineage; no scientific score is inferred."
        />
        <DataTable
          caption="Assessment neutral results"
          columns={["Metric", "Revision", "Scope", "Value", "Origin", "Method"]}
          rows={details.results.map((result) => [
            result.metricDefinition.displayName,
            result.metricDefinition.revision,
            result.trialId === null ? "Assessment" : "Trial",
            evidenceValueLabel(result.value),
            result.origin,
            result.methodProtocolRevision === null
              ? "Not recorded"
              : `Revision ${result.methodProtocolRevision.revision}`,
          ])}
          empty={
            <EmptyState
              icon="document"
              title="No neutral results recorded"
              description="Results are added from the trial workspace when a versioned metric definition exists."
            />
          }
        />
      </Surface>
      <Surface>
        <SectionHeader
          title="Amendment history"
          description="Corrections append a new historical record instead of overwriting the original evidence."
        />
        <DataTable
          caption="Assessment amendment history"
          columns={["Target", "Reason", "Occurred", "Actor"]}
          rows={details.amendments.map((amendment) => [
            `${amendment.targetType} · ${amendment.targetId.slice(0, 8)}`,
            amendment.reason,
            amendment.occurredAt,
            amendment.actorId,
          ])}
          empty={
            <EmptyState
              icon="history"
              title="No amendments recorded"
              description="The original assessment context is currently unchanged."
            />
          }
        />
      </Surface>
    </div>
  );
}

function TrialControls({
  trial,
  workspaceId,
  assessmentId,
  onSaved,
}: {
  readonly trial: TrialRecord;
  readonly workspaceId: string;
  readonly assessmentId: string;
  readonly onSaved: () => void;
}) {
  const [validity, setValidity] = useState(trial.validity);
  const [exclusion, setExclusion] = useState(trial.exclusion);
  const [exclusionReason, setExclusionReason] = useState(
    trial.exclusionReason ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setBusy(true);
    setError(null);
    try {
      await requestData<TrialRecord>(
        `/api/v1/assessments/${encode(assessmentId)}/trials/${encode(trial.id)}`,
        patchInit({
          workspaceId,
          expectedVersion: trial.version,
          validity,
          exclusion,
          exclusionReason: exclusion === "EXCLUDED" ? exclusionReason : null,
        }),
      );
      onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The trial could not be amended.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <div className="wp-form-actions">
        <select
          aria-label={`Validity for trial ${trial.ordinal}`}
          onChange={(event) =>
            setValidity(event.target.value as TrialRecord["validity"])
          }
          value={validity}
        >
          <option value="UNASSESSED">UNASSESSED</option>
          <option value="VALID">VALID</option>
          <option value="INVALID">INVALID</option>
        </select>
        <select
          aria-label={`Exclusion for trial ${trial.ordinal}`}
          onChange={(event) =>
            setExclusion(event.target.value as TrialRecord["exclusion"])
          }
          value={exclusion}
        >
          <option value="INCLUDED">INCLUDED</option>
          <option value="EXCLUDED">EXCLUDED</option>
        </select>
        {exclusion === "EXCLUDED" ? (
          <input
            aria-label={`Exclusion reason for trial ${trial.ordinal}`}
            onChange={(event) => setExclusionReason(event.target.value)}
            placeholder="Reason"
            value={exclusionReason}
          />
        ) : null}
        <Button disabled={busy} onClick={() => void save()} variant="quiet">
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
      {error === null ? null : (
        <span className="wp-inline-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

function AssessmentObservationEntry({
  data,
  workspaceId,
  assessmentId,
  onSaved,
}: {
  readonly data: SurfaceData;
  readonly workspaceId: string;
  readonly assessmentId: string;
  readonly onSaved: () => void;
}) {
  const [trialId, setTrialId] = useState(data.assessment?.trials[0]?.id ?? "");
  const [observationKey, setObservationKey] = useState("");
  const [evidenceKind, setEvidenceKind] = useState<"PRESENT" | "MISSING">(
    "PRESENT",
  );
  const [value, setValue] = useState("");
  const [unitDimension, setUnitDimension] = useState("kg|mass");
  const [missingReason, setMissingReason] =
    useState<(typeof assessmentMissingReasons)[number]>("NOT_RECORDED");
  const [observedAt, setObservedAt] = useState(
    new Date().toISOString().slice(0, 16),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trials = data.assessment?.trials ?? [];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const [unit, dimension] = unitDimension.split("|");
    try {
      await requestData<ObservationRecord>(
        `/api/v1/assessments/${encode(assessmentId)}/observations`,
        mutationInit({
          workspaceId,
          trialId,
          observationKey,
          value:
            evidenceKind === "PRESENT"
              ? {
                  kind: "PRESENT",
                  value: { value: Number(value), unit, dimension },
                }
              : { kind: "MISSING", reason: missingReason },
          ...(evidenceKind === "PRESENT"
            ? { observedAt: new Date(observedAt).toISOString() }
            : {}),
        }),
      );
      setObservationKey("");
      setValue("");
      onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The observation could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (trials.length === 0) {
    return (
      <EmptyState
        icon="activity"
        title="Add a trial first"
        description="Raw observations are always attached to an ordered trial."
      />
    );
  }
  return (
    <form className="wp-form" onSubmit={(event) => void submit(event)}>
      {error === null ? null : (
        <div className="wp-inline-error" role="alert">
          {error}
        </div>
      )}
      <label className="wp-field">
        <span>Trial</span>
        <select
          onChange={(event) => setTrialId(event.target.value)}
          value={trialId}
        >
          {trials.map((trial) => (
            <option key={trial.id} value={trial.id}>
              Trial {trial.ordinal}
            </option>
          ))}
        </select>
      </label>
      <label className="wp-field">
        <span>Observation key</span>
        <input
          onChange={(event) => setObservationKey(event.target.value)}
          placeholder="e.g. contact_time"
          required
          value={observationKey}
        />
      </label>
      <AssessmentEvidenceFormFields
        evidenceKind={evidenceKind}
        missingReason={missingReason}
        onEvidenceKindChange={setEvidenceKind}
        onMissingReasonChange={setMissingReason}
        onUnitDimensionChange={setUnitDimension}
        onValueChange={setValue}
        unitDimension={unitDimension}
        value={value}
      />
      {evidenceKind === "PRESENT" ? (
        <label className="wp-field">
          <span>Observed at</span>
          <input
            onChange={(event) => setObservedAt(event.target.value)}
            required
            type="datetime-local"
            value={observedAt}
          />
        </label>
      ) : null}
      <Button disabled={busy} type="submit" variant="primary">
        {busy ? "Saving…" : "Record observation"}
      </Button>
    </form>
  );
}

function AssessmentResultEntry({
  data,
  workspaceId,
  assessmentId,
  onSaved,
}: {
  readonly data: SurfaceData;
  readonly workspaceId: string;
  readonly assessmentId: string;
  readonly onSaved: () => void;
}) {
  const definitions = data.assessmentMetricDefinitions;
  const [metricDefinitionId, setMetricDefinitionId] = useState(
    definitions[0]?.id ?? "",
  );
  const selectedDefinition =
    definitions.find((definition) => definition.id === metricDefinitionId) ??
    null;
  const [trialId, setTrialId] = useState("");
  const [origin, setOrigin] = useState<NeutralResultRecord["origin"]>("MANUAL");
  const [evidenceKind, setEvidenceKind] = useState<"PRESENT" | "MISSING">(
    "PRESENT",
  );
  const [value, setValue] = useState("");
  const [unitDimension, setUnitDimension] = useState("kg|mass");
  const [missingReason, setMissingReason] =
    useState<(typeof assessmentMissingReasons)[number]>("NOT_RECORDED");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trials = data.assessment?.trials ?? [];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedDefinition === null) return;
    setBusy(true);
    setError(null);
    const [unit, dimension] = unitDimension.split("|");
    try {
      await requestData<NeutralResultRecord>(
        `/api/v1/assessments/${encode(assessmentId)}/results`,
        mutationInit({
          workspaceId,
          metricDefinitionId,
          ...(selectedDefinition.resultScope === "TRIAL" ? { trialId } : {}),
          origin,
          value:
            evidenceKind === "PRESENT"
              ? {
                  kind: "PRESENT",
                  value: { value: Number(value), unit, dimension },
                }
              : { kind: "MISSING", reason: missingReason },
        }),
      );
      setValue("");
      onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The neutral result could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (definitions.length === 0) {
    return (
      <EmptyState
        icon="document"
        title="No metric definitions available"
        description="A neutral result requires a workspace-scoped versioned metric definition."
      />
    );
  }
  return (
    <form className="wp-form" onSubmit={(event) => void submit(event)}>
      {error === null ? null : (
        <div className="wp-inline-error" role="alert">
          {error}
        </div>
      )}
      <label className="wp-field">
        <span>Metric definition</span>
        <select
          onChange={(event) => setMetricDefinitionId(event.target.value)}
          value={metricDefinitionId}
        >
          {definitions.map((definition) => (
            <option key={definition.id} value={definition.id}>
              {definition.displayName} · revision {definition.revision} ·{" "}
              {definition.resultScope}
            </option>
          ))}
        </select>
      </label>
      {selectedDefinition?.resultScope === "TRIAL" ? (
        <label className="wp-field">
          <span>Trial</span>
          <select
            aria-label="Result trial"
            onChange={(event) => setTrialId(event.target.value)}
            required
            value={trialId}
          >
            <option value="">Select a trial</option>
            {trials.map((trial) => (
              <option key={trial.id} value={trial.id}>
                Trial {trial.ordinal}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="wp-field">
        <span>Origin</span>
        <select
          onChange={(event) =>
            setOrigin(event.target.value as NeutralResultRecord["origin"])
          }
          value={origin}
        >
          <option value="MANUAL">MANUAL</option>
          <option value="MEASURED">MEASURED</option>
          <option value="IMPORTED">IMPORTED</option>
          <option value="DERIVED_NEUTRAL">DERIVED_NEUTRAL</option>
        </select>
      </label>
      <AssessmentEvidenceFormFields
        evidenceKind={evidenceKind}
        missingReason={missingReason}
        onEvidenceKindChange={setEvidenceKind}
        onMissingReasonChange={setMissingReason}
        onUnitDimensionChange={setUnitDimension}
        onValueChange={setValue}
        unitDimension={unitDimension}
        value={value}
      />
      <Button disabled={busy} type="submit" variant="primary">
        {busy ? "Saving…" : "Record neutral result"}
      </Button>
    </form>
  );
}

function AssessmentTrialsSurface({
  data,
  workspaceId,
  athleteId,
  onRefresh,
}: {
  readonly data: SurfaceData;
  readonly workspaceId: string;
  readonly athleteId: string;
  readonly onRefresh: () => void;
}) {
  const details = data.assessment;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (details === null) {
    return (
      <ErrorState
        title="Assessment not available"
        description="The requested assessment was not returned for this athlete."
      />
    );
  }
  const assessment = details.assessment;
  async function createTrial() {
    setBusy(true);
    setError(null);
    try {
      await requestData<TrialRecord>(
        `/api/v1/assessments/${encode(assessment.id)}/trials`,
        mutationInit({ workspaceId }),
      );
      onRefresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The trial could not be created.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="wp-surface-stack">
      <CapabilityStrip
        capability="REAL_MUTATION"
        note="Trials are ordered records; validity and exclusion are entered explicitly and independently."
      />
      <Surface>
        <SectionHeader
          title={`Trials · ${assessment.assessmentType}`}
          description="A trial can be invalid without being excluded, and exclusion always carries an explicit reason."
          action={
            <div className="wp-form-actions">
              <Button
                onClick={() =>
                  router.push(
                    assessmentHref(workspaceId, athleteId, assessment.id),
                  )
                }
                variant="quiet"
              >
                Assessment detail
              </Button>
              <Button
                disabled={busy}
                onClick={() => void createTrial()}
                variant="primary"
              >
                {busy ? "Adding…" : "Add trial"}
              </Button>
            </div>
          }
        />
        {error === null ? null : (
          <div className="wp-inline-error" role="alert">
            {error}
          </div>
        )}
        <DataTable
          caption="Assessment trials"
          columns={[
            "Order",
            "Lifecycle",
            "Recorded validity",
            "Recorded exclusion",
            "Provenance",
            "Amend",
          ]}
          rows={details.trials.map((trial) => [
            `Trial ${trial.ordinal}`,
            trial.status,
            trial.validity,
            trial.exclusion === "EXCLUDED"
              ? `EXCLUDED · ${trial.exclusionReason ?? "Reason not recorded"}`
              : "INCLUDED",
            `${trial.provenance.sourceClass} · ${trial.provenance.origin}`,
            <TrialControls
              key={trial.id}
              assessmentId={assessment.id}
              onSaved={onRefresh}
              trial={trial}
              workspaceId={workspaceId}
            />,
          ])}
          empty={
            <EmptyState
              icon="activity"
              title="No trials recorded"
              description="Add a trial to make raw observation entry available."
              action={
                <Button onClick={() => void createTrial()} variant="primary">
                  Add trial
                </Button>
              }
            />
          }
        />
      </Surface>
      <div className="wp-two-column">
        <Surface>
          <SectionHeader
            title="Record raw observation"
            description="Use PRESENT for a quantity or choose an explicit missingness reason."
          />
          <AssessmentObservationEntry
            assessmentId={assessment.id}
            data={data}
            onSaved={onRefresh}
            workspaceId={workspaceId}
          />
        </Surface>
        <Surface>
          <SectionHeader
            title="Record neutral result"
            description="Select a versioned metric definition; no formula or interpretation is applied."
          />
          <AssessmentResultEntry
            assessmentId={assessment.id}
            data={data}
            onSaved={onRefresh}
            workspaceId={workspaceId}
          />
        </Surface>
      </div>
      <Surface>
        <SectionHeader
          title="Evidence ledger"
          description="Current raw observations and results are shown exactly as recorded."
        />
        <DataTable
          caption="Raw observation ledger"
          columns={[
            "Trial",
            "Observation",
            "Value",
            "Observed at",
            "Supersedes",
          ]}
          rows={details.observations.map((observation) => [
            `Trial ${details.trials.find((trial) => trial.id === observation.trialId)?.ordinal ?? "?"}`,
            observation.observationKey,
            evidenceValueLabel(observation.value),
            observation.observedAt ?? "Not recorded",
            observation.supersedesObservationId === null
              ? "Original"
              : observation.supersedesObservationId.slice(0, 8),
          ])}
          empty={
            <EmptyState
              icon="activity"
              title="No observations yet"
              description="The ledger will preserve present and missing evidence states."
            />
          }
        />
        <DataTable
          caption="Neutral result ledger"
          columns={["Metric", "Value", "Origin", "Scope", "Supersedes"]}
          rows={details.results.map((result) => [
            `${result.metricDefinition.displayName} · rev ${result.metricDefinition.revision}`,
            evidenceValueLabel(result.value),
            result.origin,
            result.trialId === null ? "Assessment" : "Trial",
            result.supersedesResultId === null
              ? "Original"
              : result.supersedesResultId.slice(0, 8),
          ])}
          empty={
            <EmptyState
              icon="document"
              title="No results yet"
              description="The ledger will preserve the metric revision and neutral source lineage."
            />
          }
        />
      </Surface>
    </div>
  );
}

function AssessmentsSurface({
  surfaceId,
  data,
  workspaceId,
  athleteId,
  assessmentId,
  onRefresh,
}: {
  readonly surfaceId: string;
  readonly data: SurfaceData;
  readonly workspaceId: string;
  readonly athleteId: string | undefined;
  readonly assessmentId: string | undefined;
  readonly onRefresh: () => void;
}) {
  if (athleteId === undefined) {
    return (
      <EmptyState
        icon="users"
        title="Select an athlete"
        description="Assessments are always scoped to one athlete."
      />
    );
  }
  if (surfaceId === "ASM-01") {
    return (
      <AssessmentRegistrySurface
        athleteId={athleteId}
        data={data}
        workspaceId={workspaceId}
      />
    );
  }
  if (surfaceId === "ASM-02") {
    return (
      <AssessmentCreateSurface
        athleteId={athleteId}
        data={data}
        workspaceId={workspaceId}
      />
    );
  }
  if (assessmentId === undefined) {
    return (
      <ErrorState
        title="Assessment context is missing"
        description="This route requires a workspace, athlete, and assessment identifier."
      />
    );
  }
  if (surfaceId === "ASM-04") {
    return (
      <AssessmentTrialsSurface
        athleteId={athleteId}
        data={data}
        onRefresh={onRefresh}
        workspaceId={workspaceId}
      />
    );
  }
  return (
    <AssessmentDetailsSurface
      athleteId={athleteId}
      data={data}
      onRefresh={onRefresh}
      workspaceId={workspaceId}
    />
  );
}

function ReportsSurface({ surfaceId }: { readonly surfaceId: string }) {
  const families = [
    "Training load evidence",
    "Prescription vs performed",
    "Assessment provenance",
    "Audit activity",
  ];
  return (
    <div className="wp-surface-stack">
      <CapabilityStrip
        capability="BACKEND_GAP"
        note="Report configuration is visible as a truthful capability gap until persistence and export are connected."
      />
      <Surface>
        <SectionHeader
          title={
            surfaceId === "RPT-01"
              ? "Report families"
              : surfaceId === "RPT-02"
                ? "Report builder"
                : "Report preview"
          }
          description="Evidence and provenance remain first-class in the report architecture."
        />
        <div className="wp-report-grid">
          {families.map((family, index) => (
            <article className="wp-report-card" key={family}>
              <span className="wp-report-index">0{index + 1}</span>
              <h3>{family}</h3>
              <p>
                Structured output with source records, scope, and time window.
              </p>
              <StatusBadge tone="warning">Not connected</StatusBadge>
            </article>
          ))}
        </div>
        <BackendGap
          capability="Report persistence and export"
          science={surfaceId !== "RPT-01"}
          description="The report surface is intentionally polished but does not claim to save, calculate, or export unsupported output."
        />
      </Surface>
    </div>
  );
}

function SettingsSurface({
  surfaceId,
  data,
}: {
  readonly surfaceId: string;
  readonly data: SurfaceData;
}) {
  const router = useRouter();
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
  const [massUnit, setMassUnit] = useState<WorkspacePreferences["massUnit"]>(
    data.preferences?.massUnit ?? "kg",
  );
  const [distanceUnit, setDistanceUnit] = useState<
    WorkspacePreferences["distanceUnit"]
  >(data.preferences?.distanceUnit ?? "km");
  const [paceUnit, setPaceUnit] = useState<WorkspacePreferences["paceUnit"]>(
    data.preferences?.paceUnit ?? "per-km",
  );
  const [preferencesBusy, setPreferencesBusy] = useState(false);
  const title =
    surfaceId === "SET-02"
      ? "Members & roles"
      : surfaceId === "SET-03"
        ? "Preferences & units"
        : surfaceId === "SET-04"
          ? "Security & sessions"
          : "Workspace settings";
  async function updateMember(memberId: string, role: WorkspaceMember["role"]) {
    setBusyMemberId(memberId);
    setSettingsError(null);
    setSettingsNotice(null);
    try {
      await requestData<WorkspaceMember>(
        `/api/v1/workspaces/${encode(data.workspace.id)}/members/${encode(memberId)}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "idempotency-key": crypto.randomUUID(),
          },
          body: JSON.stringify({ role }),
        },
      );
      setSettingsNotice("Member role saved.");
      router.refresh();
    } catch (cause) {
      setSettingsError(
        cause instanceof Error
          ? cause.message
          : "The member role could not be saved.",
      );
    } finally {
      setBusyMemberId(null);
    }
  }

  async function suspendMember(memberId: string) {
    setBusyMemberId(memberId);
    setSettingsError(null);
    setSettingsNotice(null);
    try {
      await requestData<WorkspaceMember>(
        `/api/v1/workspaces/${encode(data.workspace.id)}/members/${encode(memberId)}`,
        {
          method: "DELETE",
          headers: { "idempotency-key": crypto.randomUUID() },
        },
      );
      setSettingsNotice(
        "Member suspended. Historical audit records remain intact.",
      );
      router.refresh();
    } catch (cause) {
      setSettingsError(
        cause instanceof Error
          ? cause.message
          : "The member could not be suspended.",
      );
    } finally {
      setBusyMemberId(null);
    }
  }

  async function savePreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPreferencesBusy(true);
    setSettingsError(null);
    setSettingsNotice(null);
    try {
      await requestData<WorkspacePreferences>(
        `/api/v1/workspaces/${encode(data.workspace.id)}/preferences`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "idempotency-key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            expectedVersion: data.preferences?.version ?? 0,
            massUnit,
            distanceUnit,
            paceUnit,
          }),
        },
      );
      setSettingsNotice(
        "Display preferences saved. Stored facts remain canonical SI values.",
      );
      router.refresh();
    } catch (cause) {
      setSettingsError(
        cause instanceof Error
          ? cause.message
          : "Display preferences could not be saved.",
      );
    } finally {
      setPreferencesBusy(false);
    }
  }

  return (
    <div className="wp-surface-stack">
      <CapabilityStrip
        capability={
          surfaceId === "SET-01" || surfaceId === "SET-04"
            ? "REAL_READ_ONLY"
            : "REAL_MUTATION"
        }
        note="Workspace settings use server-backed contracts; owner-only mutations are enforced by the existing role matrix."
      />
      {settingsError === null ? null : (
        <div className="wp-inline-error" role="alert">
          {settingsError}
        </div>
      )}
      {settingsNotice === null ? null : (
        <div className="wp-inline-success" role="status">
          {settingsNotice}
        </div>
      )}
      <div className="wp-two-column">
        <Surface>
          <SectionHeader
            title={title}
            description="Compact operational controls with explicit authority states."
          />
          <dl className="wp-detail-list">
            <div>
              <dt>Workspace</dt>
              <dd>{data.workspace.name}</dd>
            </div>
            <div>
              <dt>Workspace id</dt>
              <dd className="wp-mono">{data.workspace.id}</dd>
            </div>
            <div>
              <dt>Membership policy</dt>
              <dd>Server-derived</dd>
            </div>
            <div>
              <dt>Audit evidence</dt>
              <dd>Append-only</dd>
            </div>
          </dl>
        </Surface>
        <Surface>
          {surfaceId === "SET-02" ? (
            <>
              <SectionHeader
                title="Members & roles"
                description="Role changes and suspension are owner-authorized and auditable."
              />
              {data.members.length === 0 ? (
                <EmptyState
                  icon="users"
                  title="No members returned"
                  description="The authenticated workspace has no visible membership records."
                />
              ) : (
                <div className="wp-settings-list">
                  {data.members.map((member) => (
                    <div className="wp-setting-row" key={member.id}>
                      <span>
                        <strong>
                          {member.displayName ??
                            member.email ??
                            member.principalId}
                        </strong>
                        <small>
                          {member.email ?? "No email returned"} ·{" "}
                          {member.status}
                        </small>
                      </span>
                      <span className="wp-form-actions">
                        <select
                          aria-label={`Role for ${member.displayName ?? member.principalId}`}
                          disabled={busyMemberId === member.id}
                          onChange={(event) =>
                            void updateMember(
                              member.id,
                              event.target.value as WorkspaceMember["role"],
                            )
                          }
                          value={member.role}
                        >
                          <option value="owner">Owner</option>
                          <option value="coach">Coach</option>
                          <option value="athlete">Athlete</option>
                          <option value="viewer">Viewer</option>
                        </select>
                        {member.status === "active" ? (
                          <Button
                            disabled={busyMemberId === member.id}
                            onClick={() => void suspendMember(member.id)}
                            type="button"
                            variant="quiet"
                          >
                            Suspend
                          </Button>
                        ) : null}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : surfaceId === "SET-03" ? (
            <>
              <SectionHeader
                title="Preferences & units"
                description="Presentation choices convert only at the display boundary; canonical storage stays SI."
              />
              <form
                className="wp-form"
                onSubmit={(event) => void savePreferences(event)}
              >
                <label className="wp-field">
                  <span>Mass</span>
                  <select
                    onChange={(event) =>
                      setMassUnit(
                        event.target.value as WorkspacePreferences["massUnit"],
                      )
                    }
                    value={massUnit}
                  >
                    <option value="kg">Kilograms (kg)</option>
                    <option value="lb">Pounds (lb)</option>
                  </select>
                </label>
                <label className="wp-field">
                  <span>Distance</span>
                  <select
                    onChange={(event) =>
                      setDistanceUnit(
                        event.target
                          .value as WorkspacePreferences["distanceUnit"],
                      )
                    }
                    value={distanceUnit}
                  >
                    <option value="m">Metres (m)</option>
                    <option value="km">Kilometres (km)</option>
                    <option value="mi">Miles (mi)</option>
                  </select>
                </label>
                <label className="wp-field">
                  <span>Pace display</span>
                  <select
                    onChange={(event) =>
                      setPaceUnit(
                        event.target.value as WorkspacePreferences["paceUnit"],
                      )
                    }
                    value={paceUnit}
                  >
                    <option value="per-km">Per kilometre</option>
                    <option value="per-mi">Per mile</option>
                  </select>
                </label>
                <Button
                  disabled={preferencesBusy}
                  type="submit"
                  variant="primary"
                >
                  {preferencesBusy ? "Saving…" : "Save preferences"}
                </Button>
              </form>
              <p className="wp-helper">
                No pace is stored or inferred as a new fact. Raw observed speed
                remains metres per second.
              </p>
            </>
          ) : surfaceId === "SET-04" ? (
            <>
              <SectionHeader
                title="Security & sessions"
                description="The supported security contract reports the authenticated identity without fabricating session controls."
              />
              {data.security === null ? (
                <EmptyState
                  icon="settings"
                  title="Security details unavailable"
                  description="No security response was returned for this workspace."
                />
              ) : (
                <dl className="wp-detail-list">
                  <div>
                    <dt>Provider</dt>
                    <dd>{data.security.provider}</dd>
                  </div>
                  <div>
                    <dt>Authenticated identity</dt>
                    <dd>
                      {data.security.name} · {data.security.email}
                    </dd>
                  </div>
                  <div>
                    <dt>Session inspection</dt>
                    <dd>
                      {data.security.sessionListingSupported
                        ? "Supported"
                        : "Current request only"}
                    </dd>
                  </div>
                  <div>
                    <dt>Session revocation</dt>
                    <dd>
                      {data.security.sessionRevocationSupported
                        ? "Supported"
                        : "Not exposed"}
                    </dd>
                  </div>
                </dl>
              )}
            </>
          ) : (
            <>
              <SectionHeader
                title="Workspace settings"
                description="Connected operational settings are available from the members, preferences, and security surfaces."
              />
              <div className="wp-settings-list">
                <div className="wp-setting-row">
                  <span>
                    <strong>Workspace visibility</strong>
                    <small>
                      Controlled by active membership and row-level security.
                    </small>
                  </span>
                  <StatusBadge tone="success">Server enforced</StatusBadge>
                </div>
                <div className="wp-setting-row">
                  <span>
                    <strong>Audit evidence</strong>
                    <small>
                      Member and preference mutations append audit events.
                    </small>
                  </span>
                  <StatusBadge tone="success">Append-only</StatusBadge>
                </div>
              </div>
            </>
          )}
        </Surface>
      </div>
    </div>
  );
}

function DefaultSurface({
  surfaceId,
  meta,
}: {
  readonly surfaceId: string;
  readonly meta: SurfaceMeta;
}) {
  return (
    <div className="wp-surface-stack">
      <CapabilityStrip
        capability={meta.capability}
        note={meta.capabilityNote}
      />
      <Surface>
        <SectionHeader
          title="Surface ready"
          description="The shared product shell, state language, and Agent context are active."
        />
        <EmptyState
          icon="grid"
          title={`${surfaceId} is accounted for`}
          description="This surface uses the RC2 route contract and keeps unsupported capability visible instead of fabricating persistence."
        />
      </Surface>
    </div>
  );
}

function SurfaceContent({
  surfaceId,
  meta,
  data,
  workspaceId,
  athleteId,
  assessmentId,
  onRefresh,
}: {
  readonly surfaceId: string;
  readonly meta: SurfaceMeta;
  readonly data: SurfaceData;
  readonly workspaceId: string;
  readonly athleteId: string | undefined;
  readonly assessmentId: string | undefined;
  readonly onRefresh: () => void;
}) {
  if (surfaceId === "GLB-01")
    return <TodaySurface data={data} workspaceId={workspaceId} />;
  if (surfaceId === "GLB-02")
    return <AttentionSurface data={data} workspaceId={workspaceId} />;
  if (surfaceId === "GLB-03")
    return <SearchSurface workspaceId={workspaceId} />;
  if (surfaceId === "AUTH-03" || surfaceId === "ATH-02")
    return (
      <NewAthleteSurface
        onboarding={surfaceId === "AUTH-03"}
        workspaceId={workspaceId}
      />
    );
  if (surfaceId === "ATH-04")
    return <AthleteProfileSurface data={data} workspaceId={workspaceId} />;
  if (surfaceId === "ATH-05" || surfaceId === "ATH-06")
    return athleteId === undefined ? (
      <EmptyState
        icon="users"
        title="Select an athlete"
        description="This screen requires an athlete context."
      />
    ) : (
      <GoalsSurface
        data={data}
        detail={surfaceId === "ATH-06"}
        athleteId={athleteId}
        workspaceId={workspaceId}
      />
    );
  if (surfaceId.startsWith("TRN-"))
    return athleteId === undefined ? (
      <EmptyState
        icon="target"
        title="Select an athlete"
        description="Training design is scoped to an athlete."
      />
    ) : (
      <TrainingSurface
        athleteId={athleteId}
        data={data}
        surfaceId={surfaceId}
        workspaceId={workspaceId}
      />
    );
  if (surfaceId.startsWith("EXE-"))
    return <ExecutionSurface meta={meta} surfaceId={surfaceId} />;
  if (surfaceId === "LIB-01" || surfaceId === "LIB-02")
    return (
      <MovementLibrarySurface
        data={data}
        detail={surfaceId === "LIB-02"}
        workspaceId={workspaceId}
      />
    );
  if (surfaceId === "HIS-01") return <HistorySurface data={data} />;
  if (surfaceId.startsWith("ASM-"))
    return (
      <AssessmentsSurface
        assessmentId={assessmentId}
        athleteId={athleteId}
        data={data}
        onRefresh={onRefresh}
        surfaceId={surfaceId}
        workspaceId={workspaceId}
      />
    );
  if (surfaceId.startsWith("RPT-"))
    return <ReportsSurface surfaceId={surfaceId} />;
  if (surfaceId.startsWith("SET-"))
    return <SettingsSurface data={data} surfaceId={surfaceId} />;
  return <DefaultSurface meta={meta} surfaceId={surfaceId} />;
}

export function ProductExperienceScreen({
  surfaceId,
  workspaceId,
  athleteId,
  goalId,
  movementId,
  routeContext,
}: {
  readonly surfaceId: string;
  readonly workspaceId: string;
  readonly athleteId?: string | undefined;
  readonly goalId?: string | undefined;
  readonly movementId?: string | undefined;
  readonly routeContext?: RouteContext | undefined;
}) {
  const resolvedAthleteId = routeContext?.athleteId ?? athleteId;
  const resolvedGoalId = routeContext?.goalId ?? goalId;
  const resolvedMovementId = routeContext?.movementId ?? movementId;
  const resolvedAssessmentId = routeContext?.assessmentId;
  const [refreshNonce, setRefreshNonce] = useState(0);
  const meta = useMemo(() => metaFor(surfaceId), [surfaceId]);
  const state = useSurfaceData({
    athleteId: resolvedAthleteId,
    goalId: resolvedGoalId,
    movementId: resolvedMovementId,
    assessmentId: resolvedAssessmentId,
    refreshNonce,
    surfaceId,
    workspaceId,
  });
  const workspaceLabel =
    state.status === "ready" ? state.data.workspace.name : "Workout workspace";
  const athleteLabel =
    state.status === "ready" ? state.data.athlete?.displayName : undefined;
  let content: React.ReactNode;
  if (state.status === "loading") {
    content = (
      <Surface>
        <LoadingState />
      </Surface>
    );
  } else if (state.status === "error") {
    content = <ErrorState description={state.message} />;
  } else if (state.status === "unauthorized") {
    content = (
      <ErrorState title="Access not available" description={state.message} />
    );
  } else {
    content = (
      <SurfaceContent
        assessmentId={resolvedAssessmentId}
        athleteId={resolvedAthleteId}
        data={state.data}
        meta={meta}
        onRefresh={() => setRefreshNonce((value) => value + 1)}
        surfaceId={surfaceId}
        workspaceId={workspaceId}
      />
    );
  }
  return (
    <AppShell
      athleteId={resolvedAthleteId}
      athleteLabel={athleteLabel}
      surfaceLabel={meta.title}
      workspaceId={workspaceId}
      workspaceLabel={workspaceLabel}
    >
      <PageHeader
        actions={<CapabilityStrip capability={meta.capability} note="" />}
        badges={HeaderBadges({ meta })}
        description={meta.description}
        eyebrow={`${meta.area} · ${surfaceId}`}
        title={meta.title}
      />
      <SurfaceNavigator
        athleteId={resolvedAthleteId}
        surfaceId={surfaceId}
        workspaceId={workspaceId}
      />
      {content}
      <PageNotes meta={meta} surfaceId={surfaceId} />
    </AppShell>
  );
}

export function SharedStateSurface({
  state,
}: {
  readonly state: "EMPTY" | "ERROR" | "CONFLICT" | "UNAUTHORIZED";
}) {
  const content =
    state === "EMPTY" ? (
      <EmptyState
        icon="grid"
        title="Nothing here yet"
        description="Create the first record or change the current filter to continue."
      />
    ) : state === "ERROR" ? (
      <ErrorState description="The current data could not be loaded. Retry the source operation or return to a known workspace surface." />
    ) : state === "CONFLICT" ? (
      <ErrorState
        title="This record changed"
        description="The source version is newer than the edit you attempted. Reload the current record before deciding what to keep."
      />
    ) : (
      <ErrorState
        title="Access not available"
        description="Your authenticated principal cannot read this workspace-scoped record."
      />
    );
  return (
    <main className="wp-state-page">
      <h1 className="sr-only">WorkoutPal workspace state</h1>
      <Surface className="wp-shared-state-surface">{content}</Surface>
    </main>
  );
}

export const PX2_AGENT_OVERLAYS = [
  "AGT-01",
  "AGT-02",
  "AGT-03",
  "AGT-04",
  "AGT-05",
  "AGT-06",
  "AGT-07",
] as const;
