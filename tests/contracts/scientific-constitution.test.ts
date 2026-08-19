import {
  assertAcyclicDerivationGraph,
  assertCalibrationRecord,
  assertCalibrationRequirement,
  assertLegalClaimProduction,
  assertOracleIndependentFromProcessor,
  assertProcessorOutputClass,
  assertReferenceDataset,
  assertUncertainty,
  assertUncertaintyPolicy,
  type ClaimAuthority,
  createDerivationGraph,
  createProcessorContract,
  createProcessorExecution,
  createQualificationBinding,
  createRecalculationHistory,
  createScientificClaim,
  createScientificFailure,
  createScientificInfrastructureException,
  createTolerance,
  createValidationEvidence,
  derivationProvenance,
  type ScientificClaimClass,
  type ScientificProcessorContract,
  type Uncertainty,
} from "@workoutpal/science-contract";
import { createQuantity, type Instant } from "@workoutpal/shared-kernel";
import { describe, expect, it } from "vitest";

const instant = "2026-08-16T03:00:00.000Z" as Instant;
const kg = createQuantity({ value: 80, unit: "kg" });
const evidenceReference = { type: "PSC4_OBSERVATION", ref: "observation-1" };

function authority(
  methodId: string,
  parentRef = "claim-1",
  parentClass: ScientificClaimClass = "OBSERVED",
): ClaimAuthority {
  return {
    method: { id: methodId, version: "1.0.0" },
    software: {
      packageName: "@workoutpal/science-contract",
      packageVersion: "0.1.0",
      sourceRevision: "candidate-source",
      buildId: "candidate-build",
    },
    assumptions: [
      {
        id: "assumption.synthetic-fixture",
        version: "1",
        description:
          "The fixture is synthetic and carries no domain interpretation.",
        reference: { type: "SCI0_FIXTURE", ref: "fixture-assumption-1" },
        status: "DECLARED",
        parameters: { synthetic: true },
      },
    ],
    configuration: {
      id: "config-1",
      parameters: { precision: "declared-by-fixture" },
      canonicalSerialization: '{"precision":"declared-by-fixture"}',
      contentHash: "config-hash-1",
    },
    lineage: {
      parents: [
        { kind: "SCIENTIFIC_CLAIM", ref: parentRef, claimClass: parentClass },
      ],
      provenance: [{ type: "SCI0_DERIVATION", ref: "derivation-1" }],
    },
  };
}

function unknownUncertainty(): Uncertainty {
  return {
    kind: "UNKNOWN",
    reason: "The synthetic fixture does not calculate uncertainty.",
    source: {
      kind: "METHOD",
      method: { id: "fixture.uncertainty", version: "1" },
    },
  };
}

function contract(): ScientificProcessorContract {
  return {
    processor: { id: "fixture.processor", version: "1.0.0" },
    method: { id: "fixture.method", version: "1.0.0" },
    software: {
      packageName: "@workoutpal/science-contract",
      packageVersion: "0.1.0",
      sourceRevision: "candidate-source",
      buildId: "candidate-build",
    },
    inputs: [
      {
        id: "vertical-force",
        source: "PSC4_EVIDENCE",
        required: true,
        acceptedClaimClasses: [],
        dimensions: ["force"],
        units: ["N"],
        acceptedValidityStates: ["VALID"],
        acceptedExclusionStates: ["INCLUDED"],
        acceptedMissingness: ["NOT_RECORDED"],
        protocol: { kind: "NONE" },
      },
    ],
    output: {
      claimClass: "MECHANICALLY_DERIVED",
      valueKind: "QUANTITY",
      dimension: "force",
      unit: "N",
    },
    assumptions: [
      {
        id: "assumption.synthetic-fixture",
        version: "1",
        description:
          "The fixture is synthetic and has no sport-specific algorithm.",
        reference: { type: "SCI0_FIXTURE", ref: "fixture-assumption-1" },
        status: "DECLARED",
        parameters: {},
      },
    ],
    calibration: {
      kind: "REQUIRED",
      acceptedStatuses: ["CALIBRATED"],
    },
    uncertainty: {
      measurement: {
        kind: "PROPAGATED_BY_PROCESSOR",
        method: { id: "fixture.method", version: "1.0.0" },
      },
      statistical: {
        kind: "NOT_PROPAGATED",
        reason: "This deterministic fixture is not a statistical estimator.",
      },
      model: {
        kind: "NOT_PROPAGATED",
        reason: "No model is implemented by SCI-0.",
      },
      propagated: {
        kind: "UNKNOWN",
        reason: "The future processor must declare propagation behavior.",
      },
      output: "UNKNOWN_ALLOWED",
    },
    configuration: {
      id: "config-1",
      parameters: { synthetic: true },
      canonicalSerialization: '{"synthetic":true}',
      contentHash: "config-hash-1",
    },
    determinism: "DETERMINISTIC",
    failureModes: ["REQUIRED_EVIDENCE_MISSING", "INPUT_INVALID"],
    lineage: {
      requiredFields: [
        "INPUTS",
        "PROCESSOR",
        "METHOD",
        "ASSUMPTIONS",
        "CONFIGURATION",
      ],
    },
    qualification: {
      status: "NOT_QUALIFIED",
      reason: "SCI-0 defines the contract before a processor exists.",
    },
  };
}

