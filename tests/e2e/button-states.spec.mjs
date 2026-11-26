import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const extensionPath = path.resolve(__dirname, "../..");
const screenshotsDir = path.resolve(__dirname, "../../screenshots");

try { mkdirSync(screenshotsDir, { recursive: true }); } catch {}

const PRO_VERSION = {
  api_version: "2.1",
  application_version: "2.1.0",
  edition: "Commercial",
  features: {
    requests: { enabled: true, file_attachments: { enabled: true, requires_authentication: true } },
    pushes: { file_attachments: { enabled: true, requires_authentication: true } },
    workspaces: { enabled: true }
  }
};

async function waitForExtension(context) {
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent("serviceworker", { timeout: 5000 });
  return sw;
}

async function seedStorage(context, extensionId, settings, instanceStatus) {
  const bgPage = await context.newPage();
  await bgPage.goto(`chrome-extension://${extensionId}/manifest.json`);
  await bgPage.evaluate(({ settings, instanceStatus }) => {
    return new Promise((resolve) => {
      chrome.storage.local.set({ settings, instanceStatus }, () => resolve());
    });
  }, { settings, instanceStatus });
  await bgPage.close();
  await new Promise(r => setTimeout(r, 150));
}

test.describe("Button and Focus States", () => {
  let context, extensionId;

  test.beforeEach(async ({}, testInfo) => {
    const userDataDir = testInfo.outputPath("user-data-dir");
    context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    const sw = await waitForExtension(context);
    extensionId = sw.url().match(/chrome-extension:\/\/([^\/]+)/)?.[1];
  });

  test.afterEach(async () => { await context?.close(); });

  test("Disabled vs enabled primary button", async () => {
    await seedStorage(context, extensionId, {
      baseUrl: "https://eu.pwpush.com",
      apiToken: "dummy_token_12345"
    }, {
      connected: true,
      instanceType: "pro",
      features: { supportsRequestsApi: "enabled" },
      versionData: PRO_VERSION
    });

    const page = await context.newPage();
    const popupUrl = `chrome-extension://${extensionId}/src/popup/popup.html`;

    await page.emulateMedia({ colorScheme: "light" });
    await page.goto(popupUrl);
    await page.waitForLoadState("networkidle");
    
    // Verify button is disabled when empty
    const pushButton = await page.locator("button.primary:has-text('Push')");
    await expect(pushButton).toBeDisabled();
    
    // Capture disabled state
    let popup = await page.locator(".popup");
    await popup.screenshot({ path: path.join(screenshotsDir, `button-disabled.png`) });
    
    // Fill in content to enable button
    await page.fill("#payload", "MySecretPassword123!");
    await page.waitForTimeout(200);
    
    // Verify button is now enabled
    await expect(pushButton).toBeEnabled();
    
    // Capture enabled state
    popup = await page.locator(".popup");
    await popup.screenshot({ path: path.join(screenshotsDir, `button-enabled.png`) });
    
    await page.close();
  });

  test("Tab focus-visible", async () => {
    await seedStorage(context, extensionId, {
      baseUrl: "https://eu.pwpush.com",
      apiToken: "dummy_token_12345"
    }, {
      connected: true,
      instanceType: "pro",
      features: { supportsRequestsApi: "enabled" },
      versionData: PRO_VERSION
    });

    const page = await context.newPage();
    const popupUrl = `chrome-extension://${extensionId}/src/popup/popup.html`;

    await page.emulateMedia({ colorScheme: "light" });
    await page.goto(popupUrl);
    await page.waitForLoadState("networkidle");
    
    // Press Tab to focus the Request tab
    await page.keyboard.press("Tab"); // Settings button
    await page.keyboard.press("Tab"); // Push tab
    await page.keyboard.press("Tab"); // Request tab
    
    await page.waitForTimeout(200);
    
    // Capture focus state
    const popup = await page.locator(".popup");
    await popup.screenshot({ path: path.join(screenshotsDir, `tab-focus-visible.png`) });
    
    // Verify focus-visible is applied
    const requestTab = await page.locator("#requestTab");
    const outline = await requestTab.evaluate((el) => {
      return window.getComputedStyle(el).outline;
    });
    
    // Should have an outline (exact value may vary, but shouldn't be 'none')
    expect(outline).not.toBe('none');
    
    await page.close();
  });
});
