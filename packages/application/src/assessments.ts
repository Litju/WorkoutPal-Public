import { canAccessAthlete, canAccessWorkspace } from "@workoutpal/accounts";
import type {
  AcquisitionSource,
  Assessment,
  AssessmentAmendment,
  MetricDefinition,
  NeutralResult,
  Protocol,
  ProtocolRevision,
  RawObservation,
  Trial,
  TrialExclusionState,
  TrialValidityState,
} from "@workoutpal/assessments";
import {
  createAcquisitionSource,
  createAssessment,
  createAssessmentAmendment,
  createMetricDefinition,
  createNeutralResult,
  createProtocol,
  createProtocolRevision,
  createRawObservation,
  createTrial,
} from "@workoutpal/assessments";
import type {
  EvidenceLineage,
  EvidenceSourceClass,
  SourceArtifact,
} from "@workoutpal/provenance";
import {
  createEvidenceLineage,
  createSourceArtifact,
} from "@workoutpal/provenance";
import type {
  Dimension,
  EvidenceValue,
  Instant,
  Quantity,
  UUID,
  WorkspaceId,
  WorkspaceScope,
} from "@workoutpal/shared-kernel";
import { transactionContext } from "./application-shared.js";
import {
  ApplicationError,
  type AssessmentRepository,
  type AuditEvent,
  type CommandMetadata,
  type Psc4Persistence,
  type Psc4Repositories,
  type RawObservationRepository,
  type TrialRepository,
} from "./contracts.js";

export interface AssessmentDetails {
  readonly assessment: Assessment;
  readonly trials: readonly Trial[];
  readonly observations: readonly RawObservation[];
  readonly results: readonly NeutralResult[];
  readonly amendments: readonly AssessmentAmendment[];
}

export interface AssessmentApplicationInput extends CommandMetadata {
  readonly workspaceId: WorkspaceId;
}

function now(): Instant {
  return new Date().toISOString() as Instant;
}

function newId(): UUID {
  return crypto.randomUUID() as UUID;
}

function scope(workspaceId: WorkspaceId): WorkspaceScope {
  return { workspaceId };
}

function requiredText(value: string, label: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new ApplicationError("VALIDATION_FAILED", `${label} is required.`);
  }
  return normalized;
}

