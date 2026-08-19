import type { IanaTimeZone, Instant, LocalDate } from "./public.js";

/** The deliberately small set of dimensions currently needed by WorkoutPal facts. */
export type Dimension =
  | "acceleration"
  | "angle"
  | "count"
  | "energy"
  | "force"
  | "frequency"
  | "impulse"
  | "length"
  | "mass"
  | "power"
  | "speed"
  | "temperature"
  | "time"
  | "torque"
  | "volume";

export interface UnitDefinition {
  readonly id: string;
  readonly dimension: Dimension;
  readonly canonicalUnit: string;
  readonly toCanonical: (value: number) => number;
  readonly fromCanonical: (value: number) => number;
}

export interface Quantity {
  readonly value: number;
  readonly unit: string;
  readonly dimension: Dimension;
}

export interface CanonicalQuantityValue {
  readonly value: number;
  readonly unit: string;
  readonly dimension: Dimension;
}

const linear = (
  id: string,
  dimension: Dimension,
  canonicalUnit: string,
  factor: number,
): UnitDefinition => ({
  id,
  dimension,
  canonicalUnit,
  toCanonical: (value) => value * factor,
  fromCanonical: (value) => value / factor,
});

const UNIT_DEFINITIONS: Readonly<Record<string, UnitDefinition>> = {
  kg: linear("kg", "mass", "kg", 1),
  g: linear("g", "mass", "kg", 0.001),
  mg: linear("mg", "mass", "kg", 0.000001),
  lb: linear("lb", "mass", "kg", 0.45359237),
  oz: linear("oz", "mass", "kg", 0.028349523125),

  m: linear("m", "length", "m", 1),
  cm: linear("cm", "length", "m", 0.01),
  mm: linear("mm", "length", "m", 0.001),
  km: linear("km", "length", "m", 1000),
  in: linear("in", "length", "m", 0.0254),
  ft: linear("ft", "length", "m", 0.3048),
  yd: linear("yd", "length", "m", 0.9144),
  mi: linear("mi", "length", "m", 1609.344),

  s: linear("s", "time", "s", 1),
  ms: linear("ms", "time", "s", 0.001),
  min: linear("min", "time", "s", 60),
  h: linear("h", "time", "s", 3600),

  "m/s": linear("m/s", "speed", "m/s", 1),
  "km/h": linear("km/h", "speed", "m/s", 1000 / 3600),
  "mi/h": linear("mi/h", "speed", "m/s", 1609.344 / 3600),
  mph: linear("mph", "speed", "m/s", 1609.344 / 3600),

  "m/s^2": linear("m/s^2", "acceleration", "m/s^2", 1),

  N: linear("N", "force", "N", 1),
  lbf: linear("lbf", "force", "N", 4.4482216152605),
  "N*s": linear("N*s", "impulse", "N*s", 1),
  "N*m": linear("N*m", "torque", "N*m", 1),
  W: linear("W", "power", "W", 1),
  kW: linear("kW", "power", "W", 1000),
  J: linear("J", "energy", "J", 1),
  kJ: linear("kJ", "energy", "J", 1000),
  kcal: linear("kcal", "energy", "J", 4184),
  Hz: linear("Hz", "frequency", "Hz", 1),
  bpm: linear("bpm", "frequency", "Hz", 1 / 60),
  count: linear("count", "count", "count", 1),
  rep: linear("rep", "count", "count", 1),
  repetitions: linear("repetitions", "count", "count", 1),
  L: linear("L", "volume", "L", 1),
  mL: linear("mL", "volume", "L", 0.001),
  deg: linear("deg", "angle", "deg", 1),
  rad: linear("rad", "angle", "deg", 180 / Math.PI),
  K: linear("K", "temperature", "K", 1),
  "°C": {
    id: "°C",
    dimension: "temperature",
    canonicalUnit: "K",
    toCanonical: (value) => value + 273.15,
    fromCanonical: (value) => value - 273.15,
  },
  "°F": {
    id: "°F",
    dimension: "temperature",
    canonicalUnit: "K",
    toCanonical: (value) => (value - 32) * (5 / 9) + 273.15,
    fromCanonical: (value) => (value - 273.15) * (9 / 5) + 32,
  },
};

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be finite.`);
  }
  return value;
}

function unitId(value: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) throw new Error("Unit is required.");
  return normalized;
}

export function getUnitDefinition(unit: string): UnitDefinition {
  const definition = UNIT_DEFINITIONS[unitId(unit)];
  if (definition === undefined) {
    throw new Error(`Unknown unit: ${unit}.`);
  }
  return definition;
}

export function listUnitDefinitions(): readonly UnitDefinition[] {
  return Object.values(UNIT_DEFINITIONS);
}

export function createQuantity(input: {
  readonly value: number;
  readonly unit: string;
  readonly dimension?: Dimension;
}): Quantity {
  const definition = getUnitDefinition(input.unit);
  finite(input.value, "Quantity value");
  if (
    input.dimension !== undefined &&
    input.dimension !== definition.dimension
  ) {
    throw new Error(
      `Unit ${definition.id} has dimension ${definition.dimension}, not ${input.dimension}.`,
    );
  }
  return {
    value: input.value,
    unit: definition.id,
    dimension: definition.dimension,
  };
}

export function canonicalizeQuantity(
  quantity: Quantity,
): CanonicalQuantityValue {
  const definition = getUnitDefinition(quantity.unit);
  if (quantity.dimension !== definition.dimension) {
    throw new Error("Quantity dimension does not match its unit.");
  }
  return {
    value: finite(
      definition.toCanonical(finite(quantity.value, "Quantity value")),
      "Canonical quantity value",
    ),
    unit: definition.canonicalUnit,
    dimension: definition.dimension,
  };
}

export function convertQuantity(
  quantity: Quantity,
  targetUnit: string,
): Quantity {
  const source = getUnitDefinition(quantity.unit);
  const target = getUnitDefinition(targetUnit);
  if (
    source.dimension !== target.dimension ||
    quantity.dimension !== source.dimension
  ) {
    throw new Error(
      `Cannot convert ${source.dimension} to ${target.dimension}.`,
    );
  }
  const canonical = source.toCanonical(
    finite(quantity.value, "Quantity value"),
  );
  return {
    value: finite(target.fromCanonical(canonical), "Converted quantity value"),
    unit: target.id,
    dimension: target.dimension,
  };
}

export function serializeQuantity(quantity: Quantity): string {
  const validated = createQuantity(quantity);
  return JSON.stringify(validated);
}

export function parseQuantity(serialized: string): Quantity {
  let value: unknown;
  try {
    value = JSON.parse(serialized) as unknown;
  } catch {
    throw new Error("Serialized quantity must be valid JSON.");
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Serialized quantity must be an object.");
  }
  const record = value as Record<string, unknown>;
  if (typeof record.value !== "number" || typeof record.unit !== "string") {
    throw new Error("Serialized quantity requires value and unit.");
  }
  return createQuantity({
    value: record.value,
    unit: record.unit,
    ...(typeof record.dimension === "string"
      ? { dimension: record.dimension as Dimension }
      : {}),
  });
}

const localDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/u;
const instantPattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/u;

function validCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = [
    31,
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return day <= (daysInMonth[month - 1] ?? 0);
}

export function parseLocalDate(value: string): LocalDate {
  const match = localDatePattern.exec(value);
  if (match === null) throw new Error("LocalDate must use YYYY-MM-DD.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!validCalendarDate(year, month, day)) {
    throw new Error("LocalDate is not a valid calendar date.");
  }
  return value as LocalDate;
}

export function serializeLocalDate(value: LocalDate): string {
  return parseLocalDate(value);
}

export function parseInstant(value: string): Instant {
  const match = instantPattern.exec(value);
  if (match === null) {
    throw new Error("Instant must be an ISO-8601 date-time with an offset.");
  }
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offset = match[7] ?? "Z";
  const offsetMatch = /^([+-])(\d{2}):(\d{2})$/u.exec(offset);
  if (
    !validCalendarDate(Number(match[1]), Number(match[2]), Number(match[3])) ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    (offsetMatch !== null &&
      (Number(offsetMatch[2]) > 23 || Number(offsetMatch[3]) > 59))
  ) {
    throw new Error("Instant is not a valid date-time.");
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Instant is invalid.");
  return date.toISOString() as Instant;
}

export function serializeInstant(value: Instant): string {
  return parseInstant(value);
}

export function parseIanaTimeZone(value: string): IanaTimeZone {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 100) {
    throw new Error("IANA timezone is required.");
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: normalized }).format();
  } catch {
    throw new Error(`Unknown IANA timezone: ${value}.`);
  }
  return normalized as IanaTimeZone;
}

export function serializeIanaTimeZone(value: IanaTimeZone): string {
  return parseIanaTimeZone(value);
}

export type MissingReason =
  | "NOT_RECORDED"
  | "NOT_APPLICABLE"
  | "INVALID"
  | "EXCLUDED"
  | "UNKNOWN";

export type Missingness = MissingReason;

export type EvidenceValue<TValue> =
  | { readonly kind: "PRESENT"; readonly value: TValue }
  | { readonly kind: "MISSING"; readonly reason: MissingReason };

export function present<TValue>(value: TValue): EvidenceValue<TValue> {
  return { kind: "PRESENT", value };
}

export function missing<TValue = never>(
  reason: MissingReason,
): EvidenceValue<TValue> {
  return { kind: "MISSING", reason };
}

export function parseEvidenceValue<TValue>(
  input: unknown,
  parseValue: (value: unknown) => TValue,
): EvidenceValue<TValue> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Evidence value must be an object.");
  }
  const record = input as Record<string, unknown>;
  if (record.kind === "MISSING") {
    if (Object.hasOwn(record, "value")) {
      throw new Error("Missing evidence cannot contain a present value.");
    }
    const reason = record.reason;
    if (
      reason !== "NOT_RECORDED" &&
      reason !== "NOT_APPLICABLE" &&
      reason !== "INVALID" &&
      reason !== "EXCLUDED" &&
      reason !== "UNKNOWN"
    ) {
      throw new Error("Evidence value has an unknown missingness reason.");
    }
    return missing(reason);
  }
  if (record.kind === "PRESENT" && Object.hasOwn(record, "value")) {
    return present(parseValue(record.value));
  }
  throw new Error("Evidence value must be PRESENT or MISSING.");
}
