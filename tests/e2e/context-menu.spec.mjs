import {promises as fs} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {chromium, expect, test} from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const extensionPath = path.resolve(__dirname, "../..");
const ARTIFACTS_DIR = "/opt/cursor/artifacts";

await fs.mkdir(ARTIFACTS_DIR, {recursive: true});

const OSS_STATUS = {
  connected: true,
  instanceType: "oss",
  apiVersion: "2.1",
  features: {supportsRequestsApi: "disabled"},
  versionData: {
    api_version: "2.1",
    application_version: "2.1.0",
    edition: "OSS",
    features: {
      requests: {enabled: false},
      pushes: {file_attachments: {enabled: false}}
    }
  }
};

async function waitForExtension(context) {
  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent("serviceworker", {timeout: 8000});
  }
  return serviceWorker;
}

async function launchExtension(testInfo, dirName) {
  const userDataDir = testInfo.outputPath(dirName);
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
  const extensionId = serviceWorker.url().match(/chrome-extension:\/\/([^/]+)/)?.[1];
  return {context, serviceWorker, extensionId};
}

async function seedLocalStorage(context, extensionId, settings, instanceStatus) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/manifest.json`);
  await page.evaluate(({settings, instanceStatus}) => {
    return new Promise((resolve) => {
      chrome.storage.local.set({settings, instanceStatus}, () => resolve());
    });
  }, {settings, instanceStatus});
  await page.close();
}

async function stubServiceWorkerTestHooks(serviceWorker, {mockPushes = false} = {}) {
  await serviceWorker.evaluate(({mockPushes}) => {
    chrome.action.openPopup = async () => {
      throw new Error("openPopup disabled for Playwright context-menu tests");
    };

    if (!mockPushes || globalThis.__pwpushFetchStubbed) {
      return;
    }

    const originalFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = async (input, init = {}) => {
      const url = String(input);
      const method = String(init.method || "GET").toUpperCase();
      if (method === "POST" && url.includes("/api/v2/pushes")) {
        return new Response(JSON.stringify({
          url_token: "dummy-url-token",
          html_url: "https://oss.pwpush.com/p/dummy-url-token",
          expires_at: "2026-12-05T00:00:00.000Z",
          views_remaining: 5
        }), {
          status: 201,
          headers: {"Content-Type": "application/json"}
        });
      }
      return originalFetch(input, init);
    };
    globalThis.__pwpushFetchStubbed = true;
  }, {mockPushes});
}

async function invokeContextMenu(serviceWorker, info, tab = {id: 1, windowId: 1}, options = {}) {
  await stubServiceWorkerTestHooks(serviceWorker, options);
  return serviceWorker.evaluate(async ({info, tab}) => {
    await globalThis.pwpushHandleContextMenuClick(info, tab);
    const [stash, badgeText, badgeTitle] = await Promise.all([
      chrome.storage.session.get(["contextMenuStash"]),
      chrome.action.getBadgeText({}),
      chrome.action.getTitle({})
    ]);
    return {
      stash: stash.contextMenuStash || null,
      badgeText,
      badgeTitle
    };
  }, {info, tab});
}

async function openPopup(context, extensionId) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(250);
  return page;
}

async function openOptions(context, extensionId) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/options/options.html`);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(250);
  return page;
}

