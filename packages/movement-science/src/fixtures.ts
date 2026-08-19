import type { Quantity, UUID } from "@workoutpal/shared-kernel";
import type {
  ExecutionConstraintSet,
  ExerciseDefinition,
  ExerciseVariation,
  LoadConfiguration,
  MeasurementModalityCapability,
  MovementFamily,
  MovementFamilyMembership,
  MovementTask,
  ObjectMassDeclaration,
  ScientificConstructBinding,
  SystemMassDeclaration,
} from "./model.js";
import {
  assertExternalMassIsNotSystemMass,
  createAttachmentContactSemantics,
  createCalibrationDependency,
  createDirectionDescriptor,
  createExecutionConstraintSet,
  createExecutionIntentDeclaration,
  createExerciseDefinition,
  createExerciseVariation,
  createLoadConfiguration,
  createLoadPlacement,
  createMeasurementModalityCapability,
  createMeasurementModalityReference,
  createMechanicalFeedbackSemantics,
  createMovementFamily,
  createMovementFamilyMembership,
  createMovementTask,
  createObjectMassDeclaration,
  createPhysicalObjectReference,
  createPrescribedPause,
  createPrescribedTempo,
  createRangeOfMotionConstraint,
  createReferenceFrameReference,
  createResistanceQuantityDescriptor,
  createSamplingSemantics,
  createScientificConstructBinding,
  createSummarySemantics,
  createSupportConfiguration,
  createSystemMassDeclaration,
  createTaskPhaseDefinition,
} from "./model.js";

const asUuid = (value: string): UUID => value as UUID;
const quantity = (
  value: number,
  unit: string,
  dimension: Quantity["dimension"],
): Quantity => ({
  value,
  unit,
  dimension,
});

const athlete = createPhysicalObjectReference({
  objectKind: "ATHLETE",
  objectId: "fixture-athlete",
  label: "Athlete",
});
const bodyCom = createPhysicalObjectReference({
  objectKind: "ATHLETE_BODY_COM",
  objectId: "fixture-athlete-com",
  label: "Athlete body centre of mass",
});
const system = createPhysicalObjectReference({
  objectKind: "ATHLETE_PLUS_EXTERNAL_LOAD_SYSTEM",
  objectId: "fixture-athlete-bar-system",
  label: "Athlete plus external-load system",
});
const bar = createPhysicalObjectReference({
  objectKind: "IMPLEMENT",
  objectId: "fixture-barbell",
  label: "Barbell",
});
const machine = createPhysicalObjectReference({
  objectKind: "EXTERNAL_OBJECT",
  objectId: "fixture-machine-linkage",
  label: "Machine linkage",
});
const groundInteraction = createPhysicalObjectReference({
  objectKind: "EXTERNAL_OBJECT",
  objectId: "fixture-ground-interaction",
  label: "Ground interaction",
});
const barPoint = createPhysicalObjectReference({
  objectKind: "MEASUREMENT_POINT",
  objectId: "fixture-bar-end-point",
  label: "Bar-end measurement point",
});
const forcePoint = createPhysicalObjectReference({
  objectKind: "MEASUREMENT_POINT",
  objectId: "fixture-force-platform-point",
  label: "Force-platform measurement point",
});
const globalFrame = createReferenceFrameReference({
  frameKind: "GLOBAL_LAB",
  frameId: "fixture-global-lab",
  convention: "Declared laboratory right-handed frame",
});
const implementFrame = createReferenceFrameReference({
  frameKind: "IMPLEMENT",
  frameId: "fixture-bar-frame",
  convention: "Bar-fixed frame with declared axis convention",
});
const deviceFrame = createReferenceFrameReference({
  frameKind: "DEVICE",
  frameId: "fixture-device-frame",
  convention: "Device frame declared by modality configuration",
});
const deviceVertical = createDirectionDescriptor({
  axis: "Y",
  sense: "POSITIVE",
  frame: deviceFrame,
  label: "Positive device-frame vertical channel",
});
const vertical = createDirectionDescriptor({
  axis: "Y",
  sense: "POSITIVE",
  frame: globalFrame,
  label: "Positive laboratory vertical",
});

