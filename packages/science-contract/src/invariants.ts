export function requireNonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`${label} is required.`);
  }
  return normalized;
}

export function requireUnique(values: readonly string[], label: string): void {
  if (values.some((value) => value.trim().length === 0)) {
    throw new Error(`${label} must be non-empty.`);
  }
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} must be unique.`);
  }
}

export function requireFinite(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be finite.`);
  }
  return value;
}

export function requireNonNegative(value: number, label: string): number {
  requireFinite(value, label);
  if (value < 0) {
    throw new Error(`${label} must be non-negative.`);
  }
  return value;
}

export function requirePositiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
}

export function requireFraction(value: number, label: string): number {
  requireFinite(value, label);
  if (value <= 0 || value > 1) {
    throw new Error(`${label} must be greater than 0 and at most 1.`);
  }
  return value;
}

export function requireVersionedIdentity(
  identity: { readonly id: string; readonly version: string },
  label: string,
): void {
  requireNonEmpty(identity.id, `${label} id`);
  requireNonEmpty(identity.version, `${label} version`);
}

export function requireReference(
  reference: { readonly type: string; readonly ref: string },
  label: string,
): void {
  requireNonEmpty(reference.type, `${label} type`);
  requireNonEmpty(reference.ref, `${label} reference`);
}

export function assertSoftwareProvenance(software: {
  readonly packageName: string;
  readonly packageVersion: string;
  readonly sourceRevision: string;
  readonly buildId: string;
}): void {
  requireNonEmpty(software.packageName, "Software package name");
  requireNonEmpty(software.packageVersion, "Software package version");
  requireNonEmpty(software.sourceRevision, "Software source revision");
  requireNonEmpty(software.buildId, "Software build id");
}

export function assertAssumptionDeclarations(
  assumptions: readonly {
    readonly id: string;
    readonly version: string;
    readonly description: string;
    readonly reference: { readonly type: string; readonly ref: string };
  }[],
): void {
  requireUnique(
    assumptions.map((assumption) => `${assumption.id}:${assumption.version}`),
    "Assumption identities",
  );
  for (const assumption of assumptions) {
    requireVersionedIdentity(assumption, "Assumption");
    requireNonEmpty(assumption.description, "Assumption description");
    requireReference(assumption.reference, "Assumption reference");
  }
}

export function assertConfigurationSnapshot(configuration: {
  readonly id: string;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly canonicalSerialization: string;
  readonly contentHash: string;
}): void {
  requireNonEmpty(configuration.id, "Configuration id");
  requireNonEmpty(
    configuration.canonicalSerialization,
    "Canonical configuration serialization",
  );
  requireNonEmpty(configuration.contentHash, "Configuration content hash");
  if (
    Object.values(configuration.parameters).some((value) => value === undefined)
  ) {
    throw new Error("Configuration parameters must be JSON values.");
  }
}

export function assertKeyValueDetails(
  details: readonly { readonly key: string; readonly value: string }[],
  label: string,
): void {
  requireUnique(
    details.map((detail) => detail.key),
    `${label} detail keys`,
  );
  for (const detail of details) {
    requireNonEmpty(detail.key, `${label} detail key`);
    requireNonEmpty(detail.value, `${label} detail value`);
  }
}
