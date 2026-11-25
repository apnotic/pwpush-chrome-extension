import {
  createPush,
  createRequest,
  getPushPreview,
  getRequestPreview
} from "../lib/api-client.js";
import {
  clearLastPushResult,
  getInstanceStatus,
  getSettings,
  saveSettings
} from "../lib/storage.js";
import {applyDocumentI18n, t} from "../lib/i18n.js";
import {buildPreviewUrl, buildPreviewUrlFromToken, extractFirstSvg, toConfiguredShareUrl} from "./qr-utils.js";

const elements = {
  serverValue: document.querySelector("#serverValue"),
  instanceValue: document.querySelector("#instanceValue"),
  apiValue: document.querySelector("#apiValue"),
  recheckButton: document.querySelector("#recheckButton"),
  connectionChips: document.querySelector("#connectionChips"),
  connectionStatus: document.querySelector("#connectionStatus"),
  settingsButton: document.querySelector("#settingsButton"),
  statusMessage: document.querySelector("#statusMessage"),
  pushTab: document.querySelector("#pushTab"),
  requestTab: document.querySelector("#requestTab"),
  pushPanel: document.querySelector("#pushPanel"),
  requestPanel: document.querySelector("#requestPanel"),
  requestInstanceNotSupported: document.querySelector("#requestInstanceNotSupported"),
  requestNeedsToken: document.querySelector("#requestNeedsToken"),
  goToSettingsButton: document.querySelector("#goToSettingsButton"),
  payload: document.querySelector("#payload"),
  selectionHint: document.querySelector("#selectionHint"),
  addSelectionButton: document.querySelector("#addSelectionButton"),
  selectionRow: document.querySelector("#selectionRow"),
  pushAuthFields: document.querySelector("#pushAuthFields"),
  pushAuthFieldsUnavailable: document.querySelector("#pushAuthFieldsUnavailable"),
  pushName: document.querySelector("#pushName"),
  pushNote: document.querySelector("#pushNote"),
  pushButton: document.querySelector("#pushButton"),
  pushUrlButton: document.querySelector("#pushUrlButton"),
  expireAfterDays: document.querySelector("#expireAfterDays"),
  expireAfterViews: document.querySelector("#expireAfterViews"),
  retrievalStep: document.querySelector("#retrievalStep"),
  passphrase: document.querySelector("#passphrase"),
  pushFileSection: document.querySelector("#pushFileSection"),
  pushFileInput: document.querySelector("#pushFileInput"),
  pushChooseFilesButton: document.querySelector("#pushChooseFilesButton"),
  pushFilesUnavailable: document.querySelector("#pushFilesUnavailable"),
  pushSelectedFiles: document.querySelector("#pushSelectedFiles"),
  requestName: document.querySelector("#requestName"),
  requestMessage: document.querySelector("#requestMessage"),
  requestNote: document.querySelector("#requestNote"),
  requestExpireDays: document.querySelector("#requestExpireDays"),
  requestRetrievalStep: document.querySelector("#requestRetrievalStep"),
  requestResponseFiles: document.querySelector("#requestResponseFiles"),
  requestPassphrase: document.querySelector("#requestPassphrase"),
  requestNotifyEmailsField: document.querySelector("#requestNotifyEmailsField"),
  requestNotifyEmails: document.querySelector("#requestNotifyEmails"),
  requestFileSection: document.querySelector("#requestFileSection"),
  requestFileInput: document.querySelector("#requestFileInput"),
  requestChooseFilesButton: document.querySelector("#requestChooseFilesButton"),
  requestFilesUnavailable: document.querySelector("#requestFilesUnavailable"),
  requestSelectedFiles: document.querySelector("#requestSelectedFiles"),
  createRequestButton: document.querySelector("#createRequestButton"),
  resultSection: document.querySelector("#resultSection"),
  resultLink: document.querySelector("#resultLink"),
  resultMeta: document.querySelector("#resultMeta"),
  copyLinkButton: document.querySelector("#copyLinkButton"),
  openLinkButton: document.querySelector("#openLinkButton"),
  showQrButton: document.querySelector("#showQrButton"),
  downloadQrButton: document.querySelector("#downloadQrButton"),
  qrContainer: document.querySelector("#qrContainer")
};

let state = {
  settings: null,
  instanceStatus: null,
  lastPushResult: null,
  isBusy: false,
  isReadingSelection: false,
  activeTab: "push",
  requestsSupported: {
    instanceSupportsRequests: false,
    hasRequiredToken: false,
    available: false
  },
  pushFilesSupported: false,
  requestFilesSupported: false,
  pushSelectedFiles: [],
  requestSelectedFiles: []
};

let selectionSnapshot = "";
const URL_PUSH_COOLDOWN_MS = 5000;
const URL_PUSH_COOLDOWN_KEY = "lastUrlPushAt";
let urlPushAvailableAt = 0;
let urlPushCooldownTimer = null;
let urlPushCooldownSeconds = 0;

applyDocumentI18n();

elements.recheckButton.addEventListener("click", async () => {
  await recheckConnection();
});

elements.goToSettingsButton.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

elements.settingsButton.addEventListener("click", async () => {
  await chrome.runtime.openOptionsPage();
});

elements.payload.addEventListener("input", () => {
  if (elements.payload.value !== selectionSnapshot) {
    setSelectionHintVisible(false);
  }
  updateActionButtons();
});

