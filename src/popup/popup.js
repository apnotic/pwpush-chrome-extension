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
import {buildPreviewUrl, buildPreviewUrlFromToken, extractFirstSvg} from "./qr-utils.js";

const elements = {
  serverValue: document.querySelector("#serverValue"),
  instanceValue: document.querySelector("#instanceValue"),
  apiValue: document.querySelector("#apiValue"),
  recheckButton: document.querySelector("#recheckButton"),
  settingsButton: document.querySelector("#settingsButton"),
  statusMessage: document.querySelector("#statusMessage"),
  payload: document.querySelector("#payload"),
  selectionHint: document.querySelector("#selectionHint"),
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
  isBusy: false
};

let prefilledSelection = "";

applyDocumentI18n();

elements.recheckButton.addEventListener("click", async () => {
  await withLoading(elements.recheckButton, t("popupChecking"), async () => {
    const response = await chrome.runtime.sendMessage({type: "recheckInstance"});
    if (!response || !response.ok) {
      throw new Error((response && response.error) || t("popupErrorRecheckServer"));
    }
    await loadState();
  });
});

elements.settingsButton.addEventListener("click", async () => {
  await chrome.runtime.openOptionsPage();
});

elements.payload.addEventListener("input", () => {
  if (elements.payload.value !== prefilledSelection) {
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

  await navigator.clipboard.writeText(shareUrl);
  setStatus(t("popupLinkCopied"), "success");
});

elements.openLinkButton.addEventListener("click", async () => {
  const shareUrl = (state.lastPushResult || {}).shareUrl;
  if (!shareUrl) {
    return;
  }

  await chrome.tabs.create({url: shareUrl});
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
  await prefillPayloadFromSelection();
  updateActionButtons();
  if (!state.isBusy) {
    elements.payload.focus();
  }
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

    await createPushFromPayload(url.toString());
  } catch (error) {
    setStatus(error.message || t("popupErrorCreateUrlPush"), "error");
  }
}

async function createFromPayloadField() {
  try {
    ensureServerConfigured();
    const payload = elements.payload.value.trim();
    if (!payload) {
      throw new Error(t("popupErrorEmptyPayload"));
    }

    await createPushFromPayload(payload);
    elements.payload.value = "";
    prefilledSelection = "";
    setSelectionHintVisible(false);
    updateActionButtons();
  } catch (error) {
    setStatus(error.message || t("popupErrorPushCreationFailed"), "error");
  }
}

async function prefillPayloadFromSelection() {
  if (elements.payload.value.trim()) {
    return;
  }

  const selection = await readActiveTabSelection();
  if (!selection) {
    setSelectionHintVisible(false);
    return;
  }

  elements.payload.value = selection;
  prefilledSelection = selection;
  setSelectionHintVisible(true);
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

  state.isBusy = true;
  updateActionButtons();
  setStatus(t("popupCreatingPush"), "info");

  try {
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
      shareUrl: data.shareUrl || "",
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
  } finally {
    state.isBusy = false;
    updateActionButtons();
  }
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
    const directSvg = await loadPreviewSvgFromUrl(previewCandidate);
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
        const svg = await loadPreviewSvgFromUrl(previewCandidate);
        if (svg) {
          return svg;
        }
      }
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

function withButtonsDisabled(disabled) {
  state.isBusy = disabled;
  updateActionButtons();
}

function updateActionButtons() {
  const hasPayload = Boolean(elements.payload.value.trim());
  elements.pushButton.disabled = state.isBusy || !hasPayload;
  elements.pushUrlButton.disabled = state.isBusy;
}

async function readActiveTabSelection() {
  try {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    if (!tab || !tab.id || !tab.url) {
      return "";
    }

    const url = new URL(tab.url);
    if (!["http:", "https:"].includes(url.protocol)) {
      return "";
    }

    const results = await chrome.scripting.executeScript({
      target: {tabId: tab.id},
      func: () => (window.getSelection ? window.getSelection().toString() : "")
    });
    return String((results && results[0] && results[0].result) || "").trim();
  } catch (_error) {
    return "";
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
