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

const OSS_VERSION = {
  api_version: "2.1",
  application_version: "2.1.0",
  edition: "OSS",
  features: {
    requests: { enabled: false },
    pushes: { file_attachments: { enabled: false } },
    workspaces: { enabled: false }
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

test.describe("Visual States", () => {
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

  test("Push tab - no token (with consolidated notice)", async () => {
    await seedStorage(context, extensionId, {
      baseUrl: "https://eu.pwpush.com",
      apiToken: ""
    }, {
      connected: true,
      instanceType: "pro",
      features: { supportsRequestsApi: "enabled" },
      versionData: PRO_VERSION
    });

    const page = await context.newPage();
    const popupUrl = `chrome-extension://${extensionId}/src/popup/popup.html`;

    for (const scheme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(popupUrl);
      await page.waitForLoadState("networkidle");
      
      // Assert: notice should be visible, Name/Note should be hidden
      const notice = await page.locator("#pushAuthSummaryNotice");
      await expect(notice).toBeVisible();
      await expect(page.locator("#pushName")).toBeHidden();
      
      const popup = await page.locator(".popup");
      await popup.screenshot({ path: path.join(screenshotsDir, `push-no-token-${scheme}.png`) });
    }
    await page.close();
  });

  test("Push tab - with token (Name/Note visible, no notice)", async () => {
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

    for (const scheme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(popupUrl);
      await page.waitForLoadState("networkidle");
      
      // Assert: notice should be hidden, Name/Note should be visible
      const notice = await page.locator("#pushAuthSummaryNotice");
      await expect(notice).toBeHidden();
      await expect(page.locator("#pushName")).toBeVisible();
      
      await page.fill("#payload", "MySecretPassword123!");
      await page.fill("#pushName", "Database Password");
      await page.waitForTimeout(200);
      
      const popup = await page.locator(".popup");
      await popup.screenshot({ path: path.join(screenshotsDir, `push-with-token-${scheme}.png`) });
    }
    await page.close();
  });

  test("Request tab - with token (form visible)", async () => {
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

    for (const scheme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(popupUrl);
      await page.waitForLoadState("networkidle");
      await page.click("#requestTab");
      await page.waitForTimeout(200);
      
      // Assert: request form should be visible
      await expect(page.locator("#requestFormContainer")).toBeVisible();
      await expect(page.locator("#requestNeedsToken")).toBeHidden();
      
      const popup = await page.locator(".popup");
      await popup.screenshot({ path: path.join(screenshotsDir, `request-with-token-${scheme}.png`) });
    }
    await page.close();
  });

  test("Request tab - no token (Add API Token button)", async () => {
    await seedStorage(context, extensionId, {
      baseUrl: "https://eu.pwpush.com",
      apiToken: ""
    }, {
      connected: true,
      instanceType: "pro",
      features: { supportsRequestsApi: "enabled" },
      versionData: PRO_VERSION
    });

    const page = await context.newPage();
    const popupUrl = `chrome-extension://${extensionId}/src/popup/popup.html`;

    for (const scheme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(popupUrl);
      await page.waitForLoadState("networkidle");
      await page.click("#requestTab");
      await page.waitForTimeout(200);
      
      // Assert: needs-token notice should be visible with specific text
      const notice = await page.locator("#requestNeedsToken");
      await expect(notice).toBeVisible();
      await expect(notice).toContainText("Requests require an API token");
      await expect(page.locator("#requestFormContainer")).toBeHidden();
      
      const popup = await page.locator(".popup");
      await popup.screenshot({ path: path.join(screenshotsDir, `request-no-token-${scheme}.png`) });
    }
    await page.close();
  });

  test("Request tab - unsupported instance", async () => {
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

    for (const scheme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(popupUrl);
      await page.waitForLoadState("networkidle");
      await page.click("#requestTab");
      await page.waitForTimeout(200);
      
      // Assert: not-supported notice should be visible
      const notice = await page.locator("#requestInstanceNotSupported");
      await expect(notice).toBeVisible();
      await expect(notice).toContainText("not supported");
      await expect(page.locator("#requestFormContainer")).toBeHidden();
      
      const popup = await page.locator(".popup");
      await popup.screenshot({ path: path.join(screenshotsDir, `request-unsupported-${scheme}.png`) });
    }
    await page.close();
  });

  test("Result state - successful push with link", async () => {
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

    for (const scheme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(popupUrl);
      await page.waitForLoadState("networkidle");
      
      // Directly inject result state into the UI
      await page.evaluate(() => {
        const resultSection = document.querySelector("#resultSection");
        const resultLink = document.querySelector("#resultLink");
        const resultMeta = document.querySelector("#resultMeta");
        
        resultSection.classList.remove("hidden");
        resultLink.innerHTML = '<a href="https://eu.pwpush.com/p/abc123def" target="_blank" rel="noopener noreferrer">https://eu.pwpush.com/p/abc123def</a>';
        resultMeta.textContent = "Expires in 7 days or 5 views";
        
        // Also show the action buttons if they exist
        const copyBtn = document.querySelector("#copyLatestBtn");
        const qrBtn = document.querySelector("#qrLatestBtn");
        if (copyBtn) copyBtn.classList.remove("hidden");
        if (qrBtn) qrBtn.classList.remove("hidden");
      });
      
      await page.waitForTimeout(300);
      
      // Assert: result link visible
      const resultLink = await page.locator("#resultLink");
      await expect(resultLink).toBeVisible();
      await expect(resultLink).toContainText("https://eu.pwpush.com/p/");
      
      const popup = await page.locator(".popup");
      await popup.screenshot({ path: path.join(screenshotsDir, `result-success-${scheme}.png`) });
    }
    await page.close();
  });

  test("Error state - API failure", async () => {
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

    for (const scheme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(popupUrl);
      await page.waitForLoadState("networkidle");
      
      await page.fill("#payload", "MySecretPassword123!");
      
      // Inject error state into the UI
      await page.evaluate(() => {
        const errorEl = document.createElement("div");
        errorEl.className = "notice error";
        errorEl.style.cssText = "margin-top: 1rem; padding: 0.75rem; background: oklch(0.95 0.02 30); border: 1px solid oklch(0.7 0.15 30); border-radius: 6px; color: oklch(0.4 0.12 30);";
        errorEl.innerHTML = "<strong>Error:</strong> Failed to create push. The server returned an error. Please try again.";
        
        const pushButton = document.querySelector("#pushButton");
        pushButton.parentElement.insertAdjacentElement("afterend", errorEl);
      });
      
      await page.waitForTimeout(200);
      
      const popup = await page.locator(".popup");
      await popup.screenshot({ path: path.join(screenshotsDir, `error-state-${scheme}.png`) });
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
      
      // Assert: two columns should be visible
      await expect(page.locator(".column-left")).toBeVisible();
      await expect(page.locator(".column-right")).toBeVisible();
      
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
