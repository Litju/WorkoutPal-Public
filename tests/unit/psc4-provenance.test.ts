import type { EvidenceLineage, SourceArtifact } from "@workoutpal/provenance";
import {
  createEvidenceLineage,
  createSourceArtifact,
  parseEvidenceLineage,
  serializeEvidenceLineage,
} from "@workoutpal/provenance";
import type { Instant, UUID, WorkspaceId } from "@workoutpal/shared-kernel";
import { describe, expect, it } from "vitest";

const workspaceId = "11111111-1111-4111-8111-111111111111" as WorkspaceId;
const sourceId = "22222222-2222-4222-8222-222222222222" as UUID;
const protocolId = "33333333-3333-4333-8333-333333333333" as UUID;
const revisionId = "44444444-4444-4444-8444-444444444444" as UUID;
const now = "2026-08-15T15:00:00.000Z" as Instant;

function lineage(): EvidenceLineage {
  return {
    sourceClass: "DEVICE_CAPTURE",
    sourceReference: "device-capture-001",
    sourceId,
    sourceArtifactIds: [],
    protocolRevision: { protocolId, revisionId, revision: 1 },
    origin: "DEVICE",
    actorId: null,
    capturedAt: now,
    ingestedAt: now,
    createdAt: now,
    parentEvidenceIds: [],
    supersedesEvidenceId: null,
  };
}

describe("PSC4 evidence provenance", () => {
  it("round-trips immutable source and protocol lineage", () => {
    const value = createEvidenceLineage(lineage());
    expect(parseEvidenceLineage(serializeEvidenceLineage(value))).toEqual(
      value,
    );
  });

  it("keeps audit/provenance rules explicit and rejects invalid lineage", () => {
    expect(() =>
      createEvidenceLineage({
        ...lineage(),
        sourceClass: "IMPORT",
        origin: "DEVICE",
      }),
    ).toThrow("DEVICE_CAPTURE");
    expect(() =>
      createEvidenceLineage({
        ...lineage(),
        sourceArtifactIds: [sourceId, sourceId],
      }),
    ).toThrow("unique");
    expect(() =>
      createEvidenceLineage({
        ...lineage(),
        sourceClass: "SYSTEM_DERIVED_NEUTRAL",
        origin: "HUMAN",
      }),
    ).toThrow("SYSTEM origin");
  });

  it("requires a private stable artifact identity and checksum", () => {
    const artifact: SourceArtifact = {
      id: sourceId,
      workspaceId,
      storageObjectReference: "workspace/assessment/source.csv",
      mediaType: "text/csv",
      sizeBytes: 12,
      checksumSha256: "a".repeat(64),
      originalFilename: "source.csv",
      sourceInformation: { importer: "manual" },
      createdAt: now,
      ingestedAt: now,
    };
    expect(createSourceArtifact(artifact)).toEqual(artifact);
    expect(() =>
      createSourceArtifact({
        ...artifact,
        storageObjectReference: "https://signed.example/file",
      }),
    ).toThrow("signed URL");
  });
});