elements.payload.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    elements.pushButton.click();
  }
});

elements.addSelectionButton.addEventListener("click", async () => {
  await addSelectedText();
});

elements.pushButton.addEventListener("click", async () => {
  await createFromPayloadField();
});

elements.pushUrlButton.addEventListener("click", async () => {
  await createFromCurrentUrl();
});

elements.copyLinkButton.addEventListener("click", async () => {
  const shareUrl = (state.lastPushResult || {}).shareUrl;
  if (!shareUrl) {
    return;
  }

  const baseUrl = ((state.settings || {}).baseUrl || "").trim();
  let trustedShareUrl = "";
  try {
    trustedShareUrl = toConfiguredShareUrl(shareUrl, baseUrl);
  } catch (_error) {
    setStatus(t("popupErrorUntrustedShareUrl"), "error");
    return;
  }

  await navigator.clipboard.writeText(trustedShareUrl);
  setStatus(t("popupLinkCopied"), "success");
});

elements.openLinkButton.addEventListener("click", async () => {
  const shareUrl = (state.lastPushResult || {}).shareUrl;
  if (!shareUrl) {
    return;
  }

  const baseUrl = ((state.settings || {}).baseUrl || "").trim();
  let trustedShareUrl = "";
  try {
    trustedShareUrl = toConfiguredShareUrl(shareUrl, baseUrl);
  } catch (_error) {
    setStatus(t("popupErrorUntrustedShareUrl"), "error");
    return;
  }

  await chrome.tabs.create({url: trustedShareUrl});
});

elements.showQrButton.addEventListener("click", async () => {
  await toggleQrForLatestPush();
});

elements.downloadQrButton.addEventListener("click", async () => {
  await downloadQrPng();
});

elements.pushTab.addEventListener("click", () => {
  switchTab("push");
});

elements.requestTab.addEventListener("click", () => {
  switchTab("request");
});

elements.requestMessage.addEventListener("input", () => {
  updateActionButtons();
});

elements.createRequestButton.addEventListener("click", async () => {
  await createRequestFromForm();
});

elements.pushChooseFilesButton.addEventListener("click", () => {
  elements.pushFileInput.click();
});

elements.pushFileInput.addEventListener("change", (event) => {
  handleFileSelection(event.target.files, "push");
});

elements.requestChooseFilesButton.addEventListener("click", () => {
  elements.requestFileInput.click();
});

elements.requestFileInput.addEventListener("change", (event) => {
  handleFileSelection(event.target.files, "request");
});

loadState().catch((error) => {
  setStatus(error.message || t("popupErrorLoadState"), "error");
});

chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName !== "local") {
    return;
  }

  if (changes.instanceStatus) {
    const newStatus = changes.instanceStatus.newValue;
    if (!newStatus) {
      return;
    }

    state.instanceStatus = newStatus;
    const settings = state.settings || await getSettings();
    state.requestsSupported = checkRequestsSupport(newStatus, settings);
    
    const {pushFilesSupported, requestFilesSupported} = checkFileAttachmentSupport(newStatus, settings);
    state.pushFilesSupported = pushFilesSupported;
    state.requestFilesSupported = requestFilesSupported;

    renderConnection(settings, newStatus);
    updateRequestsAvailability(state.requestsSupported, settings);
    updateFileAttachmentAvailability(pushFilesSupported, requestFilesSupported, settings);
    updatePushFieldAvailability(settings);
    updateActionButtons();
  }

  if (changes.settings) {
    const newSettings = changes.settings.newValue;
    if (!newSettings) {
      return;
    }

    const oldSettings = state.settings || {};
    const baseUrlChanged = oldSettings.baseUrl !== newSettings.baseUrl;
    const tokenChanged = oldSettings.apiToken !== newSettings.apiToken;

    state.settings = newSettings;

    if (baseUrlChanged || tokenChanged) {
      const instanceStatus = state.instanceStatus || {};
      state.requestsSupported = checkRequestsSupport(instanceStatus, newSettings);
      const {pushFilesSupported, requestFilesSupported} = checkFileAttachmentSupport(instanceStatus, newSettings);
      state.pushFilesSupported = pushFilesSupported;
      state.requestFilesSupported = requestFilesSupported;

      renderConnection(newSettings, instanceStatus);
      updateRequestsAvailability(state.requestsSupported, newSettings);
      updateFileAttachmentAvailability(pushFilesSupported, requestFilesSupported, newSettings);
      updatePushFieldAvailability(newSettings);
      updateActionButtons();
    }
  }
});

async function loadState() {
  await clearLastPushResult();
  const [settings, instanceStatus] = await Promise.all([
    getSettings(),
    getInstanceStatus()
  ]);

  const requestsSupported = checkRequestsSupport(instanceStatus, settings);
  const {pushFilesSupported, requestFilesSupported} = checkFileAttachmentSupport(instanceStatus, settings);

  state = {
    ...state,
    settings,
    instanceStatus,
    lastPushResult: null,
    requestsSupported,
    pushFilesSupported,
    requestFilesSupported,
    pushSelectedFiles: [],
    requestSelectedFiles: []
  };
  hydrateAdvancedOptions(settings.lastPushOptions || {});
  renderConnection(settings, instanceStatus);
  renderResult(null);
  await restoreUrlPushCooldown();
  setSelectionButtonVisible(await activeTabHasSelection());
  updateRequestsAvailability(requestsSupported, settings);
  updateFileAttachmentAvailability(pushFilesSupported, requestFilesSupported, settings);
  updatePushFieldAvailability(settings);
  updateActionButtons();
  if (!state.isBusy) {
    if (state.activeTab === "push") {
      elements.payload.focus();
    } else {
      elements.requestName.focus();
    }
  }
}

