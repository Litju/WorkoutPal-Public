import {
  ApplicationError,
  type ApplicationErrorCode,
} from "@workoutpal/application";
import { AuthenticationRequiredError } from "@workoutpal/auth-better-auth";
import type { UUID } from "@workoutpal/shared-kernel";
import { z } from "zod";
import { getRuntime, requestId } from "./workoutpal";

export { uuidSchema } from "./contracts";

export async function parseJson<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApplicationError(
      "VALIDATION_FAILED",
      "Request body must be valid JSON.",
    );
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApplicationError(
      "VALIDATION_FAILED",
      "Request body failed validation.",
      {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
        })),
      },
    );
  }
  return parsed.data;
}

export async function requirePrincipal(request: Request) {
  const actor = await getRuntime().auth.identity.requireActor(request);
  return actor.principalId;
}

export function problemResponse(error: unknown, request: Request): Response {
  const id = requestId(request);
  const mapped = mapError(error);
  return Response.json(
    {
      type: `https://workoutpal.dev/problems/${mapped.code.toLowerCase()}`,
      title: mapped.message,
      status: mapped.status,
      code: mapped.code,
      requestId: id,
      details: mapped.details,
    },
    {
      status: mapped.status,
      headers: {
        "content-type": "application/problem+json",
        "x-request-id": id,
      },
    },
  );
}

export function response<T>(
  value: T,
  request: Request,
  status = 200,
): Response {
  return Response.json(value, {
    status,
    headers: {
      "content-type": "application/json",
      "x-request-id": requestId(request),
    },
  });
}

export function apiRequestMetadata(request: Request, principalId: string) {
  return { principalId: principalId as UUID, requestId: requestId(request) };
}

function mapError(error: unknown): {
  readonly code: ApplicationErrorCode;
  readonly status: number;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
} {
  if (error instanceof z.ZodError) {
    return {
      code: "VALIDATION_FAILED",
      status: 400,
      message: "Request failed validation.",
      details: {
        issues: error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
        })),
      },
    };
  }
  if (error instanceof AuthenticationRequiredError) {
    return {
      code: "AUTHENTICATION_REQUIRED",
      status: 401,
      message: error.message,
    };
  }
  if (error instanceof ApplicationError) {
    const statusByCode: Record<ApplicationErrorCode, number> = {
      AUTHENTICATION_REQUIRED: 401,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      RESOURCE_NOT_FOUND: 404,
      VALIDATION_FAILED: 400,
      DOMAIN_RULE_VIOLATION: 409,
      VERSION_CONFLICT: 409,
      CONCURRENCY_CONFLICT: 409,
      IDEMPOTENCY_CONFLICT: 409,
      APPROVAL_REQUIRED: 409,
      APPROVAL_EXPIRED: 409,
      PROPOSAL_DIGEST_MISMATCH: 409,
      PROPOSAL_STATE_CONFLICT: 409,
      INTERNAL_ERROR: 500,
    };
    return {
      code: error.code,
      status: statusByCode[error.code],
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    };
  }
  console.error("workoutpal.http.internal_error", error);
  return {
    code: "INTERNAL_ERROR",
    status: 500,
    message: "An internal error occurred.",
  };
}

export function queryValue(request: Request, name: string): string {
  const value = new URL(request.url).searchParams.get(name);
  if (value === null || value.trim().length === 0) {
    throw new ApplicationError("VALIDATION_FAILED", `${name} is required.`);
  }
  return value;
}

export function idempotencyKey(request: Request): string {
  const key = request.headers.get("idempotency-key")?.trim();
  if (key === undefined || key.length === 0 || key.length > 200) {
    throw new ApplicationError(
      "VALIDATION_FAILED",
      "Idempotency-Key is required for this mutation.",
    );
  }
  return key;
}
