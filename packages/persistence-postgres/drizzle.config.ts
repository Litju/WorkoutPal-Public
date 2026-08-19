import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/empty-schema.ts",
  out: "../../db/migrations/generated",
  strict: true,
  verbose: true,
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