function checkRequestsSupport(instanceStatus, settings) {
  const versionData = (instanceStatus || {}).versionData || {};
  const features = versionData.features || {};
  const requests = features.requests || {};
  const hasApiToken = Boolean((settings || {}).apiToken);
  
  return {
    instanceSupportsRequests: requests.enabled === true,
    hasRequiredToken: hasApiToken,
    available: requests.enabled === true && hasApiToken
  };
}

function checkFileAttachmentSupport(instanceStatus, settings) {
  const versionData = (instanceStatus || {}).versionData || {};
  const features = versionData.features || {};
  const hasApiToken = Boolean((settings || {}).apiToken);
  
  const pushes = features.pushes || {};
  const requests = features.requests || {};
  
  const pushFileAttachments = pushes.file_attachments || {};
  const requestFileAttachments = requests.file_attachments || {};
  
  const pushFilesSupported = pushFileAttachments.enabled === true && 
    (!pushFileAttachments.requires_authentication || hasApiToken);
  
  const requestFilesSupported = requestFileAttachments.enabled === true && 
    (!requestFileAttachments.requires_authentication || hasApiToken);
  
  return {pushFilesSupported, requestFilesSupported};
}

function updateFileAttachmentAvailability(pushFilesSupported, requestFilesSupported, settings) {
  const hasApiToken = Boolean((settings || {}).apiToken);
  
  if (pushFilesSupported) {
    elements.pushFileSection.classList.remove("hidden");
    elements.pushFilesUnavailable.classList.add("hidden");
  } else {
    elements.pushFileSection.classList.remove("hidden");
    if (!hasApiToken) {
      elements.pushFilesUnavailable.classList.remove("hidden");
      elements.pushFileInput.disabled = true;
      elements.pushChooseFilesButton.disabled = true;
    } else {
      elements.pushFilesUnavailable.classList.add("hidden");
      elements.pushFileInput.disabled = false;
      elements.pushChooseFilesButton.disabled = false;
    }
  }
  
  if (requestFilesSupported) {
    elements.requestFileSection.classList.remove("hidden");
    elements.requestFilesUnavailable.classList.add("hidden");
  } else {
    elements.requestFileSection.classList.remove("hidden");
    if (!hasApiToken) {
      elements.requestFilesUnavailable.classList.remove("hidden");
      elements.requestFileInput.disabled = true;
      elements.requestChooseFilesButton.disabled = true;
    } else {
      elements.requestFilesUnavailable.classList.add("hidden");
      elements.requestFileInput.disabled = false;
      elements.requestChooseFilesButton.disabled = false;
    }
  }
}

function updatePushFieldAvailability(settings) {
  const hasApiToken = Boolean((settings || {}).apiToken);
  
  if (hasApiToken) {
    elements.pushAuthFields.classList.remove("hidden");
    elements.pushAuthFieldsUnavailable.classList.add("hidden");
    elements.requestNotifyEmailsField.classList.remove("hidden");
  } else {
    elements.pushAuthFields.classList.add("hidden");
    elements.pushAuthFieldsUnavailable.classList.remove("hidden");
    elements.requestNotifyEmailsField.classList.add("hidden");
  }
}

function updateRequestsAvailability(requestsSupported, settings) {
  const {instanceSupportsRequests, hasRequiredToken, available} = requestsSupported;
  
  if (available) {
    elements.requestTab.disabled = false;
    elements.requestInstanceNotSupported.classList.add("hidden");
    elements.requestNeedsToken.classList.add("hidden");
  } else if (instanceSupportsRequests && !hasRequiredToken) {
    elements.requestTab.disabled = false;
    elements.requestInstanceNotSupported.classList.add("hidden");
    elements.requestNeedsToken.classList.remove("hidden");
    if (state.activeTab === "request") {
      switchTab("push");
    }
  } else {
    elements.requestTab.disabled = false;
    elements.requestInstanceNotSupported.classList.remove("hidden");
    elements.requestNeedsToken.classList.add("hidden");
    if (state.activeTab === "request") {
      switchTab("push");
    }
  }
}

function switchTab(tab) {
  state.activeTab = tab;
  
  if (tab === "push") {
    elements.pushTab.setAttribute("aria-selected", "true");
    elements.requestTab.setAttribute("aria-selected", "false");
    elements.pushTab.classList.add("active");
    elements.requestTab.classList.remove("active");
    elements.pushPanel.classList.remove("hidden");
    elements.requestPanel.classList.add("hidden");
    elements.payload.focus();
  } else {
    elements.pushTab.setAttribute("aria-selected", "false");
    elements.requestTab.setAttribute("aria-selected", "true");
    elements.pushTab.classList.remove("active");
    elements.requestTab.classList.add("active");
    elements.pushPanel.classList.add("hidden");
    elements.requestPanel.classList.remove("hidden");
    elements.requestName.focus();
  }
  
  updateActionButtons();
  setStatus("");
}