export const freeResistanceSquatTask: MovementTask = createMovementTask({
  id: "movement-task-squat",
  version: "1.0.0",
  revision: 1,
  facets: {
    dynamics: "DYNAMIC",
    support: createSupportConfiguration({
      kind: "SUPPORTED",
      contactConstraint: "FIXED_CONTACT",
      weightBearing: "WEIGHT_BEARING",
      contactObjects: [groundInteraction],
      description: "Feet interact with the declared ground contact.",
    }),
    laterality: "BILATERAL",
    mechanicalConstraint: "FREE_PATH",
    resistanceInteraction: "GRAVITATIONAL_FREE_MASS",
    directions: [vertical],
  },
  phases: [
    createTaskPhaseDefinition({
      id: "descent",
      ordinal: 1,
      label: "Descent",
      action: "ECCENTRIC",
    }),
    createTaskPhaseDefinition({
      id: "bottom-transition",
      ordinal: 2,
      label: "Bottom transition",
      action: "TRANSITION",
    }),
    createTaskPhaseDefinition({
      id: "ascent",
      ordinal: 3,
      label: "Ascent",
      action: "CONCENTRIC",
    }),
  ],
  objectOfInterestRequirements: [athlete, bar],
  rationale:
    "A phase-aware, bilateral, dynamically loaded task description; it is not an exercise name or performance record.",
});

export const squatFamily: MovementFamily = createMovementFamily({
  id: "movement-family-squat",
  version: "1.0.0",
  revision: 1,
  label: "squat",
  rationale:
    "Representative qualified grouping for architecture tests; membership does not imply equivalence or transfer.",
  provenance: [
    { type: "SCI1_MODEL_DECISION", ref: "movement-family-vocabulary-fixture" },
  ],
});

export const freeResistanceSquatLoad: LoadConfiguration =
  createLoadConfiguration({
    id: "load-barbell-free-mass",
    version: "1.0.0",
    revision: 1,
    interaction: "GRAVITATIONAL_FREE_MASS",
    resistance: createResistanceQuantityDescriptor({
      kind: "MASS",
      quantity: quantity(100, "kg", "mass"),
    }),
    loadObject: bar,
    placement: createLoadPlacement({
      kind: "SHOULDER_BACK",
      contactObjects: [athlete, bar],
      description: "Bar rests at the declared shoulder/back contact.",
    }),
    distribution: "SYMMETRIC",
    direction: vertical,
    profile: "APPROXIMATELY_CONSTANT",
    mechanicalFeedback: createMechanicalFeedbackSemantics({
      kind: "MOTION_INDEPENDENT_DECLARED",
      description:
        "The configuration does not claim a computed resistance curve; it declares only the interaction class.",
    }),
    rationale:
      "Separates external implement mass from any athlete-plus-implement system mass.",
  });

export const frontRackSquatLoad: LoadConfiguration = createLoadConfiguration({
  id: "load-barbell-front-rack",
  version: "1.0.0",
  revision: 1,
  interaction: "GRAVITATIONAL_FREE_MASS",
  resistance: createResistanceQuantityDescriptor({
    kind: "MASS",
    quantity: quantity(100, "kg", "mass"),
  }),
  loadObject: bar,
  placement: createLoadPlacement({
    kind: "FRONT_RACK",
    contactObjects: [athlete, bar],
    description: "Bar is held at the declared front-rack contact.",
  }),
  distribution: "SYMMETRIC",
  direction: vertical,
  profile: "APPROXIMATELY_CONSTANT",
  mechanicalFeedback: createMechanicalFeedbackSemantics({
    kind: "MOTION_INDEPENDENT_DECLARED",
    description:
      "The placement change is explicit; no resistance curve is calculated.",
  }),
  rationale: "Representative load-placement variation from the base fixture.",
});

export const squatConstraints: ExecutionConstraintSet =
  createExecutionConstraintSet({
    id: "constraints-squat-default",
    version: "1.0.0",
    revision: 1,
    movementTask: freeResistanceSquatTask,
    loadConfiguration: freeResistanceSquatLoad,
    rom: createRangeOfMotionConstraint({
      kind: "QUALITATIVE_LANDMARK",
      referenceObject: athlete,
      referenceFrame: globalFrame,
      startCondition: "Standing start posture",
      endCondition: "Declared bottom landmark",
      description:
        "Protocol-specific bottom landmark; no FULL/HALF/QUARTER shortcut.",
    }),
    support: createSupportConfiguration({
      kind: "SUPPORTED",
      contactConstraint: "FIXED_CONTACT",
      weightBearing: "WEIGHT_BEARING",
      contactObjects: [groundInteraction],
      description: "Declared foot-ground support context.",
    }),
    tempo: createPrescribedTempo({
      phases: [
        {
          phaseId: "descent",
          duration: quantity(2, "s", "time"),
          protocolReference: null,
          description: "Two-second descent.",
        },
        {
          phaseId: "ascent",
          duration: quantity(1, "s", "time"),
          protocolReference: null,
          description: "One-second ascent.",
        },
      ],
      declaration: "Prescribed phase durations; observed timing is separate.",
    }),
    intent: createExecutionIntentDeclaration({
      kind: "CONTROLLED",
      declaration: "Control the declared descent and transition.",
    }),
    phaseConstraints: [
      {
        phaseId: "bottom-transition",
        description: "Bottom transition is semantically declared.",
      },
    ],
    rationale:
      "Composable prescribed constraints; it contains no observed performance or processor output.",
  });

