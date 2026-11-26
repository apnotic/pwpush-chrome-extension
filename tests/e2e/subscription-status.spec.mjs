import path from "node:path";
import {fileURLToPath} from "node:url";
import {mkdirSync} from "node:fs";
import {chromium, expect, test} from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const extensionPath = path.resolve(__dirname, "../..");
const screenshotsDir = path.resolve(__dirname, "../../screenshots");

try {
  mkdirSync(screenshotsDir, {recursive: true});
} catch {
  // Directory already exists.
}

const OSS_ATTACHMENTS_DISABLED = {
  edition: "oss",
  api_version: "2.1",
  application_version: "2.1.0",
  features: {
    anonymous_access: true,
    api_token_authentication: true,
    pushes: {
      enabled: true,
      file_attachments: {enabled: false, requires_authentication: true},
      email_auto_dispatch: false
    },
    requests: {enabled: false}
  }
};

const OSS_ATTACHMENTS_ENABLED = {
  edition: "oss",
  api_version: "2.1",
  application_version: "2.1.0",
  features: {
    api_token_authentication: true,
    pushes: {
      enabled: true,
      file_attachments: {enabled: true, requires_authentication: true}
    },
    requests: {enabled: false}
  }
};

const COMMERCIAL_SUBSCRIBED = {
  edition: "commercial",
  api_version: "2.1",
  application_version: "1.0.0",
  subscription: {
    workspace_id: 123,
    workspace_name: "Acme",
    subscribed: true,
    plan_name: "Pro"
  },
  features: {
    api_token_authentication: true,
    pushes: {file_attachments: {enabled: true, requires_authentication: true}},
    requests: {enabled: true, file_attachments: {enabled: true, requires_authentication: true}}
  }
};

const COMMERCIAL_UNSUBSCRIBED = {
  edition: "commercial",
  api_version: "2.1",
  application_version: "1.0.0",
  subscription: {
    workspace_id: 456,
    workspace_name: "Acme",
    subscribed: false,
    plan_name: "Free"
  },
  features: {
    api_token_authentication: true,
    pushes: {
      file_attachments: {enabled: false, requires_authentication: true},
      email_auto_dispatch: false
    },
    requests: {enabled: true, file_attachments: {enabled: false}}
  }
};

const COMMERCIAL_NO_SUBSCRIPTION_KEY = {
  edition: "commercial",
  api_version: "2.0",
  application_version: "0.9.0",
  features: {
    pushes: {file_attachments: {enabled: true, requires_authentication: true}},
    requests: {enabled: true, file_attachments: {enabled: true, requires_authentication: true}}
  }
};

async function waitForExtension(context) {
  let worker = context.serviceWorkers()[0];
  if (!worker) {
    worker = await context.waitForEvent("serviceworker", {timeout: 5000});
  }
  return worker;
}