async function recheckConnection() {
  const button = elements.recheckButton;
  const originalText = button.textContent;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  button.textContent = t("popupChecking");
  setConnectionStatus("");

  try {
    const response = await chrome.runtime.sendMessage({type: "recheckInstance"});
    if (!response || !response.ok) {
      throw new Error((response && response.error) || t("popupErrorRecheckServer"));
    }

    await refreshConnection(response.status);
    const status = response.status || {};
    if (status.connected) {
      setConnectionStatus(t("popupRecheckConnected"), "success");
      confirmConnectionChips();
      return;
    }

    setConnectionStatus(status.error || t("popupErrorRecheckServer"), "error");
  } catch (error) {
    setConnectionStatus(error.message || t("popupErrorRecheckServer"), "error");
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
    button.textContent = originalText;
  }
}

function setConnectionStatus(message, style = "") {
  elements.connectionStatus.classList.remove("success", "error");
  if (style) {
    elements.connectionStatus.classList.add(style);
  }
  elements.connectionStatus.textContent = message || "";
}

function confirmConnectionChips() {
  const chips = elements.connectionChips;
  chips.classList.remove("confirmed");
  void chips.offsetWidth;
  chips.classList.add("confirmed");
}

async function refreshConnection(instanceStatus) {
  const settings = state.settings || await getSettings();
  state.settings = settings;
  if (instanceStatus) {
    state.instanceStatus = instanceStatus;
    state.requestsSupported = checkRequestsSupport(instanceStatus, settings);
    const {pushFilesSupported, requestFilesSupported} = checkFileAttachmentSupport(instanceStatus, settings);
    state.pushFilesSupported = pushFilesSupported;
    state.requestFilesSupported = requestFilesSupported;
    updateRequestsAvailability(state.requestsSupported, settings);
    updateFileAttachmentAvailability(pushFilesSupported, requestFilesSupported, settings);
    updatePushFieldAvailability(settings);
  }
  renderConnection(settings, state.instanceStatus || {});
}

function renderConnection(settings, instanceStatus) {
  elements.serverValue.textContent = settings.baseUrl || t("popupNoServerConfigured");
  elements.instanceValue.textContent = formatInstanceType(instanceStatus.instanceType);
  elements.apiValue.textContent = instanceStatus.apiVersion
    ? t("popupApiVersionValue", [String(instanceStatus.apiVersion)])
    : t("popupApiUnknown");
}

function renderResult(result) {
  if (!result || !result.shareUrl) {
    elements.resultSection.classList.add("hidden");
    setQrVisible(false);
    return;
  }

  elements.resultSection.classList.remove("hidden");
  elements.resultLink.textContent = result.shareUrl;
  elements.resultMeta.textContent = formatResultMeta(result);

  if (result.qrPngDataUrl && result.qrVisible) {
    elements.qrContainer.classList.remove("hidden");
    renderQrImage(result.qrPngDataUrl);
    elements.downloadQrButton.classList.remove("hidden");
    setQrVisible(true);
    return;
  }

  elements.qrContainer.classList.add("hidden");
  elements.downloadQrButton.classList.add("hidden");
  setQrVisible(false);
}

function hydrateAdvancedOptions(options) {
  elements.expireAfterDays.value = String(options.expireAfterDays || 7);
  elements.expireAfterViews.value = String(options.expireAfterViews || 5);
  elements.retrievalStep.checked = Boolean(options.retrievalStep);
  elements.passphrase.value = options.passphrase || "";
}

async function createFromCurrentUrl() {
  if (urlPushCoolingDown() || !tryBeginBusy()) {
    return;
  }

  try {
    ensureServerConfigured();
    setStatus(t("popupReadingCurrentUrl"), "info");
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    if (!tab || !tab.id || !tab.url) {
      throw new Error(t("popupErrorReadCurrentUrl"));
    }

    const url = new URL(tab.url);
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error(t("popupErrorOnlyHttpHttps"));
    }

    startUrlPushCooldown();
    await createPushFromPayload(url.toString());
  } catch (error) {
    setStatus(error.message || t("popupErrorCreateUrlPush"), "error");
  } finally {
    endBusy();
  }
}

async function createFromPayloadField() {
  if (state.isBusy) {
    return;
  }

  let payload = "";
  try {
    ensureServerConfigured();
    payload = elements.payload.value.trim();
    if (!payload) {
      throw new Error(t("popupErrorEmptyPayload"));
    }
  } catch (error) {
    setStatus(error.message || t("popupErrorPushCreationFailed"), "error");
    return;
  }

  if (!tryBeginBusy()) {
    return;
  }

  try {
    await createPushFromPayload(payload);
    elements.payload.value = "";
    selectionSnapshot = "";
    setSelectionHintVisible(false);
  } catch (error) {
    setStatus(error.message || t("popupErrorPushCreationFailed"), "error");
  } finally {
    endBusy();
  }
}

async function createRequestFromForm() {
  if (state.isBusy) {
    return;
  }

  let requestMessage = "";
  try {
    ensureServerConfigured();
    if (!state.requestsSupported.available) {
      throw new Error(t("popupErrorRequestsNotSupported", [], "Requests are not supported on this instance."));
    }
    requestMessage = elements.requestMessage.value.trim();
    if (!requestMessage) {
      throw new Error(t("popupErrorEmptyRequestMessage", [], "Request message cannot be empty."));
    }
  } catch (error) {
    setStatus(error.message || t("popupErrorRequestCreationFailed", [], "Request creation failed."), "error");
    return;
  }

  if (!tryBeginBusy()) {
    return;
  }

  try {
    await createRequestFromMessage(requestMessage);
    elements.requestMessage.value = "";
    elements.requestName.value = "";
    elements.requestNote.value = "";
    elements.requestPassphrase.value = "";
    elements.requestNotifyEmails.value = "";
  } catch (error) {
    setStatus(error.message || t("popupErrorRequestCreationFailed", [], "Request creation failed."), "error");
  } finally {
    endBusy();
  }
}

