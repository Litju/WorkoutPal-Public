import { type Instant, parseInstant } from "@workoutpal/shared-kernel";
import type {
  AssumptionDeclaration,
  ConfigurationSnapshot,
  MethodIdentity,
  ScienceProvenanceRef,
  ScientificClaimClass,
  SoftwareProvenance,
} from "./claim.js";
import {
  assertLegalClaimProduction,
  SCIENTIFIC_CLAIM_CLASSES,
} from "./claim.js";
import {
  assertAssumptionDeclarations,
  assertConfigurationSnapshot,
  assertSoftwareProvenance,
  requireNonEmpty,
  requireUnique,
  requireVersionedIdentity,
} from "./invariants.js";

export type DerivationInputReference =
  | { readonly kind: "PSC4_EVIDENCE"; readonly ref: string }
  | {
      readonly kind: "SCIENTIFIC_CLAIM";
      readonly ref: string;
      readonly claimClass: ScientificClaimClass;
    }
  | { readonly kind: "DERIVATION_NODE"; readonly ref: string };

export type DerivationSupersession =
  | { readonly kind: "SUPERSEDES"; readonly ref: string }
  | { readonly kind: "NONE" };

export interface ScientificDerivationNode {
  readonly nodeId: string;
  readonly outputClaimId: string;
  readonly outputClass: Exclude<ScientificClaimClass, "OBSERVED">;
  readonly inputs: readonly DerivationInputReference[];
  readonly processor: MethodIdentity;
  readonly method: MethodIdentity;
  readonly software: SoftwareProvenance;
  readonly assumptions: readonly AssumptionDeclaration[];
  readonly configuration: ConfigurationSnapshot;
  readonly createdAt: Instant;
  readonly supersession: DerivationSupersession;
}

export interface ScientificDerivationEdge {
  readonly parentNodeId: string;
  readonly childNodeId: string;
  readonly relation: "INPUT";
}

export interface ScientificDerivationGraph {
  readonly nodes: readonly ScientificDerivationNode[];
  readonly edges: readonly ScientificDerivationEdge[];
}

export interface RecalculationRecord {
  readonly recordId: string;
  readonly outputClaimId: string;
  readonly inputReferences: readonly DerivationInputReference[];
  readonly processor: MethodIdentity;
  readonly method: MethodIdentity;
  readonly software: SoftwareProvenance;
  readonly configuration: ConfigurationSnapshot;
  readonly generatedAt: Instant;
  readonly supersedesRecordId: string | null;
}

export interface RecalculationHistory {
  readonly records: readonly RecalculationRecord[];
}

function assertInputReference(reference: DerivationInputReference): void {
  requireNonEmpty(reference.ref, "Derivation input reference");
  if (
    reference.kind === "SCIENTIFIC_CLAIM" &&
    !SCIENTIFIC_CLAIM_CLASSES.includes(reference.claimClass)
  ) {
    throw new Error("Derivation claim input must declare a known claim class.");
  }
}

function assertNode(node: ScientificDerivationNode): void {
  requireNonEmpty(node.nodeId, "Derivation node id");
  requireNonEmpty(node.outputClaimId, "Derived output claim id");
  if (node.inputs.length === 0) {
    throw new Error(
      "A derivation node must retain its input evidence or claims.",
    );
  }
  node.inputs.forEach(assertInputReference);
  requireVersionedIdentity(node.processor, "Derivation processor");
  requireVersionedIdentity(node.method, "Derivation method");
  assertSoftwareProvenance(node.software);
  assertAssumptionDeclarations(node.assumptions);
  assertConfigurationSnapshot(node.configuration);
  parseInstant(node.createdAt);
  if (node.supersession.kind === "SUPERSEDES") {
    requireNonEmpty(node.supersession.ref, "Superseded derivation node id");
  }
}

function assertEdges(
  nodes: readonly ScientificDerivationNode[],
  edges: readonly ScientificDerivationEdge[],
): void {
  const nodeIds = new Set(nodes.map((node) => node.nodeId));
  const edgeKeys = edges.map(
    (edge) => `${edge.parentNodeId}->${edge.childNodeId}`,
  );
  requireUnique(edgeKeys, "Derivation edges");
  for (const edge of edges) {
    if (edge.relation !== "INPUT") {
      throw new Error("Unknown derivation edge relation.");
    }
    if (!nodeIds.has(edge.parentNodeId) || !nodeIds.has(edge.childNodeId)) {
      throw new Error("Derivation edges must reference existing nodes.");
    }
    if (edge.parentNodeId === edge.childNodeId) {
      throw new Error("A derivation node cannot be its own parent.");
    }
    const child = nodes.find((node) => node.nodeId === edge.childNodeId);
    if (
      child?.inputs.some(
        (input) =>
          input.kind === "DERIVATION_NODE" && input.ref === edge.parentNodeId,
      ) !== true
    ) {
      throw new Error(
        "Derivation edge must be represented in child input lineage.",
      );
    }
  }
  for (const node of nodes) {
    for (const input of node.inputs) {
      if (
        input.kind === "DERIVATION_NODE" &&
        !edges.some(
          (edge) =>
            edge.parentNodeId === input.ref && edge.childNodeId === node.nodeId,
        )
      ) {
        throw new Error("Derivation node input is missing its graph edge.");
      }
    }
  }
}

