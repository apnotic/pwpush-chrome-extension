import {
  createPush,
  getPushPreview
} from "../lib/api-client.js";
import {
  getInstanceStatus,
  getLastPushResult,
  getSettings,
  saveLastPushResult,
  saveSettings
} from "../lib/storage.js";
import {buildPreviewUrl, extractFirstSvg} from "./qr-utils.js";

const elements = {
  serverValue: document.querySelector("#serverValue"),
  instanceValue: document.querySelector("#instanceValue"),
  editionValue: document.querySelector("#editionValue"),
  apiValue: document.querySelector("#apiValue"),
  recheckButton: document.querySelector("#recheckButton"),
  settingsButton: document.querySelector("#settingsButton"),
  statusMessage: document.querySelector("#statusMessage"),
  pushUrlButton: document.querySelector("#pushUrlButton"),
  pushSelectionButton: document.querySelector("#pushSelectionButton"),
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
  hasSelectedText: false,
  isBusy: false
};

elements.recheckButton.addEventListener("click", async () => {
  await withLoading(elements.recheckButton, "Checking...", async () => {
    const response = await chrome.runtime.sendMessage({type: "recheckInstance"});
    if (!response || !response.ok) {
      throw new Error((response && response.error) || "Unable to re-check server.");
    }
    await loadState();
  });
});

elements.settingsButton.addEventListener("click", async () => {
  await chrome.runtime.openOptionsPage();
});

elements.pushUrlButton.addEventListener("click", async () => {
  await createFromCurrentUrl();
});

elements.pushSelectionButton.addEventListener("click", async () => {
  await createFromSelectedText();
});

elements.copyLinkButton.addEventListener("click", async () => {
  const shareUrl = (state.lastPushResult || {}).shareUrl;
  if (!shareUrl) {
    return;
  }

  await navigator.clipboard.writeText(shareUrl);
  setStatus("Link copied.", "success");
});

elements.openLinkButton.addEventListener("click", async () => {
  const shareUrl = (state.lastPushResult || {}).shareUrl;
  if (!shareUrl) {
    return;
  }

  await chrome.tabs.create({url: shareUrl});
});

elements.showQrButton.addEventListener("click", async () => {
  await renderQrForLatestPush();
});

elements.downloadQrButton.addEventListener("click", async () => {
  await downloadQrPng();
});

loadState().catch((error) => {
  setStatus(error.message || "Unable to load extension state.", "error");
});

async function loadState() {
  const [settings, instanceStatus, lastPushResult] = await Promise.all([
    getSettings(),
    getInstanceStatus(),
    getLastPushResult()
  ]);

  state = {settings, instanceStatus, lastPushResult};
  hydrateAdvancedOptions(settings.lastPushOptions || {});
  renderConnection(settings, instanceStatus);
  renderResult(lastPushResult);
  await refreshSelectedTextAvailability();
  updateActionButtons();
}

function renderConnection(settings, instanceStatus) {
  elements.serverValue.textContent = settings.baseUrl || "No server configured";
  elements.instanceValue.textContent = formatInstanceType(instanceStatus.instanceType);
  elements.editionValue.textContent = instanceStatus.edition || "Unknown";
  elements.apiValue.textContent = instanceStatus.apiVersion ? `API ${instanceStatus.apiVersion}` : "API ?";
}

function renderResult(result) {
  if (!result || !result.shareUrl) {
    elements.resultSection.classList.add("hidden");
    return;
  }

  elements.resultSection.classList.remove("hidden");
  elements.resultLink.textContent = result.shareUrl;
  elements.resultMeta.textContent = formatResultMeta(result);

  if (result.qrPngDataUrl) {
    elements.qrContainer.classList.remove("hidden");
    renderQrImage(result.qrPngDataUrl);
    elements.downloadQrButton.classList.remove("hidden");
  } else {
    elements.qrContainer.classList.add("hidden");
    elements.qrContainer.textContent = "";
    elements.downloadQrButton.classList.add("hidden");
  }
}