export const pausedSquatConstraints: ExecutionConstraintSet =
  createExecutionConstraintSet({
    id: "constraints-squat-paused-rom",
    version: "1.0.0",
    revision: 1,
    movementTask: freeResistanceSquatTask,
    loadConfiguration: freeResistanceSquatLoad,
    rom: createRangeOfMotionConstraint({
      kind: "QUALITATIVE_LANDMARK",
      referenceObject: athlete,
      referenceFrame: globalFrame,
      startCondition: "Standing start posture",
      endCondition: "Protocol-defined deeper bottom landmark",
      description:
        "Protocol-specific deeper bottom landmark; no coarse fraction label.",
    }),
    support: squatConstraints.support,
    tempo: squatConstraints.tempo,
    pause: createPrescribedPause({
      phaseId: "bottom-transition",
      duration: quantity(1, "s", "time"),
      location: "Bottom transition",
    }),
    intent: squatConstraints.intent,
    phaseConstraints: [
      {
        phaseId: "bottom-transition",
        description: "Pause occurs at the declared transition.",
      },
    ],
    rationale:
      "Explicit paused and ROM-modified constraint set for the variation fixture.",
  });

export const freeResistanceSquatExercise: ExerciseDefinition =
  createExerciseDefinition({
    id: "exercise-back-squat",
    version: "1.0.0",
    revision: 1,
    label: "Back squat",
    operationalMovement: {
      movementId: asUuid("00000000-0000-4000-8000-000000000001"),
      movementVersion: 1,
      scope: "GLOBAL",
    },
    movementTask: freeResistanceSquatTask,
    defaultConstraintSet: squatConstraints,
    familyMemberships: [squatFamily],
    rationale:
      "Scientific identity references the existing operational movement and separately declares task/constraint authority.",
  });

export const barPlacementVariation: ExerciseVariation = createExerciseVariation(
  {
    id: "exercise-back-squat-front-rack-variation",
    version: "1.0.0",
    revision: 1,
    label: "Back squat, front-rack placement variation",
    baseExerciseDefinition: freeResistanceSquatExercise,
    movementTask: freeResistanceSquatTask,
    loadConfiguration: frontRackSquatLoad,
    executionConstraints: squatConstraints,
    changedConstraints: [
      {
        kind: "BAR_PLACEMENT",
        from: "SHOULDER_BACK",
        to: "FRONT_RACK",
        rationale:
          "Placement changes the declared loading context without creating a new taxonomy universe.",
      },
    ],
    rationale:
      "Variation is a revisioned difference from a stable exercise definition.",
  },
);

export const pausedRomVariation: ExerciseVariation = createExerciseVariation({
  id: "exercise-back-squat-paused-rom-variation",
  version: "1.0.0",
  revision: 1,
  label: "Back squat, paused landmark variation",
  baseExerciseDefinition: freeResistanceSquatExercise,
  movementTask: freeResistanceSquatTask,
  loadConfiguration: freeResistanceSquatLoad,
  executionConstraints: pausedSquatConstraints,
  changedConstraints: [
    {
      kind: "PAUSE",
      from: null,
      to: "bottom-transition:1 s",
      rationale:
        "The prescribed pause is explicit and is not an observed pause.",
    },
    {
      kind: "ROM",
      from: "declared bottom landmark",
      to: "protocol-defined deeper landmark",
      rationale:
        "ROM is represented by a reference and condition, not a coarse fraction label.",
    },
  ],
  rationale:
    "A second variation shares the family and task without implying equivalence.",
});

export const familyMembershipForBase: MovementFamilyMembership =
  createMovementFamilyMembership({
    membershipId: "membership-squat-base",
    family: squatFamily,
    member: { kind: "EXERCISE_DEFINITION", ref: freeResistanceSquatExercise },
    rationale:
      "The representative exercise is grouped with squat-family descriptors.",
    provenance: [
      { type: "SCI1_MODEL_DECISION", ref: "fixture-family-membership" },
    ],
  });

