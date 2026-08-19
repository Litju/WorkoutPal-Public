import { z } from "zod";

export const uuidSchema = z.string().uuid();
export const instantSchema = z.string().datetime({ offset: true });

export const createWorkspaceRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
  })
  .strict();

export const createAthleteRequestSchema = z
  .object({
    workspaceId: uuidSchema,
    displayName: z.string().trim().min(2).max(120),
    linkedUserId: uuidSchema.nullish(),
  })
  .strict();

export const updateAthleteRequestSchema = z
  .object({
    workspaceId: uuidSchema,
    expectedVersion: z.number().int().positive(),
    displayName: z.string().trim().min(2).max(120).optional(),
    linkedUserId: uuidSchema.nullish(),
  })
  .strict();

export const updateAthleteTrainingContextRequestSchema = z
  .object({
    workspaceId: uuidSchema,
    expectedVersion: z.number().int().nonnegative(),
    trainingAgeMonths: z.number().int().nonnegative().nullable().optional(),
    availabilityNotes: z.string().trim().max(2000).nullable().optional(),
    operationalConstraints: z.string().trim().max(2000).nullable().optional(),
    equipmentAccess: z
      .array(z.string().trim().min(1).max(80))
      .max(50)
      .optional(),
    trainingPreferences: z.string().trim().max(2000).nullable().optional(),
    practitionerNotes: z.string().trim().max(4000).nullable().optional(),
  })
  .strict();

export const archiveAthleteRequestSchema = z
  .object({
    workspaceId: uuidSchema,
    expectedVersion: z.number().int().positive(),
  })
  .strict();

export const coachAssignmentRequestSchema = z
  .object({
    workspaceId: uuidSchema,
    coachPrincipalId: uuidSchema,
  })
  .strict();

export const workspaceSummarySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  createdAt: instantSchema,
});

export const workspaceMemberRoleUpdateRequestSchema = z
  .object({
    role: z.enum(["owner", "coach", "athlete", "viewer"]),
  })
  .strict();

export const workspacePreferencesUpdateRequestSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    massUnit: z.enum(["kg", "lb"]).optional(),
    distanceUnit: z.enum(["m", "km", "mi"]).optional(),
    paceUnit: z.enum(["per-km", "per-mi"]).optional(),
  })
  .strict();

export const athleteProfileSchema = z.object({
  id: uuidSchema,
  workspaceId: uuidSchema,
  displayName: z.string(),
  linkedUserId: uuidSchema.nullable(),
  archivedAt: instantSchema.nullable(),
  createdAt: instantSchema,
  createdBy: uuidSchema,
  updatedAt: instantSchema,
  updatedBy: uuidSchema,
  version: z.number().int().positive(),
});

export const problemJsonSchema = z.object({
  type: z.string().url(),
  title: z.string(),
  status: z.number().int(),
  code: z.string(),
  requestId: z.string().min(1),
  details: z.record(z.string(), z.unknown()).optional(),
});

export function dataEnvelopeSchema<T extends z.ZodType>(schema: T) {
  return z.object({ data: schema });
}

export const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const timeZoneSchema = z.string().min(1).max(100);
export const movementModalitySchema = z.enum([
  "strength",
  "endurance",
  "mobility",
  "general",
]);

export const createMovementRequestSchema = z
  .object({
    workspaceId: uuidSchema,
    canonicalName: z.string().trim().min(1).max(240),
    modality: movementModalitySchema,
    movementPattern: z.string().trim().max(120).optional(),
    laterality: z.string().trim().max(80).optional(),
    equipmentTags: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  })
  .strict();

export const updateMovementRequestSchema = z
  .object({
    workspaceId: uuidSchema,
    expectedVersion: z.number().int().positive(),
    canonicalName: z.string().trim().min(1).max(240).optional(),
    modality: movementModalitySchema.optional(),
    movementPattern: z.string().trim().max(120).nullable().optional(),
    laterality: z.string().trim().max(80).nullable().optional(),
    equipmentTags: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  })
  .strict();

export const createTrainingGoalRequestSchema = z
  .object({
    workspaceId: uuidSchema,
    title: z.string().trim().min(1).max(240),
    description: z.string().trim().max(2000).optional(),
    targetDate: localDateSchema.optional(),
    startsOn: localDateSchema.optional(),
    endsOn: localDateSchema.optional(),
  })
  .strict();

