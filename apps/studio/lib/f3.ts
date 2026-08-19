import type { PrescriptionBlock } from "@workoutpal/training-design";
import type { z } from "zod";
import type { prescriptionBlockContractSchema } from "./contracts";

type ContractBlock = z.infer<typeof prescriptionBlockContractSchema>;

function id(value: string | undefined): string {
  return value ?? crypto.randomUUID();
}

export function materializePrescriptionBlocks(
  blocks: readonly ContractBlock[] | undefined,
): readonly PrescriptionBlock[] | undefined {
  if (blocks === undefined) return undefined;
  return blocks.map((block) => {
    if (block.kind === "strength") {
      return {
        id: id(block.id),
        kind: "strength" as const,
        ordinal: block.ordinal,
        exercises: block.exercises.map((exercise) => ({
          id: id(exercise.id),
          movementId: exercise.movementId,
          ordinal: exercise.ordinal,
          ...(exercise.notes === undefined ? {} : { notes: exercise.notes }),
          sets: exercise.sets.map((set) => ({
            id: id(set.id),
            ordinal: set.ordinal,
            ...(set.targetRepMin === undefined
              ? {}
              : { targetRepMin: set.targetRepMin }),
            ...(set.targetRepMax === undefined
              ? {}
              : { targetRepMax: set.targetRepMax }),
            ...(set.targetLoadKg === undefined
              ? {}
              : { targetLoadKg: set.targetLoadKg }),
            ...(set.targetRpe === undefined
              ? {}
              : { targetRpe: set.targetRpe }),
            ...(set.targetRpeScale === undefined
              ? {}
              : { targetRpeScale: set.targetRpeScale }),
            ...(set.targetRir === undefined
              ? {}
              : { targetRir: set.targetRir }),
            ...(set.targetRirScale === undefined
              ? {}
              : { targetRirScale: set.targetRirScale }),
            ...(set.targetRestSeconds === undefined
              ? {}
              : { targetRestSeconds: set.targetRestSeconds }),
            ...(set.targetDurationSeconds === undefined
              ? {}
              : { targetDurationSeconds: set.targetDurationSeconds }),
            ...(set.targetVelocityMps === undefined
              ? {}
              : { targetVelocityMps: set.targetVelocityMps }),
            ...(set.tempoDescriptor === undefined
              ? {}
              : { tempoDescriptor: set.tempoDescriptor }),
            ...(set.notes === undefined ? {} : { notes: set.notes }),
          })),
        })),
      };
    }
    if (block.kind === "endurance") {
      return {
        id: id(block.id),
        kind: "endurance" as const,
        ordinal: block.ordinal,
        segments: block.segments.map((segment) => ({
          id: id(segment.id),
          parentSegmentId: segment.parentSegmentId ?? null,
          ordinal: segment.ordinal,
          kind: segment.kind,
          repeatCount: segment.repeatCount,
          ...(segment.durationSeconds === undefined
            ? {}
            : { durationSeconds: segment.durationSeconds }),
          ...(segment.distanceMeters === undefined
            ? {}
            : { distanceMeters: segment.distanceMeters }),
          ...(segment.targetHrMin === undefined
            ? {}
            : { targetHrMin: segment.targetHrMin }),
          ...(segment.targetHrMax === undefined
            ? {}
            : { targetHrMax: segment.targetHrMax }),
          ...(segment.targetSpeedMpsMin === undefined
            ? {}
            : { targetSpeedMpsMin: segment.targetSpeedMpsMin }),
          ...(segment.targetSpeedMpsMax === undefined
            ? {}
            : { targetSpeedMpsMax: segment.targetSpeedMpsMax }),
          ...(segment.targetPowerWattsMin === undefined
            ? {}
            : { targetPowerWattsMin: segment.targetPowerWattsMin }),
          ...(segment.targetPowerWattsMax === undefined
            ? {}
            : { targetPowerWattsMax: segment.targetPowerWattsMax }),
          ...(segment.targetRpe === undefined
            ? {}
            : { targetRpe: segment.targetRpe }),
          ...(segment.notes === undefined ? {} : { notes: segment.notes }),
        })),
      };
    }
    if (block.kind === "mobility") {
      return {
        id: id(block.id),
        kind: "mobility" as const,
        ordinal: block.ordinal,
        items: block.items.map((item) => ({
          id: id(item.id),
          movementId: item.movementId,
          ordinal: item.ordinal,
          ...(item.sets === undefined ? {} : { sets: item.sets }),
          ...(item.reps === undefined ? {} : { reps: item.reps }),
          ...(item.holdSeconds === undefined
            ? {}
            : { holdSeconds: item.holdSeconds }),
          ...(item.side === undefined ? {} : { side: item.side }),
          ...(item.targetRpe === undefined
            ? {}
            : { targetRpe: item.targetRpe }),
          ...(item.notes === undefined ? {} : { notes: item.notes }),
        })),
      };
    }
    return {
      id: id(block.id),
      kind: "generic" as const,
      ordinal: block.ordinal,
      description: block.description,
    };
  }) as unknown as readonly PrescriptionBlock[];
}
