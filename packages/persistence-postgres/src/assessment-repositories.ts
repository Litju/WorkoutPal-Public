import type {
  AcquisitionSourceRepository,
  AssessmentAmendmentRepository,
  AssessmentRepository,
  MetricDefinitionRepository,
  NeutralResultRepository,
  ProtocolRepository,
  ProtocolRevisionRepository,
  Psc4Repositories,
  RawObservationRepository,
  SourceArtifactRepository,
  TrialRepository,
} from "@workoutpal/application";
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
import type { EvidenceLineage, SourceArtifact } from "@workoutpal/provenance";
import {
  createEvidenceLineage,
  createSourceArtifact,
} from "@workoutpal/provenance";
import {
  type AthleteId,
  createQuantity,
  type Dimension,
  type EvidenceValue,
  missing,
  present,
  type UUID,
} from "@workoutpal/shared-kernel";
import type { PoolClient } from "pg";

type Row = Record<string, unknown>;

function row(value: unknown): Row {
  return value as Row;
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function instantValue(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function localDateValue(value: unknown): string {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value);
}

function mapProtocolRevision(
  value: Row,
  prefix = "pr_",
): ProtocolRevision | null {
  const id = value[`${prefix}id`];
  if (id === null || id === undefined) return null;
  return createProtocolRevision({
    id: id as UUID,
    workspaceId: value[
      `${prefix}workspace_id`
    ] as ProtocolRevision["workspaceId"],
    protocolId: value[`${prefix}protocol_id`] as UUID,
    revision: Number(value[`${prefix}revision`]),
    name: String(value[`${prefix}name`]),
    description: nullableString(value[`${prefix}description`]),
    metadata: value[`${prefix}metadata`] as Readonly<Record<string, unknown>>,
    createdAt: instantValue(
      value[`${prefix}created_at`],
    ) as ProtocolRevision["createdAt"],
    createdBy: value[`${prefix}created_by`] as UUID,
  });
}

function mapProtocol(value: Row): Protocol {
  return createProtocol({
    id: value.id as Protocol["id"],
    workspaceId: value.workspace_id as Protocol["workspaceId"],
    key: String(value.key),
    name: String(value.name),
    description: nullableString(value.description),
    status: value.status as Protocol["status"],
    currentRevision: Number(value.current_revision),
    createdAt: instantValue(value.created_at) as Protocol["createdAt"],
    createdBy: value.created_by as UUID,
    updatedAt: instantValue(value.updated_at) as Protocol["updatedAt"],
    updatedBy: value.updated_by as UUID,
    version: Number(value.version),
  });
}

function mapSource(value: Row, prefix = ""): AcquisitionSource {
  return createAcquisitionSource({
    id: value[`${prefix}id`] as AcquisitionSource["id"],
    workspaceId: value[
      `${prefix}workspace_id`
    ] as AcquisitionSource["workspaceId"],
    sourceClass: value[
      `${prefix}source_class`
    ] as AcquisitionSource["sourceClass"],
    label: String(value[`${prefix}label`]),
    manufacturer: nullableString(value[`${prefix}manufacturer`]),
    model: nullableString(value[`${prefix}model`]),
    serialNumber: nullableString(value[`${prefix}serial_number`]),
    firmwareVersion: nullableString(value[`${prefix}firmware_version`]),
    softwareVersion: nullableString(value[`${prefix}software_version`]),
    configurationMetadata: value[`${prefix}configuration_metadata`] as Readonly<
      Record<string, unknown>
    >,
    createdAt: instantValue(
      value[`${prefix}created_at`],
    ) as AcquisitionSource["createdAt"],
    createdBy: value[`${prefix}created_by`] as UUID,
    updatedAt: instantValue(
      value[`${prefix}updated_at`],
    ) as AcquisitionSource["updatedAt"],
    updatedBy: value[`${prefix}updated_by`] as UUID,
    version: Number(value[`${prefix}version`]),
  });
}

function mapArtifact(value: Row): SourceArtifact {
  return createSourceArtifact({
    id: value.id as SourceArtifact["id"],
    workspaceId: value.workspace_id as SourceArtifact["workspaceId"],
    storageObjectReference: String(value.storage_object_reference),
    mediaType: String(value.media_type),
    sizeBytes: Number(value.size_bytes),
    checksumSha256: String(value.checksum_sha256),
    originalFilename: nullableString(value.original_filename),
    sourceInformation: value.source_information as Readonly<
      Record<string, unknown>
    >,
    createdAt: instantValue(value.created_at) as SourceArtifact["createdAt"],
    ingestedAt: instantValue(value.ingested_at) as SourceArtifact["ingestedAt"],
  });
}

function mapLineage(value: Row): EvidenceLineage {
  return createEvidenceLineage(value.provenance as EvidenceLineage);
}

function mapAssessment(value: Row): Assessment {
  const artifactIds =
    (value.artifact_ids as readonly unknown[] | null | undefined) ?? [];
  return createAssessment({
    id: value.id as Assessment["id"],
    workspaceId: value.workspace_id as Assessment["workspaceId"],
    athleteId: value.athlete_id as Assessment["athleteId"],
    assessmentType: String(value.assessment_type),
    purpose: nullableString(value.purpose),
    status: value.status as Assessment["status"],
    occurrenceDate: localDateValue(
      value.occurrence_date,
    ) as Assessment["occurrenceDate"],
    occurredAt:
      value.occurred_at === null
        ? null
        : (instantValue(value.occurred_at) as Assessment["occurredAt"]),
    timeZone: String(value.time_zone) as Assessment["timeZone"],
    protocolRevision: mapProtocolRevision(value),
    source:
      value.source_id === null || value.source_id === undefined
        ? null
        : mapSource(value, "source_"),
    sourceVersion:
      value.assessment_source_version === null
        ? null
        : Number(value.assessment_source_version),
    artifactIds: artifactIds.map((artifactId) => artifactId as UUID),
    notes: nullableString(value.notes),
    createdAt: instantValue(value.created_at) as Assessment["createdAt"],
    createdBy: value.created_by as UUID,
    updatedAt: instantValue(value.updated_at) as Assessment["updatedAt"],
    updatedBy: value.updated_by as UUID,
    version: Number(value.version),
  });
}

function mapTrial(value: Row): Trial {
  return createTrial({
    id: value.id as Trial["id"],
    workspaceId: value.workspace_id as Trial["workspaceId"],
    assessmentId: value.assessment_id as Trial["assessmentId"],
    ordinal: Number(value.ordinal),
    status: value.status as Trial["status"],
    validity: value.validity_state as Trial["validity"],
    exclusion: value.exclusion_state as Trial["exclusion"],
    exclusionReason: nullableString(value.exclusion_reason),
    provenance: mapLineage(value),
    createdAt: instantValue(value.created_at) as Trial["createdAt"],
    createdBy: value.created_by as UUID,
    updatedAt: instantValue(value.updated_at) as Trial["updatedAt"],
    updatedBy: value.updated_by as UUID,
    version: Number(value.version),
  });
}

function mapEvidenceValue(
  value: Row,
): EvidenceValue<import("@workoutpal/shared-kernel").Quantity> {
  if (value.value_kind === "MISSING") {
    return missing(value.missing_reason as Parameters<typeof missing>[0]);
  }
  return present(
    createQuantity({
      value: Number(value.value_magnitude),
      unit: String(value.value_unit),
      dimension: String(value.value_dimension) as Dimension,
    }),
  );
}

function mapObservation(value: Row): RawObservation {
  return createRawObservation({
    id: value.id as RawObservation["id"],
    workspaceId: value.workspace_id as RawObservation["workspaceId"],
    assessmentId: value.assessment_id as RawObservation["assessmentId"],
    trialId: value.trial_id as RawObservation["trialId"],
    observationKey: String(value.observation_key),
    value: mapEvidenceValue(value),
    observedAt:
      value.observed_at === null
        ? null
        : (instantValue(value.observed_at) as RawObservation["observedAt"]),
    provenance: mapLineage(value),
    metadata: value.metadata as Readonly<Record<string, unknown>>,
    supersedesObservationId:
      value.supersedes_observation_id === null
        ? null
        : (value.supersedes_observation_id as UUID),
    recordedAt: instantValue(value.recorded_at) as RawObservation["recordedAt"],
    recordedBy: value.recorded_by as UUID,
  });
}

function mapMetricDefinition(
  value: Row,
  prefix = "",
  revisionField = "revision",
): MetricDefinition {
  return createMetricDefinition({
    id: value[`${prefix}id`] as MetricDefinition["id"],
    workspaceId: value[
      `${prefix}workspace_id`
    ] as MetricDefinition["workspaceId"],
    key: String(value[`${prefix}key`]),
    revision: Number(value[`${prefix}${revisionField}`]),
    displayName: String(value[`${prefix}display_name`]),
    description: nullableString(value[`${prefix}description`]),
    expectedDimension:
      value[`${prefix}expected_dimension`] === null ||
      value[`${prefix}expected_dimension`] === undefined
        ? null
        : (String(value[`${prefix}expected_dimension`]) as Dimension),
    methodProtocolRevision: mapProtocolRevision(value, `${prefix}pr_`),
    resultScope: value[
      `${prefix}result_scope`
    ] as MetricDefinition["resultScope"],
    createdAt: instantValue(
      value[`${prefix}created_at`],
    ) as MetricDefinition["createdAt"],
    createdBy: value[`${prefix}created_by`] as UUID,
  });
}

function mapResult(value: Row): NeutralResult {
  return createNeutralResult({
    id: value.id as NeutralResult["id"],
    workspaceId: value.workspace_id as NeutralResult["workspaceId"],
    assessmentId: value.assessment_id as NeutralResult["assessmentId"],
    trialId: value.trial_id === null ? null : (value.trial_id as UUID),
    metricDefinition: mapMetricDefinition(value, "metric_", "revision_value"),
    value: mapEvidenceValue(value),
    origin: value.result_origin as NeutralResult["origin"],
    sourceClass: value.source_class as NeutralResult["sourceClass"],
    methodProtocolRevision: mapProtocolRevision(value, "method_pr_"),
    provenance: mapLineage(value),
    recordedAt: instantValue(value.recorded_at) as NeutralResult["recordedAt"],
    recordedBy: value.recorded_by as UUID,
    supersedesResultId:
      value.supersedes_result_id === null
        ? null
        : (value.supersedes_result_id as UUID),
  });
}

function mapAmendment(value: Row): AssessmentAmendment {
  return createAssessmentAmendment({
    id: value.id as AssessmentAmendment["id"],
    workspaceId: value.workspace_id as AssessmentAmendment["workspaceId"],
    assessmentId: value.assessment_id as AssessmentAmendment["assessmentId"],
    targetType: value.target_type as AssessmentAmendment["targetType"],
    targetId: value.target_id as UUID,
    reason: String(value.reason),
    originalState: value.original_state as Readonly<Record<string, unknown>>,
    correctedFields: value.corrected_fields as Readonly<
      Record<string, unknown>
    >,
    supersedesAmendmentId:
      value.supersedes_amendment_id === null
        ? null
        : (value.supersedes_amendment_id as UUID),
    occurredAt: instantValue(
      value.occurred_at,
    ) as AssessmentAmendment["occurredAt"],
    actorId: value.actor_id as UUID,
  });
}

function lineageColumns(lineage: EvidenceLineage): readonly unknown[] {
  return [
    lineage.sourceClass,
    lineage.sourceReference,
    lineage.sourceId,
    lineage.protocolRevision?.revisionId ?? null,
    JSON.stringify(lineage.sourceArtifactIds),
    lineage.origin,
    lineage.actorId,
    lineage.capturedAt,
    lineage.ingestedAt,
    lineage.createdAt,
    JSON.stringify(lineage.parentEvidenceIds),
    lineage.supersedesEvidenceId,
    JSON.stringify(lineage),
  ];
}

const assessmentSelect = `
  SELECT a.id, a.workspace_id, a.athlete_id, a.assessment_type, a.purpose,
         a.status, a.occurrence_date, a.occurred_at, a.time_zone,
         a.protocol_revision_id, a.source_id, a.source_version AS assessment_source_version, a.notes,
         a.created_at, a.created_by, a.updated_at, a.updated_by, a.version,
         COALESCE((SELECT array_agg(aa.artifact_id ORDER BY aa.artifact_id)
                     FROM assessment.assessment_artifact aa
                    WHERE aa.workspace_id = a.workspace_id
                      AND aa.assessment_id = a.id), ARRAY[]::uuid[]) AS artifact_ids,
         pr.id AS pr_id, pr.workspace_id AS pr_workspace_id,
         pr.protocol_id AS pr_protocol_id, pr.revision AS pr_revision,
         pr.name AS pr_name, pr.description AS pr_description,
         pr.metadata AS pr_metadata, pr.created_at AS pr_created_at,
         pr.created_by AS pr_created_by,
         s.id AS source_id, s.workspace_id AS source_workspace_id,
         s.source_class AS source_source_class, s.label AS source_label,
         s.manufacturer AS source_manufacturer, s.model AS source_model,
         s.serial_number AS source_serial_number,
         s.firmware_version AS source_firmware_version,
         s.software_version AS source_software_version,
         s.configuration_metadata AS source_configuration_metadata,
         s.created_at AS source_created_at, s.created_by AS source_created_by,
         s.updated_at AS source_updated_at, s.updated_by AS source_updated_by,
         s.version AS source_version
    FROM assessment.assessment a
    LEFT JOIN assessment.protocol_revision pr
      ON pr.workspace_id = a.workspace_id AND pr.id = a.protocol_revision_id
    LEFT JOIN assessment.acquisition_source s
      ON s.workspace_id = a.workspace_id AND s.id = a.source_id`;

export function createAssessmentRepositories(
  client: PoolClient,
): Pick<
  Psc4Repositories,
  | "protocols"
  | "protocolRevisions"
  | "acquisitionSources"
  | "sourceArtifacts"
  | "assessments"
  | "trials"
  | "rawObservations"
  | "metricDefinitions"
  | "neutralResults"
  | "assessmentAmendments"
> {
  const protocols: ProtocolRepository = {
    async get(scope, protocolId) {
      const result = await client.query(
        `SELECT id, workspace_id, key, name, description, status, current_revision,
                created_at, created_by, updated_at, updated_by, version
           FROM assessment.protocol
          WHERE workspace_id = $1 AND id = $2`,
        [scope.workspaceId, protocolId],
      );
      const found = result.rows[0];
      return found === undefined ? null : mapProtocol(row(found));
    },
    async list(scope) {
      const result = await client.query(
        `SELECT id, workspace_id, key, name, description, status, current_revision,
                created_at, created_by, updated_at, updated_by, version
           FROM assessment.protocol
          WHERE workspace_id = $1
          ORDER BY name, id`,
        [scope.workspaceId],
      );
      return result.rows.map((value) => mapProtocol(row(value)));
    },
    async insert(protocol) {
      await client.query(
        `INSERT INTO assessment.protocol
           (id, workspace_id, key, name, description, status, current_revision,
            created_at, created_by, updated_at, updated_by, version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          protocol.id,
          protocol.workspaceId,
          protocol.key,
          protocol.name,
          protocol.description,
          protocol.status,
          protocol.currentRevision,
          protocol.createdAt,
          protocol.createdBy,
          protocol.updatedAt,
          protocol.updatedBy,
          protocol.version,
        ],
      );
    },
    async updateExpected(scope, protocol, expectedVersion) {
      const result = await client.query(
        `UPDATE assessment.protocol
            SET name = $3, description = $4, status = $5, current_revision = $6,
                updated_at = $7, updated_by = $8, version = $9
          WHERE workspace_id = $1 AND id = $2 AND version = $10
          RETURNING id, workspace_id, key, name, description, status, current_revision,
                    created_at, created_by, updated_at, updated_by, version`,
        [
          scope.workspaceId,
          protocol.id,
          protocol.name,
          protocol.description,
          protocol.status,
          protocol.currentRevision,
          protocol.updatedAt,
          protocol.updatedBy,
          protocol.version,
          expectedVersion,
        ],
      );
      const found = result.rows[0];
      return found === undefined ? null : mapProtocol(row(found));
    },
  };

  const protocolRevisions: ProtocolRevisionRepository = {
    async get(scope, revisionId) {
      const result = await client.query(
        `SELECT id, workspace_id, protocol_id, revision, name, description,
                metadata, created_at, created_by
           FROM assessment.protocol_revision
          WHERE workspace_id = $1 AND id = $2`,
        [scope.workspaceId, revisionId],
      );
      const found = result.rows[0];
      return found === undefined ? null : mapProtocolRevision(row(found), "");
    },
    async listForProtocol(scope, protocolId) {
      const result = await client.query(
        `SELECT id, workspace_id, protocol_id, revision, name, description,
                metadata, created_at, created_by
           FROM assessment.protocol_revision
          WHERE workspace_id = $1 AND protocol_id = $2
          ORDER BY revision DESC, id`,
        [scope.workspaceId, protocolId],
      );
      return result.rows.map(
        (value) => mapProtocolRevision(row(value), "") as ProtocolRevision,
      );
    },
    async insert(revision) {
      await client.query(
        `INSERT INTO assessment.protocol_revision
           (id, workspace_id, protocol_id, revision, name, description, metadata,
            created_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          revision.id,
          revision.workspaceId,
          revision.protocolId,
          revision.revision,
          revision.name,
          revision.description,
          revision.metadata,
          revision.createdAt,
          revision.createdBy,
        ],
      );
    },
  };

  const acquisitionSources: AcquisitionSourceRepository = {
    async get(scope, sourceId) {
      const result = await client.query(
        `SELECT id, workspace_id, source_class, label, manufacturer, model,
                serial_number, firmware_version, software_version,
                configuration_metadata, created_at, created_by, updated_at,
                updated_by, version
           FROM assessment.acquisition_source
          WHERE workspace_id = $1 AND id = $2`,
        [scope.workspaceId, sourceId],
      );
      const found = result.rows[0];
      return found === undefined ? null : mapSource(row(found));
    },
    async list(scope) {
      const result = await client.query(
        `SELECT id, workspace_id, source_class, label, manufacturer, model,
                serial_number, firmware_version, software_version,
                configuration_metadata, created_at, created_by, updated_at,
                updated_by, version
           FROM assessment.acquisition_source
          WHERE workspace_id = $1
          ORDER BY label, id`,
        [scope.workspaceId],
      );
      return result.rows.map((value) => mapSource(row(value)));
    },
    async insert(source) {
      await client.query(
        `INSERT INTO assessment.acquisition_source
           (id, workspace_id, source_class, label, manufacturer, model,
            serial_number, firmware_version, software_version,
            configuration_metadata, created_at, created_by, updated_at,
            updated_by, version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          source.id,
          source.workspaceId,
          source.sourceClass,
          source.label,
          source.manufacturer,
          source.model,
          source.serialNumber,
          source.firmwareVersion,
          source.softwareVersion,
          source.configurationMetadata,
          source.createdAt,
          source.createdBy,
          source.updatedAt,
          source.updatedBy,
          source.version,
        ],
      );
    },
    async updateExpected(scope, source, expectedVersion) {
      const result = await client.query(
        `UPDATE assessment.acquisition_source
            SET label = $3, manufacturer = $4, model = $5, serial_number = $6,
                firmware_version = $7, software_version = $8,
                configuration_metadata = $9, updated_at = $10,
                updated_by = $11, version = $12
          WHERE workspace_id = $1 AND id = $2 AND version = $13
          RETURNING id, workspace_id, source_class, label, manufacturer, model,
                    serial_number, firmware_version, software_version,
                    configuration_metadata, created_at, created_by, updated_at,
                    updated_by, version`,
        [
          scope.workspaceId,
          source.id,
          source.label,
          source.manufacturer,
          source.model,
          source.serialNumber,
          source.firmwareVersion,
          source.softwareVersion,
          source.configurationMetadata,
          source.updatedAt,
          source.updatedBy,
          source.version,
          expectedVersion,
        ],
      );
      const found = result.rows[0];
      return found === undefined ? null : mapSource(row(found));
    },
  };

  const sourceArtifacts: SourceArtifactRepository = {
    async get(scope, artifactId) {
      const result = await client.query(
        `SELECT id, workspace_id, storage_object_reference, media_type,
                size_bytes, checksum_sha256, original_filename,
                source_information, created_at, ingested_at
           FROM assessment.source_artifact
          WHERE workspace_id = $1 AND id = $2`,
        [scope.workspaceId, artifactId],
      );
      const found = result.rows[0];
      return found === undefined ? null : mapArtifact(row(found));
    },
    async insert(artifact) {
      await client.query(
        `INSERT INTO assessment.source_artifact
           (id, workspace_id, storage_object_reference, media_type, size_bytes,
            checksum_sha256, original_filename, source_information, created_at,
            ingested_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          artifact.id,
          artifact.workspaceId,
          artifact.storageObjectReference,
          artifact.mediaType,
          artifact.sizeBytes,
          artifact.checksumSha256,
          artifact.originalFilename,
          artifact.sourceInformation,
          artifact.createdAt,
          artifact.ingestedAt,
        ],
      );
    },
  };

  const assessments: AssessmentRepository = {
    async get(scope, assessmentId) {
      const result = await client.query(
        `${assessmentSelect} WHERE a.workspace_id = $1 AND a.id = $2`,
        [scope.workspaceId, assessmentId],
      );
      const found = result.rows[0];
      return found === undefined ? null : mapAssessment(row(found));
    },
    async listForAthlete(scope, athleteId: AthleteId) {
      const result = await client.query(
        `${assessmentSelect} WHERE a.workspace_id = $1 AND a.athlete_id = $2 ORDER BY a.occurrence_date DESC, a.occurred_at DESC NULLS LAST, a.id`,
        [scope.workspaceId, athleteId],
      );
      return result.rows.map((value) => mapAssessment(row(value)));
    },
    async insert(assessment) {
      await client.query(
        `INSERT INTO assessment.assessment
           (id, workspace_id, athlete_id, assessment_type, purpose, status,
            occurrence_date, occurred_at, time_zone, protocol_revision_id,
            source_id, source_version, notes, created_at, created_by,
            updated_at, updated_by, version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
        [
          assessment.id,
          assessment.workspaceId,
          assessment.athleteId,
          assessment.assessmentType,
          assessment.purpose,
          assessment.status,
          assessment.occurrenceDate,
          assessment.occurredAt,
          assessment.timeZone,
          assessment.protocolRevision?.id ?? null,
          assessment.source?.id ?? null,
          assessment.sourceVersion,
          assessment.notes,
          assessment.createdAt,
          assessment.createdBy,
          assessment.updatedAt,
          assessment.updatedBy,
          assessment.version,
        ],
      );
      for (const artifactId of assessment.artifactIds) {
        await client.query(
          `INSERT INTO assessment.assessment_artifact
             (workspace_id, assessment_id, artifact_id, attached_at, attached_by)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT DO NOTHING`,
          [
            assessment.workspaceId,
            assessment.id,
            artifactId,
            assessment.createdAt,
            assessment.createdBy,
          ],
        );
      }
    },
    async updateExpected(scope, assessment, expectedVersion) {
      const result = await client.query(
        `UPDATE assessment.assessment
            SET assessment_type = $3, purpose = $4, status = $5,
                occurrence_date = $6, occurred_at = $7, time_zone = $8,
                protocol_revision_id = $9, source_id = $10, source_version = $11,
                notes = $12, updated_at = $13, updated_by = $14, version = $15
          WHERE workspace_id = $1 AND id = $2 AND version = $16
          RETURNING id, workspace_id, athlete_id, assessment_type, purpose, status,
                    occurrence_date, occurred_at, time_zone, protocol_revision_id,
                    source_id, source_version, notes, created_at, created_by,
                    updated_at, updated_by, version`,
        [
          scope.workspaceId,
          assessment.id,
          assessment.assessmentType,
          assessment.purpose,
          assessment.status,
          assessment.occurrenceDate,
          assessment.occurredAt,
          assessment.timeZone,
          assessment.protocolRevision?.id ?? null,
          assessment.source?.id ?? null,
          assessment.sourceVersion,
          assessment.notes,
          assessment.updatedAt,
          assessment.updatedBy,
          assessment.version,
          expectedVersion,
        ],
      );
      const found = result.rows[0];
      if (found === undefined) return null;
      for (const artifactId of assessment.artifactIds) {
        await client.query(
          `INSERT INTO assessment.assessment_artifact
             (workspace_id, assessment_id, artifact_id, attached_at, attached_by)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT DO NOTHING`,
          [
            assessment.workspaceId,
            assessment.id,
            artifactId,
            assessment.updatedAt,
            assessment.updatedBy,
          ],
        );
      }
      return createAssessment({
        ...assessment,
        version: Number(found.version),
      });
    },
  };

  const trials: TrialRepository = {
    async get(scope, trialId) {
      const result = await client.query(
        `SELECT * FROM assessment.trial WHERE workspace_id = $1 AND id = $2`,
        [scope.workspaceId, trialId],
      );
      const found = result.rows[0];
      return found === undefined ? null : mapTrial(row(found));
    },
    async listForAssessment(scope, assessmentId) {
      const result = await client.query(
        `SELECT * FROM assessment.trial WHERE workspace_id = $1 AND assessment_id = $2 ORDER BY ordinal, id`,
        [scope.workspaceId, assessmentId],
      );
      return result.rows.map((value) => mapTrial(row(value)));
    },
    async insert(trial) {
      await client.query(
        `INSERT INTO assessment.trial
           (id, workspace_id, assessment_id, ordinal, status, validity_state,
            exclusion_state, exclusion_reason, source_class, source_reference,
            source_id, protocol_revision_id, source_artifact_ids, evidence_origin,
            actor_id, captured_at, ingested_at, evidence_created_at,
            parent_evidence_ids, supersedes_evidence_id, provenance, created_at,
            created_by, updated_at, updated_by, version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
                 $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)`,
        [
          trial.id,
          trial.workspaceId,
          trial.assessmentId,
          trial.ordinal,
          trial.status,
          trial.validity,
          trial.exclusion,
          trial.exclusionReason,
          ...lineageColumns(trial.provenance),
          trial.createdAt,
          trial.createdBy,
          trial.updatedAt,
          trial.updatedBy,
          trial.version,
        ],
      );
    },
    async updateExpected(scope, trial, expectedVersion) {
      const result = await client.query(
        `UPDATE assessment.trial
            SET status = $3, validity_state = $4, exclusion_state = $5,
                exclusion_reason = $6, updated_at = $7, updated_by = $8,
                version = $9
          WHERE workspace_id = $1 AND id = $2 AND version = $10
          RETURNING *`,
        [
          scope.workspaceId,
          trial.id,
          trial.status,
          trial.validity,
          trial.exclusion,
          trial.exclusionReason,
          trial.updatedAt,
          trial.updatedBy,
          trial.version,
          expectedVersion,
        ],
      );
      const found = result.rows[0];
      return found === undefined ? null : mapTrial(row(found));
    },
  };

  const rawObservations: RawObservationRepository = {
    async get(scope, observationId) {
      const result = await client.query(
        `SELECT * FROM assessment.observation WHERE workspace_id = $1 AND id = $2`,
        [scope.workspaceId, observationId],
      );
      const found = result.rows[0];
      return found === undefined ? null : mapObservation(row(found));
    },
    async listForAssessment(scope, assessmentId) {
      const result = await client.query(
        `SELECT * FROM assessment.observation WHERE workspace_id = $1 AND assessment_id = $2 ORDER BY recorded_at, id`,
        [scope.workspaceId, assessmentId],
      );
      return result.rows.map((value) => mapObservation(row(value)));
    },
    async insert(observation) {
      const isPresent = observation.value.kind === "PRESENT";
      const quantity = isPresent ? observation.value.value : null;
      await client.query(
        `INSERT INTO assessment.observation
           (id, workspace_id, assessment_id, trial_id, observation_key,
            value_kind, value_magnitude, value_unit, value_dimension,
            missing_reason, observed_at, source_class, source_reference, source_id,
            protocol_revision_id, source_artifact_ids, evidence_origin, actor_id,
            captured_at, ingested_at, evidence_created_at, parent_evidence_ids,
            supersedes_evidence_id, provenance, metadata, supersedes_observation_id,
            recorded_at, recorded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
                 $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)`,
        [
          observation.id,
          observation.workspaceId,
          observation.assessmentId,
          observation.trialId,
          observation.observationKey,
          observation.value.kind,
          quantity?.value ?? null,
          quantity?.unit ?? null,
          quantity?.dimension ?? null,
          observation.value.kind === "MISSING"
            ? observation.value.reason
            : null,
          observation.observedAt,
          ...lineageColumns(observation.provenance),
          observation.metadata,
          observation.supersedesObservationId,
          observation.recordedAt,
          observation.recordedBy,
        ],
      );
    },
  };

  const metricDefinitions: MetricDefinitionRepository = {
    async get(scope, metricDefinitionId) {
      const result = await client.query(
        `SELECT md.id, md.workspace_id, md.key, md.revision, md.display_name,
                md.description, md.expected_dimension, md.result_scope,
                md.created_at, md.created_by,
                pr.id AS pr_id, pr.workspace_id AS pr_workspace_id,
                pr.protocol_id AS pr_protocol_id, pr.revision AS pr_revision,
                pr.name AS pr_name, pr.description AS pr_description,
                pr.metadata AS pr_metadata, pr.created_at AS pr_created_at,
                pr.created_by AS pr_created_by
           FROM assessment.metric_definition md
           LEFT JOIN assessment.protocol_revision pr
             ON pr.workspace_id = md.workspace_id AND pr.id = md.method_protocol_revision_id
          WHERE md.workspace_id = $1 AND md.id = $2`,
        [scope.workspaceId, metricDefinitionId],
      );
      const found = result.rows[0];
      return found === undefined ? null : mapMetricDefinition(row(found), "");
    },
    async list(scope) {
      const result = await client.query(
        `SELECT md.id, md.workspace_id, md.key, md.revision, md.display_name,
                md.description, md.expected_dimension, md.result_scope,
                md.created_at, md.created_by,
                pr.id AS pr_id, pr.workspace_id AS pr_workspace_id,
                pr.protocol_id AS pr_protocol_id, pr.revision AS pr_revision,
                pr.name AS pr_name, pr.description AS pr_description,
                pr.metadata AS pr_metadata, pr.created_at AS pr_created_at,
                pr.created_by AS pr_created_by
           FROM assessment.metric_definition md
           LEFT JOIN assessment.protocol_revision pr
             ON pr.workspace_id = md.workspace_id AND pr.id = md.method_protocol_revision_id
          WHERE md.workspace_id = $1
          ORDER BY md.key, md.revision DESC, md.id`,
        [scope.workspaceId],
      );
      return result.rows.map((value) => mapMetricDefinition(row(value), ""));
    },
    async insert(metricDefinition) {
      await client.query(
        `INSERT INTO assessment.metric_definition
           (id, workspace_id, key, revision, display_name, description,
            expected_dimension, method_protocol_revision_id, result_scope,
            created_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          metricDefinition.id,
          metricDefinition.workspaceId,
          metricDefinition.key,
          metricDefinition.revision,
          metricDefinition.displayName,
          metricDefinition.description,
          metricDefinition.expectedDimension,
          metricDefinition.methodProtocolRevision?.id ?? null,
          metricDefinition.resultScope,
          metricDefinition.createdAt,
          metricDefinition.createdBy,
        ],
      );
    },
  };

  const neutralResults: NeutralResultRepository = {
    async get(scope, resultId) {
      const result = await client.query(
        resultSelect("WHERE r.workspace_id = $1 AND r.id = $2"),
        [scope.workspaceId, resultId],
      );
      const found = result.rows[0];
      return found === undefined ? null : mapResult(row(found));
    },
    async listForAssessment(scope, assessmentId) {
      const result = await client.query(
        resultSelect(
          "WHERE r.workspace_id = $1 AND r.assessment_id = $2 ORDER BY r.recorded_at, r.id",
        ),
        [scope.workspaceId, assessmentId],
      );
      return result.rows.map((value) => mapResult(row(value)));
    },
    async insert(result) {
      const isPresent = result.value.kind === "PRESENT";
      const quantity = isPresent ? result.value.value : null;
      await client.query(
        `INSERT INTO assessment.result
           (id, workspace_id, assessment_id, trial_id, metric_definition_id,
            metric_revision, value_kind, value_magnitude, value_unit,
            value_dimension, missing_reason, result_origin, source_class,
            method_protocol_revision_id, source_reference, source_id,
            protocol_revision_id, source_artifact_ids, evidence_origin, actor_id,
            captured_at, ingested_at, evidence_created_at, parent_evidence_ids,
            supersedes_evidence_id, provenance, recorded_at, recorded_by,
            supersedes_result_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
                 $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26,
                 $27, $28, $29)`,
        [
          result.id,
          result.workspaceId,
          result.assessmentId,
          result.trialId,
          result.metricDefinition.id,
          result.metricDefinition.revision,
          result.value.kind,
          quantity?.value ?? null,
          quantity?.unit ?? null,
          quantity?.dimension ?? null,
          result.value.kind === "MISSING" ? result.value.reason : null,
          result.origin,
          result.sourceClass,
          result.methodProtocolRevision?.id ?? null,
          result.provenance.sourceReference,
          result.provenance.sourceId,
          result.provenance.protocolRevision?.revisionId ?? null,
          JSON.stringify(result.provenance.sourceArtifactIds),
          result.provenance.origin,
          result.provenance.actorId,
          result.provenance.capturedAt,
          result.provenance.ingestedAt,
          result.provenance.createdAt,
          JSON.stringify(result.provenance.parentEvidenceIds),
          result.provenance.supersedesEvidenceId,
          JSON.stringify(result.provenance),
          result.recordedAt,
          result.recordedBy,
          result.supersedesResultId,
        ],
      );
    },
  };

  const assessmentAmendments: AssessmentAmendmentRepository = {
    async listForAssessment(scope, assessmentId) {
      const result = await client.query(
        `SELECT * FROM assessment.amendment WHERE workspace_id = $1 AND assessment_id = $2 ORDER BY occurred_at, id`,
        [scope.workspaceId, assessmentId],
      );
      return result.rows.map((value) => mapAmendment(row(value)));
    },
    async insert(amendment) {
      await client.query(
        `INSERT INTO assessment.amendment
           (id, workspace_id, assessment_id, target_type, target_id, reason,
            original_state, corrected_fields, supersedes_amendment_id,
            occurred_at, actor_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          amendment.id,
          amendment.workspaceId,
          amendment.assessmentId,
          amendment.targetType,
          amendment.targetId,
          amendment.reason,
          amendment.originalState,
          amendment.correctedFields,
          amendment.supersedesAmendmentId,
          amendment.occurredAt,
          amendment.actorId,
        ],
      );
    },
  };

  return {
    protocols,
    protocolRevisions,
    acquisitionSources,
    sourceArtifacts,
    assessments,
    trials,
    rawObservations,
    metricDefinitions,
    neutralResults,
    assessmentAmendments,
  };
}

function resultSelect(where: string): string {
  return `
    SELECT r.*,
           md.id AS metric_id, md.workspace_id AS metric_workspace_id,
           md.key AS metric_key, md.revision AS metric_revision_value,
           md.display_name AS metric_display_name,
           md.description AS metric_description,
           md.expected_dimension AS metric_expected_dimension,
           md.result_scope AS metric_result_scope,
           md.created_at AS metric_created_at, md.created_by AS metric_created_by,
           mpr.id AS metric_pr_id, mpr.workspace_id AS metric_pr_workspace_id,
           mpr.protocol_id AS metric_pr_protocol_id,
           mpr.revision AS metric_pr_revision, mpr.name AS metric_pr_name,
           mpr.description AS metric_pr_description,
           mpr.metadata AS metric_pr_metadata,
           mpr.created_at AS metric_pr_created_at,
           mpr.created_by AS metric_pr_created_by,
           mth.id AS method_pr_id, mth.workspace_id AS method_pr_workspace_id,
           mth.protocol_id AS method_pr_protocol_id,
           mth.revision AS method_pr_revision, mth.name AS method_pr_name,
           mth.description AS method_pr_description,
           mth.metadata AS method_pr_metadata,
           mth.created_at AS method_pr_created_at,
           mth.created_by AS method_pr_created_by
      FROM assessment.result r
      JOIN assessment.metric_definition md
        ON md.workspace_id = r.workspace_id AND md.id = r.metric_definition_id
      LEFT JOIN assessment.protocol_revision mpr
        ON mpr.workspace_id = md.workspace_id AND mpr.id = md.method_protocol_revision_id
      LEFT JOIN assessment.protocol_revision mth
        ON mth.workspace_id = r.workspace_id AND mth.id = r.method_protocol_revision_id
     ${where}`;
}
