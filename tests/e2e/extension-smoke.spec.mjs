import path from "node:path";
import {fileURLToPath} from "node:url";
import {chromium, expect, test} from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const extensionPath = path.resolve(__dirname, "../..");

test("loads extension service worker", async ({}, testInfo) => {
  const userDataDir = testInfo.outputPath("user-data-dir");
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chromium",
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  try {
    const serviceWorker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    expect(serviceWorker.url()).toContain("chrome-extension://");
  } finally {
    await context.close();
  }
});
