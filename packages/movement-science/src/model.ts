import type {
  MethodIdentity,
  ScienceProvenanceRef,
  ScientificClaimClass,
} from "@workoutpal/science-contract";
import type { Dimension, Quantity, UUID } from "@workoutpal/shared-kernel";
import { createQuantity } from "@workoutpal/shared-kernel";

export interface ScientificDefinitionIdentity {
  readonly id: string;
  readonly version: string;
  readonly revision: number;
}

export type ScientificDefinitionRef = ScientificDefinitionIdentity;
export type MovementTaskRef = ScientificDefinitionRef;
export type ExerciseDefinitionRef = ScientificDefinitionRef;
export type ExerciseVariationRef = ScientificDefinitionRef;
export type MovementFamilyRef = ScientificDefinitionRef;
export type LoadConfigurationRef = ScientificDefinitionRef;
export type ExecutionConstraintSetRef = ScientificDefinitionRef;

function requiredText(value: string, label: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) throw new Error(`${label} is required.`);
  return normalized;
}

function optionalText(
  value: string | null | undefined,
  label: string,
): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value.trim();
  if (normalized.length === 0) throw new Error(`${label} cannot be blank.`);
  return normalized;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
}

function unique(values: readonly string[], label: string): void {
  if (values.some((value) => value.trim().length === 0)) {
    throw new Error(`${label} must contain non-empty values.`);
  }
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} must be unique.`);
  }
}

function validateIdentity(
  input: ScientificDefinitionIdentity,
  label: string,
): ScientificDefinitionIdentity {
  return {
    id: requiredText(input.id, `${label} id`),
    version: requiredText(input.version, `${label} version`),
    revision: positiveInteger(input.revision, `${label} revision`),
  };
}

function validateRef(
  input: ScientificDefinitionRef,
  label: string,
): ScientificDefinitionRef {
  return validateIdentity(input, label);
}

function validateProvenance(
  values: readonly ScienceProvenanceRef[],
  label: string,
): readonly ScienceProvenanceRef[] {
  if (values.length === 0) throw new Error(`${label} requires provenance.`);
  const keys = values.map((value) => {
    const type = requiredText(value.type, `${label} type`);
    const ref = requiredText(value.ref, `${label} reference`);
    return `${type}:${ref}`;
  });
  unique(keys, `${label} references`);
  return values;
}

function validateMethod(method: MethodIdentity, label: string): MethodIdentity {
  return {
    id: requiredText(method.id, `${label} id`),
    version: requiredText(method.version, `${label} version`),
  };
}

function validateQuantity(
  quantity: Quantity,
  label: string,
  expectedDimension?: Dimension,
): Quantity {
  const validated = createQuantity(quantity);
  if (
    expectedDimension !== undefined &&
    validated.dimension !== expectedDimension
  ) {
    throw new Error(
      `${label} must use dimension ${expectedDimension}, not ${validated.dimension}.`,
    );
  }
  return validated;
}

export type PhysicalObjectKind =
  | "ATHLETE"
  | "ATHLETE_BODY_COM"
  | "ATHLETE_PLUS_EXTERNAL_LOAD_SYSTEM"
  | "IMPLEMENT"
  | "BODY_SEGMENT"
  | "EXTERNAL_OBJECT"
  | "MEASUREMENT_POINT"
  | "CUSTOM_DECLARED_OBJECT";

export interface PhysicalObjectReference {
  readonly objectKind: PhysicalObjectKind;
  readonly objectId: string;
  readonly label: string | null;
}

function validateMeasurementPoint(
  input: PhysicalObjectReference | null,
  label: string,
): PhysicalObjectReference | null {
  if (input === null) return null;
  const measurementPoint = createPhysicalObjectReference(input);
  if (measurementPoint.objectKind !== "MEASUREMENT_POINT") {
    throw new Error(`${label} must use a MEASUREMENT_POINT object identity.`);
  }
  return measurementPoint;
}

function sameReferenceFrame(
  left: ReferenceFrameReference,
  right: ReferenceFrameReference,
): boolean {
  return (
    left.frameId === right.frameId &&
    left.frameKind === right.frameKind &&
    left.convention === right.convention
  );
}

export function createPhysicalObjectReference(input: {
  readonly objectKind: PhysicalObjectKind;
  readonly objectId: string;
  readonly label?: string | null;
}): PhysicalObjectReference {
  const objectId = requiredText(input.objectId, "Physical object id");
  const label = optionalText(input.label, "Physical object label");
  if (input.objectKind === "CUSTOM_DECLARED_OBJECT" && label === null) {
    throw new Error("Custom physical objects require a label.");
  }
  return { objectKind: input.objectKind, objectId, label };
}

export type ReferenceFrameKind =
  | "GLOBAL_LAB"
  | "BODY"
  | "SEGMENT_LOCAL"
  | "IMPLEMENT"
  | "DEVICE"
  | "CUSTOM_DECLARED";

export interface ReferenceFrameReference {
  readonly frameKind: ReferenceFrameKind;
  readonly frameId: string;
  readonly convention: string | null;
}

export function createReferenceFrameReference(input: {
  readonly frameKind: ReferenceFrameKind;
  readonly frameId: string;
  readonly convention?: string | null;
}): ReferenceFrameReference {
  const frameId = requiredText(input.frameId, "Reference frame id");
  const convention = optionalText(
    input.convention,
    "Reference frame convention",
  );
  if (input.frameKind === "CUSTOM_DECLARED" && convention === null) {
    throw new Error("Custom reference frames require a convention.");
  }
  return { frameKind: input.frameKind, frameId, convention };
}

export type DirectionAxis = "X" | "Y" | "Z" | "CUSTOM";
export type DirectionSense = "POSITIVE" | "NEGATIVE" | "UNSPECIFIED";

export interface DirectionDescriptor {
  readonly axis: DirectionAxis;
  readonly sense: DirectionSense;
  readonly frame: ReferenceFrameReference;
  readonly label: string | null;
}

export function createDirectionDescriptor(input: {
  readonly axis: DirectionAxis;
  readonly sense: DirectionSense;
  readonly frame: ReferenceFrameReference;
  readonly label?: string | null;
}): DirectionDescriptor {
  const frame = createReferenceFrameReference(input.frame);
  const label = optionalText(input.label, "Direction label");
  if (input.axis === "CUSTOM" && label === null) {
    throw new Error("Custom directions require a label.");
  }
  if (input.sense === "UNSPECIFIED" && label === null) {
    throw new Error(
      "An unspecified direction sense requires a declared direction label.",
    );
  }
  return { axis: input.axis, sense: input.sense, frame, label };
}

export type SupportKind =
  | "SUPPORTED"
  | "UNSUPPORTED"
  | "PARTIALLY_SUPPORTED"
  | "UNKNOWN"
  | "CUSTOM_DECLARED";
export type ContactConstraintKind =
  | "FIXED_CONTACT"
  | "MOVABLE_CONTACT"
  | "NO_FIXED_CONTACT"
  | "UNKNOWN"
  | "CUSTOM_DECLARED";
export type WeightBearingKind =
  | "WEIGHT_BEARING"
  | "NON_WEIGHT_BEARING"
  | "MIXED"
  | "UNKNOWN"
  | "CUSTOM_DECLARED";

export interface SupportConfiguration {
  readonly kind: SupportKind;
  readonly contactConstraint: ContactConstraintKind;
  readonly weightBearing: WeightBearingKind;
  readonly contactObjects: readonly PhysicalObjectReference[];
  readonly description: string | null;
}

export function createSupportConfiguration(input: {
  readonly kind: SupportKind;
  readonly contactConstraint: ContactConstraintKind;
  readonly weightBearing: WeightBearingKind;
  readonly contactObjects: readonly PhysicalObjectReference[];
  readonly description?: string | null;
}): SupportConfiguration {
  const contactObjects = input.contactObjects.map((object) =>
    createPhysicalObjectReference(object),
  );
  unique(
    contactObjects.map((object) => `${object.objectKind}:${object.objectId}`),
    "Support contact objects",
  );
  const description = optionalText(input.description, "Support description");
  if (
    (input.kind === "CUSTOM_DECLARED" ||
      input.contactConstraint === "CUSTOM_DECLARED" ||
      input.weightBearing === "CUSTOM_DECLARED") &&
    description === null
  ) {
    throw new Error("Custom support semantics require a description.");
  }
  if (
    input.contactConstraint === "FIXED_CONTACT" &&
    contactObjects.length === 0
  ) {
    throw new Error("Fixed support contact requires at least one object.");
  }
  return {
    kind: input.kind,
    contactConstraint: input.contactConstraint,
    weightBearing: input.weightBearing,
    contactObjects,
    description,
  };
}

export type ResistanceInteractionKind =
  | "NO_EXTERNAL_RESISTANCE"
  | "GRAVITATIONAL_FREE_MASS"
  | "BODY_MASS"
  | "MACHINE_CONSTRAINED"
  | "CABLE"
  | "ELASTIC"
  | "PNEUMATIC"
  | "HYDRAULIC"
  | "VELOCITY_CONTROLLED"
  | "MANUAL_EXTERNAL"
  | "CUSTOM_DECLARED";

export type MechanicalConstraintKind =
  | "FREE_PATH"
  | "MACHINE_GUIDED"
  | "CONTACT_CONSTRAINED"
  | "EXTERNAL_GUIDANCE"
  | "UNKNOWN"
  | "CUSTOM_DECLARED";

export type TaskDynamics = "DYNAMIC" | "STATIC" | "MIXED" | "UNKNOWN";
export type LateralityOrganization =
  | "BILATERAL"
  | "UNILATERAL"
  | "ALTERNATING"
  | "ASYMMETRIC"
  | "NOT_APPLICABLE"
  | "UNKNOWN"
  | "CUSTOM_DECLARED";

export interface MovementTaskFacets {
  readonly dynamics: TaskDynamics;
  readonly support: SupportConfiguration;
  readonly laterality: LateralityOrganization;
  readonly mechanicalConstraint: MechanicalConstraintKind;
  readonly resistanceInteraction: ResistanceInteractionKind;
  readonly directions: readonly DirectionDescriptor[];
}

export type TaskPhaseAction =
  | "CONCENTRIC"
  | "ECCENTRIC"
  | "ISOMETRIC"
  | "TRANSITION"
  | "UNKNOWN"
  | "CUSTOM_DECLARED";

export interface TaskPhaseDefinition {
  readonly id: string;
  readonly ordinal: number;
  readonly label: string;
  readonly action: TaskPhaseAction;
  readonly description: string | null;
}

export function createTaskPhaseDefinition(input: {
  readonly id: string;
  readonly ordinal: number;
  readonly label: string;
  readonly action: TaskPhaseAction;
  readonly description?: string | null;
}): TaskPhaseDefinition {
  const description = optionalText(input.description, "Task phase description");
  if (input.action === "CUSTOM_DECLARED" && description === null) {
    throw new Error("Custom task phases require a description.");
  }
  return {
    id: requiredText(input.id, "Task phase id"),
    ordinal: positiveInteger(input.ordinal, "Task phase ordinal"),
    label: requiredText(input.label, "Task phase label"),
    action: input.action,
    description,
  };
}

export interface MovementTask extends ScientificDefinitionIdentity {
  readonly kind: "MOVEMENT_TASK";
  readonly facets: MovementTaskFacets;
  readonly phases: readonly TaskPhaseDefinition[];
  readonly objectOfInterestRequirements: readonly PhysicalObjectReference[];
  readonly rationale: string;
}

export function createMovementTask(input: {
  readonly id: string;
  readonly version: string;
  readonly revision: number;
  readonly facets: MovementTaskFacets;
  readonly phases: readonly TaskPhaseDefinition[];
  readonly objectOfInterestRequirements: readonly PhysicalObjectReference[];
  readonly rationale: string;
}): MovementTask {
  const identity = validateIdentity(input, "Movement task");
  if (input.phases.length === 0) {
    throw new Error("Movement tasks require at least one semantic phase.");
  }
  const phases = input.phases.map((phase) => createTaskPhaseDefinition(phase));
  unique(
    phases.map((phase) => phase.id),
    "Movement task phase ids",
  );
  unique(
    phases.map((phase) => String(phase.ordinal)),
    "Movement task phase ordinals",
  );
  const objects = input.objectOfInterestRequirements.map((object) =>
    createPhysicalObjectReference(object),
  );
  if (objects.length === 0) {
    throw new Error(
      "Movement tasks require an object-of-interest declaration.",
    );
  }
  unique(
    objects.map((object) => `${object.objectKind}:${object.objectId}`),
    "Movement task objects",
  );
  const facets: MovementTaskFacets = {
    dynamics: input.facets.dynamics,
    support: createSupportConfiguration(input.facets.support),
    laterality: input.facets.laterality,
    mechanicalConstraint: input.facets.mechanicalConstraint,
    resistanceInteraction: input.facets.resistanceInteraction,
    directions: input.facets.directions.map((direction) =>
      createDirectionDescriptor(direction),
    ),
  };
  return {
    ...identity,
    kind: "MOVEMENT_TASK",
    facets,
    phases,
    objectOfInterestRequirements: objects,
    rationale: requiredText(input.rationale, "Movement task rationale"),
  };
}

export interface OperationalMovementReference {
  readonly movementId: UUID;
  readonly movementVersion: number;
  readonly scope: "GLOBAL" | "WORKSPACE";
}

function validateOperationalMovementReference(
  input: OperationalMovementReference,
): OperationalMovementReference {
  requiredText(input.movementId, "Operational movement id");
  return {
    movementId: input.movementId,
    movementVersion: positiveInteger(
      input.movementVersion,
      "Operational movement version",
    ),
    scope: input.scope,
  };
}

export interface ExerciseDefinition extends ScientificDefinitionIdentity {
  readonly kind: "EXERCISE_DEFINITION";
  readonly label: string;
  readonly operationalMovement: OperationalMovementReference;
  readonly movementTask: MovementTaskRef;
  readonly defaultConstraintSet: ExecutionConstraintSetRef | null;
  readonly familyMemberships: readonly MovementFamilyRef[];
  readonly rationale: string;
}

export function createExerciseDefinition(input: {
  readonly id: string;
  readonly version: string;
  readonly revision: number;
  readonly label: string;
  readonly operationalMovement: OperationalMovementReference;
  readonly movementTask: MovementTaskRef;
  readonly defaultConstraintSet?: ExecutionConstraintSetRef | null;
  readonly familyMemberships?: readonly MovementFamilyRef[];
  readonly rationale: string;
}): ExerciseDefinition {
  const identity = validateIdentity(input, "Exercise definition");
  const familyMemberships = (input.familyMemberships ?? []).map((family) =>
    validateRef(family, "Movement family"),
  );
  unique(
    familyMemberships.map((family) => `${family.id}:${family.revision}`),
    "Exercise family memberships",
  );
  return {
    ...identity,
    kind: "EXERCISE_DEFINITION",
    label: requiredText(input.label, "Exercise definition label"),
    operationalMovement: validateOperationalMovementReference(
      input.operationalMovement,
    ),
    movementTask: validateRef(input.movementTask, "Movement task reference"),
    defaultConstraintSet:
      input.defaultConstraintSet === undefined ||
      input.defaultConstraintSet === null
        ? null
        : validateRef(input.defaultConstraintSet, "Default constraint set"),
    familyMemberships,
    rationale: requiredText(input.rationale, "Exercise definition rationale"),
  };
}

export type VariationChangeKind =
  | "BAR_PLACEMENT"
  | "STANCE_SUPPORT"
  | "GRIP_ATTACHMENT"
  | "ROM"
  | "PAUSE"
  | "TEMPO"
  | "RESISTANCE_CONFIGURATION"
  | "IMPLEMENT"
  | "MECHANICAL_CONSTRAINT"
  | "CUSTOM_DECLARED";

export interface VariationConstraintChange {
  readonly kind: VariationChangeKind;
  readonly from: string | null;
  readonly to: string | null;
  readonly rationale: string;
}

export function createVariationConstraintChange(input: {
  readonly kind: VariationChangeKind;
  readonly from?: string | null;
  readonly to?: string | null;
  readonly rationale: string;
}): VariationConstraintChange {
  const from = optionalText(input.from, "Variation prior constraint");
  const to = optionalText(input.to, "Variation changed constraint");
  if (from === null && to === null) {
    throw new Error(
      "A variation change must declare a prior or changed value.",
    );
  }
  if (input.kind === "CUSTOM_DECLARED" && to === null) {
    throw new Error("Custom variation changes require a changed value.");
  }
  return {
    kind: input.kind,
    from,
    to,
    rationale: requiredText(input.rationale, "Variation change rationale"),
  };
}

export interface ExerciseVariation extends ScientificDefinitionIdentity {
  readonly kind: "EXERCISE_VARIATION";
  readonly label: string;
  readonly baseExerciseDefinition: ExerciseDefinitionRef;
  readonly movementTask: MovementTaskRef;
  readonly loadConfiguration: LoadConfigurationRef;
  readonly executionConstraints: ExecutionConstraintSetRef;
  readonly changedConstraints: readonly VariationConstraintChange[];
  readonly rationale: string;
}

export function createExerciseVariation(input: {
  readonly id: string;
  readonly version: string;
  readonly revision: number;
  readonly label: string;
  readonly baseExerciseDefinition: ExerciseDefinitionRef;
  readonly movementTask: MovementTaskRef;
  readonly loadConfiguration: LoadConfigurationRef;
  readonly executionConstraints: ExecutionConstraintSetRef;
  readonly changedConstraints: readonly VariationConstraintChange[];
  readonly rationale: string;
}): ExerciseVariation {
  const identity = validateIdentity(input, "Exercise variation");
  if (input.changedConstraints.length === 0) {
    throw new Error(
      "Exercise variations require an explicit changed constraint.",
    );
  }
  const changedConstraints = input.changedConstraints.map((change) =>
    createVariationConstraintChange(change),
  );
  unique(
    changedConstraints.map((change) => change.kind),
    "Exercise variation changed constraint kinds",
  );
  return {
    ...identity,
    kind: "EXERCISE_VARIATION",
    label: requiredText(input.label, "Exercise variation label"),
    baseExerciseDefinition: validateRef(
      input.baseExerciseDefinition,
      "Base exercise definition",
    ),
    movementTask: validateRef(input.movementTask, "Variation movement task"),
    loadConfiguration: validateRef(
      input.loadConfiguration,
      "Variation load configuration",
    ),
    executionConstraints: validateRef(
      input.executionConstraints,
      "Variation execution constraints",
    ),
    changedConstraints,
    rationale: requiredText(input.rationale, "Exercise variation rationale"),
  };
}

export interface MovementFamily extends ScientificDefinitionIdentity {
  readonly kind: "MOVEMENT_FAMILY";
  readonly label: string;
  readonly rationale: string;
  readonly provenance: readonly ScienceProvenanceRef[];
}

export function createMovementFamily(input: {
  readonly id: string;
  readonly version: string;
  readonly revision: number;
  readonly label: string;
  readonly rationale: string;
  readonly provenance: readonly ScienceProvenanceRef[];
}): MovementFamily {
  const identity = validateIdentity(input, "Movement family");
  return {
    ...identity,
    kind: "MOVEMENT_FAMILY",
    label: requiredText(input.label, "Movement family label"),
    rationale: requiredText(input.rationale, "Movement family rationale"),
    provenance: validateProvenance(input.provenance, "Movement family"),
  };
}

export type MovementFamilyMember =
  | {
      readonly kind: "EXERCISE_DEFINITION";
      readonly ref: ExerciseDefinitionRef;
    }
  | { readonly kind: "EXERCISE_VARIATION"; readonly ref: ExerciseVariationRef };

export interface MovementFamilyMembership {
  readonly membershipId: string;
  readonly family: MovementFamilyRef;
  readonly member: MovementFamilyMember;
  readonly rationale: string;
  readonly provenance: readonly ScienceProvenanceRef[];
}

export function createMovementFamilyMembership(input: {
  readonly membershipId: string;
  readonly family: MovementFamilyRef;
  readonly member: MovementFamilyMember;
  readonly rationale: string;
  readonly provenance: readonly ScienceProvenanceRef[];
}): MovementFamilyMembership {
  return {
    membershipId: requiredText(input.membershipId, "Family membership id"),
    family: validateRef(input.family, "Family membership family"),
    member: {
      kind: input.member.kind,
      ref: validateRef(input.member.ref, "Family membership member"),
    },
    rationale: requiredText(input.rationale, "Family membership rationale"),
    provenance: validateProvenance(
      input.provenance,
      "Movement family membership",
    ),
  };
}

export interface OperationalMovementAlias {
  readonly aliasId: string;
  readonly operationalMovementId: UUID;
  readonly value: string;
  readonly semantics: "PRODUCT_OR_LINGUISTIC_ONLY";
}

export function createOperationalMovementAlias(input: {
  readonly aliasId: string;
  readonly operationalMovementId: UUID;
  readonly value: string;
}): OperationalMovementAlias {
  requiredText(input.operationalMovementId, "Operational movement id");
  return {
    aliasId: requiredText(input.aliasId, "Operational alias id"),
    operationalMovementId: input.operationalMovementId,
    value: requiredText(input.value, "Operational alias value"),
    semantics: "PRODUCT_OR_LINGUISTIC_ONLY",
  };
}

export interface OperationalUiCategoryReference {
  readonly categoryId: string;
  readonly label: string;
  readonly authority: "OPERATIONAL_UI";
}

export function createOperationalUiCategoryReference(input: {
  readonly categoryId: string;
  readonly label: string;
}): OperationalUiCategoryReference {
  return {
    categoryId: requiredText(input.categoryId, "UI category id"),
    label: requiredText(input.label, "UI category label"),
    authority: "OPERATIONAL_UI",
  };
}

export type ResistanceQuantityKind =
  | "MASS"
  | "FORCE"
  | "TORQUE"
  | "MACHINE_SETTING"
  | "ELASTIC_RESISTANCE"
  | "ISOKINETIC_CONTROLLER_SETTING"
  | "CUSTOM_DECLARED";

export interface ResistanceQuantityDescriptor {
  readonly kind: ResistanceQuantityKind;
  readonly quantity: Quantity | null;
  readonly declaration: string | null;
}

export function createResistanceQuantityDescriptor(input: {
  readonly kind: ResistanceQuantityKind;
  readonly quantity?: Quantity | null;
  readonly declaration?: string | null;
}): ResistanceQuantityDescriptor {
  const declaration = optionalText(
    input.declaration,
    "Resistance quantity declaration",
  );
  let quantity: Quantity | null = null;
  if (input.quantity !== null && input.quantity !== undefined) {
    const expectedDimension: Dimension | undefined =
      input.kind === "MASS"
        ? "mass"
        : input.kind === "FORCE" || input.kind === "ELASTIC_RESISTANCE"
          ? "force"
          : input.kind === "TORQUE"
            ? "torque"
            : undefined;
    quantity = validateQuantity(
      input.quantity,
      "Resistance quantity",
      expectedDimension,
    );
  }
  if (quantity === null && declaration === null) {
    throw new Error(
      "Resistance quantity semantics require a quantity or explicit declaration.",
    );
  }
  if (
    (input.kind === "MACHINE_SETTING" ||
      input.kind === "ISOKINETIC_CONTROLLER_SETTING" ||
      input.kind === "CUSTOM_DECLARED") &&
    declaration === null
  ) {
    throw new Error("Controller or custom resistance requires a declaration.");
  }
  return { kind: input.kind, quantity, declaration };
}

export type MechanicalFeedbackKind =
  | "MOTION_INDEPENDENT_DECLARED"
  | "MOTION_DEPENDENT_DECLARED"
  | "CONTROLLER_DEPENDENT"
  | "UNKNOWN"
  | "CUSTOM_DECLARED";

export interface MechanicalFeedbackSemantics {
  readonly kind: MechanicalFeedbackKind;
  readonly description: string;
}

export function createMechanicalFeedbackSemantics(input: {
  readonly kind: MechanicalFeedbackKind;
  readonly description: string;
}): MechanicalFeedbackSemantics {
  return {
    kind: input.kind,
    description: requiredText(
      input.description,
      "Mechanical feedback description",
    ),
  };
}

export type LoadPlacementKind =
  | "HAND_HELD"
  | "SHOULDER_BACK"
  | "FRONT_RACK"
  | "WAIST_HARNESS"
  | "DISTAL_LIMB"
  | "MACHINE_CONTACT"
  | "CUSTOM_DECLARED";

export interface LoadPlacement {
  readonly kind: LoadPlacementKind;
  readonly contactObjects: readonly PhysicalObjectReference[];
  readonly description: string | null;
}

export function createLoadPlacement(input: {
  readonly kind: LoadPlacementKind;
  readonly contactObjects: readonly PhysicalObjectReference[];
  readonly description?: string | null;
}): LoadPlacement {
  const contactObjects = input.contactObjects.map((object) =>
    createPhysicalObjectReference(object),
  );
  const description = optionalText(
    input.description,
    "Load placement description",
  );
  if (input.kind === "CUSTOM_DECLARED" && description === null) {
    throw new Error("Custom load placement requires a description.");
  }
  return { kind: input.kind, contactObjects, description };
}

export type LoadDistributionKind =
  | "SYMMETRIC"
  | "ASYMMETRIC"
  | "UNILATERAL"
  | "DISTRIBUTED"
  | "UNKNOWN"
  | "CUSTOM_DECLARED";

export type ResistanceProfileKind =
  | "APPROXIMATELY_CONSTANT"
  | "POSITION_DEPENDENT"
  | "DISPLACEMENT_DEPENDENT"
  | "VELOCITY_DEPENDENT"
  | "CONTROLLER_CONSTRAINED"
  | "UNKNOWN"
  | "CUSTOM_DECLARED";

export interface LoadConfiguration extends ScientificDefinitionIdentity {
  readonly kind: "LOAD_CONFIGURATION";
  readonly interaction: ResistanceInteractionKind;
  readonly resistance: ResistanceQuantityDescriptor;
  readonly loadObject: PhysicalObjectReference;
  readonly placement: LoadPlacement;
  readonly distribution: LoadDistributionKind;
  readonly direction: DirectionDescriptor | null;
  readonly profile: ResistanceProfileKind;
  readonly mechanicalFeedback: MechanicalFeedbackSemantics;
  readonly rationale: string;
}

export function createLoadConfiguration(input: {
  readonly id: string;
  readonly version: string;
  readonly revision: number;
  readonly interaction: ResistanceInteractionKind;
  readonly resistance: ResistanceQuantityDescriptor;
  readonly loadObject: PhysicalObjectReference;
  readonly placement: LoadPlacement;
  readonly distribution: LoadDistributionKind;
  readonly direction?: DirectionDescriptor | null;
  readonly profile: ResistanceProfileKind;
  readonly mechanicalFeedback: MechanicalFeedbackSemantics;
  readonly rationale: string;
}): LoadConfiguration {
  const identity = validateIdentity(input, "Load configuration");
  return {
    ...identity,
    kind: "LOAD_CONFIGURATION",
    interaction: input.interaction,
    resistance: createResistanceQuantityDescriptor(input.resistance),
    loadObject: createPhysicalObjectReference(input.loadObject),
    placement: createLoadPlacement(input.placement),
    distribution: input.distribution,
    direction:
      input.direction === undefined || input.direction === null
        ? null
        : createDirectionDescriptor(input.direction),
    profile: input.profile,
    mechanicalFeedback: createMechanicalFeedbackSemantics(
      input.mechanicalFeedback,
    ),
    rationale: requiredText(input.rationale, "Load configuration rationale"),
  };
}

export interface ObjectMassDeclaration {
  readonly kind: "OBJECT_MASS";
  readonly object: PhysicalObjectReference;
  readonly quantity: Quantity;
}

export function createObjectMassDeclaration(input: {
  readonly object: PhysicalObjectReference;
  readonly quantity: Quantity;
}): ObjectMassDeclaration {
  const object = createPhysicalObjectReference(input.object);
  if (object.objectKind === "ATHLETE_PLUS_EXTERNAL_LOAD_SYSTEM") {
    throw new Error(
      "A composite system requires a system-mass declaration, not an object-mass declaration.",
    );
  }
  return {
    kind: "OBJECT_MASS",
    object,
    quantity: validateQuantity(input.quantity, "Object mass", "mass"),
  };
}

export interface SystemMassDeclaration {
  readonly kind: "SYSTEM_MASS";
  readonly systemObject: PhysicalObjectReference;
  readonly quantity: Quantity;
}

export function createSystemMassDeclaration(input: {
  readonly systemObject: PhysicalObjectReference;
  readonly quantity: Quantity;
}): SystemMassDeclaration {
  const systemObject = createPhysicalObjectReference(input.systemObject);
  if (
    systemObject.objectKind !== "ATHLETE_PLUS_EXTERNAL_LOAD_SYSTEM" &&
    systemObject.objectKind !== "CUSTOM_DECLARED_OBJECT"
  ) {
    throw new Error(
      "A system-mass declaration requires a composite or custom-declared system object.",
    );
  }
  return {
    kind: "SYSTEM_MASS",
    systemObject,
    quantity: validateQuantity(input.quantity, "System mass", "mass"),
  };
}

export function assertExternalMassIsNotSystemMass(input: {
  readonly external: ObjectMassDeclaration;
  readonly system: SystemMassDeclaration;
}): void {
  if (
    input.external.object.objectKind === input.system.systemObject.objectKind &&
    input.external.object.objectId === input.system.systemObject.objectId
  ) {
    throw new Error(
      "An object-mass declaration cannot be a system-mass declaration.",
    );
  }
}

export const assertSystemMassSeparation = assertExternalMassIsNotSystemMass;

export type RangeOfMotionKind =
  | "PROTOCOL_DEFINED"
  | "QUALITATIVE_LANDMARK"
  | "LINEAR_RANGE"
  | "ANGULAR_RANGE"
  | "UNKNOWN";

export interface RangeOfMotionConstraint {
  readonly kind: RangeOfMotionKind;
  readonly quantity: Quantity | null;
  readonly referenceObject: PhysicalObjectReference | null;
  readonly referenceFrame: ReferenceFrameReference | null;
  readonly protocolReference: string | null;
  readonly startCondition: string | null;
  readonly endCondition: string | null;
  readonly description: string;
}

export function createRangeOfMotionConstraint(input: {
  readonly kind: RangeOfMotionKind;
  readonly quantity?: Quantity | null;
  readonly referenceObject?: PhysicalObjectReference | null;
  readonly referenceFrame?: ReferenceFrameReference | null;
  readonly protocolReference?: string | null;
  readonly startCondition?: string | null;
  readonly endCondition?: string | null;
  readonly description: string;
}): RangeOfMotionConstraint {
  const quantity =
    input.quantity === undefined || input.quantity === null
      ? null
      : validateQuantity(
          input.quantity,
          "Range-of-motion quantity",
          input.kind === "LINEAR_RANGE"
            ? "length"
            : input.kind === "ANGULAR_RANGE"
              ? "angle"
              : undefined,
        );
  const referenceObject =
    input.referenceObject === undefined || input.referenceObject === null
      ? null
      : createPhysicalObjectReference(input.referenceObject);
  const referenceFrame =
    input.referenceFrame === undefined || input.referenceFrame === null
      ? null
      : createReferenceFrameReference(input.referenceFrame);
  const protocolReference = optionalText(
    input.protocolReference,
    "ROM protocol reference",
  );
  const startCondition = optionalText(
    input.startCondition,
    "ROM start condition",
  );
  const endCondition = optionalText(input.endCondition, "ROM end condition");
  const description = requiredText(input.description, "ROM description");
  if (/^(FULL|HALF|QUARTER)$/u.test(description.toUpperCase())) {
    throw new Error(
      "ROM cannot be represented by an unqualified FULL, HALF, or QUARTER label.",
    );
  }
  if (input.kind === "PROTOCOL_DEFINED" && protocolReference === null) {
    throw new Error("Protocol-defined ROM requires a protocol reference.");
  }
  if (input.kind === "QUALITATIVE_LANDMARK" && referenceObject === null) {
    throw new Error("Qualitative ROM requires a referenced object or segment.");
  }
  if (
    (input.kind === "LINEAR_RANGE" || input.kind === "ANGULAR_RANGE") &&
    (quantity === null || referenceObject === null || referenceFrame === null)
  ) {
    throw new Error(
      "Quantified ROM requires a quantity, object reference, and frame.",
    );
  }
  if (input.kind === "UNKNOWN" && protocolReference !== null) {
    throw new Error("Unknown ROM cannot claim a protocol-defined reference.");
  }
  return {
    kind: input.kind,
    quantity,
    referenceObject,
    referenceFrame,
    protocolReference,
    startCondition,
    endCondition,
    description,
  };
}

export interface PostureConstraint {
  readonly kind: "START_POSTURE" | "END_POSTURE";
  readonly description: string;
  readonly referenceObjects: readonly PhysicalObjectReference[];
}

export function createPostureConstraint(input: {
  readonly kind: "START_POSTURE" | "END_POSTURE";
  readonly description: string;
  readonly referenceObjects: readonly PhysicalObjectReference[];
}): PostureConstraint {
  const referenceObjects = input.referenceObjects.map((object) =>
    createPhysicalObjectReference(object),
  );
  return {
    kind: input.kind,
    description: requiredText(input.description, "Posture description"),
    referenceObjects,
  };
}

export type GripAttachmentKind =
  | "HAND_HELD"
  | "BAR_CONTACT"
  | "HANDLE"
  | "STRAP"
  | "MACHINE_CONTACT"
  | "CUSTOM_DECLARED"
  | "UNKNOWN";

export interface GripAttachmentConstraint {
  readonly kind: GripAttachmentKind;
  readonly contactObjects: readonly PhysicalObjectReference[];
  readonly description: string;
}

export function createGripAttachmentConstraint(input: {
  readonly kind: GripAttachmentKind;
  readonly contactObjects: readonly PhysicalObjectReference[];
  readonly description: string;
}): GripAttachmentConstraint {
  return {
    kind: input.kind,
    contactObjects: input.contactObjects.map((object) =>
      createPhysicalObjectReference(object),
    ),
    description: requiredText(
      input.description,
      "Grip or attachment description",
    ),
  };
}

export interface PhaseTempoConstraint {
  readonly phaseId: string;
  readonly duration: Quantity | null;
  readonly protocolReference: string | null;
  readonly description: string;
}

export function createPhaseTempoConstraint(input: {
  readonly phaseId: string;
  readonly duration?: Quantity | null;
  readonly protocolReference?: string | null;
  readonly description: string;
}): PhaseTempoConstraint {
  const duration =
    input.duration === undefined || input.duration === null
      ? null
      : validateQuantity(input.duration, "Prescribed phase duration", "time");
  const protocolReference = optionalText(
    input.protocolReference,
    "Tempo protocol reference",
  );
  if (duration === null && protocolReference === null) {
    throw new Error("A tempo phase requires a duration or protocol reference.");
  }
  return {
    phaseId: requiredText(input.phaseId, "Tempo phase id"),
    duration,
    protocolReference,
    description: requiredText(input.description, "Tempo phase description"),
  };
}

export interface PrescribedTempo {
  readonly kind: "PRESCRIBED_TEMPO";
  readonly phases: readonly PhaseTempoConstraint[];
  readonly declaration: string;
}

export function createPrescribedTempo(input: {
  readonly phases: readonly PhaseTempoConstraint[];
  readonly declaration: string;
}): PrescribedTempo {
  if (input.phases.length === 0) {
    throw new Error("Prescribed tempo requires phase-specific timing.");
  }
  const phases = input.phases.map((phase) => createPhaseTempoConstraint(phase));
  unique(
    phases.map((phase) => phase.phaseId),
    "Tempo phase ids",
  );
  return {
    kind: "PRESCRIBED_TEMPO",
    phases,
    declaration: requiredText(
      input.declaration,
      "Prescribed tempo declaration",
    ),
  };
}

export interface PrescribedPause {
  readonly kind: "PRESCRIBED_PAUSE";
  readonly phaseId: string;
  readonly duration: Quantity | null;
  readonly protocolReference: string | null;
  readonly location: string;
}

export function createPrescribedPause(input: {
  readonly phaseId: string;
  readonly duration?: Quantity | null;
  readonly protocolReference?: string | null;
  readonly location: string;
}): PrescribedPause {
  const duration =
    input.duration === undefined || input.duration === null
      ? null
      : validateQuantity(input.duration, "Prescribed pause duration", "time");
  const protocolReference = optionalText(
    input.protocolReference,
    "Pause protocol reference",
  );
  if (duration === null && protocolReference === null) {
    throw new Error(
      "A prescribed pause requires duration or protocol reference.",
    );
  }
  return {
    kind: "PRESCRIBED_PAUSE",
    phaseId: requiredText(input.phaseId, "Pause phase id"),
    duration,
    protocolReference,
    location: requiredText(input.location, "Pause location"),
  };
}

export type ExecutionIntentKind =
  | "MAXIMAL_VOLUNTARY_ACCELERATION"
  | "CONTROLLED"
  | "BALLISTIC"
  | "PROTOCOL_DEFINED"
  | "CUSTOM_DECLARED"
  | "UNKNOWN";

export interface ExecutionIntentDeclaration {
  readonly kind: ExecutionIntentKind;
  readonly declaration: string;
}

export function createExecutionIntentDeclaration(input: {
  readonly kind: ExecutionIntentKind;
  readonly declaration: string;
}): ExecutionIntentDeclaration {
  return {
    kind: input.kind,
    declaration: requiredText(
      input.declaration,
      "Execution intent declaration",
    ),
  };
}

export interface PhaseExecutionConstraint {
  readonly phaseId: string;
  readonly description: string;
}

export function createPhaseExecutionConstraint(input: {
  readonly phaseId: string;
  readonly description: string;
}): PhaseExecutionConstraint {
  return {
    phaseId: requiredText(input.phaseId, "Execution phase id"),
    description: requiredText(input.description, "Execution phase constraint"),
  };
}

export type TrajectoryConstraintKind =
  | "DIRECTION_SEQUENCE"
  | "PATH_DECLARED"
  | "UNKNOWN"
  | "CUSTOM_DECLARED";

export interface TrajectoryConstraint {
  readonly kind: TrajectoryConstraintKind;
  readonly frame: ReferenceFrameReference | null;
  readonly directions: readonly DirectionDescriptor[];
  readonly description: string;
}

export function createTrajectoryConstraint(input: {
  readonly kind: TrajectoryConstraintKind;
  readonly frame?: ReferenceFrameReference | null;
  readonly directions: readonly DirectionDescriptor[];
  readonly description: string;
}): TrajectoryConstraint {
  const frame =
    input.frame === undefined || input.frame === null
      ? null
      : createReferenceFrameReference(input.frame);
  const directions = input.directions.map((direction) =>
    createDirectionDescriptor(direction),
  );
  if (
    (input.kind === "DIRECTION_SEQUENCE" || input.kind === "PATH_DECLARED") &&
    (frame === null || directions.length === 0)
  ) {
    throw new Error("Declared trajectories require a frame and directions.");
  }
  if (input.kind === "CUSTOM_DECLARED" && frame === null) {
    throw new Error("Custom trajectories require a frame.");
  }
  return {
    kind: input.kind,
    frame,
    directions,
    description: requiredText(input.description, "Trajectory description"),
  };
}

export type AssistanceSupportKind =
  | "NONE"
  | "EXTERNAL_ASSISTANCE"
  | "SELF_ASSISTED"
  | "SUPPORT"
  | "UNKNOWN"
  | "CUSTOM_DECLARED";

export interface AssistanceSupportConstraint {
  readonly kind: AssistanceSupportKind;
  readonly objects: readonly PhysicalObjectReference[];
  readonly description: string;
}

export function createAssistanceSupportConstraint(input: {
  readonly kind: AssistanceSupportKind;
  readonly objects: readonly PhysicalObjectReference[];
  readonly description: string;
}): AssistanceSupportConstraint {
  return {
    kind: input.kind,
    objects: input.objects.map((object) =>
      createPhysicalObjectReference(object),
    ),
    description: requiredText(
      input.description,
      "Assistance or support description",
    ),
  };
}

export interface ExecutionConstraintSet extends ScientificDefinitionIdentity {
  readonly kind: "EXECUTION_CONSTRAINT_SET";
  readonly movementTask: MovementTaskRef;
  readonly loadConfiguration: LoadConfigurationRef | null;
  readonly rom: RangeOfMotionConstraint | null;
  readonly startPosture: PostureConstraint | null;
  readonly endPosture: PostureConstraint | null;
  readonly support: SupportConfiguration | null;
  readonly gripAttachment: GripAttachmentConstraint | null;
  readonly tempo: PrescribedTempo | null;
  readonly pause: PrescribedPause | null;
  readonly intent: ExecutionIntentDeclaration | null;
  readonly phaseConstraints: readonly PhaseExecutionConstraint[];
  readonly trajectory: TrajectoryConstraint | null;
  readonly assistance: AssistanceSupportConstraint | null;
  readonly rationale: string;
}

export function createExecutionConstraintSet(input: {
  readonly id: string;
  readonly version: string;
  readonly revision: number;
  readonly movementTask: MovementTaskRef;
  readonly loadConfiguration?: LoadConfigurationRef | null;
  readonly rom?: RangeOfMotionConstraint | null;
  readonly startPosture?: PostureConstraint | null;
  readonly endPosture?: PostureConstraint | null;
  readonly support?: SupportConfiguration | null;
  readonly gripAttachment?: GripAttachmentConstraint | null;
  readonly tempo?: PrescribedTempo | null;
  readonly pause?: PrescribedPause | null;
  readonly intent?: ExecutionIntentDeclaration | null;
  readonly phaseConstraints?: readonly PhaseExecutionConstraint[];
  readonly trajectory?: TrajectoryConstraint | null;
  readonly assistance?: AssistanceSupportConstraint | null;
  readonly rationale: string;
}): ExecutionConstraintSet {
  const identity = validateIdentity(input, "Execution constraint set");
  const phaseConstraints = (input.phaseConstraints ?? []).map((constraint) =>
    createPhaseExecutionConstraint(constraint),
  );
  unique(
    phaseConstraints.map((constraint) => constraint.phaseId),
    "Execution phase constraint ids",
  );
  return {
    ...identity,
    kind: "EXECUTION_CONSTRAINT_SET",
    movementTask: validateRef(input.movementTask, "Constraint movement task"),
    loadConfiguration:
      input.loadConfiguration === undefined || input.loadConfiguration === null
        ? null
        : validateRef(input.loadConfiguration, "Constraint load configuration"),
    rom:
      input.rom === undefined || input.rom === null
        ? null
        : createRangeOfMotionConstraint(input.rom),
    startPosture:
      input.startPosture === undefined || input.startPosture === null
        ? null
        : createPostureConstraint(input.startPosture),
    endPosture:
      input.endPosture === undefined || input.endPosture === null
        ? null
        : createPostureConstraint(input.endPosture),
    support:
      input.support === undefined || input.support === null
        ? null
        : createSupportConfiguration(input.support),
    gripAttachment:
      input.gripAttachment === undefined || input.gripAttachment === null
        ? null
        : createGripAttachmentConstraint(input.gripAttachment),
    tempo:
      input.tempo === undefined || input.tempo === null
        ? null
        : createPrescribedTempo(input.tempo),
    pause:
      input.pause === undefined || input.pause === null
        ? null
        : createPrescribedPause(input.pause),
    intent:
      input.intent === undefined || input.intent === null
        ? null
        : createExecutionIntentDeclaration(input.intent),
    phaseConstraints,
    trajectory:
      input.trajectory === undefined || input.trajectory === null
        ? null
        : createTrajectoryConstraint(input.trajectory),
    assistance:
      input.assistance === undefined || input.assistance === null
        ? null
        : createAssistanceSupportConstraint(input.assistance),
    rationale: requiredText(input.rationale, "Execution constraint rationale"),
  };
}

export interface ObservedExecutionTiming {
  readonly kind: "OBSERVED_EXECUTION_TIMING";
  readonly phaseId: string;
  readonly duration: Quantity;
  readonly sourceReference: string;
}

export function createObservedExecutionTiming(input: {
  readonly phaseId: string;
  readonly duration: Quantity;
  readonly sourceReference: string;
}): ObservedExecutionTiming {
  return {
    kind: "OBSERVED_EXECUTION_TIMING",
    phaseId: requiredText(input.phaseId, "Observed phase id"),
    duration: validateQuantity(
      input.duration,
      "Observed phase duration",
      "time",
    ),
    sourceReference: requiredText(
      input.sourceReference,
      "Observed timing source",
    ),
  };
}

export type ScientificConstructId =
  | "TIME"
  | "POSITION"
  | "ORIENTATION"
  | "DISPLACEMENT"
  | "VELOCITY"
  | "ACCELERATION"
  | "MASS"
  | "EXTERNAL_FORCE"
  | "MOMENT_OF_FORCE"
  | "WORK"
  | "POWER"
  | "IMPULSE";

export type RequirementLevel = "NONE" | "OPTIONAL" | "REQUIRED";
export type TemporalSupportKind =
  | "INSTANT"
  | "SAMPLE"
  | "INTERVAL"
  | "PHASE"
  | "TRIAL"
  | "REP"
  | "SET";
export type DirectObservationEligibility =
  | "DIRECT_ELIGIBLE"
  | "CONTEXT_DEPENDENT"
  | "DERIVED_ONLY";
export type DerivationEligibility = "DERIVATION_ELIGIBLE" | "NOT_ELIGIBLE";

export interface ScientificConstructDefinition {
  readonly id: ScientificConstructId;
  readonly dimension: Dimension;
  readonly objectRequirement: RequirementLevel;
  readonly frameRequirement: RequirementLevel;
  readonly axisRequirement: RequirementLevel;
  readonly measurementPointRequirement: RequirementLevel;
  readonly temporalSupport: readonly TemporalSupportKind[];
  readonly directObservationEligibility: DirectObservationEligibility;
  readonly derivationEligibility: DerivationEligibility;
}

export const SCIENTIFIC_CONSTRUCT_CATALOG: Readonly<
  Record<ScientificConstructId, ScientificConstructDefinition>
> = {
  TIME: {
    id: "TIME",
    dimension: "time",
    objectRequirement: "NONE",
    frameRequirement: "NONE",
    axisRequirement: "NONE",
    measurementPointRequirement: "NONE",
    temporalSupport: [
      "INSTANT",
      "SAMPLE",
      "INTERVAL",
      "PHASE",
      "TRIAL",
      "REP",
      "SET",
    ],
    directObservationEligibility: "DIRECT_ELIGIBLE",
    derivationEligibility: "DERIVATION_ELIGIBLE",
  },
  POSITION: {
    id: "POSITION",
    dimension: "length",
    objectRequirement: "REQUIRED",
    frameRequirement: "REQUIRED",
    axisRequirement: "OPTIONAL",
    measurementPointRequirement: "REQUIRED",
    temporalSupport: [
      "INSTANT",
      "SAMPLE",
      "INTERVAL",
      "PHASE",
      "TRIAL",
      "REP",
      "SET",
    ],
    directObservationEligibility: "DIRECT_ELIGIBLE",
    derivationEligibility: "DERIVATION_ELIGIBLE",
  },
  ORIENTATION: {
    id: "ORIENTATION",
    dimension: "angle",
    objectRequirement: "REQUIRED",
    frameRequirement: "REQUIRED",
    axisRequirement: "OPTIONAL",
    measurementPointRequirement: "OPTIONAL",
    temporalSupport: [
      "INSTANT",
      "SAMPLE",
      "INTERVAL",
      "PHASE",
      "TRIAL",
      "REP",
      "SET",
    ],
    directObservationEligibility: "CONTEXT_DEPENDENT",
    derivationEligibility: "DERIVATION_ELIGIBLE",
  },
  DISPLACEMENT: {
    id: "DISPLACEMENT",
    dimension: "length",
    objectRequirement: "REQUIRED",
    frameRequirement: "REQUIRED",
    axisRequirement: "OPTIONAL",
    measurementPointRequirement: "REQUIRED",
    temporalSupport: ["INTERVAL", "PHASE", "TRIAL", "REP", "SET"],
    directObservationEligibility: "CONTEXT_DEPENDENT",
    derivationEligibility: "DERIVATION_ELIGIBLE",
  },
  VELOCITY: {
    id: "VELOCITY",
    dimension: "speed",
    objectRequirement: "REQUIRED",
    frameRequirement: "REQUIRED",
    axisRequirement: "OPTIONAL",
    measurementPointRequirement: "REQUIRED",
    temporalSupport: [
      "INSTANT",
      "SAMPLE",
      "INTERVAL",
      "PHASE",
      "TRIAL",
      "REP",
      "SET",
    ],
    directObservationEligibility: "CONTEXT_DEPENDENT",
    derivationEligibility: "DERIVATION_ELIGIBLE",
  },
  ACCELERATION: {
    id: "ACCELERATION",
    dimension: "acceleration",
    objectRequirement: "REQUIRED",
    frameRequirement: "REQUIRED",
    axisRequirement: "OPTIONAL",
    measurementPointRequirement: "REQUIRED",
    temporalSupport: [
      "INSTANT",
      "SAMPLE",
      "INTERVAL",
      "PHASE",
      "TRIAL",
      "REP",
      "SET",
    ],
    directObservationEligibility: "CONTEXT_DEPENDENT",
    derivationEligibility: "DERIVATION_ELIGIBLE",
  },
  MASS: {
    id: "MASS",
    dimension: "mass",
    objectRequirement: "REQUIRED",
    frameRequirement: "NONE",
    axisRequirement: "NONE",
    measurementPointRequirement: "OPTIONAL",
    temporalSupport: ["INSTANT", "TRIAL", "REP", "SET"],
    directObservationEligibility: "DIRECT_ELIGIBLE",
    derivationEligibility: "DERIVATION_ELIGIBLE",
  },
  EXTERNAL_FORCE: {
    id: "EXTERNAL_FORCE",
    dimension: "force",
    objectRequirement: "REQUIRED",
    frameRequirement: "REQUIRED",
    axisRequirement: "OPTIONAL",
    measurementPointRequirement: "REQUIRED",
    temporalSupport: [
      "INSTANT",
      "SAMPLE",
      "INTERVAL",
      "PHASE",
      "TRIAL",
      "REP",
      "SET",
    ],
    directObservationEligibility: "DIRECT_ELIGIBLE",
    derivationEligibility: "DERIVATION_ELIGIBLE",
  },
  MOMENT_OF_FORCE: {
    id: "MOMENT_OF_FORCE",
    dimension: "torque",
    objectRequirement: "REQUIRED",
    frameRequirement: "REQUIRED",
    axisRequirement: "REQUIRED",
    measurementPointRequirement: "OPTIONAL",
    temporalSupport: [
      "INSTANT",
      "SAMPLE",
      "INTERVAL",
      "PHASE",
      "TRIAL",
      "REP",
      "SET",
    ],
    directObservationEligibility: "DERIVED_ONLY",
    derivationEligibility: "DERIVATION_ELIGIBLE",
  },
  WORK: {
    id: "WORK",
    dimension: "energy",
    objectRequirement: "REQUIRED",
    frameRequirement: "REQUIRED",
    axisRequirement: "OPTIONAL",
    measurementPointRequirement: "OPTIONAL",
    temporalSupport: ["INTERVAL", "PHASE", "TRIAL", "REP", "SET"],
    directObservationEligibility: "DERIVED_ONLY",
    derivationEligibility: "DERIVATION_ELIGIBLE",
  },
  POWER: {
    id: "POWER",
    dimension: "power",
    objectRequirement: "REQUIRED",
    frameRequirement: "REQUIRED",
    axisRequirement: "OPTIONAL",
    measurementPointRequirement: "OPTIONAL",
    temporalSupport: [
      "INSTANT",
      "SAMPLE",
      "INTERVAL",
      "PHASE",
      "TRIAL",
      "REP",
      "SET",
    ],
    directObservationEligibility: "DERIVED_ONLY",
    derivationEligibility: "DERIVATION_ELIGIBLE",
  },
  IMPULSE: {
    id: "IMPULSE",
    dimension: "impulse",
    objectRequirement: "REQUIRED",
    frameRequirement: "REQUIRED",
    axisRequirement: "OPTIONAL",
    measurementPointRequirement: "OPTIONAL",
    temporalSupport: ["INTERVAL", "PHASE", "TRIAL", "REP", "SET"],
    directObservationEligibility: "DERIVED_ONLY",
    derivationEligibility: "DERIVATION_ELIGIBLE",
  },
};

export function getScientificConstructDefinition(
  construct: ScientificConstructId,
): ScientificConstructDefinition {
  const definition = SCIENTIFIC_CONSTRUCT_CATALOG[construct];
  if (definition === undefined) {
    throw new Error(`Unknown scientific construct: ${construct}.`);
  }
  return definition;
}

export type SummaryOperation =
  | "BASE"
  | "PEAK"
  | "MEAN"
  | "MINIMUM"
  | "MAXIMUM"
  | "RANGE";

export interface SummarySemantics {
  readonly operation: SummaryOperation;
  readonly baseConstruct: ScientificConstructId;
  readonly scope: TemporalSupportKind;
  readonly phaseId: string | null;
}

export function createSummarySemantics(input: {
  readonly operation: SummaryOperation;
  readonly baseConstruct: ScientificConstructId;
  readonly scope: TemporalSupportKind;
  readonly phaseId?: string | null;
}): SummarySemantics {
  const phaseId =
    input.phaseId === undefined
      ? null
      : optionalText(input.phaseId, "Summary phase id");
  if (
    input.operation !== "BASE" &&
    input.baseConstruct === "VELOCITY" &&
    phaseId === null
  ) {
    throw new Error(
      "A summarized velocity requires an explicit phase or scope authority.",
    );
  }
  return {
    operation: input.operation,
    baseConstruct: input.baseConstruct,
    scope: input.scope,
    phaseId,
  };
}

export type ConstructAvailability =
  | { readonly kind: "DIRECT_OBSERVATION"; readonly capabilityId: string }
  | {
      readonly kind: "DERIVATION_REQUIRED";
      readonly method: MethodIdentity;
      readonly reason: string;
    };

export interface ScientificConstructBinding {
  readonly bindingId: string;
  readonly construct: ScientificConstructId;
  readonly objectOfInterest: PhysicalObjectReference | null;
  readonly measurementPoint: PhysicalObjectReference | null;
  readonly frame: ReferenceFrameReference | null;
  readonly axis: DirectionDescriptor | null;
  readonly temporalSupport: TemporalSupportKind;
  readonly summary: SummarySemantics;
  readonly claimClass: ScientificClaimClass;
  readonly availability: ConstructAvailability;
}

export function createScientificConstructBinding(input: {
  readonly bindingId: string;
  readonly construct: ScientificConstructId;
  readonly objectOfInterest?: PhysicalObjectReference | null;
  readonly measurementPoint?: PhysicalObjectReference | null;
  readonly frame?: ReferenceFrameReference | null;
  readonly axis?: DirectionDescriptor | null;
  readonly temporalSupport: TemporalSupportKind;
  readonly summary: SummarySemantics;
  readonly claimClass: ScientificClaimClass;
  readonly availability: ConstructAvailability;
}): ScientificConstructBinding {
  const definition = getScientificConstructDefinition(input.construct);
  const objectOfInterest =
    input.objectOfInterest === undefined || input.objectOfInterest === null
      ? null
      : createPhysicalObjectReference(input.objectOfInterest);
  const measurementPoint =
    input.measurementPoint === undefined || input.measurementPoint === null
      ? null
      : validateMeasurementPoint(
          input.measurementPoint,
          "Construct measurement point",
        );
  const frame =
    input.frame === undefined || input.frame === null
      ? null
      : createReferenceFrameReference(input.frame);
  const axis =
    input.axis === undefined || input.axis === null
      ? null
      : createDirectionDescriptor(input.axis);
  if (
    definition.objectRequirement === "REQUIRED" &&
    objectOfInterest === null
  ) {
    throw new Error(`${input.construct} requires an object of interest.`);
  }
  if (definition.frameRequirement === "REQUIRED" && frame === null) {
    throw new Error(`${input.construct} requires a reference frame.`);
  }
  if (definition.axisRequirement === "REQUIRED" && axis === null) {
    throw new Error(`${input.construct} requires a direction or axis.`);
  }
  if (definition.axisRequirement === "NONE" && axis !== null) {
    throw new Error(`${input.construct} cannot declare a direction or axis.`);
  }
  if (
    definition.measurementPointRequirement === "REQUIRED" &&
    measurementPoint === null
  ) {
    throw new Error(`${input.construct} requires a measurement point.`);
  }
  if (
    axis !== null &&
    (frame === null || !sameReferenceFrame(axis.frame, frame))
  ) {
    throw new Error(
      "Construct direction must use the binding reference frame.",
    );
  }
  if (input.summary.baseConstruct !== input.construct) {
    throw new Error(
      "Summary semantics must identify the bound base construct.",
    );
  }
  if (
    !definition.temporalSupport.includes(input.temporalSupport) ||
    !definition.temporalSupport.includes(input.summary.scope)
  ) {
    throw new Error(
      "Construct temporal support is not valid for this construct.",
    );
  }
  if (input.availability.kind === "DIRECT_OBSERVATION") {
    if (definition.directObservationEligibility === "DERIVED_ONLY") {
      throw new Error(
        `${input.construct} is not directly observable in SCI-1.`,
      );
    }
    if (input.claimClass !== "OBSERVED" || input.summary.operation !== "BASE") {
      throw new Error(
        "Direct capability bindings must remain base observed constructs.",
      );
    }
    requiredText(input.availability.capabilityId, "Direct capability id");
  } else {
    if (definition.derivationEligibility === "NOT_ELIGIBLE") {
      throw new Error(`${input.construct} cannot be declared as derivable.`);
    }
    if (input.claimClass === "OBSERVED") {
      throw new Error("A derivation-required binding cannot be observed.");
    }
    validateMethod(input.availability.method, "Construct derivation method");
    requiredText(input.availability.reason, "Construct derivation reason");
  }
  return {
    bindingId: requiredText(input.bindingId, "Construct binding id"),
    construct: input.construct,
    objectOfInterest,
    measurementPoint,
    frame,
    axis,
    temporalSupport: input.temporalSupport,
    summary: createSummarySemantics(input.summary),
    claimClass: input.claimClass,
    availability:
      input.availability.kind === "DIRECT_OBSERVATION"
        ? {
            kind: "DIRECT_OBSERVATION",
            capabilityId: requiredText(
              input.availability.capabilityId,
              "Direct capability id",
            ),
          }
        : {
            kind: "DERIVATION_REQUIRED",
            method: validateMethod(
              input.availability.method,
              "Construct derivation method",
            ),
            reason: requiredText(
              input.availability.reason,
              "Construct derivation reason",
            ),
          },
  };
}

export type MeasurementModalityKind =
  | "POSITION_TRANSDUCER"
  | "ENCODER"
  | "FORCE_PLATFORM"
  | "INERTIAL_SENSOR"
  | "VIDEO_KINEMATICS"
  | "TIMING_GATE"
  | "MANUAL_OBSERVATION"
  | "CUSTOM_DECLARED";

export interface MeasurementModalityReference {
  readonly modalityId: string;
  readonly version: string;
  readonly kind: MeasurementModalityKind;
  readonly label: string;
}

export function createMeasurementModalityReference(input: {
  readonly modalityId: string;
  readonly version: string;
  readonly kind: MeasurementModalityKind;
  readonly label: string;
}): MeasurementModalityReference {
  return {
    modalityId: requiredText(input.modalityId, "Measurement modality id"),
    version: requiredText(input.version, "Measurement modality version"),
    kind: input.kind,
    label: requiredText(input.label, "Measurement modality label"),
  };
}

export type SamplingMode = "SAMPLED" | "TIMED_EVENT" | "MANUAL" | "UNKNOWN";
export type SynchronizationRelationship =
  | "SYNCHRONOUS"
  | "ASYNCHRONOUS"
  | "UNSPECIFIED";
export type MissingSampleSemantics =
  | "DECLARED"
  | "NOT_REPORTED"
  | "NOT_APPLICABLE";

export interface SamplingSemantics {
  readonly mode: SamplingMode;
  readonly sampleRate: Quantity | null;
  readonly timebaseId: string | null;
  readonly synchronization: SynchronizationRelationship;
  readonly missingSamples: MissingSampleSemantics;
  readonly channelId: string | null;
}

export function createSamplingSemantics(input: {
  readonly mode: SamplingMode;
  readonly sampleRate?: Quantity | null;
  readonly timebaseId?: string | null;
  readonly synchronization: SynchronizationRelationship;
  readonly missingSamples: MissingSampleSemantics;
  readonly channelId?: string | null;
}): SamplingSemantics {
  const sampleRate =
    input.sampleRate === undefined || input.sampleRate === null
      ? null
      : validateQuantity(input.sampleRate, "Sampling rate", "frequency");
  const timebaseId = optionalText(input.timebaseId, "Sampling timebase id");
  const channelId = optionalText(input.channelId, "Sampling channel id");
  if (
    input.mode === "SAMPLED" &&
    (sampleRate === null || timebaseId === null)
  ) {
    throw new Error("Sampled modality semantics require rate and timebase.");
  }
  if (input.mode === "MANUAL" && sampleRate !== null) {
    throw new Error("Manual observations cannot claim a sample rate.");
  }
  return {
    mode: input.mode,
    sampleRate,
    timebaseId,
    synchronization: input.synchronization,
    missingSamples: input.missingSamples,
    channelId,
  };
}

export type AttachmentContactKind =
  | "ATTACHED"
  | "CONTACT"
  | "NONCONTACT"
  | "UNKNOWN";

export interface AttachmentContactSemantics {
  readonly kind: AttachmentContactKind;
  readonly target: PhysicalObjectReference | null;
  readonly description: string;
}

export function createAttachmentContactSemantics(input: {
  readonly kind: AttachmentContactKind;
  readonly target?: PhysicalObjectReference | null;
  readonly description: string;
}): AttachmentContactSemantics {
  const target =
    input.target === undefined || input.target === null
      ? null
      : createPhysicalObjectReference(input.target);
  if (
    (input.kind === "ATTACHED" || input.kind === "CONTACT") &&
    target === null
  ) {
    throw new Error("Attached or contact modality semantics require a target.");
  }
  return {
    kind: input.kind,
    target,
    description: requiredText(
      input.description,
      "Attachment or contact description",
    ),
  };
}

export type CalibrationDependencyKind =
  | "REQUIRED"
  | "OPTIONAL"
  | "NOT_REQUIRED"
  | "UNKNOWN";

export interface CalibrationDependency {
  readonly kind: CalibrationDependencyKind;
  readonly description: string;
}

export function createCalibrationDependency(input: {
  readonly kind: CalibrationDependencyKind;
  readonly description: string;
}): CalibrationDependency {
  return {
    kind: input.kind,
    description: requiredText(
      input.description,
      "Calibration dependency description",
    ),
  };
}

export interface MeasurementModalityCapability {
  readonly capabilityId: string;
  readonly version: string;
  readonly modality: MeasurementModalityReference;
  readonly directConstruct: ScientificConstructId;
  readonly objectOfInterest: PhysicalObjectReference | null;
  readonly measurementPoint: PhysicalObjectReference | null;
  readonly frame: ReferenceFrameReference | null;
  readonly axis: DirectionDescriptor | null;
  readonly sampling: SamplingSemantics;
  readonly attachment: AttachmentContactSemantics | null;
  readonly calibration: CalibrationDependency;
  readonly limitations: readonly string[];
}

export function createMeasurementModalityCapability(input: {
  readonly capabilityId: string;
  readonly version: string;
  readonly modality: MeasurementModalityReference;
  readonly directConstruct: ScientificConstructId;
  readonly objectOfInterest?: PhysicalObjectReference | null;
  readonly measurementPoint?: PhysicalObjectReference | null;
  readonly frame?: ReferenceFrameReference | null;
  readonly axis?: DirectionDescriptor | null;
  readonly sampling: SamplingSemantics;
  readonly attachment?: AttachmentContactSemantics | null;
  readonly calibration: CalibrationDependency;
  readonly limitations: readonly string[];
}): MeasurementModalityCapability {
  const modality = createMeasurementModalityReference(input.modality);
  const definition = getScientificConstructDefinition(input.directConstruct);
  if (definition.directObservationEligibility === "DERIVED_ONLY") {
    throw new Error(
      `${input.directConstruct} is derived-only and cannot be a direct modality capability.`,
    );
  }
  if (
    (modality.kind === "POSITION_TRANSDUCER" || modality.kind === "ENCODER") &&
    input.directConstruct !== "POSITION"
  ) {
    throw new Error(
      "Position transducer and encoder capabilities are limited to direct position in SCI-1.",
    );
  }
  if (
    modality.kind === "FORCE_PLATFORM" &&
    input.directConstruct !== "EXTERNAL_FORCE"
  ) {
    throw new Error(
      "Force-platform capability is limited to direct external force in SCI-1.",
    );
  }
  if (
    definition.objectRequirement === "REQUIRED" &&
    (input.objectOfInterest === undefined || input.objectOfInterest === null)
  ) {
    throw new Error(`${input.directConstruct} capability requires an object.`);
  }
  if (
    definition.frameRequirement === "REQUIRED" &&
    (input.frame === undefined || input.frame === null)
  ) {
    throw new Error(`${input.directConstruct} capability requires a frame.`);
  }
  if (
    definition.measurementPointRequirement === "REQUIRED" &&
    (input.measurementPoint === undefined || input.measurementPoint === null)
  ) {
    throw new Error(
      `${input.directConstruct} capability requires a measurement point.`,
    );
  }
  const objectOfInterest =
    input.objectOfInterest === undefined || input.objectOfInterest === null
      ? null
      : createPhysicalObjectReference(input.objectOfInterest);
  const measurementPoint =
    input.measurementPoint === undefined || input.measurementPoint === null
      ? null
      : validateMeasurementPoint(
          input.measurementPoint,
          "Modality measurement point",
        );
  const frame =
    input.frame === undefined || input.frame === null
      ? null
      : createReferenceFrameReference(input.frame);
  const axis =
    input.axis === undefined || input.axis === null
      ? null
      : createDirectionDescriptor(input.axis);
  if (
    axis !== null &&
    (frame === null || !sameReferenceFrame(axis.frame, frame))
  ) {
    throw new Error(
      "Modality direction must use the modality reference frame.",
    );
  }
  const attachment =
    input.attachment === undefined || input.attachment === null
      ? null
      : createAttachmentContactSemantics(input.attachment);
  const limitations = input.limitations.map((limitation) =>
    requiredText(limitation, "Modality limitation"),
  );
  if (limitations.length === 0) {
    throw new Error("Modality capabilities require declared limitations.");
  }
  unique(limitations, "Modality limitations");
  return {
    capabilityId: requiredText(input.capabilityId, "Measurement capability id"),
    version: requiredText(input.version, "Measurement capability version"),
    modality,
    directConstruct: input.directConstruct,
    objectOfInterest,
    measurementPoint,
    frame,
    axis,
    sampling: createSamplingSemantics(input.sampling),
    attachment,
    calibration: createCalibrationDependency(input.calibration),
    limitations,
  };
}