export const updateTrainingGoalRequestSchema = z
  .object({
    workspaceId: uuidSchema,
    expectedVersion: z.number().int().positive(),
    title: z.string().trim().min(1).max(240).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    targetDate: localDateSchema.nullable().optional(),
    startsOn: localDateSchema.nullable().optional(),
    endsOn: localDateSchema.nullable().optional(),
  })
  .strict();

export const createTrainingPlanRequestSchema = z
  .object({
    workspaceId: uuidSchema,
    athleteId: uuidSchema,
    title: z.string().trim().min(1).max(240),
    description: z.string().trim().max(2000).optional(),
    startsOn: localDateSchema,
    endsOn: localDateSchema,
    timeZone: timeZoneSchema,
    goalIds: z.array(uuidSchema).max(50).optional(),
  })
  .strict();

export const updateTrainingPlanRequestSchema = z
  .object({
    workspaceId: uuidSchema,
    expectedVersion: z.number().int().positive(),
    title: z.string().trim().min(1).max(240).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    startsOn: localDateSchema.optional(),
    endsOn: localDateSchema.optional(),
    timeZone: timeZoneSchema.optional(),
    goalIds: z.array(uuidSchema).max(50).optional(),
    createRevision: z.boolean().optional(),
  })
  .strict();

export const createPlanPhaseRequestSchema = z
  .object({
    workspaceId: uuidSchema,
    parentPhaseId: uuidSchema.optional(),
    ordinal: z.number().int().positive(),
    name: z.string().trim().min(1).max(240),
    classification: z
      .enum(["macrocycle", "mesocycle", "microcycle", "custom"])
      .optional(),
    startsOn: localDateSchema,
    endsOn: localDateSchema,
  })
  .strict();

export const updatePlanPhaseRequestSchema = z
  .object({
    workspaceId: uuidSchema,
    expectedVersion: z.number().int().positive(),
    parentPhaseId: uuidSchema.nullable().optional(),
    ordinal: z.number().int().positive().optional(),
    name: z.string().trim().min(1).max(240).optional(),
    classification: z
      .enum(["macrocycle", "mesocycle", "microcycle", "custom"])
      .optional(),
    startsOn: localDateSchema.optional(),
    endsOn: localDateSchema.optional(),
  })
  .strict();