export const constrainedMachineLoad: LoadConfiguration =
  createLoadConfiguration({
    id: "load-machine-constrained",
    version: "1.0.0",
    revision: 1,
    interaction: "MACHINE_CONSTRAINED",
    resistance: createResistanceQuantityDescriptor({
      kind: "MACHINE_SETTING",
      declaration:
        "Machine setting declared by protocol; not a mass or force value.",
    }),
    loadObject: machine,
    placement: createLoadPlacement({
      kind: "MACHINE_CONTACT",
      contactObjects: [athlete, machine],
      description: "Declared machine contact points.",
    }),
    distribution: "DISTRIBUTED",
    direction: null,
    profile: "CONTROLLER_CONSTRAINED",
    mechanicalFeedback: createMechanicalFeedbackSemantics({
      kind: "CONTROLLER_DEPENDENT",
      description:
        "Controller behavior is declared as context and not calculated here.",
    }),
    rationale: "Machine setting is not silently represented as mass or force.",
  });

export const bodyweightLoad: LoadConfiguration = createLoadConfiguration({
  id: "load-bodyweight",
  version: "1.0.0",
  revision: 1,
  interaction: "BODY_MASS",
  resistance: createResistanceQuantityDescriptor({
    kind: "MASS",
    declaration:
      "Athlete body mass is the declared load object; value is not inferred here.",
  }),
  loadObject: athlete,
  placement: createLoadPlacement({
    kind: "CUSTOM_DECLARED",
    contactObjects: [athlete],
    description: "Body mass is distributed through the athlete body.",
  }),
  distribution: "DISTRIBUTED",
  direction: vertical,
  profile: "APPROXIMATELY_CONSTANT",
  mechanicalFeedback: createMechanicalFeedbackSemantics({
    kind: "UNKNOWN",
    description: "No resistance relationship is computed in SCI-1.",
  }),
  rationale:
    "Body mass and external implement mass remain distinct declarations.",
});

export const implementPositionCapability: MeasurementModalityCapability =
  createMeasurementModalityCapability({
    capabilityId: "capability-position-transducer-position",
    version: "1.0.0",
    modality: createMeasurementModalityReference({
      modalityId: "modality-position-transducer",
      version: "1.0.0",
      kind: "POSITION_TRANSDUCER",
      label: "Generic linear position transducer modality",
    }),
    directConstruct: "POSITION",
    objectOfInterest: bar,
    measurementPoint: barPoint,
    frame: implementFrame,
    axis: createDirectionDescriptor({
      axis: "Y",
      sense: "POSITIVE",
      frame: implementFrame,
      label: "Declared implement-frame axis",
    }),
    sampling: createSamplingSemantics({
      mode: "SAMPLED",
      sampleRate: quantity(100, "Hz", "frequency"),
      timebaseId: "fixture-timebase-position",
      synchronization: "ASYNCHRONOUS",
      missingSamples: "DECLARED",
      channelId: "position-channel-1",
    }),
    attachment: createAttachmentContactSemantics({
      kind: "ATTACHED",
      target: barPoint,
      description:
        "Transducer is attached at a declared bar-end measurement point.",
    }),
    calibration: createCalibrationDependency({
      kind: "REQUIRED",
      description: "Calibration status is a declared dependency for later use.",
    }),
    limitations: [
      "Direct capability is position at the measurement point; velocity, acceleration, force, and power require future qualified methods.",
    ],
  });

export const forcePlatformCapability: MeasurementModalityCapability =
  createMeasurementModalityCapability({
    capabilityId: "capability-force-platform-external-force",
    version: "1.0.0",
    modality: createMeasurementModalityReference({
      modalityId: "modality-force-platform",
      version: "1.0.0",
      kind: "FORCE_PLATFORM",
      label: "Generic force-platform modality",
    }),
    directConstruct: "EXTERNAL_FORCE",
    objectOfInterest: groundInteraction,
    measurementPoint: forcePoint,
    frame: deviceFrame,
    axis: deviceVertical,
    sampling: createSamplingSemantics({
      mode: "SAMPLED",
      sampleRate: quantity(1000, "Hz", "frequency"),
      timebaseId: "fixture-timebase-force",
      synchronization: "SYNCHRONOUS",
      missingSamples: "DECLARED",
      channelId: "force-channel-vertical",
    }),
    attachment: createAttachmentContactSemantics({
      kind: "CONTACT",
      target: forcePoint,
      description:
        "Platform contact is represented at a declared measurement point.",
    }),
    calibration: createCalibrationDependency({
      kind: "REQUIRED",
      description:
        "Platform calibration is a declared dependency for later use.",
    }),
    limitations: [
      "Direct capability is interaction force at the platform point; COM velocity, jump height, impulse, and power are not direct claims.",
    ],
  });

