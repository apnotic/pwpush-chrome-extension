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

test.describe("UI Verification - Empty states, file gating, accessibility", () => {
  test("Push tab: Text label removed, aria-label present", async ({}, testInfo) => {
    const userDataDir = testInfo.outputPath("user-data-a11y");
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

    // Check that Text label is NOT present
    const hasTextLabel = await page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll('label'));
      return labels.some(label => label.textContent.trim() === 'Text');
    });
    expect(hasTextLabel).toBe(false);

    // Check that textarea has aria-label
    const textareaAriaLabel = await page.evaluate(() => {
      const textarea = document.querySelector('#payload');
      return textarea?.getAttribute('aria-label');
    });
    expect(textareaAriaLabel).toBeTruthy();
    expect(textareaAriaLabel).toBe('Text');

    // Check new tagline is present
    const tagline = await page.textContent('.subtitle');
    expect(tagline).toContain('Share secrets');
    expect(tagline).toContain('request them securely');

    await context.close();
  });

  test("Push tab: Consolidated auth notice (no token)", async ({}, testInfo) => {
    const userDataDir = testInfo.outputPath("user-data-push-notice");
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

    // Check consolidated notice is visible
    const pushAuthSummaryNotice = await checkVisibility(page, "#pushAuthSummaryNotice");
    expect(pushAuthSummaryNotice.isHidden).toBe(false);

    // Check content of consolidated notice
    const noticeContent = await page.textContent("#pushAuthSummaryNotice");
    expect(noticeContent).toContain("Name and Note");
    expect(noticeContent).toContain("File attachments");
    expect(noticeContent).toContain("paid subscription");

    // Check name/note fields are hidden
    const pushAuthFields = await checkVisibility(page, "#pushAuthFields");
    expect(pushAuthFields.isHidden).toBe(true);

    // Check file section is hidden
    const pushFileSection = await checkVisibility(page, "#pushFileSection");
    expect(pushFileSection.isHidden).toBe(true);

    await page.screenshot({path: path.join(ARTIFACTS_DIR, "push-consolidated-notice.png"), fullPage: true});
    await context.close();
  });

  test("Push tab: Notice hidden with token", async ({}, testInfo) => {
    const userDataDir = testInfo.outputPath("user-data-push-notice-hidden");
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
      apiToken: "dummy-token"
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

    // Check consolidated notice is hidden
    const pushAuthSummaryNotice = await checkVisibility(page, "#pushAuthSummaryNotice");
    expect(pushAuthSummaryNotice.isHidden).toBe(true);

    // Check name/note fields are visible
    const pushAuthFields = await checkVisibility(page, "#pushAuthFields");
    expect(pushAuthFields.isHidden).toBe(false);

    // Check file section is visible
    const pushFileSection = await checkVisibility(page, "#pushFileSection");
    expect(pushFileSection.isHidden).toBe(false);

    await page.screenshot({path: path.join(ARTIFACTS_DIR, "push-notice-hidden.png"), fullPage: true});
    await context.close();
  });

  test("Active tab styling: Push tab", async ({}, testInfo) => {
    const userDataDir = testInfo.outputPath("user-data-push-active");
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

    // Push tab should be active by default
    const tabState = await checkActiveTab(page);
    expect(tabState.pushTab.hasActiveClass).toBe(true);
    expect(tabState.requestTab.hasActiveClass).toBe(false);

    // Check computed color values (should be accent color, not text-secondary)
    console.log("Push tab active - color:", tabState.pushTab.color);
    console.log("Push tab active - borderBottomColor:", tabState.pushTab.borderBottomColor);
    console.log("Request tab inactive - color:", tabState.requestTab.color);

    await page.screenshot({path: path.join(ARTIFACTS_DIR, "push-tab-active.png"), fullPage: true});
    await context.close();
  });

  test("Active tab styling: Request tab", async ({}, testInfo) => {
    const userDataDir = testInfo.outputPath("user-data-request-active");
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
      apiToken: "dummy-token"
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

    // Request tab should be active after click
    const tabState = await checkActiveTab(page);
    expect(tabState.pushTab.hasActiveClass).toBe(false);
    expect(tabState.requestTab.hasActiveClass).toBe(true);

    // Check computed color values (should be accent color, not text-secondary)
    console.log("Request tab active - color:", tabState.requestTab.color);
    console.log("Request tab active - borderBottomColor:", tabState.requestTab.borderBottomColor);
    console.log("Push tab inactive - color:", tabState.pushTab.color);

    await page.screenshot({path: path.join(ARTIFACTS_DIR, "request-tab-active.png"), fullPage: true});
    await context.close();
  });

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

    // Start: no token - consolidated notice visible
    let pushAuthSummaryNotice = await checkVisibility(page, "#pushAuthSummaryNotice");
    let pushFileSection = await checkVisibility(page, "#pushFileSection");
    let pushAuthFields = await checkVisibility(page, "#pushAuthFields");
    expect(pushAuthSummaryNotice.isHidden).toBe(false);
    expect(pushFileSection.isHidden).toBe(true);
    expect(pushAuthFields.isHidden).toBe(true);
    await page.screenshot({path: path.join(ARTIFACTS_DIR, "push-live-before-token.png"), fullPage: true});

    // Add token
    await updateStorage(page, {
      baseUrl: "https://eu.pwpush.com",
      apiToken: "dummy-token-added"
    });

    // After: notice hidden, fields visible
    pushAuthSummaryNotice = await checkVisibility(page, "#pushAuthSummaryNotice");
    pushFileSection = await checkVisibility(page, "#pushFileSection");
    pushAuthFields = await checkVisibility(page, "#pushAuthFields");
    expect(pushAuthSummaryNotice.isHidden).toBe(true);
    expect(pushFileSection.isHidden).toBe(false);
    expect(pushAuthFields.isHidden).toBe(false);
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
