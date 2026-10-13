import {
  createPush,
  getPushPreview
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
  payload: document.querySelector("#payload"),
  selectionHint: document.querySelector("#selectionHint"),
  addSelectionButton: document.querySelector("#addSelectionButton"),
  selectionRow: document.querySelector("#selectionRow"),
  pushButton: document.querySelector("#pushButton"),
  pushUrlButton: document.querySelector("#pushUrlButton"),
  expireAfterDays: document.querySelector("#expireAfterDays"),
  expireAfterViews: document.querySelector("#expireAfterViews"),
  retrievalStep: document.querySelector("#retrievalStep"),
  passphrase: document.querySelector("#passphrase"),
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
  isReadingSelection: false
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

loadState().catch((error) => {
  setStatus(error.message || t("popupErrorLoadState"), "error");
});

async function loadState() {
  await clearLastPushResult();
  const [settings, instanceStatus] = await Promise.all([
    getSettings(),
    getInstanceStatus()
  ]);

  state = {
    ...state,
    settings,
    instanceStatus,
    lastPushResult: null
  };
  hydrateAdvancedOptions(settings.lastPushOptions || {});
  renderConnection(settings, instanceStatus);
  renderResult(null);
  await restoreUrlPushCooldown();
  setSelectionButtonVisible(await activeTabHasSelection());
  updateActionButtons();
  if (!state.isBusy) {
    elements.payload.focus();
  }
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
    passphrase: options.passphrase
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
  renderResult(state.lastPushResult);
  setStatus(t("popupPushCreated"), "success");
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
  const locked = state.isBusy || state.isReadingSelection;
  elements.pushButton.disabled = locked || !hasPayload;
  elements.pushUrlButton.disabled = locked || urlPushCoolingDown();
  elements.addSelectionButton.disabled = locked;
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
