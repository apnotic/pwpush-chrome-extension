import {listWorkspaces, normalizeBaseUrl} from "../lib/api-client.js";
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
  workspaceSection: document.querySelector("#workspaceSection"),
  workspaceSectionHelp: document.querySelector("#workspaceSectionHelp"),
  workspaceSelect: document.querySelector("#workspaceSelect"),
  detectedServer: document.querySelector("#detectedServer"),
  instanceType: document.querySelector("#instanceType"),
  applicationVersion: document.querySelector("#applicationVersion"),
  apiVersion: document.querySelector("#apiVersion"),
  featurePushes: document.querySelector("#featurePushes"),
  featureWorkspaces: document.querySelector("#featureWorkspaces"),
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
  renderWorkspaceSection(settings, status);

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
    renderWorkspaceSection(settings, status);
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

  elements.workspaceSelect.addEventListener("change", () => {
    if (elements.workspaceSelect.value) {
      elements.workspaceSectionHelp.textContent = t("optionsWorkspaceHelpSelectedFuture");
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
  renderWorkspaceOptions(settings.availableWorkspaces || [], settings.selectedWorkspaceId);
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
  elements.workspaceSection.classList.toggle("hidden", !isHostedProPreset(presetKey));

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
      renderWorkspaceSection(existingSettings, status);
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
      renderWorkspaceSection(existingSettings, status);
      return;
    }

    const workspaceState = await resolveWorkspaceState({
      baseUrl,
      apiToken: userInput.apiToken,
      presetKey: userInput.presetKey,
      instanceType: status.instanceType,
      preferredSelectedWorkspaceId: userInput.selectedWorkspaceId || existingSettings.selectedWorkspaceId
    });

    if (shouldSave) {
      const savedSettings = await saveSettings({
        baseUrl,
        presetKey: userInput.presetKey,
        apiToken: userInput.apiToken,
        rememberApiToken: userInput.rememberApiToken,
        selectedWorkspaceId: workspaceState.selectedWorkspaceId,
        availableWorkspaces: workspaceState.availableWorkspaces
      });
      setStatus(workspaceState.statusMessage || t("optionsStatusServerSaved"), "success");
      renderStatusBlock(savedSettings, status);
      renderWorkspaceSection(savedSettings, status, workspaceState.helpText);
      return;
    }

    const settings = await getSettings();
    const previewSettings = {
      ...settings,
      baseUrl,
      apiToken: userInput.apiToken,
      rememberApiToken: userInput.rememberApiToken,
      selectedWorkspaceId: workspaceState.selectedWorkspaceId,
      availableWorkspaces: workspaceState.availableWorkspaces
    };
    setStatus(workspaceState.statusMessage || t("optionsStatusConnectionSucceeded"), "success");
    renderStatusBlock(previewSettings, status);
    renderWorkspaceSection(previewSettings, status, workspaceState.helpText);
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
    selectedWorkspaceId: elements.workspaceSelect.value.trim() || null
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
  elements.applicationVersion.textContent = status.applicationVersion || t("commonUnknown");
  elements.apiVersion.textContent = status.apiVersion || t("commonUnknown");
  elements.featurePushes.textContent = t("commonEnabled");
  elements.featureWorkspaces.textContent = formatWorkspacesState(
    status.instanceType,
    settings.apiToken,
    status.features.supportsWorkspacesApi
  );
  elements.featureRequests.textContent = formatRequestsState(
    status.instanceType,
    settings.apiToken,
    status.features.supportsRequestsApi
  );
  elements.lastChecked.textContent = status.checkedAt ? new Date(status.checkedAt).toLocaleString() : t("optionsNever");
  elements.configuredBadge.textContent = settings.baseUrl ? t("optionsConfigured") : t("optionsNotConfigured");
}

function renderWorkspaceSection(settings, status, helpTextOverride = "") {
  const availableWorkspaces = Array.isArray(settings.availableWorkspaces) ? settings.availableWorkspaces : [];
  renderWorkspaceOptions(availableWorkspaces, settings.selectedWorkspaceId || null);

  const hasToken = Boolean(settings.apiToken && settings.apiToken.trim());
  const isPro = status.instanceType === "pro";
  const supportsHostedProWorkspaceSelection = isHostedProPreset(settings.presetKey);

  if (!isPro || !supportsHostedProWorkspaceSelection) {
    elements.workspaceSelect.disabled = true;
    elements.workspaceSectionHelp.textContent = t("optionsWorkspaceHelpHostedProOnly");
    return;
  }

  if (!hasToken) {
    elements.workspaceSelect.disabled = true;
    elements.workspaceSectionHelp.textContent = t("optionsWorkspaceHelpAddToken");
    return;
  }

  if (helpTextOverride) {
    elements.workspaceSectionHelp.textContent = helpTextOverride;
  } else if (!availableWorkspaces.length) {
    elements.workspaceSectionHelp.textContent = t("optionsWorkspaceHelpNoneLoaded");
  } else if (availableWorkspaces.length === 1) {
    elements.workspaceSectionHelp.textContent = t("optionsWorkspaceHelpOne");
  } else {
    elements.workspaceSectionHelp.textContent = t("optionsWorkspaceHelpChoose");
  }

  elements.workspaceSelect.disabled = availableWorkspaces.length <= 1;
}

function renderWorkspaceOptions(workspaces, selectedWorkspaceId) {
  elements.workspaceSelect.innerHTML = "";

  if (!workspaces.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = t("optionsNoWorkspacesAvailable");
    elements.workspaceSelect.appendChild(option);
    return;
  }

  for (const workspace of workspaces) {
    const option = document.createElement("option");
    option.value = workspace.id;
    option.textContent = workspace.name;
    if (selectedWorkspaceId && String(selectedWorkspaceId) === String(workspace.id)) {
      option.selected = true;
    }
    elements.workspaceSelect.appendChild(option);
  }

  if (!selectedWorkspaceId) {
    elements.workspaceSelect.selectedIndex = 0;
  }
}

async function resolveWorkspaceState({baseUrl, apiToken, presetKey, instanceType, preferredSelectedWorkspaceId}) {
  if (instanceType !== "pro" || !isHostedProPreset(presetKey)) {
    return {
      availableWorkspaces: [],
      selectedWorkspaceId: null,
      helpText: t("optionsWorkspaceHelpHostedProOnly"),
      statusMessage: ""
    };
  }

  if (!apiToken || !apiToken.trim()) {
    return {
      availableWorkspaces: [],
      selectedWorkspaceId: null,
      helpText: t("optionsWorkspaceHelpAddToken"),
      statusMessage: t("optionsStatusConnectionSucceeded")
    };
  }

  const workspaceResult = await listWorkspaces({
    baseUrl,
    token: apiToken
  });

  if (!workspaceResult.ok) {
    return {
      availableWorkspaces: [],
      selectedWorkspaceId: null,
      helpText: workspaceResult.errorMessage || t("optionsErrorLoadWorkspaces"),
      statusMessage: t("optionsStatusConnectionSucceededWorkspacesFailed")
    };
  }

  const availableWorkspaces = workspaceResult.data.workspaces || [];
  if (!availableWorkspaces.length) {
    return {
      availableWorkspaces,
      selectedWorkspaceId: null,
      helpText: t("optionsWorkspaceHelpNoAccess"),
      statusMessage: t("optionsStatusConnectionSucceeded")
    };
  }

  const selectedWorkspaceId = availableWorkspaces.some((workspace) => workspace.id === preferredSelectedWorkspaceId)
    ? preferredSelectedWorkspaceId
    : availableWorkspaces[0].id;

  if (availableWorkspaces.length === 1) {
    return {
      availableWorkspaces,
      selectedWorkspaceId,
      helpText: t("optionsWorkspaceHelpOneAvailable"),
      statusMessage: t("optionsStatusConnectionSucceeded")
    };
  }

  return {
    availableWorkspaces,
    selectedWorkspaceId,
    helpText: t("optionsWorkspaceHelpChoose"),
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

function formatWorkspacesState(instanceType, apiToken, detectedValue) {
  if (instanceType === "oss") {
    return t("optionsWorkspacesNotAvailableOss");
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
