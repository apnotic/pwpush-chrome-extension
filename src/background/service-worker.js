import {detectInstance} from "../lib/instance-detection.js";
import {
  getSettings,
  saveInstanceStatus
} from "../lib/storage.js";
import {t} from "../lib/i18n.js";

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.runtime.openOptionsPage();
});

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
    token: settings.apiToken || ""
  });

  await saveInstanceStatus(status);
  return status;
}
