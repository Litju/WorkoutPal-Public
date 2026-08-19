export type UUID = string & { readonly __brand: "UUID" };
export type WorkspaceId = UUID & { readonly __brand: "WorkspaceId" };
export type AthleteId = UUID & { readonly __brand: "AthleteId" };
export type Instant = string & { readonly __brand: "Instant" };
export type LocalDate = string & { readonly __brand: "LocalDate" };
export type IanaTimeZone = string & { readonly __brand: "IanaTimeZone" };

export type ActorType = "HUMAN" | "AGENT" | "SYSTEM";

export interface ActorContext {
  readonly actorId: UUID;
  readonly workspaceId: WorkspaceId;
  readonly actorType: ActorType;
}

export interface WorkspaceScope {
  readonly workspaceId: WorkspaceId;
}

export interface Versioned {
  readonly version: number;
}

export interface CanonicalQuantity {
  readonly value: number;
  readonly unit: string;
  readonly dimension: string;
}

export * from "./semantics.js";

export interface CorrelationContext {
  readonly requestId: string;
  readonly traceId?: string;
  readonly causationId?: string;
}

export type Result<TValue, TError> =
  | { readonly ok: true; readonly value: TValue }
  | { readonly ok: false; readonly error: TError };