async function addSelectedText() {
  if (state.isBusy || state.isReadingSelection) {
    return;
  }

  state.isReadingSelection = true;
  updateActionButtons();

  try {
    const selection = await readActiveTabSelection();
    if (selection.status === "unavailable") {
      setSelectionHintVisible(false);
      setStatus(t("popupErrorSelectionUnavailable"), "error");
      return;
    }

    if (!selection.text) {
      setSelectionHintVisible(false);
      setStatus(t("popupErrorNoSelection"), "error");
      return;
    }

    appendSelection(selection.text);
    selectionSnapshot = elements.payload.value;
    setSelectionHintVisible(true);
    setStatus("");
    elements.payload.focus();
    const end = elements.payload.value.length;
    elements.payload.setSelectionRange(end, end);
  } finally {
    state.isReadingSelection = false;
    updateActionButtons();
  }
}

function appendSelection(selection) {
  const current = elements.payload.value;
  if (!current.trim()) {
    elements.payload.value = selection;
    return;
  }

  const separator = current.endsWith("\n") ? "" : "\n";
  elements.payload.value = `${current}${separator}${selection}`;
}

function setSelectionButtonVisible(visible) {
  elements.selectionRow.classList.toggle("hidden", !visible);
}

function setSelectionHintVisible(visible) {
  elements.selectionHint.classList.toggle("hidden", !visible);
  if (visible) {
    elements.payload.setAttribute("aria-describedby", "selectionHint");
  } else {
    elements.payload.removeAttribute("aria-describedby");
  }
}

async function createPushFromPayload(payload) {
  const options = getPushOptions();
  await persistPushOptions(options);
  setStatus(t("popupCreatingPush"), "info");

  const {settings, instanceStatus} = state;
  const createResult = await createPush(payload, {
    baseUrl: settings.baseUrl,
    token: settings.apiToken,
    workspaceId: settings.selectedWorkspaceId || "",
    instanceType: instanceStatus.instanceType || "unknown",
    expireAfterDays: options.expireAfterDays,
    expireAfterViews: options.expireAfterViews,
    retrievalStep: options.retrievalStep,
    passphrase: options.passphrase,
    name: elements.pushName.value.trim(),
    note: elements.pushNote.value.trim(),
    files: state.pushSelectedFiles
  });

  if (!createResult.ok) {
    throw new Error(createResult.errorMessage || t("popupErrorPushCreationFailed"));
  }

  const data = createResult.data || {};
  const pushResult = {
    createdAt: new Date().toISOString(),
    shareUrl: resolveDisplayedShareUrl(data.shareUrl || "", data.urlToken || "", settings.baseUrl),
    urlToken: data.urlToken || "",
    qrSvg: "",
    qrPngDataUrl: "",
    expiresAt: data.expires_at || null,
    expiresIn: data.expires_in || null,
    viewsRemaining: data.views_remaining || null
  };

  state.lastPushResult = pushResult;
  state.pushSelectedFiles = [];
  renderSelectedFiles("push");
  renderResult(state.lastPushResult);
  setStatus(t("popupPushCreated"), "success");
}

async function createRequestFromMessage(requestMessage) {
  const options = getRequestOptions();
  setStatus(t("popupCreatingRequest", [], "Creating request..."), "info");

  const {settings, instanceStatus} = state;
  const createResult = await createRequest(requestMessage, {
    baseUrl: settings.baseUrl,
    token: settings.apiToken,
    workspaceId: settings.selectedWorkspaceId || "",
    instanceType: instanceStatus.instanceType || "unknown",
    name: options.name,
    note: options.note,
    closeAfterDuration: options.closeAfterDuration,
    retrievalStep: options.retrievalStep,
    passphrase: options.passphrase,
    notifyEmailsTo: options.notifyEmailsTo,
    authenticatedRecipients: options.authenticatedRecipients,
    notifyRecipients: options.notifyRecipients,
    includeRequestor: options.includeRequestor,
    responseFileAttachments: options.responseFileAttachments,
    files: state.requestSelectedFiles
  });

  if (!createResult.ok) {
    throw new Error(createResult.errorMessage || t("popupErrorRequestCreationFailed", [], "Request creation failed."));
  }

  const data = createResult.data || {};
  const requestResult = {
    createdAt: new Date().toISOString(),
    shareUrl: resolveDisplayedShareUrl(data.shareUrl || "", data.urlToken || "", settings.baseUrl),
    urlToken: data.urlToken || "",
    qrSvg: "",
    qrPngDataUrl: "",
    expiresAt: data.closes_at || data.expires_at || null,
    expiresIn: null,
    viewsRemaining: null
  };

  state.lastPushResult = requestResult;
  state.requestSelectedFiles = [];
  renderSelectedFiles("request");
  renderResult(state.lastPushResult);
  setStatus(t("popupRequestCreated", [], "Request created successfully!"), "success");
}

