import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const extensionPath = path.resolve(__dirname, "../..");
const screenshotsDir = path.resolve(__dirname, "../../screenshots");

try { mkdirSync(screenshotsDir, { recursive: true }); } catch {}

// Real OSS version response from https://oss.pwpush.com/api/v2/version
const OSS_VERSION = {
  edition: "oss",
  features: {
    anonymous_access: true,
    api_token_authentication: true,
    accounts: { enabled: false },
    pushes: {
      enabled: true,
      email_auto_dispatch: false,
      file_attachments: {
        enabled: false,
        requires_authentication: true
      },
      url_pushes: { enabled: true },
      qr_code_pushes: { enabled: true }
    },
    requests: { enabled: false }
  }
};

// Real Commercial version response from https://eu.pwpush.com/api/v2/version
const COMMERCIAL_VERSION = {
  edition: "commercial",
  features: {
    accounts: { enabled: true },
    pushes: {
      enabled: true,
      file_attachments: {
        enabled: true,
        requires_authentication: true
      }
    },
    requests: { enabled: true }
  }
};

// OSS with file attachments enabled (hypothetical but valid)
const OSS_WITH_ATTACHMENTS = {
  edition: "oss",
  features: {
    api_token_authentication: true,
    accounts: { enabled: false },
    pushes: {
      enabled: true,
      file_attachments: {
        enabled: true,
        requires_authentication: true
      }
    },
    requests: { enabled: false }
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

test.describe("Instance-Aware Copy", () => {
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

  test("OSS - no token - Push tab notice (no paid subscription mention)", async () => {
    await seedStorage(context, extensionId, {
      baseUrl: "https://oss.pwpush.com",
      apiToken: ""
    }, {
      connected: true,
      instanceType: "oss",
      features: { supportsRequestsApi: "disabled" },
      versionData: OSS_VERSION
    });

    const page = await context.newPage();
    const popupUrl = `chrome-extension://${extensionId}/src/popup/popup.html`;

    await page.emulateMedia({ colorScheme: "light" });
    await page.goto(popupUrl);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(200);
    
    // Assert: notice should be visible and NOT mention paid subscriptions
    const notice = await page.locator("#pushAuthSummaryNotice");
    await expect(notice).toBeVisible();
    
    const noticeText = await notice.textContent();
    expect(noticeText).toContain("Add an API token in Settings");
    expect(noticeText).not.toContain("paid");
    expect(noticeText).not.toContain("subscription");
    expect(noticeText).toContain("Name and Note");
    
    const popup = await page.locator(".popup");
    await popup.screenshot({ path: path.join(screenshotsDir, "oss-no-token-push-notice-light.png") });
    
    await page.close();
  });

  test("Commercial - no token - Push tab notice (mentions paid subscription)", async () => {
    await seedStorage(context, extensionId, {
      baseUrl: "https://eu.pwpush.com",
      apiToken: ""
    }, {
      connected: true,
      instanceType: "pro",
      features: { supportsRequestsApi: "enabled" },
      versionData: COMMERCIAL_VERSION
    });

    const page = await context.newPage();
    const popupUrl = `chrome-extension://${extensionId}/src/popup/popup.html`;

    await page.emulateMedia({ colorScheme: "light" });
    await page.goto(popupUrl);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(200);
    
    // Assert: notice should be visible and mention paid subscriptions
    const notice = await page.locator("#pushAuthSummaryNotice");
    await expect(notice).toBeVisible();
    
    const noticeText = await notice.textContent();
    expect(noticeText).toContain("Add an API token in Settings");
    expect(noticeText).toContain("paid subscription");
    expect(noticeText).toContain("Name and Note");
    expect(noticeText).toContain("File attachments");
    
    const popup = await page.locator(".popup");
    await popup.screenshot({ path: path.join(screenshotsDir, "commercial-no-token-push-notice-light.png") });
    
    await page.close();
  });

  test("OSS with attachments enabled - no token - Push tab notice", async () => {
    await seedStorage(context, extensionId, {
      baseUrl: "https://custom-oss.pwpush.com",
      apiToken: ""
    }, {
      connected: true,
      instanceType: "oss",
      features: { supportsRequestsApi: "disabled" },
      versionData: OSS_WITH_ATTACHMENTS
    });

    const page = await context.newPage();
    const popupUrl = `chrome-extension://${extensionId}/src/popup/popup.html`;

    await page.emulateMedia({ colorScheme: "light" });
    await page.goto(popupUrl);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(200);
    
    // Assert: notice should mention attachments but not paid subscriptions
    const notice = await page.locator("#pushAuthSummaryNotice");
    await expect(notice).toBeVisible();
    
    const noticeText = await notice.textContent();
    expect(noticeText).toContain("Name, Note and file attachments");
    expect(noticeText).not.toContain("paid");
    expect(noticeText).not.toContain("subscription");
    
    const popup = await page.locator(".popup");
    await popup.screenshot({ path: path.join(screenshotsDir, "oss-attachments-no-token-push-notice-light.png") });
    
    await page.close();
  });

  test("OSS - Request tab shows unsupported (no paid subscription mention)", async () => {
    await seedStorage(context, extensionId, {
      baseUrl: "https://oss.pwpush.com",
      apiToken: ""
    }, {
      connected: true,
      instanceType: "oss",
      features: { supportsRequestsApi: "disabled" },
      versionData: OSS_VERSION
    });

    const page = await context.newPage();
    const popupUrl = `chrome-extension://${extensionId}/src/popup/popup.html`;

    await page.emulateMedia({ colorScheme: "light" });
    await page.goto(popupUrl);
    await page.waitForLoadState("networkidle");
    await page.click("#requestTab");
    await page.waitForTimeout(200);
    
    // Assert: should show unsupported notice
    const notice = await page.locator("#requestInstanceNotSupported");
    await expect(notice).toBeVisible();
    
    const noticeText = await notice.textContent();
    expect(noticeText).toContain("not supported");
    
    await page.close();
  });
});
