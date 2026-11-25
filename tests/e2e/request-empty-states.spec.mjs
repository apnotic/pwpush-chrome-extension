import {test, expect, chromium} from "@playwright/test";
import {promises as fs} from "fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const extensionPath = path.resolve(__dirname, "../..");
const ARTIFACTS_DIR = "/opt/cursor/artifacts";

// Ensure artifacts directory exists
await fs.mkdir(ARTIFACTS_DIR, {recursive: true});

// Real API version responses (from live endpoints)
const OSS_VERSION = {
  "api_version": "2.1",
  "application_version": "2.1.0",
  "edition": "OSS",
  "features": {
    "requests": {"enabled": false},
    "pushes": {"file_attachments": {"enabled": false}},
    "workspaces": {"enabled": false}
  }
};

const PRO_VERSION = {
  "api_version": "2.1",
  "application_version": "2.1.0",
  "edition": "Commercial",
  "features": {
    "requests": {
      "enabled": true,
      "file_attachments": {
        "enabled": true,
        "requires_authentication": true
      }
    },
    "pushes": {
      "file_attachments": {
        "enabled": true,
        "requires_authentication": true
      }
    },
    "workspaces": {"enabled": true}
  }
};

async function seedStorage(page, settings, instanceStatus) {
  // Need to be on extension page to access chrome.storage
  await page.evaluate(({settings, instanceStatus}) => {
    return new Promise((resolve) => {
      chrome.storage.local.set({settings, instanceStatus}, () => resolve());
    });
  }, {settings, instanceStatus});
  await page.waitForTimeout(300);
}

async function checkVisibility(page, elementId) {
  return await page.evaluate((id) => {
    const el = document.querySelector(id);
    if (!el) return {exists: false};
    const styles = window.getComputedStyle(el);
    return {
      exists: true,
      display: styles.display,
      visibility: styles.visibility,
      isHidden: styles.display === "none"
    };
  }, elementId);
}