async function toggleQrForLatestPush() {
  const lastPush = state.lastPushResult || {};
  if (!lastPush.shareUrl) {
    setStatus(t("popupErrorCreatePushBeforeQr"), "error");
    return;
  }

  if (lastPush.qrVisible) {
    state.lastPushResult = {
      ...lastPush,
      qrVisible: false
    };
    renderResult(state.lastPushResult);
    return;
  }

  if (lastPush.qrPngDataUrl) {
    state.lastPushResult = {
      ...lastPush,
      qrVisible: true
    };
    renderResult(state.lastPushResult);
    return;
  }

  await renderQrForLatestPush();
}

async function renderQrForLatestPush() {
  const lastPush = state.lastPushResult || {};
  if (!lastPush.shareUrl) {
    setStatus(t("popupErrorCreatePushBeforeQr"), "error");
    return;
  }

  try {
    setStatus(t("popupLoadingQr"), "info");
    const qrSvg = await loadPreviewQrSvg(lastPush);
    if (!qrSvg) {
      setStatus(t("popupErrorRenderQr"), "error");
      return;
    }

    const updated = {
      ...lastPush,
      qrSvg: "",
      qrPngDataUrl: await svgToPngDataUrl(qrSvg, 512, 512),
      qrVisible: true
    };

    if (!updated.qrPngDataUrl) {
      setStatus(t("popupErrorConvertQrPng"), "error");
      return;
    }

    state.lastPushResult = updated;
    renderResult(updated);
    setStatus(t("popupQrLoaded"), "success");
  } catch (error) {
    setStatus((error && error.message) || t("popupErrorRenderQr"), "error");
  }
}

async function loadPreviewQrSvg(lastPush) {
  const baseUrl = ((state.settings || {}).baseUrl || "").trim();
  const previewCandidates = [];

  if (lastPush.urlToken && baseUrl) {
    try {
      previewCandidates.push(buildPreviewUrlFromToken(lastPush.urlToken, baseUrl));
    } catch (_error) {
      // Continue with other lookup paths.
    }
  }

  if (lastPush.shareUrl) {
    try {
      previewCandidates.push(buildPreviewUrl(lastPush.shareUrl, baseUrl));
    } catch (_error) {
      // Continue with other lookup paths.
    }
  }

  for (const previewCandidate of previewCandidates) {
    const directSvg = await loadPreviewSvgFromUrl(previewCandidate, baseUrl);
    if (directSvg) {
      return directSvg;
    }
  }

  if (lastPush.urlToken && baseUrl) {
    const previewResult = await getPushPreview(lastPush.urlToken, {
      baseUrl,
      token: state.settings.apiToken || "",
      workspaceId: state.settings.selectedWorkspaceId || ""
    });
    if (previewResult.ok && previewResult.data) {
      const apiCandidates = [];

      if (previewResult.data.shareUrl) {
        try {
          apiCandidates.push(buildPreviewUrl(previewResult.data.shareUrl, baseUrl));
        } catch (_error) {
          // Continue with token-based path.
        }
      }

      const previewToken = previewResult.data.url_token || lastPush.urlToken;
      if (previewToken) {
        try {
          apiCandidates.push(buildPreviewUrlFromToken(previewToken, baseUrl));
        } catch (_error) {
          // No additional candidate.
        }
      }

      for (const previewCandidate of apiCandidates) {
        const svg = await loadPreviewSvgFromUrl(previewCandidate, baseUrl);
        if (svg) {
          return svg;
        }
      }
    }
  }
  return "";
}

async function loadPreviewSvgFromUrl(previewUrl, baseUrl) {
  let trustedPreviewUrl = "";
  try {
    trustedPreviewUrl = toConfiguredShareUrl(previewUrl, baseUrl);
  } catch (_error) {
    return "";
  }

  try {
    const response = await fetch(trustedPreviewUrl, {
      method: "GET",
      headers: {Accept: "text/html"}
    });
    if (!response.ok) {
      return "";
    }

    return extractFirstSvg(await response.text());
  } catch (_error) {
    return "";
  }
}

async function downloadQrPng() {
  const lastPush = state.lastPushResult || {};
  const dataUrl = lastPush.qrPngDataUrl || "";
  if (!dataUrl) {
    setStatus(t("popupErrorGenerateQrFirst"), "error");
    return;
  }

  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = "pwpush-qr.png";
  link.click();
  setStatus(t("popupQrDownloaded"), "success");
}

function svgToPngDataUrl(svgMarkup, width, height) {
  return new Promise((resolve) => {
    const blob = new Blob([svgMarkup], {type: "image/svg+xml"});
    const blobUrl = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      URL.revokeObjectURL(blobUrl);
      resolve(canvas.toDataURL("image/png"));
    };

    image.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      resolve("");
    };

    image.src = blobUrl;
  });
}

function resolveDisplayedShareUrl(shareUrl, urlToken, baseUrl) {
  try {
    if (shareUrl) {
      return toConfiguredShareUrl(shareUrl, baseUrl);
    }
  } catch (_error) {
    // The server URL was not a push link on this host. Fall back to the token.
  }

  const token = String(urlToken || "").trim();
  if (!token || !baseUrl) {
    return "";
  }

  const trusted = new URL(baseUrl);
  trusted.pathname = `/p/${encodeURIComponent(token)}`;
  trusted.search = "";
  trusted.hash = "";
  return trusted.toString();
}

