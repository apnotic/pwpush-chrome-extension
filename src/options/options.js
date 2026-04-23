import {listAccounts, normalizeBaseUrl} from "../lib/api-client.js";
import {detectInstance} from "../lib/instance-detection.js";
import {
  clearAllExtensionState,
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
const HOSTED_PRO_PRESETS = ["us", "eu"];

const elements = {
  selfHostedTabButton: document.querySelector("#selfHostedTabButton"),
  hostedTabButton: document.querySelector("#hostedTabButton"),
  selfHostedPanel: document.querySelector("#selfHostedPanel"),
  hostedPanel: document.querySelector("#hostedPanel"),
  configuredBadge: document.querySelector("#configuredBadge"),
  customUrl: document.querySelector("#customUrl"),
  apiToken: document.querySelector("#apiToken"),
  rememberApiToken: document.querySelector("#rememberApiToken"),
  saveButton: document.querySelector("#saveButton"),
  testConnectionButton: document.querySelector("#testConnectionButton"),
  clearSettingsButton: document.querySelector("#clearSettingsButton"),
  statusMessage: document.querySelector("#statusMessage"),
  hostedLegalLinks: document.querySelector("#hostedLegalLinks"),
  privacyPolicyLink: document.querySelector("#privacyPolicyLink"),
  termsOfServiceLink: document.querySelector("#termsOfServiceLink"),
  selfHostedPolicyNote: document.querySelector("#selfHostedPolicyNote"),
  accountSection: document.querySelector("#accountSection"),
  accountSectionHelp: document.querySelector("#accountSectionHelp"),
  accountSelect: document.querySelector("#accountSelect"),
  detectedServer: document.querySelector("#detectedServer"),
  instanceType: document.querySelector("#instanceType"),
  editionValue: document.querySelector("#editionValue"),
  applicationVersion: document.querySelector("#applicationVersion"),
  apiVersion: document.querySelector("#apiVersion"),
  featurePushes: document.querySelector("#featurePushes"),
  featureAccounts: document.querySelector("#featureAccounts"),
  featureRequests: document.querySelector("#featureRequests"),
  lastChecked: document.querySelector("#lastChecked"),
  serverChoices: Array.from(document.querySelectorAll('input[name="serverChoice"]'))
};

initialize().catch((error) => {
  setStatus(error.message || "Unable to initialize settings page.", "error");
});

async function initialize() {
  const settings = await getSettings();
  const status = await getInstanceStatus();

  hydrateForm(settings);
  updateServerSelectionUi();
  renderStatusBlock(settings, status);
  renderAccountSection(settings, status);

  elements.testConnectionButton.addEventListener("click", async () => {
    await testConnection(false);
  });

  elements.saveButton.addEventListener("click", async () => {
    await testConnection(true);
  });

  elements.clearSettingsButton.addEventListener("click", async () => {
    const confirmed = window.confirm("Clear this configuration and reset detected instance data?");
    if (!confirmed) {
      return;
    }

    await clearAllExtensionState();
    const settings = await getSettings();
    const status = await getInstanceStatus();
    hydrateForm(settings);
    updateServerSelectionUi();
    renderStatusBlock(settings, status);
    renderAccountSection(settings, status);
    setStatus("Configuration cleared.", "success");
  });

  elements.serverChoices.forEach((choice) => {
    choice.addEventListener("change", () => {
      updateServerSelectionUi();
    });
  });

  elements.selfHostedTabButton.addEventListener("click", () => {
    switchServerTab("selfHosted", true);
  });

  elements.hostedTabButton.addEventListener("click", () => {
    switchServerTab("hosted", true);
  });

  elements.accountSelect.addEventListener("change", () => {
    if (elements.accountSelect.value) {
      elements.accountSectionHelp.textContent = "Selected account will be used for future Pro API requests.";
    }
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
  elements.rememberApiToken.checked = settings.rememberApiToken !== false;
  renderAccountOptions(settings.availableAccounts || [], settings.selectedAccountId);
}

function updateServerSelectionUi() {
  const selectedChoice = document.querySelector('input[name="serverChoice"]:checked');
  const presetKey = selectedChoice ? selectedChoice.value : "custom";
  const isHosted = Boolean(PRESET_URLS[presetKey]);
  const isSelfHosted = presetKey === "custom";

  switchServerTab(isSelfHosted ? "selfHosted" : "hosted", false);

  elements.customUrl.disabled = presetKey !== "custom";
  if (presetKey !== "custom") {
    elements.customUrl.value = "";
  }

  elements.hostedLegalLinks.classList.toggle("hidden", !isHosted);
  elements.selfHostedPolicyNote.classList.toggle("hidden", isHosted);
  elements.accountSection.classList.toggle("hidden", !isHostedProPreset(presetKey));

  if (isHosted) {
    const host = PRESET_URLS[presetKey];
    elements.privacyPolicyLink.href = `${host}/privacy`;
    elements.termsOfServiceLink.href = `${host}/terms`;
  } else {
    elements.privacyPolicyLink.href = "#";
    elements.termsOfServiceLink.href = "#";
  }
}

function switchServerTab(tabName, syncSelection) {
  const isSelfHosted = tabName === "selfHosted";

  elements.selfHostedTabButton.classList.toggle("active", isSelfHosted);
  elements.hostedTabButton.classList.toggle("active", !isSelfHosted);
  elements.selfHostedPanel.classList.toggle("hidden", !isSelfHosted);
  elements.hostedPanel.classList.toggle("hidden", isSelfHosted);

  if (!syncSelection) {
    return;
  }

  if (isSelfHosted) {
    const customChoice = document.querySelector('input[name="serverChoice"][value="custom"]');
    if (customChoice) {
      customChoice.checked = true;
    }
    elements.hostedLegalLinks.classList.add("hidden");
    elements.selfHostedPolicyNote.classList.remove("hidden");
    elements.customUrl.disabled = false;
  } else {
    const selectedChoice = document.querySelector('input[name="serverChoice"]:checked');
    if (!selectedChoice || selectedChoice.value === "custom") {
      const preferredHostedChoice = document.querySelector('input[name="serverChoice"][value="us"]')
        || document.querySelector('input[name="serverChoice"][value="eu"]')
        || document.querySelector('input[name="serverChoice"][value="oss"]');
      if (preferredHostedChoice) {
        preferredHostedChoice.checked = true;
      }
    }
    elements.selfHostedPolicyNote.classList.add("hidden");
  }

  updateServerSelectionUi();
}

async function testConnection(shouldSave) {
  setStatus("Testing connection...", "");

  try {
    const userInput = getUserSelection();
    const existingSettings = await getSettings();
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
      renderAccountSection(existingSettings, status);
      return;
    }

    const minimumOssVersion = "2.5.0";
    if (status.instanceType === "oss" && !isVersionAtLeast(status.applicationVersion, minimumOssVersion)) {
      const detectedVersion = status.applicationVersion || "unknown";
      setStatus(
        `This extension supports OSS Password Pusher ${minimumOssVersion} and newer. Detected version: ${detectedVersion}. Please upgrade your OSS instance and try again.`,
        "error"
      );
      renderStatusBlock({baseUrl, apiToken: userInput.apiToken}, status);
      renderAccountSection(existingSettings, status);
      return;
    }

    const accountState = await resolveAccountState({
      baseUrl,
      apiToken: userInput.apiToken,
      presetKey: userInput.presetKey,
      instanceType: status.instanceType,
      preferredSelectedAccountId: userInput.selectedAccountId || existingSettings.selectedAccountId
    });

    if (shouldSave) {
      const savedSettings = await saveSettings({
        baseUrl,
        presetKey: userInput.presetKey,
        apiToken: userInput.apiToken,
        rememberApiToken: userInput.rememberApiToken,
        selectedAccountId: accountState.selectedAccountId,
        availableAccounts: accountState.availableAccounts
      });
      setStatus(accountState.statusMessage || "Server saved successfully.", "success");
      renderStatusBlock(savedSettings, status);
      renderAccountSection(savedSettings, status, accountState.helpText);
      return;
    }

    const settings = await getSettings();
    const previewSettings = {
      ...settings,
      baseUrl,
      apiToken: userInput.apiToken,
      rememberApiToken: userInput.rememberApiToken,
      selectedAccountId: accountState.selectedAccountId,
      availableAccounts: accountState.availableAccounts
    };
    setStatus(accountState.statusMessage || "Connection succeeded.", "success");
    renderStatusBlock(previewSettings, status);
    renderAccountSection(previewSettings, status, accountState.helpText);
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
    apiToken,
    rememberApiToken: elements.rememberApiToken.checked,
    selectedAccountId: elements.accountSelect.value.trim() || null
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
  elements.featurePushes.textContent = "Enabled";
  elements.featureAccounts.textContent = formatAccountsState(
    status.instanceType,
    settings.apiToken,
    status.features.supportsAccountsApi
  );
  elements.featureRequests.textContent = formatRequestsState(
    status.instanceType,
    settings.apiToken,
    status.features.supportsRequestsApi
  );
  elements.lastChecked.textContent = status.checkedAt ? new Date(status.checkedAt).toLocaleString() : "Never";
  elements.configuredBadge.textContent = settings.baseUrl ? "Configured" : "Not configured";
}

function renderAccountSection(settings, status, helpTextOverride = "") {
  const availableAccounts = Array.isArray(settings.availableAccounts) ? settings.availableAccounts : [];
  renderAccountOptions(availableAccounts, settings.selectedAccountId || null);

  const hasToken = Boolean(settings.apiToken && settings.apiToken.trim());
  const isPro = status.instanceType === "pro";
  const supportsHostedProAccountSelection = isHostedProPreset(settings.presetKey);

  if (!isPro || !supportsHostedProAccountSelection) {
    elements.accountSelect.disabled = true;
    elements.accountSectionHelp.textContent = "Account selection is only available for hosted Pro instances (us/eu) when using an API token.";
    return;
  }

  if (!hasToken) {
    elements.accountSelect.disabled = true;
    elements.accountSectionHelp.textContent = "Add an API token to load available accounts.";
    return;
  }

  if (helpTextOverride) {
    elements.accountSectionHelp.textContent = helpTextOverride;
  } else if (!availableAccounts.length) {
    elements.accountSectionHelp.textContent = "No accounts loaded yet. Click Test connection to load accounts.";
  } else if (availableAccounts.length === 1) {
    elements.accountSectionHelp.textContent = "This token has one account. It will be used automatically.";
  } else {
    elements.accountSectionHelp.textContent = "Choose which account this extension should use.";
  }

  elements.accountSelect.disabled = availableAccounts.length <= 1;
}

function renderAccountOptions(accounts, selectedAccountId) {
  elements.accountSelect.innerHTML = "";

  if (!accounts.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No accounts available";
    elements.accountSelect.appendChild(option);
    return;
  }

  for (const account of accounts) {
    const option = document.createElement("option");
    option.value = account.id;
    option.textContent = account.name;
    if (selectedAccountId && String(selectedAccountId) === String(account.id)) {
      option.selected = true;
    }
    elements.accountSelect.appendChild(option);
  }

  if (!selectedAccountId) {
    elements.accountSelect.selectedIndex = 0;
  }
}

async function resolveAccountState({baseUrl, apiToken, presetKey, instanceType, preferredSelectedAccountId}) {
  if (instanceType !== "pro" || !isHostedProPreset(presetKey)) {
    return {
      availableAccounts: [],
      selectedAccountId: null,
      helpText: "Account selection is only available for hosted Pro instances (us/eu) when using an API token.",
      statusMessage: ""
    };
  }

  if (!apiToken || !apiToken.trim()) {
    return {
      availableAccounts: [],
      selectedAccountId: null,
      helpText: "Add an API token to load available accounts.",
      statusMessage: "Connection succeeded."
    };
  }

  const accountResult = await listAccounts({
    baseUrl,
    token: apiToken
  });

  if (!accountResult.ok) {
    return {
      availableAccounts: [],
      selectedAccountId: null,
      helpText: accountResult.errorMessage || "Unable to load accounts for this token.",
      statusMessage: "Connection succeeded, but accounts could not be loaded."
    };
  }

  const availableAccounts = accountResult.data.accounts || [];
  if (!availableAccounts.length) {
    return {
      availableAccounts,
      selectedAccountId: null,
      helpText: "This token does not have access to any accounts.",
      statusMessage: "Connection succeeded."
    };
  }

  const selectedAccountId = availableAccounts.some((account) => account.id === preferredSelectedAccountId)
    ? preferredSelectedAccountId
    : availableAccounts[0].id;

  if (availableAccounts.length === 1) {
    return {
      availableAccounts,
      selectedAccountId,
      helpText: "This token has one available account.",
      statusMessage: "Connection succeeded."
    };
  }

  return {
    availableAccounts,
    selectedAccountId,
    helpText: "Choose which account this extension should use.",
    statusMessage: "Connection succeeded."
  };
}

function isHostedProPreset(presetKey) {
  return HOSTED_PRO_PRESETS.includes(presetKey);
}

function isVersionAtLeast(currentVersion, minimumVersion) {
  const currentParts = normalizeVersionParts(currentVersion);
  const minimumParts = normalizeVersionParts(minimumVersion);

  for (let index = 0; index < Math.max(currentParts.length, minimumParts.length); index += 1) {
    const current = currentParts[index] || 0;
    const minimum = minimumParts[index] || 0;

    if (current > minimum) {
      return true;
    }

    if (current < minimum) {
      return false;
    }
  }

  return true;
}

function normalizeVersionParts(version) {
  const numeric = String(version || "")
    .trim()
    .split(".")
    .map((segment) => Number.parseInt(segment.replace(/[^0-9].*$/, ""), 10))
    .filter((segment) => !Number.isNaN(segment));

  return numeric.length ? numeric : [0, 0, 0];
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

function formatRequestsState(instanceType, apiToken, detectedValue) {
  if (instanceType === "oss") {
    return "Requests are not available in OSS";
  }

  if (instanceType === "pro") {
    return apiToken && apiToken.trim()
      ? "Enabled"
      : "Available with an API token";
  }

  return formatFeatureState(detectedValue);
}

function formatAccountsState(instanceType, apiToken, detectedValue) {
  if (instanceType === "oss") {
    return "Accounts are not available in OSS";
  }

  if (instanceType === "pro") {
    return apiToken && apiToken.trim()
      ? "Enabled"
      : "Available with an API token";
  }

  return formatFeatureState(detectedValue);
}

function setStatus(message, style) {
  elements.statusMessage.classList.remove("success", "error");
  if (style) {
    elements.statusMessage.classList.add(style);
  }

  elements.statusMessage.textContent = message;
}