test.describe("Context menu right-click push", () => {
  test("popup prefills selected text after simulating the handler", async ({}, testInfo) => {
    const {context, serviceWorker, extensionId} = await launchExtension(testInfo, "user-data-prefill-text");
    try {
      await seedLocalStorage(context, extensionId, {
        baseUrl: "https://oss.pwpush.com",
        apiToken: "",
        instantPushSelectedText: false
      }, OSS_STATUS);

      const result = await invokeContextMenu(serviceWorker, {
        menuItemId: "pwpush-push-selected-text",
        selectionText: "dummy-selected-secret"
      });
      expect(result.stash.payload).toBe("dummy-selected-secret");
      expect(result.badgeText).toBe("1");

      const popup = await openPopup(context, extensionId);
      await expect(popup.locator("#payload")).toHaveValue("dummy-selected-secret");
      await expect(popup.locator("#selectionHint")).toContainText("right-clicked");
      await expect(popup.locator("#pushButton")).toBeEnabled();
      await popup.screenshot({
        path: path.join(ARTIFACTS_DIR, "context-menu-popup-prefill-selection.png"),
        fullPage: true
      });
      await popup.close();
    } finally {
      await context.close();
    }
  });

  test("popup prefills a right-clicked link", async ({}, testInfo) => {
    const {context, serviceWorker, extensionId} = await launchExtension(testInfo, "user-data-prefill-link");
    try {
      await seedLocalStorage(context, extensionId, {
        baseUrl: "https://oss.pwpush.com",
        apiToken: "",
        instantPushSelectedText: true
      }, OSS_STATUS);

      const result = await invokeContextMenu(serviceWorker, {
        menuItemId: "pwpush-push-this-link",
        linkUrl: "https://example.com/docs"
      });
      expect(result.stash.source).toBe("link");
      expect(result.stash.kind).toBe("prefill");

      const popup = await openPopup(context, extensionId);
      await expect(popup.locator("#payload")).toHaveValue("https://example.com/docs");
      await expect(popup.locator("#selectionHint")).toContainText("link");
      await popup.screenshot({
        path: path.join(ARTIFACTS_DIR, "context-menu-popup-prefill-link.png"),
        fullPage: true
      });
      await popup.close();
    } finally {
      await context.close();
    }
  });

  test("settings toggle is off by default and can be turned on", async ({}, testInfo) => {
    const {context, extensionId} = await launchExtension(testInfo, "user-data-settings-toggle");
    try {
      await seedLocalStorage(context, extensionId, {
        baseUrl: "https://oss.pwpush.com",
        apiToken: "",
        instantPushSelectedText: false
      }, OSS_STATUS);

      const options = await openOptions(context, extensionId);
      const checkbox = options.locator("#instantPushSelectedText");
      await expect(checkbox).toBeVisible();
      await expect(checkbox).not.toBeChecked();
      await expect(options.locator("#instantPushHelp")).toContainText("Anyone with that link");
      await options.screenshot({
        path: path.join(ARTIFACTS_DIR, "context-menu-settings-toggle-off.png"),
        fullPage: true
      });

      await checkbox.check();
      await expect(checkbox).toBeChecked();
      await expect(options.locator("#contextMenuStatus")).toContainText("saved");
      await options.screenshot({
        path: path.join(ARTIFACTS_DIR, "context-menu-settings-toggle-on.png"),
        fullPage: true
      });

      const stored = await options.evaluate(() => chrome.storage.local.get(["settings"]));
      expect(stored.settings.instantPushSelectedText).toBe(true);
      await options.close();
    } finally {
      await context.close();
    }
  });

  test("instant push success shows the result in the popup", async ({}, testInfo) => {
    const {context, serviceWorker, extensionId} = await launchExtension(testInfo, "user-data-instant-success");
    try {
      await seedLocalStorage(context, extensionId, {
        baseUrl: "https://oss.pwpush.com",
        apiToken: "",
        instantPushSelectedText: true,
        lastPushOptions: {
          expireAfterDays: 7,
          expireAfterViews: 5,
          retrievalStep: true
        }
      }, OSS_STATUS);
      const result = await invokeContextMenu(serviceWorker, {
        menuItemId: "pwpush-push-selected-text",
        selectionText: "dummy-instant-secret"
      }, {id: 1, url: "https://example.com"}, {mockPushes: true});
      expect(result.stash.kind).toBe("result");
      expect(result.stash.shareUrl).toContain("/p/dummy-url-token");

      const popup = await openPopup(context, extensionId);
      await expect(popup.locator("#resultSection")).toBeVisible();
      await expect(popup.locator("#resultLink")).toContainText("dummy-url-token");
      await expect(popup.locator("#copyLinkButton")).toBeVisible();
      await popup.screenshot({
        path: path.join(ARTIFACTS_DIR, "context-menu-instant-push-result.png"),
        fullPage: true
      });
      await popup.close();
    } finally {
      await context.close();
    }
  });

  test("badge fallback state after openPopup failure", async ({}, testInfo) => {
    const {context, serviceWorker, extensionId} = await launchExtension(testInfo, "user-data-badge-fallback");
    try {
      await seedLocalStorage(context, extensionId, {
        baseUrl: "https://oss.pwpush.com",
        apiToken: "",
        instantPushSelectedText: false
      }, OSS_STATUS);

      const result = await invokeContextMenu(serviceWorker, {
        menuItemId: "pwpush-push-selected-text",
        selectionText: "dummy-selected-secret"
      });
      expect(result.badgeText).toBe("1");
      expect(result.badgeTitle.toLowerCase()).toContain("toolbar");

      const badgePage = await context.newPage();
      await badgePage.setContent(`<!doctype html>
        <html><body style="font-family:sans-serif;padding:32px;background:#0f172a;color:#e2e8f0">
          <h1>Toolbar badge fallback</h1>
          <p>Badge text: <strong id="badgeText"></strong></p>
          <p>Badge title: <strong id="badgeTitle"></strong></p>
          <p>Stash kind: <strong id="stashKind"></strong></p>
        </body></html>`);
      await badgePage.evaluate(({badgeText, badgeTitle, kind}) => {
        document.querySelector("#badgeText").textContent = badgeText;
        document.querySelector("#badgeTitle").textContent = badgeTitle;
        document.querySelector("#stashKind").textContent = kind;
      }, {
        badgeText: result.badgeText,
        badgeTitle: result.badgeTitle,
        kind: result.stash.kind
      });
      await badgePage.screenshot({
        path: path.join(ARTIFACTS_DIR, "context-menu-badge-fallback.png"),
        fullPage: true
      });
      await badgePage.close();
    } finally {
      await context.close();
    }
  });

  test("no server configured opens Settings and surfaces an error in the popup", async ({}, testInfo) => {
    const {context, serviceWorker, extensionId} = await launchExtension(testInfo, "user-data-no-server");
    try {
      await seedLocalStorage(context, extensionId, {
        baseUrl: "",
        apiToken: "",
        instantPushSelectedText: false
      }, {connected: false, instanceType: null});

      const result = await invokeContextMenu(serviceWorker, {
        menuItemId: "pwpush-push-selected-text",
        selectionText: "dummy-selected-secret"
      });
      expect(result.stash.kind).toBe("error");
      expect(result.badgeText).toBe("!");

      const options = await openOptions(context, extensionId);
      await expect(options.locator("h2").first()).toBeVisible();
      await options.screenshot({
        path: path.join(ARTIFACTS_DIR, "context-menu-no-server-settings.png"),
        fullPage: true
      });
      await options.close();

      const popup = await openPopup(context, extensionId);
      await expect(popup.locator("#statusMessage")).toContainText("Settings");
      await popup.screenshot({
        path: path.join(ARTIFACTS_DIR, "context-menu-no-server-popup.png"),
        fullPage: true
      });
      await popup.close();
    } finally {
      await context.close();
    }
  });
});