function expectedVersion(value: number, allowZero = false): void {
  if (!Number.isInteger(value) || (allowZero ? value < 0 : value < 1)) {
    throw new ApplicationError(
      "VALIDATION_FAILED",
      `expectedVersion must be a ${allowZero ? "non-negative" : "positive"} integer.`,
    );
  }
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(",")}}`;
}

async function fingerprint(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(stableSerialize(value)),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function snapshot(value: unknown): Readonly<Record<string, unknown>> {
  const copy = JSON.parse(JSON.stringify(value)) as unknown;
  if (copy === null || typeof copy !== "object" || Array.isArray(copy)) {
    throw new ApplicationError(
      "INTERNAL_ERROR",
      "A historical state must be an object.",
    );
  }
  return copy as Readonly<Record<string, unknown>>;
}

function domainError(error: unknown): never {
  if (error instanceof ApplicationError) throw error;
  if (error instanceof Error) {
    throw new ApplicationError("DOMAIN_RULE_VIOLATION", error.message);
  }
  throw error;
}

function manualLineage(
  actorId: UUID,
  occurredAt: Instant,
  input?: EvidenceLineage,
): EvidenceLineage {
  const candidate = input ?? {
    sourceClass: "MANUAL_ENTRY" as const,
    sourceReference: null,
    sourceId: null,
    sourceArtifactIds: [],
    protocolRevision: null,
    origin: "HUMAN" as const,
    actorId,
    capturedAt: occurredAt,
    ingestedAt: occurredAt,
    createdAt: occurredAt,
    parentEvidenceIds: [],
    supersedesEvidenceId: null,
  };
  return createEvidenceLineage({
    ...candidate,
    actorId,
    ingestedAt: occurredAt,
    createdAt: occurredAt,
  });
}

export class AssessmentApplication {
  constructor(private readonly persistence: Psc4Persistence) {}

  async listAssessments(
    input: AssessmentApplicationInput & {
      readonly athleteId: import("@workoutpal/shared-kernel").AthleteId;
    },
  ): Promise<readonly Assessment[]> {
    return this.persistence.transaction(async (repositories) => {
      await this.authorizeAthlete(repositories, input, input.athleteId, "read");
      return repositories.assessments.listForAthlete(
        scope(input.workspaceId),
        input.athleteId,
      );
    }, transactionContext(input));
  }

  async getAssessment(
    input: AssessmentApplicationInput & {
      readonly assessmentId: UUID;
      readonly athleteId?: import("@workoutpal/shared-kernel").AthleteId;
    },
  ): Promise<AssessmentDetails> {
    return this.persistence.transaction(async (repositories) => {
      const assessment = await this.requireAssessment(
        repositories.assessments,
        input.workspaceId,
        input.assessmentId,
      );
      if (
        input.athleteId !== undefined &&
        assessment.athleteId !== input.athleteId
      ) {
        throw new ApplicationError(
          "NOT_FOUND",
          "Assessment not found for this athlete.",
        );
      }
      await this.authorizeAthlete(
        repositories,
        input,
        assessment.athleteId,
        "read",
      );
      return this.details(repositories, assessment);
    }, transactionContext(input));
  }

  async listProtocols(
    input: AssessmentApplicationInput,
  ): Promise<readonly Protocol[]> {
    return this.persistence.transaction(async (repositories) => {
      await this.authorizeWorkspace(repositories, input, "read");
      return repositories.protocols.list(scope(input.workspaceId));
    }, transactionContext(input));
  }

  async listProtocolRevisions(
    input: AssessmentApplicationInput & { readonly protocolId: UUID },
  ): Promise<readonly ProtocolRevision[]> {
    return this.persistence.transaction(async (repositories) => {
      await this.authorizeWorkspace(repositories, input, "read");
      const protocol = await repositories.protocols.get(
        scope(input.workspaceId),
        input.protocolId,
      );
      if (protocol === null)
        throw new ApplicationError("RESOURCE_NOT_FOUND", "Protocol not found.");
      return repositories.protocolRevisions.listForProtocol(
        scope(input.workspaceId),
        input.protocolId,
      );
    }, transactionContext(input));
  }

  async createProtocol(
    input: AssessmentApplicationInput & {
      readonly key: string;
      readonly name: string;
      readonly description?: string | null;
      readonly idempotencyKey?: string;
    },
  ): Promise<Protocol> {
    const occurredAt = input.occurredAt ?? now();
    const requestHash = await fingerprint({
      operation: "protocol.create",
      workspaceId: input.workspaceId,
      key: input.key,
      name: input.name,
      description: input.description ?? null,
    });
    return this.persistence.transaction(async (repositories) => {
      await this.authorizeWorkspace(repositories, input, "write");
      const prior = await this.reserveIdempotency(
        repositories,
        input,
        "assessment.protocol.create",
        requestHash,
      );
      if (prior !== undefined) return prior as Protocol;
      let protocol: Protocol;
      try {
        protocol = createProtocol({
          id: newId(),
          workspaceId: input.workspaceId,
          key: requiredText(input.key, "Protocol key"),
          name: requiredText(input.name, "Protocol name"),
          description: input.description ?? null,
          status: "ACTIVE",
          currentRevision: 0,
          createdAt: occurredAt,
          createdBy: input.principalId,
          updatedAt: occurredAt,
          updatedBy: input.principalId,
          version: 1,
        });
      } catch (error) {
        return domainError(error);
      }
      await repositories.protocols.insert(protocol);
      await repositories.audit.append(
        this.audit(
          input,
          "assessment.protocol.created",
          "Protocol",
          protocol.id,
          null,
          protocol.version,
          { key: protocol.key },
        ),
      );
      await this.completeIdempotency(
        repositories,
        input,
        "assessment.protocol.create",
        protocol,
      );
      return protocol;
    }, transactionContext(input));
  }

  async createProtocolRevision(
    input: AssessmentApplicationInput & {
      readonly protocolId: UUID;
      readonly name: string;
      readonly description?: string | null;
      readonly metadata?: Readonly<Record<string, unknown>>;
      readonly expectedVersion: number;
      readonly idempotencyKey?: string;
    },
  ): Promise<ProtocolRevision> {
    expectedVersion(input.expectedVersion);
    const occurredAt = input.occurredAt ?? now();
    const requestHash = await fingerprint({
      operation: "assessment.protocol.revision.create",
      workspaceId: input.workspaceId,
      protocolId: input.protocolId,
      name: input.name,
      description: input.description ?? null,
      metadata: input.metadata ?? {},
      expectedVersion: input.expectedVersion,
    });
    return this.persistence.transaction(async (repositories) => {
      await this.authorizeWorkspace(repositories, input, "write");
      const prior = await this.reserveIdempotency(
        repositories,
        input,
        "assessment.protocol.revision.create",
        requestHash,
      );
      if (prior !== undefined) return prior as ProtocolRevision;
      const protocol = await repositories.protocols.get(
        scope(input.workspaceId),
        input.protocolId,
      );
      if (protocol === null)
        throw new ApplicationError("RESOURCE_NOT_FOUND", "Protocol not found.");
      const revisionNumber = protocol.currentRevision + 1;
      const revision = createProtocolRevision({
        id: newId(),
        workspaceId: input.workspaceId,
        protocolId: protocol.id,
        revision: revisionNumber,
        name: requiredText(input.name, "Protocol revision name"),
        description: input.description ?? null,
        metadata: input.metadata ?? {},
        createdAt: occurredAt,
        createdBy: input.principalId,
      });
      const updatedProtocol = createProtocol({
        ...protocol,
        currentRevision: revisionNumber,
        updatedAt: occurredAt,
        updatedBy: input.principalId,
        version: protocol.version + 1,
      });
      await repositories.protocolRevisions.insert(revision);
      const persisted = await repositories.protocols.updateExpected(
        scope(input.workspaceId),
        updatedProtocol,
        input.expectedVersion,
      );
      if (persisted === null)
        throw new ApplicationError(
          "VERSION_CONFLICT",
          "The protocol changed before its revision was added.",
        );
      await repositories.audit.append(
        this.audit(
          input,
          "assessment.protocol.revision_created",
          "Protocol",
          protocol.id,
          protocol.version,
          persisted.version,
          { revision: revisionNumber, revisionId: revision.id },
        ),
      );
      await this.completeIdempotency(
        repositories,
        input,
        "assessment.protocol.revision.create",
        revision,
      );
      return revision;
    }, transactionContext(input));
  }

  async listAcquisitionSources(
    input: AssessmentApplicationInput,
  ): Promise<readonly AcquisitionSource[]> {
    return this.persistence.transaction(async (repositories) => {
      await this.authorizeWorkspace(repositories, input, "read");
      return repositories.acquisitionSources.list(scope(input.workspaceId));
    }, transactionContext(input));
  }

  async createAcquisitionSource(
    input: AssessmentApplicationInput & {
      readonly sourceClass: EvidenceSourceClass;
      readonly label: string;
      readonly manufacturer?: string | null;
      readonly model?: string | null;
      readonly serialNumber?: string | null;
      readonly firmwareVersion?: string | null;
      readonly softwareVersion?: string | null;
      readonly configurationMetadata?: Readonly<Record<string, unknown>>;
      readonly idempotencyKey?: string;
    },
  ): Promise<AcquisitionSource> {
    const occurredAt = input.occurredAt ?? now();
    const requestHash = await fingerprint({
      operation: "assessment.source.create",
      workspaceId: input.workspaceId,
      sourceClass: input.sourceClass,
      label: input.label,
      manufacturer: input.manufacturer ?? null,
      model: input.model ?? null,
      serialNumber: input.serialNumber ?? null,
      firmwareVersion: input.firmwareVersion ?? null,
      softwareVersion: input.softwareVersion ?? null,
      configurationMetadata: input.configurationMetadata ?? {},
    });
    return this.persistence.transaction(async (repositories) => {
      await this.authorizeWorkspace(repositories, input, "write");
      const prior = await this.reserveIdempotency(
        repositories,
        input,
        "assessment.source.create",
        requestHash,
      );
      if (prior !== undefined) return prior as AcquisitionSource;
      const source = createAcquisitionSource({
        id: newId(),
        workspaceId: input.workspaceId,
        sourceClass: input.sourceClass,
        label: requiredText(input.label, "Acquisition source label"),
        manufacturer: input.manufacturer ?? null,
        model: input.model ?? null,
        serialNumber: input.serialNumber ?? null,
        firmwareVersion: input.firmwareVersion ?? null,
        softwareVersion: input.softwareVersion ?? null,
        configurationMetadata: input.configurationMetadata ?? {},
        createdAt: occurredAt,
        createdBy: input.principalId,
        updatedAt: occurredAt,
        updatedBy: input.principalId,
        version: 1,
      });
      await repositories.acquisitionSources.insert(source);
      await repositories.audit.append(
        this.audit(
          input,
          "assessment.source.created",
          "AcquisitionSource",
          source.id,
          null,
          source.version,
          { sourceClass: source.sourceClass },
        ),
      );
      await this.completeIdempotency(
        repositories,
        input,
        "assessment.source.create",
        source,
      );
      return source;
    }, transactionContext(input));
  }

  async createSourceArtifact(
    input: AssessmentApplicationInput & {
      readonly storageObjectReference: string;
      readonly mediaType: string;
      readonly sizeBytes: number;
      readonly checksumSha256: string;
      readonly originalFilename?: string | null;
      readonly sourceInformation?: Readonly<Record<string, unknown>>;
      readonly idempotencyKey?: string;
    },
  ): Promise<SourceArtifact> {
    const occurredAt = input.occurredAt ?? now();
    const requestHash = await fingerprint({
      operation: "assessment.source_artifact.create",
      workspaceId: input.workspaceId,
      storageObjectReference: input.storageObjectReference,
      mediaType: input.mediaType,
      sizeBytes: input.sizeBytes,
      checksumSha256: input.checksumSha256,
      originalFilename: input.originalFilename ?? null,
      sourceInformation: input.sourceInformation ?? {},
    });
    return this.persistence.transaction(async (repositories) => {
      await this.authorizeWorkspace(repositories, input, "write");
      const prior = await this.reserveIdempotency(
        repositories,
        input,
        "assessment.source_artifact.create",
        requestHash,
      );
      if (prior !== undefined) return prior as SourceArtifact;
      const artifact = createSourceArtifact({
        id: newId(),
        workspaceId: input.workspaceId,
        storageObjectReference: input.storageObjectReference,
        mediaType: input.mediaType,
        sizeBytes: input.sizeBytes,
        checksumSha256: input.checksumSha256,
        originalFilename: input.originalFilename ?? null,
        sourceInformation: input.sourceInformation ?? {},
        createdAt: occurredAt,
        ingestedAt: occurredAt,
      });
      await repositories.sourceArtifacts.insert(artifact);
      await repositories.audit.append(
        this.audit(
          input,
          "assessment.source_artifact.created",
          "SourceArtifact",
          artifact.id,
          null,
          null,
          { mediaType: artifact.mediaType, sizeBytes: artifact.sizeBytes },
        ),
      );
      await this.completeIdempotency(
        repositories,
        input,
        "assessment.source_artifact.create",
        artifact,
      );
      return artifact;
    }, transactionContext(input));
  }

  async createAssessment(
    input: AssessmentApplicationInput & {
      readonly athleteId: import("@workoutpal/shared-kernel").AthleteId;
      readonly assessmentType: string;
      readonly purpose?: string | null;
      readonly occurrenceDate: import("@workoutpal/shared-kernel").LocalDate;
      readonly assessmentOccurredAt?: Instant | null;
      readonly timeZone: import("@workoutpal/shared-kernel").IanaTimeZone;
      readonly protocolRevisionId?: UUID | null;
      readonly sourceId?: UUID | null;
      readonly sourceVersion?: number | null;
      readonly artifactIds?: readonly UUID[];
      readonly notes?: string | null;
      readonly reason?: string;
      readonly idempotencyKey?: string;
    },
  ): Promise<Assessment> {
    const occurredAt = input.occurredAt ?? now();
    const requestHash = await fingerprint({
      operation: "assessment.create",
      workspaceId: input.workspaceId,
      athleteId: input.athleteId,
      assessmentType: input.assessmentType,
      purpose: input.purpose ?? null,
      occurrenceDate: input.occurrenceDate,
      measuredAt: input.assessmentOccurredAt ?? null,
      timeZone: input.timeZone,
      protocolRevisionId: input.protocolRevisionId ?? null,
      sourceId: input.sourceId ?? null,
      sourceVersion: input.sourceVersion ?? null,
      artifactIds: input.artifactIds ?? [],
      notes: input.notes ?? null,
    });
    return this.persistence.transaction(async (repositories) => {
      await this.authorizeAthlete(
        repositories,
        input,
        input.athleteId,
        "write",
      );
      const prior = await this.reserveIdempotency(
        repositories,
        input,
        "assessment.create",
        requestHash,
      );
      if (prior !== undefined) return prior as Assessment;
      const protocolRevision = await this.resolveProtocolRevision(
        repositories,
        input.workspaceId,
        input.protocolRevisionId,
      );
      const source = await this.resolveSource(
        repositories,
        input.workspaceId,
        input.sourceId,
      );
      const artifactIds = input.artifactIds ?? [];
      await this.assertArtifacts(repositories, input.workspaceId, artifactIds);
      let assessment: Assessment;
      try {
        assessment = createAssessment({
          id: newId(),
          workspaceId: input.workspaceId,
          athleteId: input.athleteId,
          assessmentType: input.assessmentType,
          purpose: input.purpose ?? null,
          status: "RECORDED",
          occurrenceDate: input.occurrenceDate,
          occurredAt: input.assessmentOccurredAt ?? null,
          timeZone: input.timeZone,
          protocolRevision,
          source,
          sourceVersion: input.sourceVersion ?? source?.version ?? null,
          artifactIds: [...artifactIds],
          notes: input.notes ?? null,
          createdAt: occurredAt,
          createdBy: input.principalId,
          updatedAt: occurredAt,
          updatedBy: input.principalId,
          version: 1,
        });
      } catch (error) {
        return domainError(error);
      }
      await repositories.assessments.insert(assessment);
      await repositories.audit.append(
        this.audit(
          input,
          "assessment.created",
          "Assessment",
          assessment.id,
          null,
          assessment.version,
          {
            athleteId: assessment.athleteId,
            assessmentType: assessment.assessmentType,
          },
        ),
      );
      await this.completeIdempotency(
        repositories,
        input,
        "assessment.create",
        assessment,
      );
      return assessment;
    }, transactionContext(input));
  }

  async updateAssessment(
    input: AssessmentApplicationInput & {
      readonly assessmentId: UUID;
      readonly expectedVersion: number;
      readonly assessmentType?: string;
      readonly purpose?: string | null;
      readonly occurrenceDate?: import("@workoutpal/shared-kernel").LocalDate;
      readonly assessmentOccurredAt?: Instant | null;
      readonly timeZone?: import("@workoutpal/shared-kernel").IanaTimeZone;
      readonly protocolRevisionId?: UUID | null;
      readonly sourceId?: UUID | null;
      readonly sourceVersion?: number | null;
      readonly artifactIds?: readonly UUID[];
      readonly notes?: string | null;
      readonly idempotencyKey?: string;
    },
  ): Promise<Assessment> {
    expectedVersion(input.expectedVersion);
    const occurredAt = input.occurredAt ?? now();
    const requestHash = await fingerprint({
      ...input,
      operation: "assessment.update",
    });
    return this.persistence.transaction(async (repositories) => {
      const current = await this.requireAssessment(
        repositories.assessments,
        input.workspaceId,
        input.assessmentId,
      );
      await this.authorizeAthlete(
        repositories,
        input,
        current.athleteId,
        "write",
      );
      const prior = await this.reserveIdempotency(
        repositories,
        input,
        "assessment.update",
        requestHash,
      );
      if (prior !== undefined) return prior as Assessment;
      const protocolRevision =
        input.protocolRevisionId === undefined
          ? current.protocolRevision
          : await this.resolveProtocolRevision(
              repositories,
              input.workspaceId,
              input.protocolRevisionId,
            );
      const source =
        input.sourceId === undefined
          ? current.source
          : await this.resolveSource(
              repositories,
              input.workspaceId,
              input.sourceId,
            );
      const artifactIds = input.artifactIds ?? current.artifactIds;
      await this.assertArtifacts(repositories, input.workspaceId, artifactIds);
      const updated = createAssessment({
        ...current,
        assessmentType: input.assessmentType ?? current.assessmentType,
        purpose: input.purpose === undefined ? current.purpose : input.purpose,
        occurrenceDate: input.occurrenceDate ?? current.occurrenceDate,
        occurredAt:
          input.assessmentOccurredAt === undefined
            ? current.occurredAt
            : input.assessmentOccurredAt,
        timeZone: input.timeZone ?? current.timeZone,
        protocolRevision,
        source,
        sourceVersion:
          input.sourceVersion === undefined
            ? current.sourceVersion
            : input.sourceVersion,
        artifactIds: [...artifactIds],
        notes: input.notes === undefined ? current.notes : input.notes,
        status: "AMENDED",
        updatedAt: occurredAt,
        updatedBy: input.principalId,
        version: current.version + 1,
      });
      const amendment = this.amendment({
        input,
        assessmentId: current.id,
        targetType: "ASSESSMENT",
        targetId: current.id,
        originalState: snapshot(current),
        correctedFields: this.patchFields(input),
        occurredAt,
      });
      const persisted = await repositories.assessments.updateExpected(
        scope(input.workspaceId),
        updated,
        input.expectedVersion,
      );
      if (persisted === null)
        throw new ApplicationError(
          "VERSION_CONFLICT",
          "The assessment changed before this amendment was applied.",
          { resourceId: current.id, expectedVersion: input.expectedVersion },
        );
      await repositories.assessmentAmendments.insert(amendment);
      await repositories.audit.append(
        this.audit(
          input,
          "assessment.amended",
          "Assessment",
          current.id,
          current.version,
          persisted.version,
          {
            amendmentId: amendment.id,
            correctedFields: Object.keys(amendment.correctedFields),
          },
        ),
      );
      await this.completeIdempotency(
        repositories,
        input,
        "assessment.update",
        persisted,
      );
      return persisted;
    }, transactionContext(input));
  }

  async createTrial(
    input: AssessmentApplicationInput & {
      readonly assessmentId: UUID;
      readonly ordinal?: number;
      readonly validity?: TrialValidityState;
      readonly exclusion?: TrialExclusionState;
      readonly exclusionReason?: string | null;
      readonly provenance?: EvidenceLineage;
      readonly idempotencyKey?: string;
    },
  ): Promise<Trial> {
    const occurredAt = input.occurredAt ?? now();
    const requestHash = await fingerprint({
      operation: "assessment.trial.create",
      workspaceId: input.workspaceId,
      assessmentId: input.assessmentId,
      ordinal: input.ordinal ?? null,
      validity: input.validity ?? "UNASSESSED",
      exclusion: input.exclusion ?? "INCLUDED",
      exclusionReason: input.exclusionReason ?? null,
      provenance: input.provenance ?? null,
    });
    return this.persistence.transaction(async (repositories) => {
      const assessment = await this.requireAssessment(
        repositories.assessments,
        input.workspaceId,
        input.assessmentId,
      );
      await this.authorizeAthlete(
        repositories,
        input,
        assessment.athleteId,
        "write",
      );
      const lineage = manualLineage(
        input.principalId,
        occurredAt,
        input.provenance,
      );
      await this.assertLineage(repositories, input.workspaceId, lineage);
      const prior = await this.reserveIdempotency(
        repositories,
        input,
        "assessment.trial.create",
        requestHash,
      );
      if (prior !== undefined) return prior as Trial;
      const trials = await repositories.trials.listForAssessment(
        scope(input.workspaceId),
        assessment.id,
      );
      const ordinal =
        input.ordinal ??
        Math.max(0, ...trials.map((trial) => trial.ordinal)) + 1;
      const trial = createTrial({
        id: newId(),
        workspaceId: input.workspaceId,
        assessmentId: assessment.id,
        ordinal,
        status: "RECORDED",
        validity: input.validity ?? "UNASSESSED",
        exclusion: input.exclusion ?? "INCLUDED",
        exclusionReason: input.exclusionReason ?? null,
        provenance: lineage,
        createdAt: occurredAt,
        createdBy: input.principalId,
        updatedAt: occurredAt,
        updatedBy: input.principalId,
        version: 1,
      });
      await repositories.trials.insert(trial);
      await repositories.audit.append(
        this.audit(
          input,
          "assessment.trial.created",
          "Trial",
          trial.id,
          null,
          trial.version,
          { assessmentId: trial.assessmentId, ordinal: trial.ordinal },
        ),
      );
      await this.completeIdempotency(
        repositories,
        input,
        "assessment.trial.create",
        trial,
      );
      return trial;
    }, transactionContext(input));
  }

  async updateTrial(
    input: AssessmentApplicationInput & {
      readonly trialId: UUID;
      readonly expectedVersion: number;
      readonly assessmentId?: UUID;
      readonly validity?: TrialValidityState;
      readonly exclusion?: TrialExclusionState;
      readonly exclusionReason?: string | null;
      readonly idempotencyKey?: string;
    },
  ): Promise<Trial> {
    expectedVersion(input.expectedVersion);
    const occurredAt = input.occurredAt ?? now();
    const requestHash = await fingerprint({
      operation: "assessment.trial.update",
      workspaceId: input.workspaceId,
      trialId: input.trialId,
      expectedVersion: input.expectedVersion,
      validity: input.validity ?? null,
      exclusion: input.exclusion ?? null,
      exclusionReason: input.exclusionReason ?? null,
    });
    return this.persistence.transaction(async (repositories) => {
      const current = await this.requireTrial(
        repositories.trials,
        input.workspaceId,
        input.trialId,
      );
      const assessment = await this.requireAssessment(
        repositories.assessments,
        input.workspaceId,
        current.assessmentId,
      );
      if (
        input.assessmentId !== undefined &&
        input.assessmentId !== assessment.id
      ) {
        throw new ApplicationError(
          "NOT_FOUND",
          "Trial not found for this assessment.",
        );
      }
      await this.authorizeAthlete(
        repositories,
        input,
        assessment.athleteId,
        "write",
      );
      const prior = await this.reserveIdempotency(
        repositories,
        input,
        "assessment.trial.update",
        requestHash,
      );
      if (prior !== undefined) return prior as Trial;
      const updated = createTrial({
        ...current,
        status: "AMENDED",
        validity: input.validity ?? current.validity,
        exclusion: input.exclusion ?? current.exclusion,
        exclusionReason:
          input.exclusionReason === undefined
            ? current.exclusionReason
            : input.exclusionReason,
        updatedAt: occurredAt,
        updatedBy: input.principalId,
        version: current.version + 1,
      });
      const amendment = this.amendment({
        input,
        assessmentId: assessment.id,
        targetType: "TRIAL",
        targetId: current.id,
        originalState: snapshot(current),
        correctedFields: {
          ...(input.validity === undefined ? {} : { validity: input.validity }),
          ...(input.exclusion === undefined
            ? {}
            : { exclusion: input.exclusion }),
          ...(input.exclusionReason === undefined
            ? {}
            : { exclusionReason: input.exclusionReason }),
        },
        occurredAt,
      });
      const persisted = await repositories.trials.updateExpected(
        scope(input.workspaceId),
        updated,
        input.expectedVersion,
      );
      if (persisted === null)
        throw new ApplicationError(
          "VERSION_CONFLICT",
          "The trial changed before this amendment was applied.",
          { resourceId: current.id, expectedVersion: input.expectedVersion },
        );
      await repositories.assessmentAmendments.insert(amendment);
      await repositories.audit.append(
        this.audit(
          input,
          "assessment.trial.amended",
          "Trial",
          current.id,
          current.version,
          persisted.version,
          { amendmentId: amendment.id },
        ),
      );
      await this.completeIdempotency(
        repositories,
        input,
        "assessment.trial.update",
        persisted,
      );
      return persisted;
    }, transactionContext(input));
  }

  async createRawObservation(
    input: AssessmentApplicationInput & {
      readonly assessmentId: UUID;
      readonly trialId: UUID;
      readonly observationKey: string;
      readonly value: EvidenceValue<Quantity>;
      readonly observedAt?: Instant | null;
      readonly provenance?: EvidenceLineage;
      readonly metadata?: Readonly<Record<string, unknown>>;
      readonly idempotencyKey?: string;
    },
  ): Promise<RawObservation> {
    const occurredAt = input.occurredAt ?? now();
    const requestHash = await fingerprint({
      operation: "assessment.observation.create",
      workspaceId: input.workspaceId,
      assessmentId: input.assessmentId,
      trialId: input.trialId,
      observationKey: input.observationKey,
      value: input.value,
      observedAt: input.observedAt ?? null,
      provenance: input.provenance ?? null,
      metadata: input.metadata ?? {},
    });
    return this.persistence.transaction(async (repositories) => {
      const assessment = await this.requireAssessment(
        repositories.assessments,
        input.workspaceId,
        input.assessmentId,
      );
      await this.authorizeAthlete(
        repositories,
        input,
        assessment.athleteId,
        "write",
      );
      const trial = await this.requireTrial(
        repositories.trials,
        input.workspaceId,
        input.trialId,
      );
      if (trial.assessmentId !== assessment.id)
        throw new ApplicationError(
          "NOT_FOUND",
          "Trial not found for this assessment.",
        );
      const lineage = manualLineage(
        input.principalId,
        occurredAt,
        input.provenance,
      );
      await this.assertLineage(repositories, input.workspaceId, lineage);
      const prior = await this.reserveIdempotency(
        repositories,
        input,
        "assessment.observation.create",
        requestHash,
      );
      if (prior !== undefined) return prior as RawObservation;
      const observation = createRawObservation({
        id: newId(),
        workspaceId: input.workspaceId,
        assessmentId: assessment.id,
        trialId: trial.id,
        observationKey: input.observationKey,
        value: input.value,
        observedAt: input.observedAt === undefined ? null : input.observedAt,
        provenance: lineage,
        metadata: input.metadata ?? {},
        supersedesObservationId: null,
        recordedAt: occurredAt,
        recordedBy: input.principalId,
      });
      await repositories.rawObservations.insert(observation);
      await repositories.audit.append(
        this.audit(
          input,
          "assessment.observation.recorded",
          "RawObservation",
          observation.id,
          null,
          null,
          {
            assessmentId: assessment.id,
            trialId: trial.id,
            observationKey: observation.observationKey,
          },
        ),
      );
      await this.completeIdempotency(
        repositories,
        input,
        "assessment.observation.create",
        observation,
      );
      return observation;
    }, transactionContext(input));
  }

  async amendRawObservation(
    input: AssessmentApplicationInput & {
      readonly observationId: UUID;
      readonly value: EvidenceValue<Quantity>;
      readonly observedAt?: Instant | null;
      readonly assessmentId?: UUID;
      readonly reason: string;
      readonly metadata?: Readonly<Record<string, unknown>>;
      readonly idempotencyKey?: string;
    },
  ): Promise<RawObservation> {
    const occurredAt = input.occurredAt ?? now();
    const requestHash = await fingerprint({
      operation: "assessment.observation.amend",
      workspaceId: input.workspaceId,
      observationId: input.observationId,
      value: input.value,
      observedAt: input.observedAt ?? null,
      reason: input.reason,
      metadata: input.metadata ?? null,
    });
    return this.persistence.transaction(async (repositories) => {
      const current = await this.requireObservation(
        repositories.rawObservations,
        input.workspaceId,
        input.observationId,
      );
      const assessment = await this.requireAssessment(
        repositories.assessments,
        input.workspaceId,
        current.assessmentId,
      );
      if (
        input.assessmentId !== undefined &&
        input.assessmentId !== assessment.id
      ) {
        throw new ApplicationError(
          "NOT_FOUND",
          "Observation not found for this assessment.",
        );
      }
      await this.authorizeAthlete(
        repositories,
        input,
        assessment.athleteId,
        "write",
      );
      const prior = await this.reserveIdempotency(
        repositories,
        input,
        "assessment.observation.amend",
        requestHash,
      );
      if (prior !== undefined) return prior as RawObservation;
      const corrected = createRawObservation({
        ...current,
        id: newId(),
        value: input.value,
        observedAt:
          input.observedAt === undefined
            ? current.observedAt
            : input.observedAt,
        provenance: createEvidenceLineage({
          ...current.provenance,
          origin: "HUMAN",
          actorId: input.principalId,
          createdAt: occurredAt,
          ingestedAt: occurredAt,
          supersedesEvidenceId: current.id,
        }),
        metadata: input.metadata ?? current.metadata,
        supersedesObservationId: current.id,
        recordedAt: occurredAt,
        recordedBy: input.principalId,
      });
      const amendment = this.amendment({
        input,
        assessmentId: assessment.id,
        targetType: "OBSERVATION",
        targetId: current.id,
        originalState: snapshot(current),
        correctedFields: {
          value: input.value,
          observedAt: corrected.observedAt,
          reason: input.reason,
        },
        occurredAt,
      });
      await repositories.rawObservations.insert(corrected);
      await repositories.assessmentAmendments.insert(amendment);
      await repositories.audit.append(
        this.audit(
          input,
          "assessment.observation.amended",
          "RawObservation",
          current.id,
          null,
          null,
          { amendmentId: amendment.id, replacementId: corrected.id },
        ),
      );
      await this.completeIdempotency(
        repositories,
        input,
        "assessment.observation.amend",
        corrected,
      );
      return corrected;
    }, transactionContext(input));
  }

  async listMetricDefinitions(
    input: AssessmentApplicationInput,
  ): Promise<readonly MetricDefinition[]> {
    return this.persistence.transaction(async (repositories) => {
      await this.authorizeWorkspace(repositories, input, "read");
      return repositories.metricDefinitions.list(scope(input.workspaceId));
    }, transactionContext(input));
  }

  async createMetricDefinition(
    input: AssessmentApplicationInput & {
      readonly key: string;
      readonly revision: number;
      readonly displayName: string;
      readonly description?: string | null;
      readonly expectedDimension?: Dimension | null;
      readonly methodProtocolRevisionId?: UUID | null;
      readonly resultScope: "ASSESSMENT" | "TRIAL";
      readonly idempotencyKey?: string;
    },
  ): Promise<MetricDefinition> {
    const occurredAt = input.occurredAt ?? now();
    const requestHash = await fingerprint({
      operation: "assessment.metric_definition.create",
      workspaceId: input.workspaceId,
      key: input.key,
      revision: input.revision,
      displayName: input.displayName,
      description: input.description ?? null,
      expectedDimension: input.expectedDimension ?? null,
      methodProtocolRevisionId: input.methodProtocolRevisionId ?? null,
      resultScope: input.resultScope,
    });
    return this.persistence.transaction(async (repositories) => {
      await this.authorizeWorkspace(repositories, input, "write");
      const prior = await this.reserveIdempotency(
        repositories,
        input,
        "assessment.metric_definition.create",
        requestHash,
      );
      if (prior !== undefined) return prior as MetricDefinition;
      const methodProtocolRevision = await this.resolveProtocolRevision(
        repositories,
        input.workspaceId,
        input.methodProtocolRevisionId,
      );
      const metric = createMetricDefinition({
        id: newId(),
        workspaceId: input.workspaceId,
        key: input.key,
        revision: input.revision,
        displayName: input.displayName,
        description: input.description ?? null,
        expectedDimension: input.expectedDimension ?? null,
        methodProtocolRevision,
        resultScope: input.resultScope,
        createdAt: occurredAt,
        createdBy: input.principalId,
      });
      await repositories.metricDefinitions.insert(metric);
      await repositories.audit.append(
        this.audit(
          input,
          "assessment.metric_definition.created",
          "MetricDefinition",
          metric.id,
          null,
          metric.revision,
          { key: metric.key, revision: metric.revision },
        ),
      );
      await this.completeIdempotency(
        repositories,
        input,
        "assessment.metric_definition.create",
        metric,
      );
      return metric;
    }, transactionContext(input));
  }

  async createNeutralResult(
    input: AssessmentApplicationInput & {
      readonly assessmentId: UUID;
      readonly trialId?: UUID | null;
      readonly metricDefinitionId: UUID;
      readonly value: EvidenceValue<Quantity>;
      readonly origin: NeutralResult["origin"];
      readonly sourceClass?: EvidenceSourceClass;
      readonly methodProtocolRevisionId?: UUID | null;
      readonly provenance?: EvidenceLineage;
      readonly supersedesResultId?: UUID | null;
      readonly idempotencyKey?: string;
    },
  ): Promise<NeutralResult> {
    const occurredAt = input.occurredAt ?? now();
    const requestHash = await fingerprint({
      operation: "assessment.result.create",
      workspaceId: input.workspaceId,
      assessmentId: input.assessmentId,
      trialId: input.trialId ?? null,
      metricDefinitionId: input.metricDefinitionId,
      value: input.value,
      origin: input.origin,
      sourceClass: input.sourceClass ?? null,
      methodProtocolRevisionId: input.methodProtocolRevisionId ?? null,
      provenance: input.provenance ?? null,
      supersedesResultId: input.supersedesResultId ?? null,
    });
    return this.persistence.transaction(async (repositories) => {
      const assessment = await this.requireAssessment(
        repositories.assessments,
        input.workspaceId,
        input.assessmentId,
      );
      await this.authorizeAthlete(
        repositories,
        input,
        assessment.athleteId,
        "write",
      );
      const trialId = input.trialId ?? null;
      if (trialId !== null) {
        const trial = await this.requireTrial(
          repositories.trials,
          input.workspaceId,
          trialId,
        );
        if (trial.assessmentId !== assessment.id)
          throw new ApplicationError(
            "NOT_FOUND",
            "Trial not found for this assessment.",
          );
      }
      if (
        input.supersedesResultId !== undefined &&
        input.supersedesResultId !== null &&
        (await repositories.neutralResults.get(
          scope(input.workspaceId),
          input.supersedesResultId,
        )) === null
      ) {
        throw new ApplicationError(
          "RESOURCE_NOT_FOUND",
          "Result being superseded was not found.",
        );
      }
      const metricDefinition = await repositories.metricDefinitions.get(
        scope(input.workspaceId),
        input.metricDefinitionId,
      );
      if (metricDefinition === null)
        throw new ApplicationError(
          "RESOURCE_NOT_FOUND",
          "Metric definition not found.",
        );
      const methodProtocolRevision =
        input.methodProtocolRevisionId === undefined
          ? metricDefinition.methodProtocolRevision
          : await this.resolveProtocolRevision(
              repositories,
              input.workspaceId,
              input.methodProtocolRevisionId,
            );
      const lineage = manualLineage(
        input.principalId,
        occurredAt,
        input.provenance,
      );
      await this.assertLineage(repositories, input.workspaceId, lineage);
      const prior = await this.reserveIdempotency(
        repositories,
        input,
        "assessment.result.create",
        requestHash,
      );
      if (prior !== undefined) return prior as NeutralResult;
      const result = createNeutralResult({
        id: newId(),
        workspaceId: input.workspaceId,
        assessmentId: assessment.id,
        trialId,
        metricDefinition,
        value: input.value,
        origin: input.origin,
        sourceClass: input.sourceClass ?? lineage.sourceClass,
        methodProtocolRevision,
        provenance: lineage,
        recordedAt: occurredAt,
        recordedBy: input.principalId,
        supersedesResultId: input.supersedesResultId ?? null,
      });
      await repositories.neutralResults.insert(result);
      await repositories.audit.append(
        this.audit(
          input,
          "assessment.result.recorded",
          "NeutralResult",
          result.id,
          null,
          null,
          {
            assessmentId: result.assessmentId,
            metricDefinitionId: result.metricDefinition.id,
            metricRevision: result.metricDefinition.revision,
          },
        ),
      );
      await this.completeIdempotency(
        repositories,
        input,
        "assessment.result.create",
        result,
      );
      return result;
    }, transactionContext(input));
  }

  private async details(
    repositories: Psc4Repositories,
    assessment: Assessment,
  ): Promise<AssessmentDetails> {
    const scopeValue = scope(assessment.workspaceId);
    const trials = await repositories.trials.listForAssessment(
      scopeValue,
      assessment.id,
    );
    const observations = await repositories.rawObservations.listForAssessment(
      scopeValue,
      assessment.id,
    );
    const results = await repositories.neutralResults.listForAssessment(
      scopeValue,
      assessment.id,
    );
    const amendments =
      await repositories.assessmentAmendments.listForAssessment(
        scopeValue,
        assessment.id,
      );
    return { assessment, trials, observations, results, amendments };
  }

  private async resolveProtocolRevision(
    repositories: Psc4Repositories,
    workspaceId: WorkspaceId,
    revisionId: UUID | null | undefined,
  ): Promise<ProtocolRevision | null> {
    if (revisionId === undefined || revisionId === null) return null;
    const revision = await repositories.protocolRevisions.get(
      scope(workspaceId),
      revisionId,
    );
    if (revision === null)
      throw new ApplicationError(
        "RESOURCE_NOT_FOUND",
        "Protocol revision not found.",
      );
    return revision;
  }

  private async resolveSource(
    repositories: Psc4Repositories,
    workspaceId: WorkspaceId,
    sourceId: UUID | null | undefined,
  ): Promise<AcquisitionSource | null> {
    if (sourceId === undefined || sourceId === null) return null;
    const source = await repositories.acquisitionSources.get(
      scope(workspaceId),
      sourceId,
    );
    if (source === null)
      throw new ApplicationError(
        "RESOURCE_NOT_FOUND",
        "Acquisition source not found.",
      );
    return source;
  }

  private async assertArtifacts(
    repositories: Psc4Repositories,
    workspaceId: WorkspaceId,
    artifactIds: readonly UUID[],
  ): Promise<void> {
    for (const artifactId of artifactIds) {
      if (
        (await repositories.sourceArtifacts.get(
          scope(workspaceId),
          artifactId,
        )) === null
      ) {
        throw new ApplicationError(
          "RESOURCE_NOT_FOUND",
          "Source artifact not found.",
        );
      }
    }
  }

  private async assertLineage(
    repositories: Psc4Repositories,
    workspaceId: WorkspaceId,
    lineage: EvidenceLineage,
  ): Promise<void> {
    if (
      lineage.sourceId !== null &&
      (await repositories.acquisitionSources.get(
        scope(workspaceId),
        lineage.sourceId,
      )) === null
    ) {
      throw new ApplicationError(
        "RESOURCE_NOT_FOUND",
        "Evidence source not found.",
      );
    }
    for (const artifactId of lineage.sourceArtifactIds) {
      if (
        (await repositories.sourceArtifacts.get(
          scope(workspaceId),
          artifactId,
        )) === null
      ) {
        throw new ApplicationError(
          "RESOURCE_NOT_FOUND",
          "Evidence source artifact not found.",
        );
      }
    }
    if (lineage.protocolRevision !== null) {
      const revision = await repositories.protocolRevisions.get(
        scope(workspaceId),
        lineage.protocolRevision.revisionId,
      );
      if (
        revision === null ||
        revision.protocolId !== lineage.protocolRevision.protocolId ||
        revision.revision !== lineage.protocolRevision.revision
      ) {
        throw new ApplicationError(
          "RESOURCE_NOT_FOUND",
          "Evidence protocol revision not found.",
        );
      }
    }
    const parentIds = [
      ...lineage.parentEvidenceIds,
      ...(lineage.supersedesEvidenceId === null
        ? []
        : [lineage.supersedesEvidenceId]),
    ];
    for (const parentId of new Set(parentIds)) {
      const trial = await repositories.trials.get(scope(workspaceId), parentId);
      const observation =
        trial === null
          ? await repositories.rawObservations.get(scope(workspaceId), parentId)
          : null;
      const result =
        trial === null && observation === null
          ? await repositories.neutralResults.get(scope(workspaceId), parentId)
          : null;
      if (trial === null && observation === null && result === null) {
        throw new ApplicationError(
          "RESOURCE_NOT_FOUND",
          "Parent evidence not found.",
        );
      }
    }
  }

  private async requireAssessment(
    repository: AssessmentRepository,
    workspaceId: WorkspaceId,
    assessmentId: UUID,
  ): Promise<Assessment> {
    const assessment = await repository.get(scope(workspaceId), assessmentId);
    if (assessment === null)
      throw new ApplicationError("NOT_FOUND", "Assessment not found.");
    return assessment;
  }

  private async requireTrial(
    repository: TrialRepository,
    workspaceId: WorkspaceId,
    trialId: UUID,
  ): Promise<Trial> {
    const trial = await repository.get(scope(workspaceId), trialId);
    if (trial === null)
      throw new ApplicationError("NOT_FOUND", "Trial not found.");
    return trial;
  }

  private async requireObservation(
    repository: RawObservationRepository,
    workspaceId: WorkspaceId,
    observationId: UUID,
  ): Promise<RawObservation> {
    const observation = await repository.get(scope(workspaceId), observationId);
    if (observation === null)
      throw new ApplicationError("NOT_FOUND", "Observation not found.");
    return observation;
  }

  private async authorizeWorkspace(
    repositories: Psc4Repositories,
    input: AssessmentApplicationInput,
    operation: "read" | "write",
  ): Promise<void> {
    const membership = await repositories.memberships.get(
      scope(input.workspaceId),
      input.principalId,
    );
    const action =
      operation === "read" ? "assessment.read" : "assessment.write";
    if (
      membership === null ||
      membership.status !== "active" ||
      !canAccessWorkspace(membership, action)
    ) {
      throw new ApplicationError(
        "FORBIDDEN",
        "You are not authorized for assessments in this workspace.",
      );
    }
  }

  private async authorizeAthlete(
    repositories: Psc4Repositories,
    input: AssessmentApplicationInput,
    athleteId: import("@workoutpal/shared-kernel").AthleteId,
    operation: "read" | "write",
  ): Promise<void> {
    const membership = await repositories.memberships.get(
      scope(input.workspaceId),
      input.principalId,
    );
    const athlete = await repositories.athletes.get(
      scope(input.workspaceId),
      athleteId,
    );
    const action =
      operation === "read" ? "assessment.read" : "assessment.write";
    if (
      membership === null ||
      membership.status !== "active" ||
      !canAccessWorkspace(membership, action)
    ) {
      throw new ApplicationError(
        "FORBIDDEN",
        "You are not authorized for assessments in this workspace.",
      );
    }
    if (athlete === null) {
      throw new ApplicationError("NOT_FOUND", "Athlete not found.");
    }
    const assignments = await repositories.coachAssignments.listForAthlete(
      scope(input.workspaceId),
      athleteId,
    );
    if (
      !canAccessAthlete(membership, input.principalId, action, {
        workspaceId: input.workspaceId,
        linkedUserId: athlete.linkedUserId,
        assignedCoachIds: assignments.map(
          (assignment) => assignment.coachPrincipalId,
        ),
      })
    ) {
      throw new ApplicationError(
        operation === "read" ? "NOT_FOUND" : "FORBIDDEN",
        "Athlete is not available for this assessment operation.",
      );
    }
  }

  private amendment(input: {
    readonly input: AssessmentApplicationInput;
    readonly assessmentId: UUID;
    readonly targetType: AssessmentAmendment["targetType"];
    readonly targetId: UUID;
    readonly originalState: Readonly<Record<string, unknown>>;
    readonly correctedFields: Readonly<Record<string, unknown>>;
    readonly occurredAt: Instant;
  }): AssessmentAmendment {
    return createAssessmentAmendment({
      id: newId(),
      workspaceId: input.input.workspaceId,
      assessmentId: input.assessmentId,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: requiredText(
        String(input.correctedFields.reason ?? "Recorded correction"),
        "Amendment reason",
      ),
      originalState: input.originalState,
      correctedFields: input.correctedFields,
      supersedesAmendmentId: null,
      occurredAt: input.occurredAt,
      actorId: input.input.principalId,
    });
  }

  private patchFields(input: object): Readonly<Record<string, unknown>> {
    const ignored = new Set([
      "principalId",
      "requestId",
      "workspaceId",
      "assessmentId",
      "expectedVersion",
      "idempotencyKey",
      "occurredAt",
    ]);
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>).filter(
        ([key, value]) => !ignored.has(key) && value !== undefined,
      ),
    );
  }

  private async reserveIdempotency(
    repositories: Psc4Repositories,
    input: AssessmentApplicationInput & { readonly idempotencyKey?: string },
    operation: string,
    requestHash: string,
  ): Promise<unknown | undefined> {
    if (input.idempotencyKey === undefined) return undefined;
    const prior = await repositories.idempotency.find(
      input.workspaceId,
      input.principalId,
      operation,
      input.idempotencyKey,
    );
    if (prior !== null) {
      if (prior.requestHash !== requestHash)
        throw new ApplicationError(
          "IDEMPOTENCY_CONFLICT",
          "Idempotency key was already used for a different command.",
        );
      if (prior.outcome !== null) return prior.outcome;
      throw new ApplicationError(
        "IDEMPOTENCY_CONFLICT",
        "Idempotency key is already being processed.",
      );
    }
    const reserved = await repositories.idempotency.reserve({
      workspaceId: input.workspaceId,
      actorId: input.principalId,
      operation,
      key: input.idempotencyKey,
      requestHash,
    });
    if (reserved !== null) {
      if (reserved.requestHash !== requestHash)
        throw new ApplicationError(
          "IDEMPOTENCY_CONFLICT",
          "Idempotency key was already used for a different command.",
        );
      if (reserved.outcome !== null) return reserved.outcome;
      throw new ApplicationError(
        "IDEMPOTENCY_CONFLICT",
        "Idempotency key is already being processed.",
      );
    }
    return undefined;
  }

  private async completeIdempotency(
    repositories: Psc4Repositories,
    input: AssessmentApplicationInput & { readonly idempotencyKey?: string },
    operation: string,
    outcome: unknown,
  ): Promise<void> {
    if (input.idempotencyKey !== undefined)
      await repositories.idempotency.complete(
        input.workspaceId,
        input.principalId,
        operation,
        input.idempotencyKey,
        outcome,
      );
  }

  private audit(
    input: AssessmentApplicationInput,
    action: string,
    aggregateType: string,
    aggregateId: UUID,
    versionBefore: number | null,
    versionAfter: number | null,
    payload: Readonly<Record<string, unknown>>,
  ): AuditEvent {
    return {
      id: newId(),
      occurredAt: input.occurredAt ?? now(),
      workspaceId: input.workspaceId,
      actorId: input.principalId,
      actorType: "HUMAN",
      action,
      aggregateType,
      aggregateId,
      versionBefore,
      versionAfter,
      requestId: input.requestId,
      payload,
    };
  }
}

export function createAssessmentApplication(
  persistence: Psc4Persistence,
): AssessmentApplication {
  return new AssessmentApplication(persistence);
}
