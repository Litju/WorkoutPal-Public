import { z } from "zod";

const routeIdentifierSchema = z.string().uuid();

const routeContextSchema = z
  .object({
    workspaceId: routeIdentifierSchema.optional(),
    athleteId: routeIdentifierSchema.optional(),
    goalId: routeIdentifierSchema.optional(),
    planId: routeIdentifierSchema.optional(),
    phaseId: routeIdentifierSchema.optional(),
    sessionId: routeIdentifierSchema.optional(),
    executionId: routeIdentifierSchema.optional(),
    assessmentId: routeIdentifierSchema.optional(),
    movementId: routeIdentifierSchema.optional(),
    reportId: routeIdentifierSchema.optional(),
  })
  .strict();

export type RouteContext = z.infer<typeof routeContextSchema>;

type RouteContextKey = keyof RouteContext;

const requiredContextBySurface: Readonly<
  Record<string, readonly RouteContextKey[]>
> = {
  "GLB-01": ["workspaceId"],
  "GLB-02": ["workspaceId"],
  "GLB-03": ["workspaceId"],
  "ATH-01": ["workspaceId"],
  "ATH-02": ["workspaceId"],
  "ATH-03": ["workspaceId", "athleteId"],
  "ATH-04": ["workspaceId", "athleteId"],
  "ATH-05": ["workspaceId", "athleteId"],
  "ATH-06": ["workspaceId", "athleteId", "goalId"],
  "HIS-01": ["workspaceId"],
  "TRN-01": ["workspaceId", "athleteId"],
  "TRN-02": ["workspaceId", "athleteId"],
  "TRN-03": ["workspaceId", "athleteId", "planId"],
  "TRN-04": ["workspaceId", "athleteId", "planId", "phaseId"],
  "TRN-05": ["workspaceId", "athleteId"],
  "TRN-06": ["workspaceId", "athleteId"],
  "TRN-07": ["workspaceId", "athleteId", "sessionId"],
  "TRN-08": ["workspaceId", "athleteId", "sessionId"],
  "TRN-09": ["workspaceId", "athleteId", "sessionId"],
  "TRN-10": ["workspaceId", "athleteId", "sessionId"],
  "TRN-11": ["workspaceId", "athleteId"],
  "TRN-12": ["workspaceId", "athleteId"],
  "EXE-01": ["workspaceId", "athleteId", "sessionId"],
  "EXE-02": ["workspaceId", "athleteId", "sessionId"],
  "EXE-03": ["workspaceId", "athleteId", "sessionId"],
  "EXE-04": ["workspaceId", "athleteId", "sessionId"],
  "EXE-05": ["workspaceId", "athleteId", "sessionId"],
  "EXE-06": ["workspaceId", "athleteId", "executionId"],
  "EXE-07": ["workspaceId", "athleteId", "executionId"],
  "MON-01": ["workspaceId", "athleteId"],
  "MON-02": ["workspaceId", "athleteId", "sessionId"],
  "MON-03": ["workspaceId", "athleteId"],
  "MON-04": ["workspaceId", "athleteId"],
  "LIB-02": ["workspaceId", "movementId"],
  "LIB-01": ["workspaceId"],
  "ASM-03": ["workspaceId", "athleteId", "assessmentId"],
  "ASM-04": ["workspaceId", "athleteId", "assessmentId"],
  "ASM-01": ["workspaceId", "athleteId"],
  "ASM-02": ["workspaceId", "athleteId"],
  "RPT-01": ["workspaceId"],
  "RPT-02": ["workspaceId"],
  "RPT-03": ["workspaceId", "reportId"],
  "SET-01": ["workspaceId"],
  "SET-02": ["workspaceId"],
  "SET-03": ["workspaceId"],
  "SET-04": ["workspaceId"],
};

export function parseRouteContext(input: unknown): RouteContext | null {
  const result = routeContextSchema.safeParse(input);
  return result.success ? result.data : null;
}

export function validateRouteContext(
  surfaceId: string,
  input: unknown,
): RouteContext | null {
  const context = parseRouteContext(input);
  if (context === null) return null;
  const requiredKeys = requiredContextBySurface[surfaceId] ?? [];
  return requiredKeys.every((key) => context[key] !== undefined)
    ? context
    : null;
}

export type RouteSelection<T> =
  | { readonly kind: "requested"; readonly value: T }
  | { readonly kind: "default"; readonly value: T }
  | { readonly kind: "missing"; readonly requestedId: string };

export function selectRouteEntity<T extends { readonly id: string }>(
  entities: readonly T[],
  requestedId: string | undefined,
): RouteSelection<T> | null {
  if (requestedId === undefined) {
    const first = entities[0];
    return first === undefined ? null : { kind: "default", value: first };
  }
  const requested = entities.find((entity) => entity.id === requestedId);
  return requested === undefined
    ? { kind: "missing", requestedId }
    : { kind: "requested", value: requested };
}
