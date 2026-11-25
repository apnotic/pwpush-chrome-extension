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

// Real API version responses
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

async function waitForExtension(context) {
  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent("serviceworker", {timeout: 5000});
  }
  return serviceWorker;
}

async function seedStorage(context, extensionId, settings, instanceStatus) {
  // Create a temporary page to seed storage before popup loads
  const bgPage = await context.newPage();
  await bgPage.goto(`chrome-extension://${extensionId}/manifest.json`);
  await bgPage.evaluate(({settings, instanceStatus}) => {
    return new Promise((resolve) => {
      chrome.storage.local.set({settings, instanceStatus}, () => resolve());
    });
  }, {settings, instanceStatus});
  await bgPage.close();
  await new Promise(r => setTimeout(r, 150));
}

async function updateStorage(page, settings) {
  await page.evaluate((settings) => {
    return new Promise((resolve) => {
      chrome.storage.local.set({settings}, () => resolve());
    });
  }, settings);
  await new Promise(r => setTimeout(r, 300));
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

async function checkActiveTab(page) {
  return await page.evaluate(() => {
    const pushTab = document.querySelector("#pushTab");
    const requestTab = document.querySelector("#requestTab");
    const pushTabStyles = window.getComputedStyle(pushTab);
    const requestTabStyles = window.getComputedStyle(requestTab);
    return {
      pushTab: {
        hasActiveClass: pushTab.classList.contains("active"),
        color: pushTabStyles.color,
        borderBottomColor: pushTabStyles.borderBottomColor
      },
      requestTab: {
        hasActiveClass: requestTab.classList.contains("active"),
        color: requestTabStyles.color,
        borderBottomColor: requestTabStyles.borderBottomColor
      }
    };
  });
}

test.describe("Empty states and file attachment gating", () => {
  test("Request tab: OSS instance - only 'not supported' notice", async ({}, testInfo) => {
    const userDataDir = testInfo.outputPath("user-data-oss");
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        "--headless=new"
      ]
    });

    const serviceWorker = await waitForExtension(context);
    const extensionId = serviceWorker.url().match(/chrome-extension:\/\/([^\/]+)/)?.[1];
    
    await seedStorage(context, extensionId, {
      baseUrl: "https://oss.pwpush.com",
      apiToken: ""
    }, {
      connected: true,
      instanceType: "oss",
      features: {supportsRequestsApi: "disabled"},
      versionData: OSS_VERSION
    });

    const page = await context.newPage();
    const popupUrl = `chrome-extension://${extensionId}/src/popup/popup.html`;
    await page.goto(popupUrl);
    await page.waitForLoadState("networkidle");
    await page.click("#requestTab");
    await page.waitForTimeout(200);

    const notSupported = await checkVisibility(page, "#requestInstanceNotSupported");
    const needsToken = await checkVisibility(page, "#requestNeedsToken");
    const formContainer = await checkVisibility(page, "#requestFormContainer");

    expect(notSupported.isHidden).toBe(false);
    expect(needsToken.isHidden).toBe(true);
    expect(formContainer.isHidden).toBe(true);

    // Check active tab styling
    const tabState = await checkActiveTab(page);
    expect(tabState.requestTab.hasActiveClass).toBe(true);

    await page.screenshot({path: path.join(ARTIFACTS_DIR, "request-oss-instance.png"), fullPage: true});
    await context.close();
  });

  test("Request tab: Pro no token - new copy with free/paid info", async ({}, testInfo) => {
    const userDataDir = testInfo.outputPath("user-data-pro-no-token");
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        "--headless=new"
      ]
    });

    const serviceWorker = await waitForExtension(context);
    const extensionId = serviceWorker.url().match(/chrome-extension:\/\/([^\/]+)/)?.[1];
    
    await seedStorage(context, extensionId, {
      baseUrl: "https://eu.pwpush.com",
      apiToken: ""
    }, {
      connected: true,
      instanceType: "pro",
      features: {supportsRequestsApi: "enabled"},
      versionData: PRO_VERSION
    });

    const page = await context.newPage();
    const popupUrl = `chrome-extension://${extensionId}/src/popup/popup.html`;
    await page.goto(popupUrl);
    await page.waitForLoadState("networkidle");
    await page.click("#requestTab");
    await page.waitForTimeout(200);

    const notSupported = await checkVisibility(page, "#requestInstanceNotSupported");
    const needsToken = await checkVisibility(page, "#requestNeedsToken");
    const formContainer = await checkVisibility(page, "#requestFormContainer");

    // Verify correct visibility
    expect(notSupported.isHidden).toBe(true); 
    expect(needsToken.isHidden).toBe(false);
    expect(formContainer.isHidden).toBe(true);

    // Check new copy contains key phrases
    const content = await page.textContent("#requestNeedsToken");
    expect(content).toContain("API token");
    expect(content).toContain("free");

    // Check active tab styling
    const tabState = await checkActiveTab(page);
    expect(tabState.requestTab.hasActiveClass).toBe(true);

    await page.screenshot({path: path.join(ARTIFACTS_DIR, "request-pro-no-token.png"), fullPage: true});
    await context.close();
  });

  test("Request tab: Pro with token - form visible, no notices", async ({}, testInfo) => {
    const userDataDir = testInfo.outputPath("user-data-pro-token");
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        "--headless=new"
      ]
    });

    const serviceWorker = await waitForExtension(context);
    const extensionId = serviceWorker.url().match(/chrome-extension:\/\/([^\/]+)/)?.[1];
    
    await seedStorage(context, extensionId, {
      baseUrl: "https://eu.pwpush.com",
      apiToken: "dummy-token-for-testing"
    }, {
      connected: true,
      instanceType: "pro",
      features: {supportsRequestsApi: "enabled"},
      versionData: PRO_VERSION
    });

    const page = await context.newPage();
    const popupUrl = `chrome-extension://${extensionId}/src/popup/popup.html`;
    await page.goto(popupUrl);
    await page.waitForLoadState("networkidle");
    await page.click("#requestTab");
    await page.waitForTimeout(200);

    const notSupported = await checkVisibility(page, "#requestInstanceNotSupported");
    const needsToken = await checkVisibility(page, "#requestNeedsToken");
    const formContainer = await checkVisibility(page, "#requestFormContainer");

    expect(notSupported.isHidden).toBe(true);
    expect(needsToken.isHidden).toBe(true);
    expect(formContainer.isHidden).toBe(false);

    // Check active tab styling
    const tabState = await checkActiveTab(page);
    expect(tabState.requestTab.hasActiveClass).toBe(true);

    await page.screenshot({path: path.join(ARTIFACTS_DIR, "request-pro-with-token.png"), fullPage: true});
    await context.close();
  });

  test("Push tab: No token - file attachment area hidden, message shown", async ({}, testInfo) => {
    const userDataDir = testInfo.outputPath("user-data-push-no-token");
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        "--headless=new"
      ]
    });

    const serviceWorker = await waitForExtension(context);
    const extensionId = serviceWorker.url().match(/chrome-extension:\/\/([^\/]+)/)?.[1];
    
    await seedStorage(context, extensionId, {
      baseUrl: "https://eu.pwpush.com",
      apiToken: ""
    }, {
      connected: true,
      instanceType: "pro",
      features: {supportsRequestsApi: "enabled"},
      versionData: PRO_VERSION
    });

    const page = await context.newPage();
    const popupUrl = `chrome-extension://${extensionId}/src/popup/popup.html`;
    await page.goto(popupUrl);
    await page.waitForLoadState("networkidle");

    // Push tab is default, no need to click
    const pushFileSection = await checkVisibility(page, "#pushFileSection");
    const pushFileAttachmentsNeedAuth = await checkVisibility(page, "#pushFileAttachmentsNeedAuth");
    const pushAuthFields = await checkVisibility(page, "#pushAuthFields");
    const pushAuthUnavailable = await checkVisibility(page, "#pushAuthFieldsUnavailable");

    // File section completely hidden
    expect(pushFileSection.isHidden).toBe(true);
    // Need auth message shown
    expect(pushFileAttachmentsNeedAuth.isHidden).toBe(false);
    // Check message content
    const fileAuthMessage = await page.textContent("#pushFileAttachmentsNeedAuth");
    expect(fileAuthMessage).toContain("authentication");
    expect(fileAuthMessage).toContain("paid subscription");

    // Also check name/note fields hidden
    expect(pushAuthFields.isHidden).toBe(true);
    expect(pushAuthUnavailable.isHidden).toBe(false);

    // Check active tab styling
    const tabState = await checkActiveTab(page);
    expect(tabState.pushTab.hasActiveClass).toBe(true);

    await page.screenshot({path: path.join(ARTIFACTS_DIR, "push-no-token.png"), fullPage: true});
    await context.close();
  });

  test("Push tab: With token - file attachment area visible", async ({}, testInfo) => {
    const userDataDir = testInfo.outputPath("user-data-push-token");
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        "--headless=new"
      ]
    });

    const serviceWorker = await waitForExtension(context);
    const extensionId = serviceWorker.url().match(/chrome-extension:\/\/([^\/]+)/)?.[1];
    
    await seedStorage(context, extensionId, {
      baseUrl: "https://eu.pwpush.com",
      apiToken: "dummy-token-push"
    }, {
      connected: true,
      instanceType: "pro",
      features: {supportsRequestsApi: "enabled"},
      versionData: PRO_VERSION
    });

    const page = await context.newPage();
    const popupUrl = `chrome-extension://${extensionId}/src/popup/popup.html`;
    await page.goto(popupUrl);
    await page.waitForLoadState("networkidle");

    const pushFileSection = await checkVisibility(page, "#pushFileSection");
    const pushFileAttachmentsNeedAuth = await checkVisibility(page, "#pushFileAttachmentsNeedAuth");
    const pushAuthFields = await checkVisibility(page, "#pushAuthFields");
    const pushAuthUnavailable = await checkVisibility(page, "#pushAuthFieldsUnavailable");

    // File section visible
    expect(pushFileSection.isHidden).toBe(false);
    // Need auth message hidden
    expect(pushFileAttachmentsNeedAuth.isHidden).toBe(true);

    // Also check name/note fields visible
    expect(pushAuthFields.isHidden).toBe(false);
    expect(pushAuthUnavailable.isHidden).toBe(true);

    // Check active tab styling
    const tabState = await checkActiveTab(page);
    expect(tabState.pushTab.hasActiveClass).toBe(true);

    await page.screenshot({path: path.join(ARTIFACTS_DIR, "push-with-token.png"), fullPage: true});
    await context.close();
  });

  test("Live switching: Push tab token changes", async ({}, testInfo) => {
    const userDataDir = testInfo.outputPath("user-data-live-push");
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        "--headless=new"
      ]
    });

    const serviceWorker = await waitForExtension(context);
    const extensionId = serviceWorker.url().match(/chrome-extension:\/\/([^\/]+)/)?.[1];
    
    await seedStorage(context, extensionId, {
      baseUrl: "https://eu.pwpush.com",
      apiToken: ""
    }, {
      connected: true,
      instanceType: "pro",
      features: {supportsRequestsApi: "enabled"},
      versionData: PRO_VERSION
    });

    const page = await context.newPage();
    const popupUrl = `chrome-extension://${extensionId}/src/popup/popup.html`;
    await page.goto(popupUrl);
    await page.waitForLoadState("networkidle");

    // Start: no token - file section hidden
    let pushFileSection = await checkVisibility(page, "#pushFileSection");
    let pushFileAttachmentsNeedAuth = await checkVisibility(page, "#pushFileAttachmentsNeedAuth");
    expect(pushFileSection.isHidden).toBe(true);
    expect(pushFileAttachmentsNeedAuth.isHidden).toBe(false);
    await page.screenshot({path: path.join(ARTIFACTS_DIR, "push-live-before-token.png"), fullPage: true});

    // Add token
    await updateStorage(page, {
      baseUrl: "https://eu.pwpush.com",
      apiToken: "dummy-token-added"
    });

    // After: file section visible
    pushFileSection = await checkVisibility(page, "#pushFileSection");
    pushFileAttachmentsNeedAuth = await checkVisibility(page, "#pushFileAttachmentsNeedAuth");
    expect(pushFileSection.isHidden).toBe(false);
    expect(pushFileAttachmentsNeedAuth.isHidden).toBe(true);
    await page.screenshot({path: path.join(ARTIFACTS_DIR, "push-live-after-token.png"), fullPage: true});

    await context.close();
  });

  test("Live switching: Request tab token changes", async ({}, testInfo) => {
    const userDataDir = testInfo.outputPath("user-data-live-request");
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        "--headless=new"
      ]
    });

    const serviceWorker = await waitForExtension(context);
    const extensionId = serviceWorker.url().match(/chrome-extension:\/\/([^\/]+)/)?.[1];
    
    await seedStorage(context, extensionId, {
      baseUrl: "https://eu.pwpush.com",
      apiToken: ""
    }, {
      connected: true,
      instanceType: "pro",
      features: {supportsRequestsApi: "enabled"},
      versionData: PRO_VERSION
    });

    const page = await context.newPage();
    const popupUrl = `chrome-extension://${extensionId}/src/popup/popup.html`;
    await page.goto(popupUrl);
    await page.waitForLoadState("networkidle");
    await page.click("#requestTab");
    await page.waitForTimeout(200);

    // Start: no token - needs-token message
    let needsToken = await checkVisibility(page, "#requestNeedsToken");
    let formContainer = await checkVisibility(page, "#requestFormContainer");
    expect(needsToken.isHidden).toBe(false);
    expect(formContainer.isHidden).toBe(true);
    await page.screenshot({path: path.join(ARTIFACTS_DIR, "request-live-before-token.png"), fullPage: true});

    // Add token
    await updateStorage(page, {
      baseUrl: "https://eu.pwpush.com",
      apiToken: "dummy-token-added"
    });

    // After: form visible
    needsToken = await checkVisibility(page, "#requestNeedsToken");
    formContainer = await checkVisibility(page, "#requestFormContainer");
    expect(needsToken.isHidden).toBe(true);
    expect(formContainer.isHidden).toBe(false);
    await page.screenshot({path: path.join(ARTIFACTS_DIR, "request-live-after-token.png"), fullPage: true});

    await context.close();
  });
});