async function seedStorage(context, extensionId, settings, instanceStatus) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/manifest.json`);
  await page.evaluate(({settings, instanceStatus}) => {
    return new Promise((resolve) => {
      chrome.storage.local.set({settings, instanceStatus}, () => resolve());
    });
  }, {settings, instanceStatus});
  await page.close();
  await new Promise((resolve) => setTimeout(resolve, 150));
}

async function openPopup(context, extensionId) {
  const page = await context.newPage();
  await page.emulateMedia({colorScheme: "light"});
  await page.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(200);
  return page;
}

test.describe("Subscription status", () => {
  let context;
  let extensionId;

  test.beforeEach(async ({}, testInfo) => {
    context = await chromium.launchPersistentContext(testInfo.outputPath("user-data-dir"), {
      channel: "chromium",
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`
      ]
    });
    const worker = await waitForExtension(context);
    extensionId = worker.url().match(/chrome-extension:\/\/([^/]+)/)?.[1];
  });

  test.afterEach(async () => {
    await context?.close();
  });

  test("commercial subscribed popup shows the plan badge and attachments", async () => {
    await seedStorage(context, extensionId, {
      baseUrl: "https://eu.pwpush.com",
      apiToken: "dummy-token"
    }, {
      connected: true,
      instanceType: "pro",
      edition: "commercial",
      subscription: COMMERCIAL_SUBSCRIBED.subscription,
      features: {supportsRequestsApi: "enabled"},
      versionData: COMMERCIAL_SUBSCRIBED
    });

    const page = await openPopup(context, extensionId);
    await expect(page.locator("#pushFileSection")).toBeVisible();
    await expect(page.locator("#planNotice")).toBeHidden();
    await expect(page.locator("#planBadge")).toHaveText("Pro · Acme");
    await page.locator(".popup").screenshot({
      path: path.join(screenshotsDir, "commercial-subscribed-popup-light.png")
    });
    await page.close();
  });

  test("commercial unsubscribed popup names the workspace and hides attachments", async () => {
    await seedStorage(context, extensionId, {
      baseUrl: "https://eu.pwpush.com",
      apiToken: "dummy-token"
    }, {
      connected: true,
      instanceType: "pro",
      edition: "commercial",
      subscription: COMMERCIAL_UNSUBSCRIBED.subscription,
      features: {supportsRequestsApi: "enabled"},
      versionData: COMMERCIAL_UNSUBSCRIBED
    });

    const page = await openPopup(context, extensionId);
    await expect(page.locator("#pushFileSection")).toBeHidden();
    await expect(page.locator("#requestFileSection")).toBeHidden();
    const notice = page.locator("#planNotice");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("workspace \"Acme\"");
    await expect(notice).toContainText("paid plan");
    await expect(notice.locator("a")).toHaveAttribute("href", "https://eu.pwpush.com/billing");
    await page.locator(".popup").screenshot({
      path: path.join(screenshotsDir, "commercial-unsubscribed-popup-light.png")
    });
    await page.close();
  });

  test("missing subscription key keeps attachments available and shows no plan hint", async () => {
    await seedStorage(context, extensionId, {
      baseUrl: "https://eu.pwpush.com",
      apiToken: "dummy-token"
    }, {
      connected: true,
      instanceType: "pro",
      features: {supportsRequestsApi: "enabled"},
      versionData: COMMERCIAL_NO_SUBSCRIPTION_KEY
    });

    const page = await openPopup(context, extensionId);
    await expect(page.locator("#pushFileSection")).toBeVisible();
    await expect(page.locator("#planNotice")).toBeHidden();
    await expect(page.locator("#planBadge")).toBeHidden();
    await page.close();
  });

  test("OSS with a token and attachments disabled has no subscription wording", async () => {
    await seedStorage(context, extensionId, {
      baseUrl: "https://oss.pwpush.com",
      apiToken: "dummy-valid-token"
    }, {
      connected: true,
      instanceType: "oss",
      edition: "oss",
      features: {supportsRequestsApi: "disabled"},
      versionData: OSS_ATTACHMENTS_DISABLED
    });

    const page = await openPopup(context, extensionId);
    await expect(page.locator("#pushFileSection")).toBeHidden();
    await expect(page.locator("#requestFileSection")).toBeHidden();
    const html = await page.locator("#popupRoot").innerHTML();
    expect(html.toLowerCase()).not.toMatch(/subscription|paid/);
    await page.locator(".popup").screenshot({
      path: path.join(screenshotsDir, "oss-token-attachments-disabled-light.png")
    });
    await page.close();
  });

  test("no OSS payload produces subscription wording in the popup", async () => {
    const cases = [
      {token: "", version: OSS_ATTACHMENTS_DISABLED},
      {token: "dummy-valid-token", version: OSS_ATTACHMENTS_DISABLED},
      {token: "", version: OSS_ATTACHMENTS_ENABLED},
      {token: "dummy-valid-token", version: OSS_ATTACHMENTS_ENABLED},
      {token: "dummy-valid-token", version: {...OSS_ATTACHMENTS_DISABLED, edition: "OSS"}}
    ];

    for (const item of cases) {
      await seedStorage(context, extensionId, {
        baseUrl: "https://oss.pwpush.com",
        apiToken: item.token
      }, {
        connected: true,
        instanceType: "oss",
        edition: item.version.edition,
        features: {supportsRequestsApi: "disabled"},
        versionData: item.version
      });

      const page = await openPopup(context, extensionId);
      const html = await page.locator("#popupRoot").innerHTML();
      expect(html.toLowerCase(), JSON.stringify(item.version.edition)).not.toMatch(/subscription|paid/);
      if (item.version.features.pushes.file_attachments.enabled && item.token) {
        await expect(page.locator("#pushFileSection")).toBeVisible();
      } else {
        await expect(page.locator("#pushFileSection")).toBeHidden();
      }
      await page.close();
    }
  });

  test("options page notes a saved workspace that is no longer available", async () => {
    await seedStorage(context, extensionId, {
      baseUrl: "https://us.pwpush.com",
      presetKey: "us",
      apiToken: "dummy-token",
      rememberApiToken: true,
      selectedWorkspaceId: "999",
      availableWorkspaces: [{id: "999", name: "Old Workspace"}]
    }, {
      connected: true,
      instanceType: "pro",
      edition: "commercial",
      workspaceIdInvalid: true,
      features: {supportsWorkspacesApi: "enabled", supportsRequestsApi: "enabled"},
      versionData: COMMERCIAL_SUBSCRIBED
    });

    const page = await context.newPage();
    await page.emulateMedia({colorScheme: "light"});
    await page.setViewportSize({width: 1100, height: 900});
    await page.goto(`chrome-extension://${extensionId}/src/options/options.html`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#workspaceSectionHelp")).toContainText("no longer available");
    await page.locator("#workspaceSection").screenshot({
      path: path.join(screenshotsDir, "options-stale-workspace-light.png")
    });
    await page.close();
  });

  test("a 401 for a stale workspace_id retries once and shows the options note", async () => {
    const versionCalls = [];
    await context.route("https://us.pwpush.com/api/v2/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const authorized = Boolean(request.headers().authorization);

      if (url.pathname === "/api/v2/version") {
        versionCalls.push({
          authorized,
          workspaceId: url.searchParams.get("workspace_id")
        });
        if (!authorized) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              edition: "commercial",
              api_version: "2.1",
              application_version: "1.0.0"
            })
          });
          return;
        }
        if (url.searchParams.get("workspace_id")) {
          await route.fulfill({
            status: 401,
            contentType: "application/json",
            body: JSON.stringify({error: "not a member"})
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            edition: "commercial",
            api_version: "2.1",
            application_version: "1.0.0",
            subscription: {
              workspace_id: 5,
              workspace_name: "Default",
              subscribed: true,
              plan_name: "Pro"
            },
            features: {
              pushes: {file_attachments: {enabled: true}}
            }
          })
        });
        return;
      }

      if (url.pathname === "/api/v2/workspaces") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([{id: "5", name: "Default"}])
        });
        return;
      }

      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({})
      });
    });

    await seedStorage(context, extensionId, {
      baseUrl: "https://us.pwpush.com",
      presetKey: "us",
      apiToken: "dummy-token",
      rememberApiToken: true,
      selectedWorkspaceId: "999",
      availableWorkspaces: [{id: "999", name: "Old Workspace"}]
    }, {
      connected: false,
      features: {supportsWorkspacesApi: "unknown", supportsRequestsApi: "unknown"}
    });

    const page = await context.newPage();
    await page.emulateMedia({colorScheme: "light"});
    await page.goto(`chrome-extension://${extensionId}/src/options/options.html`);
    await page.waitForLoadState("networkidle");
    await page.click("#testConnectionButton");
    await expect(page.locator("#workspaceSectionHelp")).toContainText("no longer available", {timeout: 8000});

    const authorizedVersionCalls = versionCalls.filter((call) => call.authorized);
    expect(authorizedVersionCalls.map((call) => call.workspaceId)).toEqual(["999", null]);
    await page.close();
  });
});
