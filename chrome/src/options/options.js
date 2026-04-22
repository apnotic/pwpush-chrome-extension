import {normalizeBaseUrl} from "../lib/api-client.js";
import {detectInstance} from "../lib/instance-detection.js";
import {
  getSettings,
  getInstanceStatus,
  saveInstanceStatus,
  saveSettings
} from "../lib/storage.js";

const PRESET_URLS = {
  oss: "https://oss.pwpush.com",
  eu: "https://eu.pwpush.com",
  us: "https://us.pwpush.com"
};

const elements = {
  customUrl: document.querySelector("#customUrl"),
  apiToken: document.querySelector("#apiToken"),
  saveButton: document.querySelector("#saveButton"),
  testConnectionButton: document.querySelector("#testConnectionButton"),
  statusMessage: document.querySelector("#statusMessage"),
  detectedServer: document.querySelector("#detectedServer"),
  instanceType: document.querySelector("#instanceType"),
  editionValue: document.querySelector("#editionValue"),
  applicationVersion: document.querySelector("#applicationVersion"),
  apiVersion: document.querySelector("#apiVersion"),
  featureAccounts: document.querySelector("#featureAccounts"),
  featureRequests: document.querySelector("#featureRequests"),
  lastChecked: document.querySelector("#lastChecked")
};

initialize().catch((error) => {
  setStatus(error.message || "Unable to initialize settings page.", "error");
});

async function initialize() {
  const settings = await getSettings();
  const status = await getInstanceStatus();

  hydrateForm(settings);
  renderStatusBlock(settings, status);

  elements.testConnectionButton.addEventListener("click", async () => {
    await testConnection(false);
  });

  elements.saveButton.addEventListener("click", async () => {
    await testConnection(true);
  });
}

function hydrateForm(settings) {
  const presetKey = settings.presetKey && PRESET_URLS[settings.presetKey] ? settings.presetKey : "custom";
  const selected = document.querySelector(`input[name="serverChoice"][value="${presetKey}"]`);
  if (selected) {
    selected.checked = true;
  }

  elements.customUrl.value = presetKey === "custom" ? settings.baseUrl : "";
  elements.apiToken.value = settings.apiToken || "";
}

async function testConnection(shouldSave) {
  setStatus("Testing connection...", "");

  try {
    const userInput = getUserSelection();
    const baseUrl = normalizeBaseUrl(userInput.baseUrl);
    await ensureHostPermission(baseUrl);

    const status = await detectInstance({
      baseUrl,
      token: userInput.apiToken
    });
    await saveInstanceStatus(status);

    if (!status.connected) {
      setStatus(status.error || "Connection failed.", "error");
      renderStatusBlock({baseUrl}, status);
      return;
    }

    if (shouldSave) {
      const savedSettings = await saveSettings({
        baseUrl,
        presetKey: userInput.presetKey,
        apiToken: userInput.apiToken
      });
      setStatus("Server saved successfully.", "success");
      renderStatusBlock(savedSettings, status);
      return;
    }

    const settings = await getSettings();
    setStatus("Connection succeeded.", "success");
    renderStatusBlock(
      {
        ...settings,
        baseUrl
      },
      status
    );
  } catch (error) {
    setStatus(error.message || "Connection failed.", "error");
  }
}

function getUserSelection() {
  const selectedChoice = document.querySelector('input[name="serverChoice"]:checked');
  if (!selectedChoice) {
    throw new Error("Select a server first.");
  }

  const apiToken = elements.apiToken.value.trim();
  const presetKey = selectedChoice.value;
  const baseUrl = presetKey === "custom" ? elements.customUrl.value.trim() : PRESET_URLS[presetKey];

  if (!baseUrl) {
    throw new Error("Provide a server URL.");
  }

  return {
    presetKey: PRESET_URLS[presetKey] ? presetKey : "custom",
    baseUrl,
    apiToken
  };
}

async function ensureHostPermission(baseUrl) {
  const originPattern = `${new URL(baseUrl).origin}/*`;
  const contains = await chrome.permissions.contains({
    origins: [originPattern]
  });

  if (contains) {
    return;
  }

  const granted = await chrome.permissions.request({
    origins: [originPattern]
  });

  if (!granted) {
    throw new Error("Host permission was denied. This extension cannot call that server.");
  }
}

function renderStatusBlock(settings, status) {
  elements.detectedServer.textContent = settings.baseUrl || "Not set";
  elements.instanceType.textContent = formatInstanceType(status.instanceType);
  elements.editionValue.textContent = status.edition || "Unknown";
  elements.applicationVersion.textContent = status.applicationVersion || "Unknown";
  elements.apiVersion.textContent = status.apiVersion || "Unknown";
  elements.featureAccounts.textContent = formatFeatureState(status.features.supportsAccountsApi);
  elements.featureRequests.textContent = formatFeatureState(status.features.supportsRequestsApi);
  elements.lastChecked.textContent = status.checkedAt ? new Date(status.checkedAt).toLocaleString() : "Never";
}

function formatInstanceType(instanceType) {
  if (instanceType === "pro") {
    return "Pro / Commercial";
  }

  if (instanceType === "oss") {
    return "Open Source";
  }

  return "Unknown";
}

function formatFeatureState(value) {
  if (value === "enabled") {
    return "Enabled";
  }

  if (value === "disabled") {
    return "Unavailable";
  }

  return "Unknown";
}

function setStatus(message, style) {
  elements.statusMessage.classList.remove("success", "error");
  if (style) {
    elements.statusMessage.classList.add(style);
  }

  elements.statusMessage.textContent = message;
}