const strengthSetContractSchema = z
  .object({
    id: uuidSchema.optional(),
    ordinal: z.number().int().positive(),
    targetRepMin: z.number().int().nonnegative().optional(),
    targetRepMax: z.number().int().nonnegative().optional(),
    targetLoadKg: z.number().nonnegative().optional(),
    targetRpe: z.number().min(0).max(10).optional(),
    targetRpeScale: z.literal("0-10").optional(),
    targetRir: z.number().min(0).max(10).optional(),
    targetRirScale: z.literal("0-10").optional(),
    targetRestSeconds: z.number().nonnegative().optional(),
    targetDurationSeconds: z.number().nonnegative().optional(),
    targetVelocityMps: z.number().nonnegative().optional(),
    tempoDescriptor: z.string().trim().max(80).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.targetRepMin === undefined ||
      value.targetRepMax === undefined ||
      value.targetRepMin <= value.targetRepMax,
    "targetRepMin must not exceed targetRepMax",
  );

const strengthExerciseContractSchema = z
  .object({
    id: uuidSchema.optional(),
    movementId: uuidSchema,
    ordinal: z.number().int().positive(),
    notes: z.string().trim().max(2000).optional(),
    sets: z.array(strengthSetContractSchema),
  })
  .strict();

const enduranceSegmentContractSchema = z
  .object({
    id: uuidSchema.optional(),
    parentSegmentId: uuidSchema.nullable().optional(),
    ordinal: z.number().int().positive(),
    kind: z.enum(["warmup", "work", "recovery", "cooldown", "free"]),
    repeatCount: z.number().int().positive(),
    durationSeconds: z.number().nonnegative().optional(),
    distanceMeters: z.number().nonnegative().optional(),
    targetHrMin: z.number().nonnegative().optional(),
    targetHrMax: z.number().nonnegative().optional(),
    targetSpeedMpsMin: z.number().nonnegative().optional(),
    targetSpeedMpsMax: z.number().nonnegative().optional(),
    targetPowerWattsMin: z.number().nonnegative().optional(),
    targetPowerWattsMax: z.number().nonnegative().optional(),
    targetRpe: z.number().min(0).max(10).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();

const mobilityItemContractSchema = z
  .object({
    id: uuidSchema.optional(),
    movementId: uuidSchema,
    ordinal: z.number().int().positive(),
    sets: z.number().int().nonnegative().optional(),
    reps: z.number().int().nonnegative().optional(),
    holdSeconds: z.number().nonnegative().optional(),
    side: z.enum(["left", "right", "bilateral", "alternating"]).optional(),
    targetRpe: z.number().min(0).max(10).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();

export const prescriptionBlockContractSchema = z.discriminatedUnion("kind", [
  z
    .object({
      id: uuidSchema.optional(),
      kind: z.literal("strength"),
      ordinal: z.number().int().positive(),
      exercises: z.array(strengthExerciseContractSchema),
    })
    .strict(),
  z
    .object({
      id: uuidSchema.optional(),
      kind: z.literal("endurance"),
      ordinal: z.number().int().positive(),
      segments: z.array(enduranceSegmentContractSchema),
    })
    .strict(),
  z
    .object({
      id: uuidSchema.optional(),
      kind: z.literal("mobility"),
      ordinal: z.number().int().positive(),
      items: z.array(mobilityItemContractSchema),
    })
    .strict(),
  z
    .object({
      id: uuidSchema.optional(),
      kind: z.literal("generic"),
      ordinal: z.number().int().positive(),
      description: z.string().trim().min(1).max(2000),
    })
    .strict(),
]);

export const createSessionPrescriptionRequestSchema = z
  .object({
    workspaceId: uuidSchema,
    planId: uuidSchema,
    phaseId: uuidSchema.optional(),
    scheduledLocalDate: localDateSchema,
    timeZone: timeZoneSchema,
    title: z.string().trim().min(1).max(240),
    blocks: z.array(prescriptionBlockContractSchema).max(20).optional(),
  })
  .strict();

export const updateSessionPrescriptionRequestSchema = z
  .object({
    workspaceId: uuidSchema,
    expectedVersion: z.number().int().positive(),
    phaseId: uuidSchema.nullable().optional(),
    scheduledLocalDate: localDateSchema.optional(),
    timeZone: timeZoneSchema.optional(),
    title: z.string().trim().min(1).max(240).optional(),
    blocks: z.array(prescriptionBlockContractSchema).max(20).optional(),
    createRevision: z.boolean().optional(),
  })
  .strict();

export const agentProposalDecisionRequestSchema = z
  .object({
    decision: z.enum(["APPROVE", "REJECT"]),
    proposalDigest: z.string().regex(/^[0-9a-f]{64}$/),
    approvalRequestId: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export const publishTrainingPlanRequestSchema = z
  .object({
    workspaceId: uuidSchema,
    expectedVersion: z.number().int().positive(),
  })
  .strict();

export const createPlanRevisionRequestSchema = z
  .object({
    workspaceId: uuidSchema,
    expectedVersion: z.number().int().positive(),
  })
  .strict();

export const startExecutedSessionRequestSchema = z
  .object({
    workspaceId: uuidSchema,
    prescriptionId: uuidSchema.optional(),
    athleteId: uuidSchema.optional(),
    prescriptionRevision: z.number().int().positive().optional(),
    timeZone: timeZoneSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      (value.prescriptionId !== undefined && value.athleteId === undefined) ||
      (value.prescriptionId === undefined && value.athleteId !== undefined),
    "Provide either prescriptionId for planned execution or athleteId for unplanned execution.",
  );

export const recordPerformedStrengthSetRequestSchema = z
  .object({
    workspaceId: uuidSchema,
    expectedVersion: z.number().int().positive(),
    movementId: uuidSchema,
    prescriptionExerciseId: uuidSchema.optional(),
    prescriptionSetId: uuidSchema.optional(),
    observedAt: instantSchema.optional(),
    repetitions: z.number().nonnegative().optional(),
    loadKg: z.number().nonnegative().optional(),
    rpe: z.number().min(0).max(10).optional(),
    rir: z.number().min(0).max(10).optional(),
    durationSeconds: z.number().nonnegative().optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();

export const recordPerformedEnduranceSegmentRequestSchema = z
  .object({
    workspaceId: uuidSchema,
    expectedVersion: z.number().int().positive(),
    prescriptionSegmentId: uuidSchema.optional(),
    observedAt: instantSchema.optional(),
    modality: z.string().trim().max(120).optional(),
    durationSeconds: z.number().nonnegative().optional(),
    distanceMeters: z.number().nonnegative().optional(),
    averageSpeedMps: z.number().nonnegative().optional(),
    averageHeartRateBpm: z.number().nonnegative().optional(),
    averagePowerWatts: z.number().nonnegative().optional(),
    rpe: z.number().min(0).max(10).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();

export const recordPerformedMobilityItemRequestSchema = z
  .object({
    workspaceId: uuidSchema,
    expectedVersion: z.number().int().positive(),
    movementId: uuidSchema,
    prescriptionItemId: uuidSchema.optional(),
    observedAt: instantSchema.optional(),
    sets: z.number().nonnegative().optional(),
    repetitions: z.number().nonnegative().optional(),
    durationSeconds: z.number().nonnegative().optional(),
    side: z.enum(["left", "right", "bilateral", "alternating"]).optional(),
    rpe: z.number().min(0).max(10).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();

export const recordSessionObservationRequestSchema = z
  .object({
    workspaceId: uuidSchema,
    expectedVersion: z.number().int().positive(),
    observedAt: instantSchema.optional(),
    kind: z.enum(["session-rpe", "pain", "note", "other"]),
    valueText: z.string().trim().max(2000).optional(),
    valueNumber: z.number().nonnegative().optional(),
    unit: z.string().trim().max(40).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();

export const completeExecutedSessionRequestSchema = z
  .object({
    workspaceId: uuidSchema,
    expectedVersion: z.number().int().positive(),
  })
  .strict();

export const amendPerformedFactRequestSchema = z
  .object({
    workspaceId: uuidSchema,
    expectedVersion: z.number().int().positive(),
    factKind: z.enum(["strength-set", "endurance-segment", "mobility-item"]),
    factId: uuidSchema,
    reason: z.string().trim().min(1).max(2000),
    correctedFields: z
      .record(z.string().trim().min(1).max(80), z.unknown())
      .refine(
        (value) => Object.keys(value).length > 0,
        "At least one corrected field is required.",
      ),
  })
  .strict();

export const assessmentSourceClassSchema = z.enum([
  "MANUAL_ENTRY",
  "DEVICE_CAPTURE",
  "IMPORT",
  "SYSTEM_DERIVED_NEUTRAL",
]);

export const assessmentDimensionSchema = z.enum([
  "angle",
  "count",
  "energy",
  "force",
  "frequency",
  "length",
  "mass",
  "power",
  "speed",
  "temperature",
  "time",
  "volume",
]);

export const assessmentQuantitySchema = z
  .object({
    value: z.number().finite(),
    unit: z.string().trim().min(1).max(32),
    dimension: assessmentDimensionSchema,
  })
  .strict();

export const assessmentEvidenceValueSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("PRESENT"), value: assessmentQuantitySchema })
    .strict(),
  z
    .object({
      kind: z.literal("MISSING"),
      reason: z.enum([
        "NOT_RECORDED",
        "NOT_APPLICABLE",
        "INVALID",
        "EXCLUDED",
        "UNKNOWN",
      ]),
    })
    .strict(),
]);

export const evidenceLineageRequestSchema = z
  .object({
    sourceClass: assessmentSourceClassSchema,
    sourceReference: z.string().trim().max(240).nullable(),
    sourceId: uuidSchema.nullable(),
    sourceArtifactIds: z.array(uuidSchema).max(100),
    protocolRevision: z
      .object({
        protocolId: uuidSchema,
        revisionId: uuidSchema,
        revision: z.number().int().positive(),
      })
      .strict()
      .nullable(),
    origin: z.enum(["HUMAN", "DEVICE", "SYSTEM"]),
    actorId: uuidSchema.nullable(),
    capturedAt: instantSchema.nullable(),
    ingestedAt: instantSchema,
    createdAt: instantSchema,
    parentEvidenceIds: z.array(uuidSchema).max(100),
    supersedesEvidenceId: uuidSchema.nullable(),
  })
  .strict();

export const createAssessmentRequestSchema = z
  .object({
    workspaceId: uuidSchema,
    athleteId: uuidSchema,
    assessmentType: z.string().trim().min(1).max(120),
    purpose: z.string().trim().max(2000).nullable().optional(),
    occurrenceDate: localDateSchema,
    assessmentOccurredAt: instantSchema.nullable().optional(),
    timeZone: timeZoneSchema,
    protocolRevisionId: uuidSchema.nullable().optional(),
    sourceId: uuidSchema.nullable().optional(),
    sourceVersion: z.number().int().positive().nullable().optional(),
    artifactIds: z.array(uuidSchema).max(100).optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
  })
  .strict();

export const updateAssessmentRequestSchema = z
  .object({
    workspaceId: uuidSchema,
    expectedVersion: z.number().int().positive(),
    assessmentType: z.string().trim().min(1).max(120).optional(),
    purpose: z.string().trim().max(2000).nullable().optional(),
    occurrenceDate: localDateSchema.optional(),
    assessmentOccurredAt: instantSchema.nullable().optional(),
    timeZone: timeZoneSchema.optional(),
    protocolRevisionId: uuidSchema.nullable().optional(),
    sourceId: uuidSchema.nullable().optional(),
    sourceVersion: z.number().int().positive().nullable().optional(),
    artifactIds: z.array(uuidSchema).max(100).optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
    reason: z.string().trim().min(1).max(1000).optional(),
  })
  .strict();

export const createTrialRequestSchema = z
  .object({
    workspaceId: uuidSchema,
    ordinal: z.number().int().positive().optional(),
    validity: z.enum(["UNASSESSED", "VALID", "INVALID"]).optional(),
    exclusion: z.enum(["INCLUDED", "EXCLUDED"]).optional(),
    exclusionReason: z.string().trim().max(1000).nullable().optional(),
    provenance: evidenceLineageRequestSchema.optional(),
  })
  .strict();

export const updateTrialRequestSchema = z
  .object({
    workspaceId: uuidSchema,
    expectedVersion: z.number().int().positive(),
    validity: z.enum(["UNASSESSED", "VALID", "INVALID"]).optional(),
    exclusion: z.enum(["INCLUDED", "EXCLUDED"]).optional(),
    exclusionReason: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();

export const createAssessmentObservationRequestSchema = z
  .object({
    workspaceId: uuidSchema,
    trialId: uuidSchema,
    observationKey: z.string().trim().min(1).max(160),
    value: assessmentEvidenceValueSchema,
    observedAt: instantSchema.nullable().optional(),
    provenance: evidenceLineageRequestSchema.optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const amendAssessmentObservationRequestSchema = z
  .object({
    workspaceId: uuidSchema,
    value: assessmentEvidenceValueSchema,
    observedAt: instantSchema.nullable().optional(),
    reason: z.string().trim().min(1).max(1000),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const createAssessmentMetricDefinitionRequestSchema = z
  .object({
    workspaceId: uuidSchema,
    key: z.string().trim().min(1).max(160),
    revision: z.number().int().positive(),
    displayName: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).nullable().optional(),
    expectedDimension: assessmentDimensionSchema.nullable().optional(),
    methodProtocolRevisionId: uuidSchema.nullable().optional(),
    resultScope: z.enum(["ASSESSMENT", "TRIAL"]),
  })
  .strict();

export const createAssessmentResultRequestSchema = z
  .object({
    workspaceId: uuidSchema,
    trialId: uuidSchema.nullable().optional(),
    metricDefinitionId: uuidSchema,
    value: assessmentEvidenceValueSchema,
    origin: z.enum(["MANUAL", "MEASURED", "IMPORTED", "DERIVED_NEUTRAL"]),
    sourceClass: assessmentSourceClassSchema.optional(),
    methodProtocolRevisionId: uuidSchema.nullable().optional(),
    provenance: evidenceLineageRequestSchema.optional(),
    supersedesResultId: uuidSchema.nullable().optional(),
  })
  .strict();

export const createAssessmentProtocolRequestSchema = z
  .object({
    workspaceId: uuidSchema,
    key: z.string().trim().min(1).max(160),
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

export const createAssessmentProtocolRevisionRequestSchema = z
  .object({
    workspaceId: uuidSchema,
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    expectedVersion: z.number().int().positive(),
  })
  .strict();

export const createAssessmentSourceRequestSchema = z
  .object({
    workspaceId: uuidSchema,
    sourceClass: assessmentSourceClassSchema,
    label: z.string().trim().min(1).max(200),
    manufacturer: z.string().trim().max(160).nullable().optional(),
    model: z.string().trim().max(160).nullable().optional(),
    serialNumber: z.string().trim().max(160).nullable().optional(),
    firmwareVersion: z.string().trim().max(160).nullable().optional(),
    softwareVersion: z.string().trim().max(160).nullable().optional(),
    configurationMetadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const createAssessmentArtifactRequestSchema = z
  .object({
    workspaceId: uuidSchema,
    storageObjectReference: z.string().trim().min(1).max(1000),
    mediaType: z.string().trim().min(1).max(160),
    sizeBytes: z.number().int().nonnegative(),
    checksumSha256: z.string().regex(/^[0-9a-f]{64}$/u),
    originalFilename: z.string().trim().max(255).nullable().optional(),
    sourceInformation: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const monitoringFactStatusSchema = z.enum([
  "MATCHED",
  "DIFFERENT",
  "NOT_RECORDED",
  "NOT_PERFORMED",
  "UNPLANNED",
  "NOT_APPLICABLE",
]);

export const monitoringSessionStatusSchema = z.enum([
  "PRESCRIBED_NOT_STARTED",
  "PRESCRIBED_STARTED",
  "PRESCRIBED_COMPLETED",
  "PRESCRIBED_WITH_EXECUTION_DEVIATION",
  "UNPLANNED_EXECUTION",
  "ARCHIVED_OR_SUPERSEDED_CONTEXT",
]);

export const monitoringWindowQuerySchema = z
  .object({
    workspaceId: uuidSchema,
    startDate: localDateSchema,
    endDate: localDateSchema.optional(),
    timeZone: timeZoneSchema,
  })
  .strict();

export const workspaceSearchQuerySchema = z
  .object({
    workspaceId: uuidSchema,
    q: z.string().trim().max(200).default(""),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  })
  .strict();

export const monitoringProvenanceSchema = z
  .object({
    workspaceId: uuidSchema,
    prescriptionId: uuidSchema.nullable(),
    prescriptionVersion: z.number().int().positive().nullable(),
    prescriptionRevision: z.number().int().positive().nullable(),
    prescriptionSnapshotFingerprint: z.string().nullable(),
    executionId: uuidSchema.nullable(),
    performedFactId: uuidSchema.nullable(),
    sourceTimestamp: instantSchema.nullable(),
    amendmentIds: z.array(uuidSchema),
  })
  .strict();

export const amendmentProvenanceSchema = z
  .object({
    amendmentId: uuidSchema,
    factId: uuidSchema,
    factKind: z
      .enum(["strength-set", "endurance-segment", "mobility-item"])
      .nullable(),
    actorId: uuidSchema,
    reason: z.string(),
    originalValues: z.record(z.string(), z.unknown()),
    correctedFields: z.record(z.string(), z.unknown()),
    occurredAt: instantSchema,
  })
  .strict();

export const monitoringCountsSchema = z
  .object({
    prescribedStrengthSetCount: z.number().int().nonnegative(),
    performedStrengthSetCount: z.number().int().nonnegative(),
    prescribedEnduranceSegmentCount: z.number().int().nonnegative(),
    performedEnduranceSegmentCount: z.number().int().nonnegative(),
    prescribedMobilityItemCount: z.number().int().nonnegative(),
    performedMobilityItemCount: z.number().int().nonnegative(),
    amendedPerformedFactCount: z.number().int().nonnegative(),
  })
  .strict();

export const monitoringSessionSummarySchema = z
  .object({
    id: uuidSchema,
    workspaceId: uuidSchema,
    athleteId: uuidSchema,
    title: z.string(),
    scheduledLocalDate: localDateSchema.nullable(),
    classification: monitoringSessionStatusSchema,
    prescriptionId: uuidSchema.nullable(),
    executionId: uuidSchema.nullable(),
    executionStatus: z.enum(["started", "completed", "cancelled"]).nullable(),
    counts: monitoringCountsSchema,
  })
  .strict();

export const monitoringOverviewSchema = z
  .object({
    workspaceId: uuidSchema,
    athleteId: uuidSchema,
    window: z
      .object({
        kind: z.enum(["day", "week"]),
        startDate: localDateSchema,
        endDate: localDateSchema,
        timeZone: timeZoneSchema,
      })
      .strict(),
    prescribedSessionCount: z.number().int().nonnegative(),
    executedSessionCount: z.number().int().nonnegative(),
    linkedExecutedSessionCount: z.number().int().nonnegative(),
    completedSessionCount: z.number().int().nonnegative(),
    unplannedSessionCount: z.number().int().nonnegative(),
    amendedPerformedFactCount: z.number().int().nonnegative(),
    counts: monitoringCountsSchema,
    sessions: z.array(monitoringSessionSummarySchema),
  })
  .strict();
