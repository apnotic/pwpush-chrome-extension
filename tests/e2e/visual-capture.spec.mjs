import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, test } from "@playwright/test";
import { mkdirSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const extensionPath = path.resolve(__dirname, "../..");
const screenshotsDir = path.resolve(__dirname, "../../screenshots");

try { mkdirSync(screenshotsDir, { recursive: true }); } catch {}

async function getExtensionId(context) {
  const sw = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  return sw.url().split("/")[2];
}

async function seedStorage(context, data) {
  const extensionId = await getExtensionId(context);
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
  await page.evaluate((storage) => chrome.storage.local.set(storage), data);
  await page.close();
}

test.describe("Visual States", () => {
  let context, extensionId;

  test.beforeEach(async ({}, testInfo) => {
    const userDataDir = testInfo.outputPath("user-data-dir");
    context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    extensionId = await getExtensionId(context);
  });

  test.afterEach(async () => { await context?.close(); });

  test("Push tab - no token (with consolidated notice)", async () => {
    await seedStorage(context, { serverChoice: "us", serverUrl: "https://us.pwpush.com" });
    const page = await context.newPage();
    
    for (const scheme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(500);
      const popup = await page.locator(".popup");
      await popup.screenshot({ path: path.join(screenshotsDir, `push-no-token-${scheme}.png`) });
    }
    await page.close();
  });

  test("Push tab - with token", async () => {
    await seedStorage(context, { serverChoice: "us", serverUrl: "https://us.pwpush.com", apiToken: "dummy_token" });
    const page = await context.newPage();
    
    for (const scheme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
      await page.waitForLoadState("networkidle");
      await page.fill("#payload", "MySecretPassword123!");
      await page.waitForTimeout(300);
      const popup = await page.locator(".popup");
      await popup.screenshot({ path: path.join(screenshotsDir, `push-with-token-${scheme}.png`) });
    }
    await page.close();
  });

  test("Request tab - with token", async () => {
    await seedStorage(context, { serverChoice: "us", serverUrl: "https://us.pwpush.com", apiToken: "dummy_token" });
    const page = await context.newPage();
    
    for (const scheme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
      await page.waitForLoadState("networkidle");
      await page.click("#requestTab");
      await page.waitForTimeout(300);
      const popup = await page.locator(".popup");
      await popup.screenshot({ path: path.join(screenshotsDir, `request-with-token-${scheme}.png`) });
    }
    await page.close();
  });

  test("Request tab - no token", async () => {
    await seedStorage(context, { serverChoice: "us", serverUrl: "https://us.pwpush.com" });
    const page = await context.newPage();
    
    for (const scheme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
      await page.waitForLoadState("networkidle");
      await page.click("#requestTab");
      await page.waitForTimeout(300);
      const popup = await page.locator(".popup");
      await popup.screenshot({ path: path.join(screenshotsDir, `request-no-token-${scheme}.png`) });
    }
    await page.close();
  });

  test("Request tab - unsupported instance", async () => {
    await seedStorage(context, { serverChoice: "oss", serverUrl: "https://oss.pwpush.com" });
    const page = await context.newPage();
    
    for (const scheme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
      await page.waitForLoadState("networkidle");
      await page.click("#requestTab");
      await page.waitForTimeout(300);
      const popup = await page.locator(".popup");
      await popup.screenshot({ path: path.join(screenshotsDir, `request-unsupported-${scheme}.png`) });
    }
    await page.close();
  });

  test("Options page - wide", async () => {
    const page = await context.newPage();
    
    for (const scheme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(`chrome-extension://${extensionId}/src/options/options.html`);
      await page.waitForLoadState("networkidle");
      await page.click("#hostedTabButton");
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(screenshotsDir, `options-wide-${scheme}.png`), fullPage: true });
    }
    await page.close();
  });

  test("Options page - narrow", async () => {
    const page = await context.newPage();
    await page.setViewportSize({ width: 375, height: 812 });
    
    for (const scheme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(`chrome-extension://${extensionId}/src/options/options.html`);
      await page.waitForLoadState("networkidle");
      await page.click("#hostedTabButton");
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(screenshotsDir, `options-narrow-${scheme}.png`), fullPage: true });
    }
    await page.close();
  });
});