function hydrateAdvancedOptions(options) {
  elements.expireAfterDays.value = String(options.expireAfterDays || 7);
  elements.expireAfterViews.value = String(options.expireAfterViews || 5);
  elements.retrievalStep.checked = Boolean(options.retrievalStep);
  elements.passphrase.value = options.passphrase || "";
}

async function createFromCurrentUrl() {
  try {
    ensureServerConfigured();
    setStatus("Reading current tab URL...", "info");
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    if (!tab || !tab.id || !tab.url) {
      throw new Error("Unable to read current tab URL.");
    }

    const url = new URL(tab.url);
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("Only http/https pages can be pushed.");
    }

    await createPushFromPayload(url.toString());
  } catch (error) {
    setStatus(error.message || "Unable to create URL push.", "error");
  }
}

async function createFromSelectedText() {
  try {
    ensureServerConfigured();
    setStatus("Reading selected text from page...", "info");

    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    if (!tab || !tab.id) {
      throw new Error("No active tab found.");
    }

    const results = await chrome.scripting.executeScript({
      target: {tabId: tab.id},
      func: () => window.getSelection ? window.getSelection().toString() : ""
    });
    const selection = ((results && results[0] && results[0].result) || "").trim();
    if (!selection) {
      state.hasSelectedText = false;
      updateActionButtons();
      throw new Error("No text selected. Highlight text on the page and try again.");
    }

    state.hasSelectedText = true;
    updateActionButtons();
    await createPushFromPayload(selection);
  } catch (error) {
    setStatus(formatSelectionError(error), "error");
  }
}

async function createPushFromPayload(payload) {
  const options = getPushOptions();
  await persistPushOptions(options);

  state.isBusy = true;
  updateActionButtons();
  setStatus("Creating push...", "info");

  try {
    const {settings, instanceStatus} = state;
    const createResult = await createPush(payload, {
      baseUrl: settings.baseUrl,
      token: settings.apiToken,
      accountId: settings.selectedAccountId || "",
      instanceType: instanceStatus.instanceType || "unknown",
      expireAfterDays: options.expireAfterDays,
      expireAfterViews: options.expireAfterViews,
      retrievalStep: options.retrievalStep,
      passphrase: options.passphrase
    });

    if (!createResult.ok) {
      throw new Error(createResult.errorMessage || "Push creation failed.");
    }

    const data = createResult.data || {};
    const pushResult = {
      createdAt: new Date().toISOString(),
      shareUrl: data.shareUrl || "",
      urlToken: data.urlToken || "",
      qrSvg: "",
      qrPngDataUrl: "",
      expiresAt: data.expires_at || null,
      expiresIn: data.expires_in || null,
      viewsRemaining: data.views_remaining || null,
      rawResponse: data
    };

    state.lastPushResult = await saveLastPushResult(pushResult);
    renderResult(state.lastPushResult);
    setStatus("Push created. Copy the link or open QR.", "success");
  } finally {
    state.isBusy = false;
    updateActionButtons();
  }
}

async function renderQrForLatestPush() {
  const lastPush = state.lastPushResult || {};
  if (!lastPush.shareUrl) {
    setStatus("Create a push first to generate QR.", "error");
    return;
  }

  try {
    setStatus("Loading QR from preview page...", "info");
    const qrSvg = await loadPreviewQrSvg(lastPush);
    if (!qrSvg) {
      setStatus("Unable to render QR for this push.", "error");
      return;
    }

    const updated = await saveLastPushResult({
      ...lastPush,
      qrSvg: "",
      qrPngDataUrl: await svgToPngDataUrl(qrSvg, 512, 512)
    });

    if (!updated.qrPngDataUrl) {
      setStatus("Unable to convert QR to PNG.", "error");
      return;
    }

    state.lastPushResult = updated;
    renderResult(updated);
    setStatus("QR loaded.", "success");
  } catch (error) {
    setStatus((error && error.message) || "Unable to render QR for this push.", "error");
  }
}

