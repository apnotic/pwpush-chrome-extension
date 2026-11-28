chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.target !== "offscreen" || message.type !== "copyToClipboard") {
    return false;
  }

  copyText(message.text)
    .then((ok) => sendResponse({ok}))
    .catch(() => sendResponse({ok: false}));
  return true;
});

async function copyText(text) {
  const value = String(text || "");
  if (!value) {
    return false;
  }

  if (typeof navigator?.clipboard?.writeText === "function") {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Fall through to execCommand; some environments still allow it.
    }
  }

  return copyWithExecCommand(value);
}

function copyWithExecCommand(text) {
  const textarea = document.querySelector("#clipboard");
  if (!textarea) {
    return false;
  }

  textarea.value = String(text || "");
  textarea.focus();
  textarea.select();
  try {
    return Boolean(document.execCommand("copy"));
  } catch {
    return false;
  } finally {
    textarea.value = "";
  }
}