function setQrVisible(visible) {
  elements.showQrButton.setAttribute("aria-expanded", visible ? "true" : "false");
  elements.showQrButton.textContent = visible ? t("popupHideQrButton") : t("popupShowQrButton");
}

function renderQrImage(dataUrl) {
  const image = document.createElement("img");
  image.src = dataUrl;
  image.alt = t("popupQrImageAlt");
  image.width = 256;
  image.height = 256;
  image.decoding = "async";
  image.loading = "eager";
  elements.qrContainer.textContent = "";
  elements.qrContainer.appendChild(image);
}

async function persistPushOptions(options) {
  const settings = await saveSettings({
    ...state.settings,
    lastPushOptions: {
      ...options,
      passphrase: ""
    }
  });
  state.settings = settings;
}

function getPushOptions() {
  return {
    expireAfterDays: Number.parseInt(elements.expireAfterDays.value, 10) || 7,
    expireAfterViews: Number.parseInt(elements.expireAfterViews.value, 10) || 5,
    retrievalStep: elements.retrievalStep.checked,
    passphrase: elements.passphrase.value.trim()
  };
}

function getRequestOptions() {
  const expireDays = Number.parseInt(elements.requestExpireDays.value, 10) || 7;
  return {
    name: elements.requestName.value.trim(),
    note: elements.requestNote.value.trim(),
    closeAfterDuration: mapDaysToRequestDuration(expireDays),
    retrievalStep: elements.requestRetrievalStep.checked,
    passphrase: elements.requestPassphrase.value.trim(),
    notifyEmailsTo: elements.requestNotifyEmails.value.trim(),
    authenticatedRecipients: false,
    notifyRecipients: Boolean(elements.requestNotifyEmails.value.trim()),
    includeRequestor: false,
    responseFileAttachments: elements.requestResponseFiles.checked
  };
}

function mapDaysToRequestDuration(days) {
  if (days === 1) return 6;
  if (days === 2) return 7;
  if (days === 3) return 8;
  if (days === 4) return 9;
  if (days === 5) return 10;
  if (days === 6) return 11;
  if (days === 7) return 12;
  if (days <= 14) return 13;
  if (days <= 21) return 14;
  if (days <= 30) return 15;
  if (days <= 60) return 16;
  return 17;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_FILES = 10;

function handleFileSelection(fileList, type) {
  if (!fileList || fileList.length === 0) {
    return;
  }

  const files = Array.from(fileList);
  const stateKey = type === "push" ? "pushSelectedFiles" : "requestSelectedFiles";
  const currentFiles = state[stateKey];
  
  const totalFiles = currentFiles.length + files.length;
  if (totalFiles > MAX_FILES) {
    setStatus(t("popupErrorTooManyFiles", [String(MAX_FILES)], `You can attach up to ${MAX_FILES} files.`), "error");
    return;
  }

  const validFiles = [];
  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      setStatus(t("popupErrorFileTooLarge", [file.name, formatFileSize(MAX_FILE_SIZE)], `${file.name} is too large. Maximum size is ${formatFileSize(MAX_FILE_SIZE)}.`), "error");
      continue;
    }
    validFiles.push(file);
  }

  state[stateKey] = [...currentFiles, ...validFiles];
  renderSelectedFiles(type);
  
  if (type === "push") {
    elements.pushFileInput.value = "";
  } else {
    elements.requestFileInput.value = "";
  }
}

function removeFile(type, index) {
  const stateKey = type === "push" ? "pushSelectedFiles" : "requestSelectedFiles";
  state[stateKey] = state[stateKey].filter((_, i) => i !== index);
  renderSelectedFiles(type);
}

function renderSelectedFiles(type) {
  const stateKey = type === "push" ? "pushSelectedFiles" : "requestSelectedFiles";
  const container = type === "push" ? elements.pushSelectedFiles : elements.requestSelectedFiles;
  const files = state[stateKey];
  
  container.textContent = "";
  
  if (files.length === 0) {
    return;
  }

  files.forEach((file, index) => {
    const fileEl = document.createElement("div");
    fileEl.className = "selected-file";
    
    const infoEl = document.createElement("div");
    infoEl.className = "selected-file-info";
    
    const iconEl = document.createElement("div");
    iconEl.className = "selected-file-icon";
    iconEl.textContent = getFileIcon(file.name);
    
    const nameEl = document.createElement("div");
    nameEl.className = "selected-file-name";
    nameEl.textContent = file.name;
    nameEl.title = file.name;
    
    const sizeEl = document.createElement("div");
    sizeEl.className = "selected-file-size";
    sizeEl.textContent = formatFileSize(file.size);
    
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "selected-file-remove";
    removeBtn.textContent = t("popupRemoveFileButton", [], "Remove");
    removeBtn.addEventListener("click", () => removeFile(type, index));
    
    infoEl.appendChild(iconEl);
    infoEl.appendChild(nameEl);
    fileEl.appendChild(infoEl);
    fileEl.appendChild(sizeEl);
    fileEl.appendChild(removeBtn);
    container.appendChild(fileEl);
  });
}