test.describe("Request tab empty states - visual verification", () => {
  test("Scenario 1: OSS instance - only 'not supported' notice, no form", async ({}, testInfo) => {
    const userDataDir = testInfo.outputPath("user-data-1");
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        "--headless=new"
      ]
    });

    const page = await context.newPage();
    const extensionId = context.serviceWorkers()[0]?.url().match(/chrome-extension:\/\/([^\/]+)/)?.[1];
    const popupUrl = `chrome-extension://${extensionId}/src/popup/popup.html`;

    // Load popup first so we have chrome.storage access
    await page.goto(popupUrl);
    
    await seedStorage(page, {
      baseUrl: "https://oss.pwpush.com",
      apiToken: ""
    }, {
      connected: true,
      instanceType: "oss",
      features: {supportsRequestsApi: "disabled"},
      versionData: OSS_VERSION
    });
    await page.waitForLoadState("networkidle");
    await page.click("#requestTab");
    await page.waitForTimeout(300);

    const notSupported = await checkVisibility(page, "#requestInstanceNotSupported");
    const needsToken = await checkVisibility(page, "#requestNeedsToken");
    const formContainer = await checkVisibility(page, "#requestFormContainer");

    console.log("OSS - notSupported:", notSupported);
    console.log("OSS - needsToken:", needsToken);
    console.log("OSS - formContainer:", formContainer);

    expect(notSupported.isHidden).toBe(false);
    expect(needsToken.isHidden).toBe(true);
    expect(formContainer.isHidden).toBe(true);

    await page.screenshot({path: path.join(ARTIFACTS_DIR, "request-oss-instance.png"), fullPage: true});
    await context.close();
  });

  test("Scenario 2: Pro instance, no token - only needs-token notice + button, no form [BUG SCENARIO]", async ({}, testInfo) => {
    const userDataDir = testInfo.outputPath("user-data-2");
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        "--headless=new"
      ]
    });

    const page = await context.newPage();
    const extensionId = context.serviceWorkers()[0]?.url().match(/chrome-extension:\/\/([^\/]+)/)?.[1];
    const popupUrl = `chrome-extension://${extensionId}/src/popup/popup.html`;

    await page.goto(popupUrl);
    
    await seedStorage(page, {
      baseUrl: "https://eu.pwpush.com",
      apiToken: ""
    }, {
      connected: true,
      instanceType: "pro",
      features: {supportsRequestsApi: "enabled"},
      versionData: PRO_VERSION
    });

    await page.waitForLoadState("networkidle");
    await page.click("#requestTab");
    await page.waitForTimeout(300);

    const notSupported = await checkVisibility(page, "#requestInstanceNotSupported");
    const needsToken = await checkVisibility(page, "#requestNeedsToken");
    const formContainer = await checkVisibility(page, "#requestFormContainer");

    console.log("Pro no token - notSupported:", notSupported);
    console.log("Pro no token - needsToken:", needsToken);
    console.log("Pro no token - formContainer:", formContainer);

    // THIS IS THE BUG - notSupported MUST be hidden
    expect(notSupported.isHidden).toBe(true); 
    expect(needsToken.isHidden).toBe(false);
    expect(formContainer.isHidden).toBe(true);

    await page.screenshot({path: path.join(ARTIFACTS_DIR, "request-pro-no-token.png"), fullPage: true});
    await context.close();
  });

  test("Scenario 3: Pro instance with token - form visible, no notices", async ({}, testInfo) => {
    const userDataDir = testInfo.outputPath("user-data-3");
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        "--headless=new"
      ]
    });

    const page = await context.newPage();
    const extensionId = context.serviceWorkers()[0]?.url().match(/chrome-extension:\/\/([^\/]+)/)?.[1];
    const popupUrl = `chrome-extension://${extensionId}/src/popup/popup.html`;

    await page.goto(popupUrl);
    
    await seedStorage(page, {
      baseUrl: "https://eu.pwpush.com",
      apiToken: "dummy-token-for-testing"
    }, {
      connected: true,
      instanceType: "pro",
      features: {supportsRequestsApi: "enabled"},
      versionData: PRO_VERSION
    });

    // Reload to pick up seeded storage
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.click("#requestTab");
    await page.waitForTimeout(300);

    const notSupported = await checkVisibility(page, "#requestInstanceNotSupported");
    const needsToken = await checkVisibility(page, "#requestNeedsToken");
    const formContainer = await checkVisibility(page, "#requestFormContainer");

    console.log("Pro with token - notSupported:", notSupported);
    console.log("Pro with token - needsToken:", needsToken);
    console.log("Pro with token - formContainer:", formContainer);

    expect(notSupported.isHidden).toBe(true);
    expect(needsToken.isHidden).toBe(true);
    expect(formContainer.isHidden).toBe(false);

    await page.screenshot({path: path.join(ARTIFACTS_DIR, "request-pro-with-token.png"), fullPage: true});
    await context.close();
  });

  test("Scenario 4: Live switch - no token to token", async ({}, testInfo) => {
    const userDataDir = testInfo.outputPath("user-data-4");
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        "--headless=new"
      ]
    });

    const page = await context.newPage();
    const extensionId = context.serviceWorkers()[0]?.url().match(/chrome-extension:\/\/([^\/]+)/)?.[1];
    const popupUrl = `chrome-extension://${extensionId}/src/popup/popup.html`;

    await page.goto(popupUrl);
    
    await seedStorage(page, {
      baseUrl: "https://eu.pwpush.com",
      apiToken: ""
    }, {
      connected: true,
      instanceType: "pro",
      features: {supportsRequestsApi: "enabled"},
      versionData: PRO_VERSION
    });

    await page.waitForLoadState("networkidle");
    await page.click("#requestTab");
    await page.waitForTimeout(300);

    // Before adding token
    let needsToken = await checkVisibility(page, "#requestNeedsToken");
    let formContainer = await checkVisibility(page, "#requestFormContainer");
    expect(needsToken.isHidden).toBe(false);
    expect(formContainer.isHidden).toBe(true);
    await page.screenshot({path: path.join(ARTIFACTS_DIR, "request-live-before-token.png"), fullPage: true});

    // Add token via storage
    await page.evaluate(() => {
      return new Promise((resolve) => {
        chrome.storage.local.set({
          settings: {
            baseUrl: "https://eu.pwpush.com",
            apiToken: "dummy-token-added"
          }
        }, resolve);
      });
    });
    await page.waitForTimeout(500);

    // After adding token
    needsToken = await checkVisibility(page, "#requestNeedsToken");
    formContainer = await checkVisibility(page, "#requestFormContainer");
    expect(needsToken.isHidden).toBe(true);
    expect(formContainer.isHidden).toBe(false);
    await page.screenshot({path: path.join(ARTIFACTS_DIR, "request-live-after-token.png"), fullPage: true});

    await context.close();
  });

  test("Push tab: name/note fields gated by token", async ({}, testInfo) => {
    const userDataDir = testInfo.outputPath("user-data-push");
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        "--headless=new"
      ]
    });

    const page = await context.newPage();
    const extensionId = context.serviceWorkers()[0]?.url().match(/chrome-extension:\/\/([^\/]+)/)?.[1];
    const popupUrl = `chrome-extension://${extensionId}/src/popup/popup.html`;

    await page.goto(popupUrl);
    
    await seedStorage(page, {
      baseUrl: "https://eu.pwpush.com",
      apiToken: ""
    }, {
      connected: true,
      instanceType: "pro",
      features: {supportsRequestsApi: "enabled"},
      versionData: PRO_VERSION
    });

    // Reload to pick up seeded storage
    await page.reload();
    await page.waitForLoadState("networkidle");

    const pushAuthFields = await checkVisibility(page, "#pushAuthFields");
    const pushAuthUnavailable = await checkVisibility(page, "#pushAuthFieldsUnavailable");

    console.log("Push no token - pushAuthFields:", pushAuthFields);
    console.log("Push no token - pushAuthUnavailable:", pushAuthUnavailable);

    expect(pushAuthFields.isHidden).toBe(true);
    expect(pushAuthUnavailable.isHidden).toBe(false);
    await page.screenshot({path: path.join(ARTIFACTS_DIR, "push-no-token.png"), fullPage: true});

    // Add token
    await page.evaluate(() => {
      return new Promise((resolve) => {
        chrome.storage.local.set({
          settings: {
            baseUrl: "https://eu.pwpush.com",
            apiToken: "dummy-token-push"
          }
        }, resolve);
      });
    });
    await page.waitForTimeout(500);

    const pushAuthFieldsAfter = await checkVisibility(page, "#pushAuthFields");
    const pushAuthUnavailableAfter = await checkVisibility(page, "#pushAuthFieldsUnavailable");

    console.log("Push with token - pushAuthFields:", pushAuthFieldsAfter);
    console.log("Push with token - pushAuthUnavailable:", pushAuthUnavailableAfter);

    expect(pushAuthFieldsAfter.isHidden).toBe(false);
    expect(pushAuthUnavailableAfter.isHidden).toBe(true);
    await page.screenshot({path: path.join(ARTIFACTS_DIR, "push-with-token.png"), fullPage: true});

    await context.close();
  });
});