describe("SCI-0 claim taxonomy and legal transitions", () => {
  it("keeps observed, derived, estimated, inference, interpretation, and decision claims distinct", () => {
    const observed = createScientificClaim({
      claimClass: "OBSERVED",
      claimId: "observed-1",
      value: { kind: "QUANTITY", value: kg },
      evidence: [evidenceReference],
      observedAt: instant,
    });
    const derived = createScientificClaim({
      claimClass: "MECHANICALLY_DERIVED",
      claimId: "derived-1",
      value: { kind: "QUANTITY", value: kg },
      output: { kind: "QUANTITY", dimension: "mass", unit: "kg" },
      ...authority("fixture.mechanical", "observed-1", "OBSERVED"),
    });
    const estimated = createScientificClaim({
      claimClass: "STATISTICALLY_ESTIMATED",
      claimId: "estimated-1",
      value: { kind: "QUANTITY", value: kg },
      output: { kind: "QUANTITY", dimension: "mass", unit: "kg" },
      estimator: { id: "fixture.estimator", version: "1" },
      sampleScope: {
        kind: "SAMPLE",
        reference: { type: "SCI0_FIXTURE", ref: "sample-1" },
        count: 3,
      },
      uncertainty: unknownUncertainty(),
      ...authority("fixture.estimator", "derived-1", "MECHANICALLY_DERIVED"),
    });
    const inference = createScientificClaim({
      claimClass: "SCIENTIFIC_INFERENCE",
      claimId: "inference-1",
      proposition:
        "A synthetic proposition is represented without a domain rule.",
      evidenceBasis: [
        {
          kind: "SCIENTIFIC_CLAIM",
          ref: "estimated-1",
          claimClass: "STATISTICALLY_ESTIMATED",
        },
      ],
      uncertainty: unknownUncertainty(),
      ...authority(
        "fixture.inference",
        "estimated-1",
        "STATISTICALLY_ESTIMATED",
      ),
    });
    const interpretation = createScientificClaim({
      claimClass: "INTERPRETATION",
      claimId: "interpretation-1",
      statement: "A future domain layer may interpret a qualified claim.",
      ...authority(
        "fixture.interpretation",
        "inference-1",
        "SCIENTIFIC_INFERENCE",
      ),
    });
    const decision = createScientificClaim({
      claimClass: "DECISION_RECOMMENDATION",
      claimId: "decision-1",
      action: "A future decision layer may propose an action.",
      ...authority("fixture.decision", "interpretation-1", "INTERPRETATION"),
    });

    expect(observed.claimClass).toBe("OBSERVED");
    expect(derived.claimClass).toBe("MECHANICALLY_DERIVED");
    expect(estimated.claimClass).toBe("STATISTICALLY_ESTIMATED");
    expect(inference.claimClass).toBe("SCIENTIFIC_INFERENCE");
    expect(interpretation.claimClass).toBe("INTERPRETATION");
    expect(decision.claimClass).toBe("DECISION_RECOMMENDATION");
  });

  it("requires PSC4 provenance and validates observed quantity semantics", () => {
    expect(() =>
      createScientificClaim({
        claimClass: "OBSERVED",
        claimId: "observed-non-psc4",
        value: { kind: "QUANTITY", value: kg },
        evidence: [{ type: "SCI0_FIXTURE", ref: "fixture-1" }],
        observedAt: instant,
      }),
    ).toThrow("PSC4 source evidence");
    expect(() =>
      createScientificClaim({
        claimClass: "OBSERVED",
        claimId: "observed-fake-psc4",
        value: { kind: "QUANTITY", value: kg },
        evidence: [{ type: "PSC4_FAKE", ref: "fake-1" }],
        observedAt: instant,
      }),
    ).toThrow("PSC4 source evidence");
    expect(() =>
      createScientificClaim({
        claimClass: "OBSERVED",
        claimId: "observed-invalid-quantity",
        value: {
          kind: "QUANTITY",
          value: { value: 80, unit: "kg", dimension: "force" },
        },
        evidence: [evidenceReference],
        observedAt: instant,
      }),
    ).toThrow("not force");
  });

  it("accepts non-linear upward production and rejects downcasting or method mismatch", () => {
    const legal = [
      ["OBSERVED", "MECHANICALLY_DERIVED"],
      ["OBSERVED", "STATISTICALLY_ESTIMATED"],
      ["MECHANICALLY_DERIVED", "STATISTICALLY_ESTIMATED"],
      ["STATISTICALLY_ESTIMATED", "SCIENTIFIC_INFERENCE"],
      ["SCIENTIFIC_INFERENCE", "INTERPRETATION"],
      ["INTERPRETATION", "DECISION_RECOMMENDATION"],
    ] as const;
    for (const [parentClass, outputClass] of legal) {
      expect(() =>
        assertLegalClaimProduction({
          parentClasses: [parentClass],
          outputClass,
          producerOutputClass: outputClass,
        }),
      ).not.toThrow();
    }
    expect(() =>
      assertLegalClaimProduction({
        parentClasses: ["INTERPRETATION"],
        outputClass: "OBSERVED",
        producerOutputClass: "OBSERVED",
      }),
    ).toThrow("Illegal scientific claim transition");
    expect(() =>
      assertLegalClaimProduction({
        parentClasses: ["OBSERVED"],
        outputClass: "MECHANICALLY_DERIVED",
        producerOutputClass: "STATISTICALLY_ESTIMATED",
      }),
    ).toThrow("different from its declared output class");
    expect(() =>
      createScientificClaim({
        claimClass: "MECHANICALLY_DERIVED",
        claimId: "illegal-downcast",
        value: { kind: "QUANTITY", value: kg },
        output: { kind: "QUANTITY", dimension: "mass", unit: "kg" },
        ...authority(
          "fixture.mechanical",
          "interpretation-1",
          "INTERPRETATION",
        ),
      }),
    ).toThrow("Illegal scientific claim transition");
  });
});

