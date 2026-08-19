import {
  classifyPostgresConnectionTarget,
  createPostgresConnection,
  readPostgresConnectionConfig,
} from "@workoutpal/persistence-postgres";
import { describe, expect, it } from "vitest";

describe("PSC1 PostgreSQL connection policy", () => {
  it("keeps loopback development connections explicit and unencrypted", () => {
    const config = readPostgresConnectionConfig({
      DATABASE_URL:
        "postgresql://workoutpal_runtime_login:dev-password@127.0.0.1:55432/workoutpal",
    });

    expect(config.target).toBe("LOCAL_LOOPBACK");
    expect(config.ssl).toBe(false);
    expect(config.enableChannelBinding).toBe(false);
  });

  it("requires TLS for Preview and Production remote targets", () => {
    const previewUrl =
      "postgresql://runtime:dev-password@ep-preview.example.com/workoutpal?sslmode=require";
    const productionUrl =
      "postgresql://runtime:dev-password@ep-production.example.com/workoutpal?sslmode=verify-full";

    expect(
      classifyPostgresConnectionTarget(previewUrl, { VERCEL_ENV: "preview" }),
    ).toBe("PREVIEW_REMOTE");
    expect(
      readPostgresConnectionConfig({
        DATABASE_URL: previewUrl,
        VERCEL_ENV: "preview",
      }),
    ).toMatchObject({
      target: "PREVIEW_REMOTE",
      ssl: { rejectUnauthorized: true },
      enableChannelBinding: true,
    });
    expect(
      classifyPostgresConnectionTarget(productionUrl, {
        VERCEL_ENV: "production",
      }),
    ).toBe("PRODUCTION_REMOTE");
    expect(
      classifyPostgresConnectionTarget(previewUrl, {
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
      }),
    ).toBe("PREVIEW_REMOTE");
  });

  it("rejects remote URLs without an explicit secure sslmode", () => {
    expect(() =>
      readPostgresConnectionConfig({
        DATABASE_URL:
          "postgresql://runtime:dev-password@ep-preview.example.com/workoutpal",
      }),
    ).toThrow(/sslmode=require/);
  });

  it("rejects an explicitly insecure remote adapter configuration", () => {
    expect(() =>
      createPostgresConnection({
        url: "postgresql://runtime:dev-password@ep-preview.example.com/workoutpal?sslmode=require",
        applicationName: "psc1-policy-test",
        ssl: false,
        target: "PREVIEW_REMOTE",
      }),
    ).toThrow(/cannot disable TLS/);
  });

  it("does not let caller metadata override URL target classification", () => {
    expect(() =>
      createPostgresConnection({
        url: "postgresql://runtime:dev-password@ep-preview.example.com/workoutpal?sslmode=require",
        applicationName: "psc1-policy-test",
        ssl: false,
        target: "LOCAL_LOOPBACK",
      }),
    ).toThrow(/does not match the URL classification/);
  });
});