export const implementPositionBinding: ScientificConstructBinding =
  createScientificConstructBinding({
    bindingId: "binding-implement-position",
    construct: "POSITION",
    objectOfInterest: bar,
    measurementPoint: barPoint,
    frame: implementFrame,
    axis: implementPositionCapability.axis,
    temporalSupport: "SAMPLE",
    summary: createSummarySemantics({
      operation: "BASE",
      baseConstruct: "POSITION",
      scope: "SAMPLE",
    }),
    claimClass: "OBSERVED",
    availability: {
      kind: "DIRECT_OBSERVATION",
      capabilityId: implementPositionCapability.capabilityId,
    },
  });

export const implementVelocityDerivedBinding: ScientificConstructBinding =
  createScientificConstructBinding({
    bindingId: "binding-implement-velocity-derived",
    construct: "VELOCITY",
    objectOfInterest: bar,
    measurementPoint: barPoint,
    frame: implementFrame,
    axis: implementPositionCapability.axis,
    temporalSupport: "SAMPLE",
    summary: createSummarySemantics({
      operation: "BASE",
      baseConstruct: "VELOCITY",
      scope: "SAMPLE",
    }),
    claimClass: "MECHANICALLY_DERIVED",
    availability: {
      kind: "DERIVATION_REQUIRED",
      method: { id: "future.position-to-velocity", version: "unqualified" },
      reason:
        "Velocity requires an authorized future processor and declared method.",
    },
  });

export const forceBinding: ScientificConstructBinding =
  createScientificConstructBinding({
    bindingId: "binding-ground-force",
    construct: "EXTERNAL_FORCE",
    objectOfInterest: groundInteraction,
    measurementPoint: forcePoint,
    frame: deviceFrame,
    axis: deviceVertical,
    temporalSupport: "SAMPLE",
    summary: createSummarySemantics({
      operation: "BASE",
      baseConstruct: "EXTERNAL_FORCE",
      scope: "SAMPLE",
    }),
    claimClass: "OBSERVED",
    availability: {
      kind: "DIRECT_OBSERVATION",
      capabilityId: forcePlatformCapability.capabilityId,
    },
  });

export const implementMass: ObjectMassDeclaration = createObjectMassDeclaration(
  {
    object: bar,
    quantity: quantity(100, "kg", "mass"),
  },
);
export const athleteSystemMass: SystemMassDeclaration =
  createSystemMassDeclaration({
    systemObject: system,
    quantity: quantity(180, "kg", "mass"),
  });

assertExternalMassIsNotSystemMass({
  external: implementMass,
  system: athleteSystemMass,
});

export interface RepresentativeSci1Fixtures {
  readonly task: MovementTask;
  readonly exercise: ExerciseDefinition;
  readonly barPlacementVariation: ExerciseVariation;
  readonly pausedRomVariation: ExerciseVariation;
  readonly family: MovementFamily;
  readonly membership: MovementFamilyMembership;
  readonly freeResistanceLoad: LoadConfiguration;
  readonly machineLoad: LoadConfiguration;
  readonly bodyweightLoad: LoadConfiguration;
  readonly executionConstraints: ExecutionConstraintSet;
  readonly implementPositionCapability: MeasurementModalityCapability;
  readonly forcePlatformCapability: MeasurementModalityCapability;
  readonly implementPositionBinding: ScientificConstructBinding;
  readonly implementVelocityDerivedBinding: ScientificConstructBinding;
  readonly forceBinding: ScientificConstructBinding;
  readonly implementMass: ObjectMassDeclaration;
  readonly systemMass: SystemMassDeclaration;
  readonly athlete: typeof athlete;
  readonly bodyCom: typeof bodyCom;
}

export const representativeSci1Fixtures = (): RepresentativeSci1Fixtures => ({
  task: freeResistanceSquatTask,
  exercise: freeResistanceSquatExercise,
  barPlacementVariation,
  pausedRomVariation,
  family: squatFamily,
  membership: familyMembershipForBase,
  freeResistanceLoad: freeResistanceSquatLoad,
  machineLoad: constrainedMachineLoad,
  bodyweightLoad,
  executionConstraints: squatConstraints,
  implementPositionCapability,
  forcePlatformCapability,
  implementPositionBinding,
  implementVelocityDerivedBinding,
  forceBinding,
  implementMass,
  systemMass: athleteSystemMass,
  athlete,
  bodyCom,
});