describe("SCI-0 processor and failure contracts", () => {
  it("requires versioned inputs, outputs, assumptions, configuration, lineage, and structured failures", () => {
    const processor = createProcessorContract(contract());
    expect(processor.output.claimClass).toBe("MECHANICALLY_DERIVED");
    expect(processor.lineage.requiredFields).toContain("CONFIGURATION");
    expect(processor.failureModes).toContain("REQUIRED_EVIDENCE_MISSING");
    expect(() =>
      assertProcessorOutputClass(processor, "MECHANICALLY_DERIVED"),
    ).not.toThrow();
    expect(() =>
      assertProcessorOutputClass(processor, "INTERPRETATION"),
    ).toThrow();
  });

  it("rejects required inputs without an explicit scientific failure mode", () => {
    expect(() =>
      createProcessorContract({
        ...contract(),
        failureModes: ["INPUT_INVALID"],
      }),
    ).toThrow("REQUIRED_EVIDENCE_MISSING");
  });

  it("never represents an unsatisfied prerequisite as a successful value", () => {
    const failure = createScientificFailure({
      code: "REQUIRED_EVIDENCE_MISSING",
      message: "The required PSC4 evidence was not supplied.",
      details: [{ key: "requirementId", value: "vertical-force" }],
    });
    expect(
      createProcessorExecution({ status: "FAILED", failure }),
    ).toMatchObject({
      status: "FAILED",
      failure: { code: "REQUIRED_EVIDENCE_MISSING" },
    });
    expect(() =>
      createProcessorExecution({
        status: "SUCCEEDED",
        claimId: "claim-1",
        claimClass: "MECHANICALLY_DERIVED",
        derivationId: "derivation-1",
      }),
    ).not.toThrow();
    const infrastructure = createScientificInfrastructureException({
      code: "INFRASTRUCTURE_EXCEPTION",
      message: "The persistence adapter was unavailable.",
      details: [{ key: "transport", value: "postgres" }],
    });
    expect(
      createProcessorExecution({
        status: "INFRASTRUCTURE_FAILED",
        exception: infrastructure,
      }),
    ).toMatchObject({
      status: "INFRASTRUCTURE_FAILED",
      exception: { code: "INFRASTRUCTURE_EXCEPTION" },
    });
  });

  it("rejects dimension-unit mismatches and stale qualification identities", () => {
    expect(() =>
      createProcessorContract({
        ...contract(),
        inputs: [
          { ...contract().inputs[0], dimensions: ["force"], units: ["kg"] },
        ],
      }),
    ).toThrow("dimensions must match");
    expect(() =>
      createProcessorContract({
        ...contract(),
        inputs: [{ ...contract().inputs[0], dimensions: [], units: ["N"] }],
      }),
    ).toThrow("matching dimensions and units");
    const qualified = {
      status: "QUALIFIED" as const,
      identity: {
        qualificationId: "qualification-1",
        qualificationVersion: "1",
        processor: contract().processor,
        method: contract().method,
        software: contract().software,
        oracle: { id: "oracle-1", version: "1" },
        validationData: { id: "dataset-1", version: "1" },
      },
    };
    expect(() =>
      createProcessorContract({ ...contract(), qualification: qualified }),
    ).not.toThrow();
    expect(() =>
      createProcessorContract({
        ...contract(),
        qualification: {
          ...qualified,
          identity: {
            ...qualified.identity,
            method: { id: "fixture.method", version: "2.0.0" },
          },
        },
      }),
    ).toThrow("Qualification method must match");
  });
});

