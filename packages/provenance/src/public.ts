import type {
  ActorType,
  CorrelationContext,
  Instant,
  UUID,
  WorkspaceId,
} from "@workoutpal/shared-kernel";
import { parseIanaTimeZone, parseInstant } from "@workoutpal/shared-kernel";

export interface AuditActor {
  readonly type: ActorType;
  readonly id: UUID;
}

export interface AuditEvent {
  readonly eventId: UUID;
  readonly workspaceId: WorkspaceId;
  readonly occurredAt: Instant;
  readonly actor: AuditActor;
  readonly action: string;
  readonly aggregateType: string;
  readonly aggregateId: UUID;
  readonly correlation: CorrelationContext;
  readonly diff: Readonly<Record<string, unknown>>;
}

export interface AuditPort {
  append(event: AuditEvent): Promise<void>;
  listForAggregate(
    workspaceId: WorkspaceId,
    aggregateId: UUID,
  ): Promise<readonly AuditEvent[]>;
}

export function createAuditEvent(input: AuditEvent): AuditEvent {
  if (
    input.action.trim().length === 0 ||
    input.aggregateType.trim().length === 0
  ) {
    throw new Error("Audit events require an action and aggregate type.");
  }

  return input;
}

export type EvidenceSourceClass =
  | "MANUAL_ENTRY"
  | "DEVICE_CAPTURE"
  | "IMPORT"
  | "SYSTEM_DERIVED_NEUTRAL";

export type EvidenceOrigin = "HUMAN" | "DEVICE" | "SYSTEM";

export interface ProtocolRevisionReference {
  readonly protocolId: UUID;
  readonly revisionId: UUID;
  readonly revision: number;
}

export interface EvidenceLineage {
  readonly sourceClass: EvidenceSourceClass;
  readonly sourceReference: string | null;
  readonly sourceId: UUID | null;
  readonly sourceArtifactIds: readonly UUID[];
  readonly protocolRevision: ProtocolRevisionReference | null;
  readonly origin: EvidenceOrigin;
  readonly actorId: UUID | null;
  readonly capturedAt: Instant | null;
  readonly ingestedAt: Instant;
  readonly createdAt: Instant;
  readonly parentEvidenceIds: readonly UUID[];
  readonly supersedesEvidenceId: UUID | null;
}

export interface SourceArtifact {
  readonly id: UUID;
  readonly workspaceId: WorkspaceId;
  /** Stable private object identity; signed URLs are delivery concerns. */
  readonly storageObjectReference: string;
  readonly mediaType: string;
  readonly sizeBytes: number;
  readonly checksumSha256: string;
  readonly originalFilename: string | null;
  readonly sourceInformation: Readonly<Record<string, unknown>>;
  readonly createdAt: Instant;
  readonly ingestedAt: Instant;
}

function nonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) throw new Error(`${label} is required.`);
  return normalized;
}