function assertClaimTransitions(
  nodes: readonly ScientificDerivationNode[],
): void {
  const nodesById = new Map(nodes.map((node) => [node.nodeId, node]));
  for (const node of nodes) {
    const parentClasses = node.inputs.map((input) => {
      if (input.kind === "PSC4_EVIDENCE") return "OBSERVED" as const;
      if (input.kind === "SCIENTIFIC_CLAIM") return input.claimClass;
      const parent = nodesById.get(input.ref);
      if (parent === undefined) {
        throw new Error(
          "Derivation node input must reference an existing node.",
        );
      }
      return parent.outputClass;
    });
    assertLegalClaimProduction({
      parentClasses,
      outputClass: node.outputClass,
      producerOutputClass: node.outputClass,
    });
  }
}

export function assertAcyclicDerivationGraph(
  graph: ScientificDerivationGraph,
): void {
  const children = new Map<string, string[]>();
  for (const node of graph.nodes) children.set(node.nodeId, []);
  for (const edge of graph.edges) {
    children.get(edge.parentNodeId)?.push(edge.childNodeId);
  }
  const active = new Set<string>();
  const visited = new Set<string>();

  function visit(nodeId: string): void {
    if (active.has(nodeId)) {
      throw new Error("Scientific derivation graph must be acyclic.");
    }
    if (visited.has(nodeId)) return;
    active.add(nodeId);
    for (const child of children.get(nodeId) ?? []) visit(child);
    active.delete(nodeId);
    visited.add(nodeId);
  }

  for (const node of graph.nodes) visit(node.nodeId);
}

export function createDerivationGraph(
  graph: ScientificDerivationGraph,
): ScientificDerivationGraph {
  if (graph.nodes.length === 0) {
    throw new Error("Scientific derivation graph must contain a node.");
  }
  requireUnique(
    graph.nodes.map((node) => node.nodeId),
    "Derivation node ids",
  );
  requireUnique(
    graph.nodes.map((node) => node.outputClaimId),
    "Derived output claim ids",
  );
  graph.nodes.forEach(assertNode);
  assertEdges(graph.nodes, graph.edges);
  assertClaimTransitions(graph.nodes);
  assertAcyclicDerivationGraph(graph);
  return graph;
}

function assertRecalculationRecord(record: RecalculationRecord): void {
  requireNonEmpty(record.recordId, "Recalculation record id");
  requireNonEmpty(record.outputClaimId, "Recalculation output claim id");
  if (record.inputReferences.length === 0) {
    throw new Error(
      "Recalculation records must retain exact input references.",
    );
  }
  record.inputReferences.forEach(assertInputReference);
  requireVersionedIdentity(record.processor, "Recalculation processor");
  requireVersionedIdentity(record.method, "Recalculation method");
  assertSoftwareProvenance(record.software);
  assertConfigurationSnapshot(record.configuration);
  parseInstant(record.generatedAt);
  if (record.supersedesRecordId !== null) {
    requireNonEmpty(
      record.supersedesRecordId,
      "Superseded recalculation record id",
    );
  }
}

export function createRecalculationHistory(
  history: RecalculationHistory,
): RecalculationHistory {
  if (history.records.length === 0) {
    throw new Error("Recalculation history must retain at least one record.");
  }
  requireUnique(
    history.records.map((record) => record.recordId),
    "Recalculation record ids",
  );
  history.records.forEach(assertRecalculationRecord);
  for (const [index, record] of history.records.entries()) {
    if (record.supersedesRecordId === null) continue;
    const supersededIndex = history.records.findIndex(
      (candidate) => candidate.recordId === record.supersedesRecordId,
    );
    if (supersededIndex < 0 || supersededIndex >= index) {
      throw new Error(
        "A recalculation may supersede only an earlier retained record.",
      );
    }
    const superseded = history.records[supersededIndex];
    if (superseded?.outputClaimId !== record.outputClaimId) {
      throw new Error(
        "Recalculation supersession must preserve the output claim identity.",
      );
    }
  }
  return history;
}

export function derivationProvenance(
  graph: ScientificDerivationGraph,
): readonly ScienceProvenanceRef[] {
  return graph.nodes.flatMap((node) =>
    node.inputs
      .filter(
        (
          input,
        ): input is Extract<
          DerivationInputReference,
          { kind: "PSC4_EVIDENCE" }
        > => input.kind === "PSC4_EVIDENCE",
      )
      .map((input) => ({ type: input.kind, ref: input.ref })),
  );
}
