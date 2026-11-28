import {createPush} from "./api-client.js";
import {copyTextViaOffscreen} from "./clipboard.js";
import {t} from "./i18n.js";
import {
  getInstanceStatus,
  getSettings,
  setContextMenuStash
} from "./storage.js";
import {toConfiguredShareUrl} from "../popup/qr-utils.js";

export const MENU_PUSH_SELECTED_TEXT = "pwpush-push-selected-text";
export const MENU_PUSH_THIS_LINK = "pwpush-push-this-link";

const BADGE_REVIEW = "1";
const BADGE_COPIED = "OK";
const BADGE_ERROR = "!";
const BADGE_COLOR_REVIEW = "#0369a1";
const BADGE_COLOR_SUCCESS = "#047857";
const BADGE_COLOR_ERROR = "#b91c1c";

export async function registerContextMenus() {
  if (!globalThis.chrome?.contextMenus?.create) {
    return;
  }

  await chrome.contextMenus.removeAll();
  await chrome.contextMenus.create({
    id: MENU_PUSH_SELECTED_TEXT,
    title: t("contextMenuPushSelectedText", [], "Push selected text…"),
    contexts: ["selection"]
  });
  await chrome.contextMenus.create({
    id: MENU_PUSH_THIS_LINK,
    title: t("contextMenuPushThisLink", [], "Push this link…"),
    contexts: ["link"]
  });
}

export async function handleContextMenuClick(info, tab) {
  const menuItemId = info?.menuItemId;
  if (menuItemId === MENU_PUSH_SELECTED_TEXT) {
    await handleSelectedText(info, tab);
    return;
  }

  if (menuItemId === MENU_PUSH_THIS_LINK) {
    await handleLink(info, tab);
  }
}

export async function clearActionAttention() {
  if (!globalThis.chrome?.action?.setBadgeText) {
    return;
  }

  await chrome.action.setBadgeText({text: ""});
  await chrome.action.setTitle({
    title: t("actionTitle", [], "Password Pusher")
  });
}

async function handleSelectedText(info, tab) {
  const payload = String(info?.selectionText || "").trim();
  if (!payload) {
    return;
  }

  const settings = await getSettings();
  if (!settings.baseUrl) {
    await stashAndPrompt({
      kind: "error",
      source: "selection",
      payload,
      message: t("popupErrorConfigureServerFirst", [], "Configure a Password Pusher server in Settings first.")
    }, tab, {
      text: BADGE_ERROR,
      color: BADGE_COLOR_ERROR,
      titleKey: "contextMenuBadgeNoServerTitle",
      titleFallback: "Password Pusher: configure a server in Settings",
      openSettings: true
    });
    return;
  }

  if (settings.instantPushSelectedText === true) {
    await createInstantPush(payload, "selection", settings, tab);
    return;
  }

  await stashAndPrompt({
    kind: "prefill",
    source: "selection",
    payload
  }, tab, {
    text: BADGE_REVIEW,
    color: BADGE_COLOR_REVIEW,
    titleKey: "contextMenuBadgeReviewTitle",
    titleFallback: "Password Pusher: click the toolbar icon to review before pushing"
  });
}

async function handleLink(info, tab) {
  const linkUrl = String(info?.linkUrl || "").trim();
  let payload = "";
  try {
    payload = normalizeHttpUrl(linkUrl);
  } catch (error) {
    await stashAndPrompt({
      kind: "error",
      source: "link",
      payload: "",
      message: error.message || t("popupErrorOnlyHttpHttps", [], "Only http/https pages can be pushed.")
    }, tab, {
      text: BADGE_ERROR,
      color: BADGE_COLOR_ERROR,
      titleKey: "contextMenuBadgeErrorTitle",
      titleFallback: "Password Pusher: click the toolbar icon for details"
    });
    return;
  }

  const settings = await getSettings();
  if (!settings.baseUrl) {
    await stashAndPrompt({
      kind: "error",
      source: "link",
      payload,
      message: t("popupErrorConfigureServerFirst", [], "Configure a Password Pusher server in Settings first.")
    }, tab, {
      text: BADGE_ERROR,
      color: BADGE_COLOR_ERROR,
      titleKey: "contextMenuBadgeNoServerTitle",
      titleFallback: "Password Pusher: configure a server in Settings",
      openSettings: true
    });
    return;
  }

  await stashAndPrompt({
    kind: "prefill",
    source: "link",
    payload
  }, tab, {
    text: BADGE_REVIEW,
    color: BADGE_COLOR_REVIEW,
    titleKey: "contextMenuBadgeReviewTitle",
    titleFallback: "Password Pusher: click the toolbar icon to review before pushing"
  });
}

