import path from "node:path";
import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config";

export default defineConfig(baseConfig, {
  globalSetup: path.join(process.cwd(), "playwright.hosted.setup.ts"),
  use: {
    ...baseConfig.use,
    storageState: path.join(
      process.cwd(),
      "test-results",
      "hosted-share-state.json",
    ),
  },
  webServer: undefined,
});
