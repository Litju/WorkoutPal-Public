import type { AthleteId, Instant } from "@workoutpal/shared-kernel";
import type { ScienceProvenanceRef } from "./claim.js";

export * from "./claim.js";
export * from "./derivation.js";
export * from "./processor.js";
export * from "./quality.js";
export * from "./validation.js";

export type ScienceStatus =
  | "ok"
  | "not_implemented"
  | "not_applicable"
  | "insufficient_input"
  | "invalid_input"
  | "method_unavailable"
  | "computation_failed";

export const SCIENCE_NOT_IMPLEMENTED: ScienceStatus = "not_implemented";

export type ScienceInputValue =
  | { readonly kind: "scalar"; readonly value: number; readonly unit: string }
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "reference"; readonly ref: string }
  /** Structured transport remains language-neutral; the owning capability validates its shape. */
  | {
      readonly kind: "structured";
      readonly value: Readonly<Record<string, unknown>>;
    };

export interface ScienceRequest {
  readonly requestId: string;
  readonly capabilityId: string;
  readonly capabilityVersion?: string;
  readonly subjectRef?: { readonly athleteId: AthleteId };
  readonly observedAt?: Instant;
  readonly inputs: Readonly<Record<string, ScienceInputValue>>;
  readonly inputProvenance: readonly ScienceProvenanceRef[];
}

export interface ScienceResult {
  readonly requestId: string;
  readonly capabilityId: string;
  readonly status: ScienceStatus;
  readonly method?: { readonly id: string; readonly version: string };
  readonly inputFingerprint?: string;
  readonly value?: unknown;
  readonly unit?: string | null;
  readonly dimension?: string | null;
  readonly uncertainty?: Readonly<Record<string, unknown>> | null;
  readonly assumptions?: readonly string[];
  readonly limitations?: readonly string[];
  readonly provenance?: readonly ScienceProvenanceRef[];
  readonly generatedAt: Instant;
  readonly error?: { readonly code: string; readonly message: string } | null;
}

export interface ScienceCapability {
  readonly capabilityId: string;
  readonly status: ScienceStatus;
  readonly description: string;
}

export interface SciencePort {
  capabilities(): Promise<readonly ScienceCapability[]>;
  compute(request: ScienceRequest): Promise<ScienceResult>;
}

export class NotImplementedScienceAdapter implements SciencePort {
  async capabilities(): Promise<readonly ScienceCapability[]> {
    return [
      {
        capabilityId: "foundation.science",
        status: SCIENCE_NOT_IMPLEMENTED,
        description:
          "Scientific computation is outside the F1 foundation boundary.",
      },
    ];
  }

  async compute(request: ScienceRequest): Promise<ScienceResult> {
    return {
      requestId: request.requestId,
      capabilityId: request.capabilityId,
      status: SCIENCE_NOT_IMPLEMENTED,
      generatedAt: new Date().toISOString() as Instant,
      error: {
        code: "SCIENCE_NOT_IMPLEMENTED",
        message:
          "No scientific implementation is authorized in the foundation.",
      },
    };
  }
}