async function createInstantPush(payload, source, settings, tab) {
  const instanceStatus = await getInstanceStatus();
  const options = settings.lastPushOptions || {};
  const createResult = await createPush(payload, {
    baseUrl: settings.baseUrl,
    token: settings.apiToken || "",
    workspaceId: settings.selectedWorkspaceId || "",
    instanceType: instanceStatus.instanceType || "unknown",
    expireAfterDays: options.expireAfterDays,
    expireAfterViews: options.expireAfterViews,
    retrievalStep: options.retrievalStep,
    passphrase: ""
  });

  if (!createResult.ok) {
    await stashAndPrompt({
      kind: "error",
      source,
      payload,
      message: createResult.errorMessage || t("popupErrorPushCreationFailed", [], "Push creation failed.")
    }, tab, {
      text: BADGE_ERROR,
      color: BADGE_COLOR_ERROR,
      titleKey: "contextMenuBadgeErrorTitle",
      titleFallback: "Password Pusher: click the toolbar icon for details"
    });
    return;
  }

  const data = createResult.data || {};
  const shareUrl = resolveDisplayedShareUrl(
    data.shareUrl || "",
    data.urlToken || data.url_token || "",
    settings.baseUrl
  );
  if (!shareUrl) {
    await stashAndPrompt({
      kind: "error",
      source,
      payload,
      message: t("apiErrorPushNoShareUrl", [], "Push created but no share URL was returned.")
    }, tab, {
      text: BADGE_ERROR,
      color: BADGE_COLOR_ERROR,
      titleKey: "contextMenuBadgeErrorTitle",
      titleFallback: "Password Pusher: click the toolbar icon for details"
    });
    return;
  }

  const copied = await copyTextViaOffscreen(shareUrl);
  const resultStash = {
    kind: "result",
    source,
    shareUrl,
    urlToken: data.urlToken || data.url_token || "",
    expiresAt: data.expires_at || null,
    expiresIn: data.expires_in || null,
    viewsRemaining: data.views_remaining ?? null,
    copied
  };

  if (copied) {
    await setContextMenuStash(resultStash);
    await setActionAttention({
      text: BADGE_COPIED,
      color: BADGE_COLOR_SUCCESS,
      title: t("contextMenuBadgeCopiedTitle", [], "Password Pusher: share link copied")
    });
    return;
  }

  await stashAndPrompt(resultStash, tab, {
    text: BADGE_REVIEW,
    color: BADGE_COLOR_REVIEW,
    titleKey: "contextMenuBadgeCopyTitle",
    titleFallback: "Password Pusher: click the toolbar icon to copy the share link"
  });
}

async function stashAndPrompt(stash, tab, attention) {
  await setContextMenuStash(stash);
  if (attention.openSettings) {
    await chrome.runtime.openOptionsPage();
  }

  const opened = attention.openSettings ? false : await tryOpenPopup(tab);
  if (opened) {
    return;
  }

  await setActionAttention({
    text: attention.text,
    color: attention.color,
    title: t(attention.titleKey, [], attention.titleFallback)
  });
}

async function tryOpenPopup(tab) {
  if (typeof chrome.action?.openPopup !== "function") {
    return false;
  }

  try {
    if (tab?.windowId) {
      await chrome.action.openPopup({windowId: tab.windowId});
    } else {
      await chrome.action.openPopup();
    }
    return true;
  } catch {
    return false;
  }
}

async function setActionAttention({text, color, title}) {
  if (!globalThis.chrome?.action?.setBadgeText) {
    return;
  }

  await chrome.action.setBadgeBackgroundColor({color});
  await chrome.action.setBadgeText({text});
  await chrome.action.setTitle({title});
}

function normalizeHttpUrl(rawValue) {
  let parsed;
  try {
    parsed = new URL(String(rawValue || "").trim());
  } catch {
    throw new Error(t("popupErrorOnlyHttpHttps", [], "Only http/https pages can be pushed."));
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(t("popupErrorOnlyHttpHttps", [], "Only http/https pages can be pushed."));
  }

  return parsed.toString();
}

function resolveDisplayedShareUrl(shareUrl, urlToken, baseUrl) {
  try {
    if (shareUrl) {
      return toConfiguredShareUrl(shareUrl, baseUrl);
    }
  } catch {
    // Fall through to the token on the configured host.
  }

  const token = String(urlToken || "").trim();
  if (!token || !baseUrl) {
    return "";
  }

  try {
    const trusted = new URL(baseUrl);
    trusted.pathname = `/p/${encodeURIComponent(token)}`;
    trusted.search = "";
    trusted.hash = "";
    return trusted.toString();
  } catch {
    return "";
  }
}