function assertUuidLike(value: UUID | null, label: string): void {
  if (value !== null && value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty identifier.`);
  }
}

export function createEvidenceLineage(input: EvidenceLineage): EvidenceLineage {
  if (input.sourceArtifactIds.some((id) => id.trim().length === 0)) {
    throw new Error("Evidence artifact identifiers must be non-empty.");
  }
  if (
    new Set(input.sourceArtifactIds).size !== input.sourceArtifactIds.length
  ) {
    throw new Error("Evidence artifact identifiers must be unique.");
  }
  if (
    input.parentEvidenceIds.some((id) => id.trim().length === 0) ||
    new Set(input.parentEvidenceIds).size !== input.parentEvidenceIds.length
  ) {
    throw new Error(
      "Parent evidence identifiers must be unique and non-empty.",
    );
  }
  if (
    input.supersedesEvidenceId !== null &&
    input.parentEvidenceIds.includes(input.supersedesEvidenceId)
  ) {
    throw new Error(
      "An amendment cannot also treat its superseded evidence as a parent.",
    );
  }
  assertUuidLike(input.sourceId, "Source identifier");
  assertUuidLike(input.actorId, "Actor identifier");
  if (input.protocolRevision !== null) {
    assertUuidLike(input.protocolRevision.protocolId, "Protocol identifier");
    assertUuidLike(
      input.protocolRevision.revisionId,
      "Protocol revision identifier",
    );
    if (
      !Number.isInteger(input.protocolRevision.revision) ||
      input.protocolRevision.revision < 1
    ) {
      throw new Error("Protocol revision must be a positive integer.");
    }
  }
  if (
    input.sourceClass === "SYSTEM_DERIVED_NEUTRAL" &&
    input.origin !== "SYSTEM"
  ) {
    throw new Error("System-derived neutral evidence must have SYSTEM origin.");
  }
  if (input.origin === "DEVICE" && input.sourceClass !== "DEVICE_CAPTURE") {
    throw new Error("DEVICE origin requires DEVICE_CAPTURE source class.");
  }
  if (input.sourceReference !== null)
    nonEmpty(input.sourceReference, "Source reference");
  parseInstant(input.ingestedAt);
  parseInstant(input.createdAt);
  if (input.capturedAt !== null) parseInstant(input.capturedAt);
  return input;
}

export function createSourceArtifact(input: SourceArtifact): SourceArtifact {
  nonEmpty(input.storageObjectReference, "Storage object reference");
  nonEmpty(input.mediaType, "Artifact media type");
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes < 0) {
    throw new Error("Artifact size must be a non-negative integer.");
  }
  if (!/^[0-9a-f]{64}$/u.test(input.checksumSha256)) {
    throw new Error("Artifact checksum must be a SHA-256 hex digest.");
  }
  if (/^https?:\/\//iu.test(input.storageObjectReference)) {
    throw new Error("A signed URL cannot be used as artifact identity.");
  }
  parseInstant(input.createdAt);
  parseInstant(input.ingestedAt);
  return input;
}

export function serializeEvidenceLineage(lineage: EvidenceLineage): string {
  return JSON.stringify(createEvidenceLineage(lineage));
}

export function parseEvidenceLineage(serialized: string): EvidenceLineage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    throw new Error("Serialized evidence lineage must be valid JSON.");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Serialized evidence lineage must be an object.");
  }
  const value = parsed as Record<string, unknown>;
  const sourceClass = value.sourceClass;
  const origin = value.origin;
  if (
    (sourceClass !== "MANUAL_ENTRY" &&
      sourceClass !== "DEVICE_CAPTURE" &&
      sourceClass !== "IMPORT" &&
      sourceClass !== "SYSTEM_DERIVED_NEUTRAL") ||
    (origin !== "HUMAN" && origin !== "DEVICE" && origin !== "SYSTEM")
  ) {
    throw new Error(
      "Serialized evidence lineage has invalid source semantics.",
    );
  }
  if (
    typeof value.ingestedAt !== "string" ||
    typeof value.createdAt !== "string" ||
    !Array.isArray(value.sourceArtifactIds) ||
    !Array.isArray(value.parentEvidenceIds)
  ) {
    throw new Error("Serialized evidence lineage is incomplete.");
  }
  const protocolRevision = value.protocolRevision;
  return createEvidenceLineage({
    sourceClass,
    origin,
    sourceReference:
      value.sourceReference === null || value.sourceReference === undefined
        ? null
        : String(value.sourceReference),
    sourceId:
      value.sourceId === null || value.sourceId === undefined
        ? null
        : (String(value.sourceId) as UUID),
    sourceArtifactIds: value.sourceArtifactIds.map((id) => String(id) as UUID),
    protocolRevision:
      protocolRevision === null || protocolRevision === undefined
        ? null
        : {
            protocolId: String(
              (protocolRevision as Record<string, unknown>).protocolId,
            ) as UUID,
            revisionId: String(
              (protocolRevision as Record<string, unknown>).revisionId,
            ) as UUID,
            revision: Number(
              (protocolRevision as Record<string, unknown>).revision,
            ),
          },
    actorId:
      value.actorId === null || value.actorId === undefined
        ? null
        : (String(value.actorId) as UUID),
    capturedAt:
      value.capturedAt === null || value.capturedAt === undefined
        ? null
        : (String(value.capturedAt) as Instant),
    ingestedAt: value.ingestedAt as Instant,
    createdAt: value.createdAt as Instant,
    parentEvidenceIds: value.parentEvidenceIds.map((id) => String(id) as UUID),
    supersedesEvidenceId:
      value.supersedesEvidenceId === null ||
      value.supersedesEvidenceId === undefined
        ? null
        : (String(value.supersedesEvidenceId) as UUID),
  });
}

export function validateEvidenceTimeZone(value: string): string {
  return parseIanaTimeZone(value);
}
