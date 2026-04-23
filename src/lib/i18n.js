export function t(key, substitutions = [], fallback = "") {
  const message = globalThis.chrome?.i18n?.getMessage?.(key, substitutions);
  if (message) {
    return message;
  }

  return fallback || key;
}

export function applyDocumentI18n(root = document) {
  const language = globalThis.chrome?.i18n?.getUILanguage?.();
  if (language && root?.documentElement) {
    root.documentElement.lang = language;
  }

  root.querySelectorAll("[data-i18n]").forEach((node) => {
    const key = node.getAttribute("data-i18n");
    if (!key) {
      return;
    }

    node.textContent = t(key, [], node.textContent || "");
  });

  root.querySelectorAll("[data-i18n-html]").forEach((node) => {
    const key = node.getAttribute("data-i18n-html");
    if (!key) {
      return;
    }

    node.innerHTML = t(key, [], node.innerHTML || "");
  });

  root.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    const key = node.getAttribute("data-i18n-placeholder");
    if (!key) {
      return;
    }

    node.setAttribute("placeholder", t(key, [], node.getAttribute("placeholder") || ""));
  });

  root.querySelectorAll("[data-i18n-title]").forEach((node) => {
    const key = node.getAttribute("data-i18n-title");
    if (!key) {
      return;
    }

    node.setAttribute("title", t(key, [], node.getAttribute("title") || ""));
  });

  root.querySelectorAll("[data-i18n-alt]").forEach((node) => {
    const key = node.getAttribute("data-i18n-alt");
    if (!key) {
      return;
    }

    node.setAttribute("alt", t(key, [], node.getAttribute("alt") || ""));
  });

  root.querySelectorAll("[data-i18n-aria-label]").forEach((node) => {
    const key = node.getAttribute("data-i18n-aria-label");
    if (!key) {
      return;
    }

    node.setAttribute("aria-label", t(key, [], node.getAttribute("aria-label") || ""));
  });
}
