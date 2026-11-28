export const OFFSCREEN_CLIPBOARD_PATH = "src/offscreen/clipboard.html";
export const COPY_TO_CLIPBOARD_MESSAGE = "copyToClipboard";
export const OFFSCREEN_MESSAGE_TARGET = "offscreen";

let creatingOffscreenDocument = null;

export async function copyTextWithClipboardApi(text) {
  const value = String(text || "");
  if (!value || typeof navigator?.clipboard?.writeText !== "function") {
    return false;
  }

  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export function copyTextWithExecCommand(text, doc = document) {
  const textarea = doc.querySelector("#clipboard");
  if (!textarea) {
    return false;
  }

  textarea.value = String(text || "");
  textarea.focus();
  textarea.select();
  try {
    return Boolean(doc.execCommand("copy"));
  } catch {
    return false;
  } finally {
    textarea.value = "";
  }
}

export async function copyTextViaOffscreen(text) {
  const value = String(text || "");
  if (!value || typeof chrome?.offscreen?.createDocument !== "function") {
    return false;
  }

  try {
    await ensureOffscreenDocument();
    const response = await sendCopyMessage(value);
    return Boolean(response?.ok);
  } catch {
    return false;
  } finally {
    await closeOffscreenDocument();
  }
}

async function sendCopyMessage(text) {
  const payload = {
    type: COPY_TO_CLIPBOARD_MESSAGE,
    target: OFFSCREEN_MESSAGE_TARGET,
    text
  };

  try {
    return await chrome.runtime.sendMessage(payload);
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return chrome.runtime.sendMessage(payload);
  }
}

async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) {
    return;
  }

  if (creatingOffscreenDocument) {
    await creatingOffscreenDocument;
    return;
  }

  creatingOffscreenDocument = chrome.offscreen.createDocument({
    url: OFFSCREEN_CLIPBOARD_PATH,
    reasons: ["CLIPBOARD"],
    justification: "Write the created share URL to the clipboard after an instant push."
  });

  try {
    await creatingOffscreenDocument;
  } catch (error) {
    if (await hasOffscreenDocument()) {
      return;
    }
    throw error;
  } finally {
    creatingOffscreenDocument = null;
  }
}

async function hasOffscreenDocument() {
  if (typeof chrome?.offscreen?.hasDocument === "function") {
    return Boolean(await chrome.offscreen.hasDocument());
  }

  if (typeof chrome?.runtime?.getContexts !== "function") {
    return false;
  }

  const existing = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_CLIPBOARD_PATH)]
  });
  return Boolean(existing && existing.length);
}

async function closeOffscreenDocument() {
  if (typeof chrome?.offscreen?.closeDocument !== "function") {
    return;
  }

  try {
    await chrome.offscreen.closeDocument();
  } catch {
    // Already closed, or no document was open.
  }
}