async function loadPreviewQrSvg(lastPush) {
  const shareUrl = lastPush.shareUrl;
  const previewCandidate = buildPreviewUrl(shareUrl, (state.settings || {}).baseUrl || "");
  const directSvg = await loadPreviewSvgFromUrl(previewCandidate);
  if (directSvg) {
    return directSvg;
  }

  if (lastPush.urlToken && state.settings.baseUrl) {
    const previewResult = await getPushPreview(lastPush.urlToken, {
      baseUrl: state.settings.baseUrl,
      token: state.settings.apiToken || "",
      accountId: state.settings.selectedAccountId || ""
    });
    if (previewResult.ok && previewResult.data && previewResult.data.shareUrl) {
      return loadPreviewSvgFromUrl(buildPreviewUrl(previewResult.data.shareUrl, (state.settings || {}).baseUrl || ""));
    }
  }
  return "";
}

async function loadPreviewSvgFromUrl(previewUrl) {
  try {
    const response = await fetch(previewUrl, {
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
    setStatus("Generate QR first.", "error");
    return;
  }

  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = "pwpush-qr.png";
  link.click();
  setStatus("QR PNG downloaded.", "success");
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

function renderQrImage(dataUrl) {
  const image = document.createElement("img");
  image.src = dataUrl;
  image.alt = "QR code for latest push";
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
    lastPushOptions: options
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
    throw new Error("Configure a Password Pusher server in Settings first.");
  }
}

function withButtonsDisabled(disabled) {
  state.isBusy = disabled;
  updateActionButtons();
}

function updateActionButtons() {
  elements.pushUrlButton.disabled = state.isBusy;
  const selectionUnavailable = !state.hasSelectedText;
  elements.pushSelectionButton.disabled = state.isBusy || selectionUnavailable;
  elements.pushSelectionButton.title = selectionUnavailable
    ? "Select text on the page first, then push."
    : "";
}

async function refreshSelectedTextAvailability() {
  state.hasSelectedText = await hasActiveTabSelection();
}

async function hasActiveTabSelection() {
  try {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    if (!tab || !tab.id || !tab.url) {
      return false;
    }

    const url = new URL(tab.url);
    if (!["http:", "https:"].includes(url.protocol)) {
      return false;
    }

    const results = await chrome.scripting.executeScript({
      target: {tabId: tab.id},
      func: () => (window.getSelection ? window.getSelection().toString().trim().length > 0 : false)
    });
    return Boolean(results && results[0] && results[0].result);
  } catch (_error) {
    return false;
  }
}

async function withLoading(button, loadingText, task) {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = loadingText;

  try {
    await task();
  } catch (error) {
    setStatus(error.message || "Action failed.", "error");
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

function formatSelectionError(error) {
  const rawMessage = String((error && error.message) || "");
  const normalized = rawMessage.toLowerCase();

  if (normalized.includes("receiving end does not exist")) {
    return "Unable to read selected text from this tab. Reload the page and try again. If needed, close and reopen the popup after reloading.";
  }

  if (normalized.includes("cannot access contents of")) {
    return "Selected text is unavailable on this page. Open a regular http/https webpage, highlight text, and try again.";
  }

  if (normalized.includes("cannot access a chrome")) {
    return "Selected text is unavailable on browser internal pages (chrome://). Open a regular webpage and try again.";
  }

  return rawMessage || "Unable to create text push.";
}

function formatInstanceType(value) {
  if (value === "oss") return "Open Source";
  if (value === "pro") return "Pro / Commercial";
  return "Unknown";
}

function formatResultMeta(result) {
  const parts = [];
  if (result.viewsRemaining !== null && result.viewsRemaining !== undefined) {
    parts.push(`Views left: ${result.viewsRemaining}`);
  }

  if (result.expiresAt) {
    parts.push(`Expires: ${new Date(result.expiresAt).toLocaleString()}`);
  } else if (result.expiresIn) {
    parts.push(`Expires in: ${result.expiresIn}s`);
  }

  return parts.join(" • ") || "Ready to share.";
}