describe("SCI-0 validity, calibration, and uncertainty", () => {
  it("keeps unknown uncertainty explicit and requires declared coverage semantics", () => {
    expect(() => assertUncertainty(unknownUncertainty())).not.toThrow();
    expect(() =>
      assertUncertainty({
        kind: "INTERVAL",
        intervalKind: "CONFIDENCE",
        lower: createQuantity({ value: 1, unit: "kg" }),
        upper: createQuantity({ value: 2, unit: "kg" }),
        coverage: { kind: "NOT_APPLICABLE" },
        source: { kind: "METHOD", method: { id: "fixture", version: "1" } },
      }),
    ).toThrow("matching coverage semantics");
    expect(() =>
      assertUncertainty({
        kind: "INTERVAL",
        intervalKind: "BOUNDED",
        lower: createQuantity({ value: 1, unit: "kg" }),
        upper: createQuantity({ value: 2, unit: "kg" }),
        coverage: { kind: "NOT_APPLICABLE" },
        source: { kind: "METHOD", method: { id: "fixture", version: "1" } },
      }),
    ).not.toThrow();
  });

  it("separates validity, exclusion, protocol applicability, and calibration ownership", () => {
    const input = contract().inputs[0];
    expect(input?.acceptedValidityStates).toEqual(["VALID"]);
    expect(input?.acceptedExclusionStates).toEqual(["INCLUDED"]);
    expect(() =>
      assertCalibrationRequirement(contract().calibration),
    ).not.toThrow();
    expect(() =>
      assertCalibrationRecord({
        deviceOrSource: { type: "PSC4_SOURCE", ref: "force-plate-1" },
        procedure: { id: "calibration.procedure", version: "1" },
        eventAt: instant,
        validity: {
          kind: "NOT_SPECIFIED",
          reason: "No universal calibration interval is asserted.",
        },
        artifact: {
          kind: "PROVIDED",
          reference: { type: "CALIBRATION_CERTIFICATE", ref: "certificate-1" },
        },
        status: "CALIBRATED",
        uncertaintyContribution: {
          kind: "NOT_REPORTED",
          reason: "Calibration contribution is not available in this fixture.",
        },
      }),
    ).not.toThrow();
    expect(() => assertUncertaintyPolicy(contract().uncertainty)).not.toThrow();
    expect(() =>
      assertCalibrationRecord({
        deviceOrSource: { type: "PSC4_SOURCE", ref: "force-plate-1" },
        procedure: { id: "calibration.procedure", version: "1" },
        eventAt: instant,
        validity: {
          kind: "INTERVAL",
          startsAt: "2026-08-16T02:00:00-02:00" as Instant,
          endsAt: "2026-08-16T03:00:00.000Z" as Instant,
        },
        artifact: { kind: "NOT_PROVIDED", reason: "Synthetic fixture." },
        status: "CALIBRATED",
        uncertaintyContribution: {
          kind: "NOT_REPORTED",
          reason: "Synthetic fixture.",
        },
      }),
    ).toThrow("later end");
  });
});

