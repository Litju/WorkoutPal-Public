import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { chromium, type FullConfig } from "@playwright/test";

export default async function globalSetup(_config: FullConfig): Promise<void> {
  const shareUrl = process.env.VERCEL_SHARE_URL;
  if (shareUrl === undefined) return;

  const statePath = "test-results/.vercel-protection-state.json";
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(shareUrl, { waitUntil: "domcontentloaded" });
    const cookies = await context.cookies();
    if (!cookies.some((cookie) => cookie.name === "_vercel_jwt")) {
      throw new Error("The Vercel share URL did not establish _vercel_jwt.");
    }
    await mkdir(dirname(statePath), { recursive: true });
    await context.storageState({ path: statePath });
  } finally {
    await browser.close();
  }
}
