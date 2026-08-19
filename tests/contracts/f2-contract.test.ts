import { ApplicationError } from "@workoutpal/application";
import { describe, expect, it } from "vitest";
import {
  archiveAthleteRequestSchema,
  athleteProfileSchema,
  createAthleteRequestSchema,
  createWorkspaceRequestSchema,
  dataEnvelopeSchema,
  instantSchema,
  problemJsonSchema,
  updateAthleteRequestSchema,
  uuidSchema,
  workspaceSummarySchema,
} from "../../apps/studio/lib/contracts";
import {
  idempotencyKey,
  problemResponse,
  response,
} from "../../apps/studio/lib/http";

const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const athleteId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const principalId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const occurredAt = "2026-08-10T12:34:56.000Z";

describe("F2 HTTP contracts", () => {
  it("validates request shapes before application primitives", () => {
    expect(
      createWorkspaceRequestSchema.parse({ name: "  Coaching  " }),
    ).toEqual({ name: "Coaching" });
    expect(
      createAthleteRequestSchema.safeParse({
        workspaceId,
        displayName: "Unlinked athlete",
        linkedUserId: null,
      }).success,
    ).toBe(true);
    expect(
      createAthleteRequestSchema.safeParse({
        workspaceId,
        displayName: "Spoofed actor",
        actorId: principalId,
      }).success,
    ).toBe(false);
    expect(
      updateAthleteRequestSchema.safeParse({
        workspaceId,
        expectedVersion: 0,
        displayName: "Changed",
      }).success,
    ).toBe(false);
    expect(
      archiveAthleteRequestSchema.safeParse({
        workspaceId,
        expectedVersion: 2,
      }).success,
    ).toBe(true);
  });

  it("keeps UUID/time and response envelope serialization explicit", () => {
    expect(uuidSchema.parse(athleteId)).toBe(athleteId);
    expect(instantSchema.parse(occurredAt)).toBe(occurredAt);
    expect(
      dataEnvelopeSchema(workspaceSummarySchema).parse({
        data: { id: workspaceId, name: "Coaching", createdAt: occurredAt },
      }),
    ).toEqual({
      data: { id: workspaceId, name: "Coaching", createdAt: occurredAt },
    });
    expect(
      dataEnvelopeSchema(athleteProfileSchema).parse({
        data: {
          id: athleteId,
          workspaceId,
          displayName: "Athlete",
          linkedUserId: null,
          archivedAt: null,
          createdAt: occurredAt,
          createdBy: principalId,
          updatedAt: occurredAt,
          updatedBy: principalId,
          version: 1,
        },
      }).data.version,
    ).toBe(1);
  });

  it("emits problem+json and ordinary JSON with request correlation", async () => {
    const request = new Request("http://localhost/api/v1/athletes", {
      headers: { "x-request-id": "req-contract" },
    });
    const problem = problemResponse(
      new ApplicationError("VERSION_CONFLICT", "Stale athlete", {
        resourceId: athleteId,
        expectedVersion: 1,
      }),
      request,
    );
    expect(problem.status).toBe(409);
    expect(problem.headers.get("content-type")).toBe(
      "application/problem+json",
    );
    expect(problemJsonSchema.parse(await problem.json())).toMatchObject({
      code: "VERSION_CONFLICT",
      status: 409,
      requestId: "req-contract",
    });

    const ok = response({ data: { id: athleteId } }, request);
    expect(ok.headers.get("content-type")).toBe("application/json");
    expect(ok.headers.get("x-request-id")).toBe("req-contract");
  });

  it("requires and bounds the retry key at the HTTP boundary", () => {
    const request = new Request("http://localhost/api/v1/athletes", {
      headers: { "Idempotency-Key": "create-once" },
    });
    expect(idempotencyKey(request)).toBe("create-once");
    expect(() =>
      idempotencyKey(new Request("http://localhost/api/v1/athletes")),
    ).toThrow("Idempotency-Key is required");
  });
});