function formatFileSize(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getFileIcon(filename) {
  const ext = filename.split(".").pop().toLowerCase();
  const icons = {
    pdf: "📄",
    doc: "📝",
    docx: "📝",
    txt: "📝",
    jpg: "🖼️",
    jpeg: "🖼️",
    png: "🖼️",
    gif: "🖼️",
    zip: "📦",
    rar: "📦",
    tar: "📦",
    gz: "📦"
  };
  return icons[ext] || "📎";
}

function ensureServerConfigured() {
  if (!state.settings || !state.settings.baseUrl) {
    throw new Error(t("popupErrorConfigureServerFirst"));
  }
}

function tryBeginBusy() {
  if (state.isBusy) {
    return false;
  }

  state.isBusy = true;
  updateActionButtons();
  return true;
}

function endBusy() {
  state.isBusy = false;
  updateActionButtons();
}

function updateActionButtons() {
  const hasPayload = Boolean(elements.payload.value.trim());
  const hasRequestMessage = Boolean(elements.requestMessage.value.trim());
  const locked = state.isBusy || state.isReadingSelection;
  
  elements.pushButton.disabled = locked || !hasPayload;
  elements.pushUrlButton.disabled = locked || urlPushCoolingDown();
  elements.addSelectionButton.disabled = locked;
  elements.createRequestButton.disabled = locked || !hasRequestMessage || !state.requestsSupported.available;
}

function urlPushCoolingDown() {
  return Date.now() < urlPushAvailableAt;
}

function startUrlPushCooldown() {
  const now = Date.now();
  urlPushAvailableAt = now + URL_PUSH_COOLDOWN_MS;
  Promise.resolve(chrome.storage.session.set({[URL_PUSH_COOLDOWN_KEY]: now})).catch(() => {});
  paintUrlPushCooldown();
}

async function restoreUrlPushCooldown() {
  try {
    const stored = await chrome.storage.session.get([URL_PUSH_COOLDOWN_KEY]);
    const lastAt = Number(stored[URL_PUSH_COOLDOWN_KEY]) || 0;
    if (lastAt > 0) {
      urlPushAvailableAt = lastAt + URL_PUSH_COOLDOWN_MS;
    }
  } catch (_error) {
    urlPushAvailableAt = 0;
  }

  paintUrlPushCooldown();
}

function paintUrlPushCooldown() {
  const remaining = urlPushAvailableAt - Date.now();
  if (remaining <= 0) {
    urlPushAvailableAt = 0;
    urlPushCooldownSeconds = 0;
    if (urlPushCooldownTimer) {
      clearInterval(urlPushCooldownTimer);
      urlPushCooldownTimer = null;
    }
    elements.pushUrlButton.textContent = t("popupPushCurrentUrlButton", [], "Push Current URL");
    updateActionButtons();
    return;
  }

  const seconds = Math.ceil(remaining / 1000);
  if (seconds !== urlPushCooldownSeconds) {
    urlPushCooldownSeconds = seconds;
    elements.pushUrlButton.textContent = t(
      "popupPushCurrentUrlCooldown",
      [String(seconds)],
      `Push Current URL (${seconds}s)`
    );
  }
  updateActionButtons();
  if (!urlPushCooldownTimer) {
    urlPushCooldownTimer = setInterval(paintUrlPushCooldown, 200);
  }
}

async function activeHttpTab() {
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  if (!tab || !tab.id || !tab.url) {
    return null;
  }

  const url = new URL(tab.url);
  if (!["http:", "https:"].includes(url.protocol)) {
    return null;
  }

  return tab;
}

async function activeTabHasSelection() {
  try {
    const tab = await activeHttpTab();
    if (!tab) {
      return false;
    }

    const results = await chrome.scripting.executeScript({
      target: {tabId: tab.id},
      func: () => {
        const selection = window.getSelection ? window.getSelection().toString() : "";
        return Boolean(selection && selection.trim());
      }
    });
    return Boolean(results && results[0] && results[0].result);
  } catch (_error) {
    return false;
  }
}

async function readActiveTabSelection() {
  try {
    const tab = await activeHttpTab();
    if (!tab) {
      return {text: "", status: "unavailable"};
    }

    const results = await chrome.scripting.executeScript({
      target: {tabId: tab.id},
      func: () => (window.getSelection ? window.getSelection().toString() : "")
    });
    const text = String((results && results[0] && results[0].result) || "").trim();
    return {text, status: text ? "ok" : "empty"};
  } catch (_error) {
    return {text: "", status: "unavailable"};
  }
}

async function withLoading(button, loadingText, task) {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = loadingText;

  try {
    await task();
  } catch (error) {
    setStatus(error.message || t("commonActionFailed"), "error");
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function setStatus(message, style = "info") {
  elements.statusMessage.classList.remove("success", "error", "info");
  elements.statusMessage.classList.add(style);
  elements.statusMessage.textContent = message;
}

function formatInstanceType(value) {
  if (value === "oss") return t("commonOpenSource");
  if (value === "pro") return t("commonProCommercial");
  return t("commonUnknown");
}

function formatResultMeta(result) {
  const parts = [];
  if (result.viewsRemaining !== null && result.viewsRemaining !== undefined) {
    parts.push(t("popupViewsLeft", [String(result.viewsRemaining)]));
  }

  if (result.expiresAt) {
    parts.push(t("popupExpiresAt", [new Date(result.expiresAt).toLocaleString()]));
  } else if (result.expiresIn) {
    parts.push(t("popupExpiresIn", [String(result.expiresIn)]));
  }

  return parts.join(" • ") || t("popupReadyToShare");
}
