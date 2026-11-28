import {detectInstance} from "../lib/instance-detection.js";
import {
  handleContextMenuClick,
  registerContextMenus
} from "../lib/context-menu.js";
import {
  getSettings,
  saveInstanceStatus
} from "../lib/storage.js";
import {t} from "../lib/i18n.js";

registerContextMenus().catch(() => {});

chrome.runtime.onInstalled.addListener(async () => {
  await registerContextMenus();
  const settings = await getSettings();
  if (settings.baseUrl) {
    return;
  }

  await chrome.runtime.openOptionsPage();
});

if (chrome.contextMenus?.onClicked) {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    handleContextMenuClick(info, tab).catch(() => {});
  });
}

// Playwright simulates native right-clicks by calling this from the service worker.
globalThis.pwpushHandleContextMenuClick = handleContextMenuClick;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "recheckInstance") {
    return false;
  }

  recheckConfiguredInstance()
    .then((status) => sendResponse({ok: true, status}))
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : t("backgroundErrorRecheckFailed", [], "Failed to re-check server.")
      });
    });

  return true;
});

async function recheckConfiguredInstance() {
  const settings = await getSettings();
  if (!settings.baseUrl) {
    const status = await saveInstanceStatus({
      connected: false,
      error: t("backgroundNoServerConfiguredYet", [], "No server has been configured yet.")
    });
    return status;
  }

  const status = await detectInstance({
    baseUrl: settings.baseUrl,
    token: settings.apiToken || "",
    workspaceId: settings.selectedWorkspaceId || ""
  });

  await saveInstanceStatus(status);
  return status;
}
