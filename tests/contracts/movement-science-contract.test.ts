import {
  assertExternalMassIsNotSystemMass,
  createDirectionDescriptor,
  createMeasurementModalityCapability,
  createObjectMassDeclaration,
  createObservedExecutionTiming,
  createOperationalMovementAlias,
  createOperationalUiCategoryReference,
  createRangeOfMotionConstraint,
  createScientificConstructBinding,
  createSummarySemantics,
  representativeSci1Fixtures,
} from "@workoutpal/movement-science";
import { describe, expect, it } from "vitest";

const fixtures = representativeSci1Fixtures();

describe("SCI-1 movement and exercise scientific model", () => {
  it("keeps movement task identity, phase semantics, and exercise identity separate", () => {
    expect(fixtures.task.kind).toBe("MOVEMENT_TASK");
    expect(fixtures.exercise.kind).toBe("EXERCISE_DEFINITION");
    expect(fixtures.task.id).not.toBe(fixtures.exercise.id);
    expect(fixtures.task.phases.map((phase) => phase.action)).toEqual([
      "ECCENTRIC",
      "TRANSITION",
      "CONCENTRIC",
    ]);
    expect(fixtures.task).not.toHaveProperty("detector");
    expect(fixtures.exercise).not.toHaveProperty("athlete");
    expect(fixtures.exercise).not.toHaveProperty("performedLoad");
  });

  it("keeps object identity and frame identity structurally distinct", () => {
    expect(fixtures.athlete).toHaveProperty("objectId");
    expect(fixtures.athlete).not.toHaveProperty("frameId");
    expect(fixtures.implementPositionCapability.frame).toHaveProperty(
      "frameId",
    );
    expect(fixtures.implementPositionCapability.frame).not.toHaveProperty(
      "objectId",
    );
  });

  it("requires direction descriptors to bind to an explicit frame", () => {
    expect(() =>
      createDirectionDescriptor({
        axis: "Y",
        sense: "POSITIVE",
        frame: null as never,
        label: "unbound vertical",
      }),
    ).toThrow();
    expect(() =>
      createScientificConstructBinding({
        bindingId: "missing-frame-velocity",
        construct: "VELOCITY",
        objectOfInterest: fixtures.athlete,
        measurementPoint: fixtures.implementPositionCapability.measurementPoint,
        frame: null,
        axis: null,
        temporalSupport: "SAMPLE",
        summary: createSummarySemantics({
          operation: "BASE",
          baseConstruct: "VELOCITY",
          scope: "SAMPLE",
        }),
        claimClass: "MECHANICALLY_DERIVED",
        availability: {
          kind: "DERIVATION_REQUIRED",
          method: { id: "future.velocity", version: "unqualified" },
          reason: "Future method placeholder.",
        },
      }),
    ).toThrow("reference frame");
  });

  it("keeps families as qualified many-to-many groupings, never equivalence", () => {
    expect(fixtures.exercise.familyMemberships[0]?.id).toBe(fixtures.family.id);
    expect(fixtures.membership.member.kind).toBe("EXERCISE_DEFINITION");
    expect(fixtures.membership).not.toHaveProperty("equivalence");
    expect(fixtures.membership).not.toHaveProperty("transferCoefficient");
    expect(fixtures.barPlacementVariation.baseExerciseDefinition.id).toBe(
      fixtures.exercise.id,
    );
    expect(fixtures.barPlacementVariation.loadConfiguration.id).not.toBe(
      fixtures.freeResistanceLoad.id,
    );
    expect(fixtures.pausedRomVariation.executionConstraints.id).not.toBe(
      fixtures.executionConstraints.id,
    );
  });

  it("keeps aliases and UI categories outside scientific identity", () => {
    const alias = createOperationalMovementAlias({
      aliasId: "alias-back-squat",
      operationalMovementId: fixtures.exercise.operationalMovement.movementId,
      value: "back squat",
    });
    const category = createOperationalUiCategoryReference({
      categoryId: "strength",
      label: "Strength",
    });
    expect(alias.semantics).toBe("PRODUCT_OR_LINGUISTIC_ONLY");
    expect(alias).toHaveProperty("operationalMovementId");
    expect(alias).not.toHaveProperty("scientificIdentity");
    expect(category.authority).toBe("OPERATIONAL_UI");
    expect(category).not.toHaveProperty("familyId");
  });

  it("does not collapse mass, force, torque, or controller settings into load", () => {
    expect(fixtures.freeResistanceLoad.resistance.kind).toBe("MASS");
    expect(fixtures.machineLoad.resistance.kind).toBe("MACHINE_SETTING");
    expect(() =>
      createObjectMassDeclaration({
        object: fixtures.athlete,
        quantity: { value: 100, unit: "N", dimension: "force" },
      }),
    ).toThrow("dimension mass");
    expect(fixtures.machineLoad.resistance.quantity).toBeNull();
    expect(fixtures.machineLoad.resistance.declaration).toContain(
      "Machine setting",
    );
  });

  it("proves external implement mass is not system mass", () => {
    expect(fixtures.implementMass.kind).toBe("OBJECT_MASS");
    expect(fixtures.systemMass.kind).toBe("SYSTEM_MASS");
    expect(fixtures.implementMass.quantity.dimension).toBe("mass");
    expect(fixtures.systemMass.quantity.dimension).toBe("mass");
    expect(() =>
      assertExternalMassIsNotSystemMass({
        external: createObjectMassDeclaration({
          object: fixtures.systemMass.systemObject,
          quantity: fixtures.implementMass.quantity,
        }),
        system: fixtures.systemMass,
      }),
    ).toThrow("system-mass");
    expect(() =>
      createObjectMassDeclaration({
        object: fixtures.systemMass.systemObject,
        quantity: fixtures.implementMass.quantity,
      }),
    ).toThrow("system-mass declaration");
  });

  it("keeps ROM and tempo explicit instead of accepting ambiguous shortcuts", () => {
    expect(fixtures.executionConstraints.rom?.kind).toBe(
      "QUALITATIVE_LANDMARK",
    );
    expect(fixtures.executionConstraints.tempo?.kind).toBe("PRESCRIBED_TEMPO");
    expect(fixtures.executionConstraints.pause).toBeNull();
    expect(fixtures.pausedRomVariation.executionConstraints).toBeDefined();
    expect(() =>
      createRangeOfMotionConstraint({
        kind: "QUALITATIVE_LANDMARK",
        description: "FULL",
        referenceObject: fixtures.athlete,
      }),
    ).toThrow("unqualified FULL");
    expect(fixtures.executionConstraints).not.toHaveProperty("observedTempo");
  });

  it("separates prescribed timing and intent from observed timing and performance", () => {
    expect(fixtures.executionConstraints.intent?.kind).toBe("CONTROLLED");
    expect(
      fixtures.executionConstraints.tempo?.phases[0]?.duration?.dimension,
    ).toBe("time");
    expect(fixtures.implementVelocityDerivedBinding.claimClass).toBe(
      "MECHANICALLY_DERIVED",
    );
    expect(fixtures.implementVelocityDerivedBinding.availability.kind).toBe(
      "DERIVATION_REQUIRED",
    );
    const observedTiming = createObservedExecutionTiming({
      phaseId: "descent",
      duration: { value: 2.2, unit: "s", dimension: "time" },
      sourceReference: "fixture-observation-1",
    });
    expect(observedTiming.kind).toBe("OBSERVED_EXECUTION_TIMING");
    expect(observedTiming).not.toEqual(fixtures.executionConstraints.tempo);
  });

  it("keeps modality, measurement point, construct, and direct capability separate", () => {
    expect(fixtures.implementPositionCapability.modality.kind).toBe(
      "POSITION_TRANSDUCER",
    );
    expect(fixtures.implementPositionCapability.directConstruct).toBe(
      "POSITION",
    );
    expect(fixtures.forcePlatformCapability.directConstruct).toBe(
      "EXTERNAL_FORCE",
    );
    expect(fixtures.forceBinding.availability.kind).toBe("DIRECT_OBSERVATION");
    expect(fixtures.forceBinding.construct).toBe("EXTERNAL_FORCE");
    expect(fixtures.forcePlatformCapability).not.toHaveProperty("deviceModel");
    expect(fixtures.forcePlatformCapability).not.toHaveProperty("jumpHeight");
    expect(fixtures.implementPositionCapability.modality.kind).not.toBe(
      fixtures.implementPositionCapability.directConstruct,
    );
    expect(
      fixtures.implementPositionCapability.measurementPoint?.objectKind,
    ).toBe("MEASUREMENT_POINT");
  });

  it("rejects a derived construct as a direct capability and rejects frame mismatch", () => {
    expect(() =>
      createMeasurementModalityCapability({
        capabilityId: "position-transducer-force",
        version: "1.0.0",
        modality: fixtures.implementPositionCapability.modality,
        directConstruct: "POWER",
        objectOfInterest: fixtures.athlete,
        measurementPoint: fixtures.implementPositionCapability.measurementPoint,
        frame: fixtures.implementPositionCapability.frame,
        axis: fixtures.implementPositionCapability.axis,
        sampling: fixtures.implementPositionCapability.sampling,
        attachment: fixtures.implementPositionCapability.attachment,
        calibration: fixtures.implementPositionCapability.calibration,
        limitations: ["invalid direct derived capability"],
      }),
    ).toThrow("derived-only");
    expect(() =>
      createMeasurementModalityCapability({
        capabilityId: "position-transducer-mismatched-frame",
        version: "1.0.0",
        modality: fixtures.implementPositionCapability.modality,
        directConstruct: "POSITION",
        objectOfInterest: fixtures.athlete,
        measurementPoint: fixtures.implementPositionCapability.measurementPoint,
        frame: fixtures.forcePlatformCapability.frame,
        axis: fixtures.implementPositionCapability.axis,
        sampling: fixtures.implementPositionCapability.sampling,
        attachment: fixtures.implementPositionCapability.attachment,
        calibration: fixtures.implementPositionCapability.calibration,
        limitations: ["invalid frame binding"],
      }),
    ).toThrow("reference frame");
  });

  it("does not turn a summarized velocity into a hidden propulsive processor", () => {
    expect(() =>
      createSummarySemantics({
        operation: "MEAN",
        baseConstruct: "VELOCITY",
        scope: "PHASE",
      }),
    ).toThrow("explicit phase");
    expect(fixtures.implementVelocityDerivedBinding.summary.operation).toBe(
      "BASE",
    );
  });

  it("keeps object and frame context material to a construct binding", () => {
    const systemVelocity = createScientificConstructBinding({
      bindingId: "binding-system-velocity",
      construct: "VELOCITY",
      objectOfInterest: fixtures.systemMass.systemObject,
      measurementPoint: fixtures.implementPositionBinding.measurementPoint,
      frame: fixtures.implementPositionBinding.frame,
      axis: fixtures.implementPositionBinding.axis,
      temporalSupport: "SAMPLE",
      summary: createSummarySemantics({
        operation: "BASE",
        baseConstruct: "VELOCITY",
        scope: "SAMPLE",
      }),
      claimClass: "MECHANICALLY_DERIVED",
      availability: {
        kind: "DERIVATION_REQUIRED",
        method: { id: "future.system-velocity", version: "unqualified" },
        reason: "Fixture only; no processor is implemented.",
      },
    });
    const globalFrameVelocity = createScientificConstructBinding({
      ...fixtures.implementVelocityDerivedBinding,
      bindingId: "binding-implement-velocity-global",
      frame: {
        frameKind: "GLOBAL_LAB",
        frameId: "fixture-global-lab",
        convention: "Declared laboratory right-handed frame",
      },
      axis: createDirectionDescriptor({
        axis: "Y",
        sense: "POSITIVE",
        frame: {
          frameKind: "GLOBAL_LAB",
          frameId: "fixture-global-lab",
          convention: "Declared laboratory right-handed frame",
        },
        label: "Positive laboratory vertical",
      }),
    });
    expect(systemVelocity.objectOfInterest?.objectId).not.toBe(
      fixtures.implementVelocityDerivedBinding.objectOfInterest?.objectId,
    );
    expect(globalFrameVelocity.frame?.frameKind).not.toBe(
      fixtures.implementVelocityDerivedBinding.frame?.frameKind,
    );
  });

  it("keeps the representative fixture small and synthetic", () => {
    expect(Object.keys(fixtures)).toHaveLength(19);
    expect(fixtures.task.rationale).toContain("phase-aware");
    expect(fixtures.bodyCom.objectKind).toBe("ATHLETE_BODY_COM");
  });

  it("does not equate a UI/category or family label with a scientific task", () => {
    expect(fixtures.family.label).toBe("squat");
    expect(fixtures.task.facets.mechanicalConstraint).toBe("FREE_PATH");
    expect(fixtures.exercise.label).toBe("Back squat");
    expect(fixtures.family.label).not.toBe(fixtures.exercise.label);
  });
});
