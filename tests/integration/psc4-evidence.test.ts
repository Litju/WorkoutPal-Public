import {
  createAssessmentApplication,
  createF2Application,
} from "@workoutpal/application";
import {
  createPostgresF2Persistence,
  readPostgresConnectionConfig,
} from "@workoutpal/persistence-postgres";
import type {
  AthleteId,
  EvidenceValue,
  Quantity,
  UUID,
  WorkspaceId,
} from "@workoutpal/shared-kernel";
import { createQuantity, missing, present } from "@workoutpal/shared-kernel";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://workoutpal_runtime_login:workoutpal_runtime_dev@127.0.0.1:55432/workoutpal";

function id(): UUID {
  return crypto.randomUUID() as UUID;
}

describe("PSC4 neutral evidence with real PostgreSQL", () => {
  const persistence = createPostgresF2Persistence({
    ...readPostgresConnectionConfig({ DATABASE_URL: databaseUrl }),
    applicationName: "workoutpal-psc4-evidence",
  });
  const foundation = createF2Application(persistence);
  const assessments = createAssessmentApplication({
    transaction: persistence.psc4Transaction,
  });
  let ownerA: UUID;
  let ownerB: UUID;
  let workspaceA: WorkspaceId;
  let workspaceB: WorkspaceId;
  let athleteA: AthleteId;
  let athleteB: AthleteId;

  beforeAll(async () => {
    ownerA = id();
    ownerB = id();
    workspaceA = (
      await foundation.createWorkspace({
        principalId: ownerA,
        requestId: `psc4-workspace-a-${ownerA}`,
        name: `PSC4 workspace A ${ownerA.slice(0, 8)}`,
      })
    ).id;
    workspaceB = (
      await foundation.createWorkspace({
        principalId: ownerB,
        requestId: `psc4-workspace-b-${ownerB}`,
        name: `PSC4 workspace B ${ownerB.slice(0, 8)}`,
      })
    ).id;
    athleteA = (
      await foundation.createAthlete({
        principalId: ownerA,
        requestId: `psc4-athlete-a-${ownerA}`,
        workspaceId: workspaceA,
        displayName: `PSC4 athlete A ${ownerA.slice(0, 8)}`,
        idempotencyKey: `psc4-athlete-a-${ownerA}`,
      })
    ).id;
    athleteB = (
      await foundation.createAthlete({
        principalId: ownerB,
        requestId: `psc4-athlete-b-${ownerB}`,
        workspaceId: workspaceB,
        displayName: `PSC4 athlete B ${ownerB.slice(0, 8)}`,
        idempotencyKey: `psc4-athlete-b-${ownerB}`,
      })
    ).id;
  });

  afterAll(async () => {
    await persistence.close();
  });

  it("persists the assessment graph, missingness, amendments, and lineage", async () => {
    const now = "2026-08-15T15:00:00.000Z" as never;
    const protocol = await assessments.createProtocol({
      principalId: ownerA,
      requestId: "psc4-protocol-create",
      workspaceId: workspaceA,
      key: `neutral-${ownerA}`,
      name: "Neutral capture protocol",
      idempotencyKey: `psc4-protocol-${ownerA}`,
    });
    const revision = await assessments.createProtocolRevision({
      principalId: ownerA,
      requestId: "psc4-protocol-revision",
      workspaceId: workspaceA,
      protocolId: protocol.id,
      name: "Neutral capture protocol revision 1",
      expectedVersion: 1,
    });
    const source = await assessments.createAcquisitionSource({
      principalId: ownerA,
      requestId: "psc4-source-create",
      workspaceId: workspaceA,
      sourceClass: "MANUAL_ENTRY",
      label: "Coach entry",
    });
    const artifact = await assessments.createSourceArtifact({
      principalId: ownerA,
      requestId: "psc4-artifact-create",
      workspaceId: workspaceA,
      storageObjectReference: `workspace/${workspaceA}/capture.csv`,
      mediaType: "text/csv",
      sizeBytes: 42,
      checksumSha256: "b".repeat(64),
    });
    const metric = await assessments.createMetricDefinition({
      principalId: ownerA,
      requestId: "psc4-metric-create",
      workspaceId: workspaceA,
      key: `recorded-mass-${ownerA}`,
      revision: 1,
      displayName: "Recorded mass",
      expectedDimension: "mass",
      methodProtocolRevisionId: revision.id,
      resultScope: "TRIAL",
    });
    const assessment = await assessments.createAssessment({
      principalId: ownerA,
      requestId: "psc4-assessment-create",
      workspaceId: workspaceA,
      athleteId: athleteA,
      assessmentType: "neutral-capture",
      purpose: "Evidence substrate test",
      occurrenceDate: "2026-08-15" as never,
      assessmentOccurredAt: now,
      timeZone: "America/Argentina/Buenos_Aires" as never,
      protocolRevisionId: revision.id,
      sourceId: source.id,
      artifactIds: [artifact.id],
      idempotencyKey: `psc4-assessment-${ownerA}`,
    });
    expect(assessment.protocolRevision?.revision).toBe(1);
    expect(assessment.source?.id).toBe(source.id);
    expect(assessment.artifactIds).toEqual([artifact.id]);

    const amendedAssessment = await assessments.updateAssessment({
      principalId: ownerA,
      requestId: "psc4-assessment-amend",
      workspaceId: workspaceA,
      assessmentId: assessment.id,
      expectedVersion: assessment.version,
      assessmentType: "neutral-capture-amended",
      reason: "Operator corrected the assessment label.",
      idempotencyKey: `psc4-assessment-amend-${ownerA}`,
    });
    expect(amendedAssessment.version).toBe(2);
    expect(amendedAssessment.sourceVersion).toBe(source.version);

    const trial = await assessments.createTrial({
      principalId: ownerA,
      requestId: "psc4-trial-create",
      workspaceId: workspaceA,
      assessmentId: assessment.id,
      ordinal: 1,
    });
    const trialTwo = await assessments.createTrial({
      principalId: ownerA,
      requestId: "psc4-trial-create-two",
      workspaceId: workspaceA,
      assessmentId: assessment.id,
    });
    expect([trial.ordinal, trialTwo.ordinal]).toEqual([1, 2]);
    await expect(
      assessments.createTrial({
        principalId: ownerA,
        requestId: "psc4-trial-duplicate",
        workspaceId: workspaceA,
        assessmentId: assessment.id,
        ordinal: 1,
      }),
    ).rejects.toBeDefined();

    const quantity: EvidenceValue<Quantity> = present(
      createQuantity({ value: 100, unit: "kg", dimension: "mass" }),
    );
    const observation = await assessments.createRawObservation({
      principalId: ownerA,
      requestId: "psc4-observation-create",
      workspaceId: workspaceA,
      assessmentId: assessment.id,
      trialId: trial.id,
      observationKey: "body-mass",
      value: quantity,
      observedAt: now,
      idempotencyKey: `psc4-observation-${ownerA}`,
    });
    await assessments.createRawObservation({
      principalId: ownerA,
      requestId: "psc4-observation-missing",
      workspaceId: workspaceA,
      assessmentId: assessment.id,
      trialId: trial.id,
      observationKey: "optional-device-value",
      value: missing("NOT_RECORDED"),
    });
    const replacement = await assessments.amendRawObservation({
      principalId: ownerA,
      requestId: "psc4-observation-amend",
      workspaceId: workspaceA,
      observationId: observation.id,
      value: present(createQuantity({ value: 101, unit: "kg" })),
      observedAt: now,
      reason: "Operator corrected the recorded value.",
      idempotencyKey: `psc4-observation-amend-${ownerA}`,
    });
    expect(replacement.supersedesObservationId).toBe(observation.id);
    expect(replacement.provenance.supersedesEvidenceId).toBe(observation.id);

    await assessments.updateTrial({
      principalId: ownerA,
      requestId: "psc4-trial-amend",
      workspaceId: workspaceA,
      trialId: trial.id,
      expectedVersion: 1,
      validity: "INVALID",
      exclusion: "EXCLUDED",
      exclusionReason: "Operator recorded an exclusion.",
    });
    await expect(
      assessments.createNeutralResult({
        principalId: ownerA,
        requestId: "psc4-result-missing-trial",
        workspaceId: workspaceA,
        assessmentId: assessment.id,
        trialId: null,
        metricDefinitionId: metric.id,
        value: present(createQuantity({ value: 101, unit: "kg" })),
        origin: "MEASURED",
      }),
    ).rejects.toThrow("A trial-scoped metric requires a trial.");
    const result = await assessments.createNeutralResult({
      principalId: ownerA,
      requestId: "psc4-result-create",
      workspaceId: workspaceA,
      assessmentId: assessment.id,
      trialId: trial.id,
      metricDefinitionId: metric.id,
      value: present(createQuantity({ value: 101, unit: "kg" })),
      origin: "MEASURED",
      methodProtocolRevisionId: revision.id,
      idempotencyKey: `psc4-result-${ownerA}`,
    });
    expect(result.metricDefinition.revision).toBe(1);
    const detail = await assessments.getAssessment({
      principalId: ownerA,
      requestId: "psc4-assessment-detail",
      workspaceId: workspaceA,
      assessmentId: assessment.id,
    });
    expect(detail.trials.map((item) => item.ordinal)).toEqual([1, 2]);
    expect(detail.observations.map((item) => item.value.kind)).toEqual([
      "PRESENT",
      "MISSING",
      "PRESENT",
    ]);
    expect(detail.results).toHaveLength(1);
    expect(detail.amendments.map((item) => item.targetType)).toContain("TRIAL");
    expect(detail.amendments.map((item) => item.targetType)).toContain(
      "OBSERVATION",
    );
  });

  it("rejects cross-workspace references and forged tenant context", async () => {
    await expect(
      assessments.listAssessments({
        principalId: ownerA,
        requestId: "psc4-cross-list",
        workspaceId: workspaceA,
        athleteId: athleteB,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      assessments.createAssessment({
        principalId: ownerA,
        requestId: "psc4-cross-create",
        workspaceId: workspaceA,
        athleteId: athleteA,
        assessmentType: "cross-tenant-reference",
        occurrenceDate: "2026-08-15" as never,
        timeZone: "UTC" as never,
        sourceId: id(),
      }),
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
    await expect(
      assessments.listAssessments({
        principalId: ownerA,
        requestId: "psc4-forged-workspace",
        workspaceId: workspaceB,
        athleteId: athleteB,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
