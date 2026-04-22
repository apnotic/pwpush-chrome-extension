chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "getSelectedText") {
    return false;
  }

  const selectedText = window.getSelection ? window.getSelection().toString() : "";
  sendResponse({text: selectedText});
  return false;
});
