import {listAccounts, normalizeBaseUrl} from "../lib/api-client.js";
import {detectInstance} from "../lib/instance-detection.js";
import {
  clearAllExtensionState,
  getSettings,
  getInstanceStatus,
  saveInstanceStatus,
  saveSettings
} from "../lib/storage.js";
import {applyDocumentI18n, t} from "../lib/i18n.js";

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

applyDocumentI18n();

initialize().catch((error) => {
  setStatus(error.message || t("optionsErrorInitialize"), "error");
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
    const confirmed = window.confirm(t("optionsConfirmClearConfig"));
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
    setStatus(t("optionsStatusConfigurationCleared"), "success");
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
      elements.accountSectionHelp.textContent = t("optionsAccountHelpSelectedFuture");
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
  setStatus(t("optionsStatusTestingConnection"), "");

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
      setStatus(status.error || t("optionsErrorConnectionFailed"), "error");
      renderStatusBlock({baseUrl}, status);
      renderAccountSection(existingSettings, status);
      return;
    }

    const minimumOssVersion = "2.5.0";
    if (status.instanceType === "oss" && !isVersionAtLeast(status.applicationVersion, minimumOssVersion)) {
      const detectedVersion = status.applicationVersion || t("commonUnknownLower");
      setStatus(
        t("optionsErrorMinimumOssVersion", [minimumOssVersion, detectedVersion]),
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
      setStatus(accountState.statusMessage || t("optionsStatusServerSaved"), "success");
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
    setStatus(accountState.statusMessage || t("optionsStatusConnectionSucceeded"), "success");
    renderStatusBlock(previewSettings, status);
    renderAccountSection(previewSettings, status, accountState.helpText);
  } catch (error) {
    setStatus(error.message || t("optionsErrorConnectionFailed"), "error");
  }
}

function getUserSelection() {
  const selectedChoice = document.querySelector('input[name="serverChoice"]:checked');
  if (!selectedChoice) {
    throw new Error(t("optionsErrorSelectServerFirst"));
  }

  const apiToken = elements.apiToken.value.trim();
  const presetKey = selectedChoice.value;
  const baseUrl = presetKey === "custom" ? elements.customUrl.value.trim() : PRESET_URLS[presetKey];

  if (!baseUrl) {
    throw new Error(t("optionsErrorProvideServerUrl"));
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
    throw new Error(t("optionsErrorHostPermissionDenied"));
  }
}

function renderStatusBlock(settings, status) {
  elements.detectedServer.textContent = settings.baseUrl || t("optionsNotSet");
  elements.instanceType.textContent = formatInstanceType(status.instanceType);
  elements.editionValue.textContent = status.edition || t("commonUnknown");
  elements.applicationVersion.textContent = status.applicationVersion || t("commonUnknown");
  elements.apiVersion.textContent = status.apiVersion || t("commonUnknown");
  elements.featurePushes.textContent = t("commonEnabled");
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
  elements.lastChecked.textContent = status.checkedAt ? new Date(status.checkedAt).toLocaleString() : t("optionsNever");
  elements.configuredBadge.textContent = settings.baseUrl ? t("optionsConfigured") : t("optionsNotConfigured");
}

function renderAccountSection(settings, status, helpTextOverride = "") {
  const availableAccounts = Array.isArray(settings.availableAccounts) ? settings.availableAccounts : [];
  renderAccountOptions(availableAccounts, settings.selectedAccountId || null);

  const hasToken = Boolean(settings.apiToken && settings.apiToken.trim());
  const isPro = status.instanceType === "pro";
  const supportsHostedProAccountSelection = isHostedProPreset(settings.presetKey);

  if (!isPro || !supportsHostedProAccountSelection) {
    elements.accountSelect.disabled = true;
    elements.accountSectionHelp.textContent = t("optionsAccountHelpHostedProOnly");
    return;
  }

  if (!hasToken) {
    elements.accountSelect.disabled = true;
    elements.accountSectionHelp.textContent = t("optionsAccountHelpAddToken");
    return;
  }

  if (helpTextOverride) {
    elements.accountSectionHelp.textContent = helpTextOverride;
  } else if (!availableAccounts.length) {
    elements.accountSectionHelp.textContent = t("optionsAccountHelpNoAccountsLoaded");
  } else if (availableAccounts.length === 1) {
    elements.accountSectionHelp.textContent = t("optionsAccountHelpOneAccount");
  } else {
    elements.accountSectionHelp.textContent = t("optionsAccountHelpChooseAccount");
  }

  elements.accountSelect.disabled = availableAccounts.length <= 1;
}

function renderAccountOptions(accounts, selectedAccountId) {
  elements.accountSelect.innerHTML = "";

  if (!accounts.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = t("optionsNoAccountsAvailable");
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
      helpText: t("optionsAccountHelpHostedProOnly"),
      statusMessage: ""
    };
  }

  if (!apiToken || !apiToken.trim()) {
    return {
      availableAccounts: [],
      selectedAccountId: null,
      helpText: t("optionsAccountHelpAddToken"),
      statusMessage: t("optionsStatusConnectionSucceeded")
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
      helpText: accountResult.errorMessage || t("optionsErrorLoadAccountsForToken"),
      statusMessage: t("optionsStatusConnectionSucceededAccountsFailed")
    };
  }

  const availableAccounts = accountResult.data.accounts || [];
  if (!availableAccounts.length) {
    return {
      availableAccounts,
      selectedAccountId: null,
      helpText: t("optionsAccountHelpNoAccess"),
      statusMessage: t("optionsStatusConnectionSucceeded")
    };
  }

  const selectedAccountId = availableAccounts.some((account) => account.id === preferredSelectedAccountId)
    ? preferredSelectedAccountId
    : availableAccounts[0].id;

  if (availableAccounts.length === 1) {
    return {
      availableAccounts,
      selectedAccountId,
      helpText: t("optionsAccountHelpOneAvailable"),
      statusMessage: t("optionsStatusConnectionSucceeded")
    };
  }

  return {
    availableAccounts,
    selectedAccountId,
    helpText: t("optionsAccountHelpChooseAccount"),
    statusMessage: t("optionsStatusConnectionSucceeded")
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
    return t("commonProCommercial");
  }

  if (instanceType === "oss") {
    return t("commonOpenSource");
  }

  return t("commonUnknown");
}

function formatFeatureState(value) {
  if (value === "enabled") {
    return t("commonEnabled");
  }

  if (value === "disabled") {
    return t("commonUnavailable");
  }

  return t("commonUnknown");
}

function formatRequestsState(instanceType, apiToken, detectedValue) {
  if (instanceType === "oss") {
    return t("optionsRequestsNotAvailableOss");
  }

  if (instanceType === "pro") {
    return apiToken && apiToken.trim()
      ? t("commonEnabled")
      : t("optionsAvailableWithApiToken");
  }

  return formatFeatureState(detectedValue);
}

function formatAccountsState(instanceType, apiToken, detectedValue) {
  if (instanceType === "oss") {
    return t("optionsAccountsNotAvailableOss");
  }

  if (instanceType === "pro") {
    return apiToken && apiToken.trim()
      ? t("commonEnabled")
      : t("optionsAvailableWithApiToken");
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
