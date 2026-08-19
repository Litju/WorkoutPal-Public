import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium, type FullConfig } from "@playwright/test";

export default async function globalSetup(_config: FullConfig) {
  const shareUrl = process.env.VERCEL_SHARE_URL;
  if (shareUrl === undefined) throw new Error("VERCEL_SHARE_URL is required.");
  const statePath = path.join(
    process.cwd(),
    "test-results",
    "hosted-share-state.json",
  );
  mkdirSync(path.dirname(statePath), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(shareUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(500);
  await context.storageState({ path: statePath });
  await browser.close();
}
