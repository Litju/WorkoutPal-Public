import type {
  SciencePort,
  ScienceRequest,
  ScienceResult,
} from "@workoutpal/science-contract";
import type { UUID, WorkspaceId } from "@workoutpal/shared-kernel";

export type ComputationOwner = "APPLICATION" | "SCIENCE";

export interface MetricDefinition {
  readonly id: UUID;
  readonly name: string;
  readonly computationOwner: ComputationOwner;
  readonly unit: string | null;
}

export interface PlanActualSummary {
  readonly workspaceId: WorkspaceId;
  readonly plannedCount: number;
  readonly completedCount: number;
  readonly absentCount: number;
}

export function summarizePlanActual(input: {
  readonly workspaceId: WorkspaceId;
  readonly plannedCount: number;
  readonly completedCount: number;
}): PlanActualSummary {
  if (
    !Number.isInteger(input.plannedCount) ||
    !Number.isInteger(input.completedCount)
  ) {
    throw new Error("Plan-versus-actual counts must be integers.");
  }
  if (
    input.plannedCount < 0 ||
    input.completedCount < 0 ||
    input.completedCount > input.plannedCount
  ) {
    throw new Error(
      "Plan-versus-actual counts must represent a valid product fact.",
    );
  }

  return {
    ...input,
    absentCount: input.plannedCount - input.completedCount,
  };
}

export function requestScienceMetric(
  sciencePort: SciencePort,
  request: ScienceRequest,
): Promise<ScienceResult> {
  return sciencePort.compute(request);
}

export * from "./f5.js";