describe("SCI-0 derivation graph and recomputation history", () => {
  it("retains PSC4 inputs, method/configuration lineage, and an acyclic node graph", () => {
    const graph = createDerivationGraph({
      nodes: [
        {
          nodeId: "node-1",
          outputClaimId: "claim-1",
          outputClass: "MECHANICALLY_DERIVED",
          inputs: [{ kind: "PSC4_EVIDENCE", ref: "observation-1" }],
          processor: { id: "fixture.processor", version: "1" },
          method: { id: "fixture.method", version: "1" },
          software: contract().software,
          assumptions: contract().assumptions,
          configuration: contract().configuration,
          createdAt: instant,
          supersession: { kind: "NONE" },
        },
        {
          nodeId: "node-2",
          outputClaimId: "claim-2",
          outputClass: "STATISTICALLY_ESTIMATED",
          inputs: [{ kind: "DERIVATION_NODE", ref: "node-1" }],
          processor: { id: "fixture.estimator", version: "1" },
          method: { id: "fixture.estimator", version: "1" },
          software: contract().software,
          assumptions: contract().assumptions,
          configuration: contract().configuration,
          createdAt: instant,
          supersession: { kind: "NONE" },
        },
      ],
      edges: [
        { parentNodeId: "node-1", childNodeId: "node-2", relation: "INPUT" },
      ],
    });
    expect(derivationProvenance(graph)).toEqual([
      { type: "PSC4_EVIDENCE", ref: "observation-1" },
    ]);
    expect(() => assertAcyclicDerivationGraph(graph)).not.toThrow();
  });

  it("rejects cycles and preserves old records during recomputation", () => {
    const cycle = {
      nodes: [
        {
          nodeId: "a",
          outputClaimId: "claim-a",
          outputClass: "MECHANICALLY_DERIVED" as const,
          inputs: [{ kind: "DERIVATION_NODE" as const, ref: "b" }],
          processor: { id: "p", version: "1" },
          method: { id: "m", version: "1" },
          software: contract().software,
          assumptions: contract().assumptions,
          configuration: contract().configuration,
          createdAt: instant,
          supersession: { kind: "NONE" as const },
        },
        {
          nodeId: "b",
          outputClaimId: "claim-b",
          outputClass: "MECHANICALLY_DERIVED" as const,
          inputs: [{ kind: "DERIVATION_NODE" as const, ref: "a" }],
          processor: { id: "p", version: "1" },
          method: { id: "m", version: "1" },
          software: contract().software,
          assumptions: contract().assumptions,
          configuration: contract().configuration,
          createdAt: instant,
          supersession: { kind: "NONE" as const },
        },
      ],
      edges: [
        { parentNodeId: "a", childNodeId: "b", relation: "INPUT" as const },
        { parentNodeId: "b", childNodeId: "a", relation: "INPUT" as const },
      ],
    };
    expect(() => createDerivationGraph(cycle)).toThrow("acyclic");

    expect(() =>
      createDerivationGraph({
        nodes: [
          {
            nodeId: "interpretation-node",
            outputClaimId: "interpretation-claim",
            outputClass: "INTERPRETATION",
            inputs: [{ kind: "PSC4_EVIDENCE", ref: "observation-1" }],
            processor: { id: "p", version: "1" },
            method: { id: "m", version: "1" },
            software: contract().software,
            assumptions: contract().assumptions,
            configuration: contract().configuration,
            createdAt: instant,
            supersession: { kind: "NONE" },
          },
          {
            nodeId: "mechanical-node",
            outputClaimId: "mechanical-claim",
            outputClass: "MECHANICALLY_DERIVED",
            inputs: [{ kind: "DERIVATION_NODE", ref: "interpretation-node" }],
            processor: { id: "p", version: "1" },
            method: { id: "m", version: "1" },
            software: contract().software,
            assumptions: contract().assumptions,
            configuration: contract().configuration,
            createdAt: instant,
            supersession: { kind: "NONE" },
          },
        ],
        edges: [
          {
            parentNodeId: "interpretation-node",
            childNodeId: "mechanical-node",
            relation: "INPUT",
          },
        ],
      }),
    ).toThrow("Illegal scientific claim transition");

    const history = createRecalculationHistory({
      records: [
        {
          recordId: "record-v1",
          outputClaimId: "claim-1",
          inputReferences: [{ kind: "PSC4_EVIDENCE", ref: "observation-1" }],
          processor: { id: "fixture.processor", version: "1" },
          method: { id: "fixture.method", version: "1" },
          software: { ...contract().software, sourceRevision: "source-v1" },
          configuration: contract().configuration,
          generatedAt: instant,
          supersedesRecordId: null,
        },
        {
          recordId: "record-v2",
          outputClaimId: "claim-1",
          inputReferences: [{ kind: "PSC4_EVIDENCE", ref: "observation-1" }],
          processor: { id: "fixture.processor", version: "2" },
          method: { id: "fixture.method", version: "2" },
          software: { ...contract().software, sourceRevision: "source-v2" },
          configuration: { ...contract().configuration, id: "config-v2" },
          generatedAt: "2026-08-16T03:01:00.000Z",
          supersedesRecordId: "record-v1",
        },
      ],
    });
    expect(history.records).toHaveLength(2);
    expect(history.records[0]?.method.version).toBe("1");
  });
});

describe("SCI-0 validation, oracle, and qualification policy", () => {
  it("requires traceable tolerance justification and dataset governance", () => {
    expect(() =>
      createTolerance({
        kind: "RELATIVE",
        fraction: 0.01,
        justification: {
          kind: "REFERENCE_UNCERTAINTY",
          reference: { type: "SCI0_REFERENCE", ref: "reference-1" },
          rationale:
            "The synthetic reference declares this acceptance criterion.",
        },
      }),
    ).not.toThrow();
    expect(() =>
      assertReferenceDataset({
        identity: { id: "dataset-1", version: "1" },
        provenance: { type: "SCI0_DATASET", ref: "dataset-provenance-1" },
        licenseUseStatus: "PERMITTED",
        protocol: "synthetic-protocol-v1",
        deviceOrSource: "synthetic-source",
        populationContext: "synthetic fixture only",
        expectedOutputs: ["adjudicated-output-1"],
        storage: { kind: "FILE", checksumSha256: "a".repeat(64) },
      }),
    ).not.toThrow();
  });

  it("rejects a self-referential oracle and binds qualification to exact versions", () => {
    const oracle = {
      kind: "INDEPENDENT_IMPLEMENTATION" as const,
      identity: { id: "fixture.processor", version: "1" },
      provenance: { type: "SCI0_ORACLE", ref: "oracle-1" },
    };
    expect(() =>
      assertOracleIndependentFromProcessor(oracle, {
        id: "fixture.processor",
        version: "1",
      }),
    ).toThrow("own independent oracle");
    expect(() =>
      createValidationEvidence({
        evidenceId: "validation-1",
        kind: "SYNTHETIC_CASE",
        artifact: { id: "fixture-1", version: "1" },
        provenance: { type: "SCI0_FIXTURE", ref: "fixture-1" },
        description: "A deterministic synthetic contract fixture.",
        oracle: {
          kind: "DECLARED",
          oracle: {
            kind: "ANALYTICAL_SOLUTION",
            identity: { id: "analytical-oracle", version: "1" },
            provenance: { type: "SCI0_ORACLE", ref: "oracle-analytical-1" },
          },
        },
        tolerance: {
          kind: "NOT_APPLICABLE",
          reason: "Exact synthetic identity.",
        },
        dataset: { kind: "NOT_A_DATASET", reason: "Fixture is inline." },
      }),
    ).not.toThrow();

    const qualification = {
      status: "QUALIFIED" as const,
      identity: {
        qualificationId: "qualification-1",
        qualificationVersion: "1",
        processor: { id: "fixture.processor", version: "1" },
        method: { id: "fixture.method", version: "1" },
        software: contract().software,
        oracle: { id: "analytical-oracle", version: "1" },
        validationData: { id: "fixture-1", version: "1" },
      },
    };
    expect(() => createQualificationBinding(qualification)).not.toThrow();
  });
});
