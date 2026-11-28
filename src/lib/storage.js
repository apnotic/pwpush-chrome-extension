const DEFAULT_SETTINGS = {
  baseUrl: "",
  presetKey: "",
  apiToken: "",
  rememberApiToken: true,
  selectedWorkspaceId: null,
  availableWorkspaces: [],
  lastPushOptions: {
    expireAfterDays: 7,
    expireAfterViews: 5,
    retrievalStep: true,
    passphrase: ""
  },
  instantPushSelectedText: false
};

const DEFAULT_INSTANCE_STATUS = {
  connected: false,
  checkedAt: null,
  apiVersion: null,
  applicationVersion: null,
  edition: null,
  instanceType: null,
  subscription: null,
  workspaceIdInvalid: false,
  features: {
    supportsWorkspacesApi: "unknown",
    supportsRequestsApi: "unknown"
  },
  versionData: null,
  error: null
};

const DEFAULT_LAST_PUSH_RESULT = {
  createdAt: null,
  shareUrl: "",
  urlToken: "",
  qrSvg: "",
  qrPngDataUrl: "",
  expiresAt: null,
  expiresIn: null,
  viewsRemaining: null,
  rawResponse: null
};

const SESSION_API_TOKEN_KEY = "sessionApiToken";
export const CONTEXT_MENU_STASH_KEY = "contextMenuStash";
export const CONTEXT_MENU_STASH_TTL_MS = 2 * 60 * 1000;

function workspaceFieldsFromSaved(savedSettings) {
  const availableWorkspaces = Array.isArray(savedSettings.availableWorkspaces)
    ? savedSettings.availableWorkspaces
    : Array.isArray(savedSettings.availableAccounts)
      ? savedSettings.availableAccounts
      : [];
  const selectedWorkspaceId = savedSettings.selectedWorkspaceId ?? savedSettings.selectedAccountId ?? null;

  return {
    availableWorkspaces,
    selectedWorkspaceId
  };
}

function withoutLegacyAccountFields(settings) {
  const next = {...settings};
  delete next.selectedAccountId;
  delete next.availableAccounts;
  return next;
}

function normalizeFeatures(features = {}) {
  return {
    supportsWorkspacesApi: features.supportsWorkspacesApi ?? features.supportsAccountsApi ?? "unknown",
    supportsRequestsApi: features.supportsRequestsApi ?? "unknown"
  };
}

export async function getSettings() {
  const [localResult, sessionResult] = await Promise.all([
    chrome.storage.local.get(["settings"]),
    chrome.storage.session.get([SESSION_API_TOKEN_KEY])
  ]);
  const savedSettings = localResult.settings || {};
  const rememberApiToken = savedSettings.rememberApiToken !== false;
  const storedApiToken = typeof savedSettings.apiToken === "string" ? savedSettings.apiToken : "";
  const sessionApiToken = typeof sessionResult[SESSION_API_TOKEN_KEY] === "string"
    ? sessionResult[SESSION_API_TOKEN_KEY]
    : "";

  const effectiveApiToken = rememberApiToken ? storedApiToken : sessionApiToken;
  return withoutLegacyAccountFields({
    ...DEFAULT_SETTINGS,
    ...savedSettings,
    apiToken: effectiveApiToken,
    rememberApiToken,
    instantPushSelectedText: savedSettings.instantPushSelectedText === true,
    ...workspaceFieldsFromSaved(savedSettings),
    lastPushOptions: {
      ...DEFAULT_SETTINGS.lastPushOptions,
      ...(savedSettings.lastPushOptions || {})
    }
  });
}

export async function saveSettings(settings) {
  const rawApiToken = typeof (settings || {}).apiToken === "string"
    ? settings.apiToken.trim()
    : "";
  const rememberApiToken = (settings || {}).rememberApiToken !== false;
  const storedApiToken = rememberApiToken ? rawApiToken : "";

  const merged = withoutLegacyAccountFields({
    ...DEFAULT_SETTINGS,
    ...settings,
    apiToken: storedApiToken,
    rememberApiToken,
    instantPushSelectedText: (settings || {}).instantPushSelectedText === true,
    ...workspaceFieldsFromSaved(settings || {}),
    lastPushOptions: {
      ...DEFAULT_SETTINGS.lastPushOptions,
      ...((settings || {}).lastPushOptions || {})
    }
  });
  await Promise.all([
    chrome.storage.local.set({settings: merged}),
    rememberApiToken
      ? chrome.storage.session.remove([SESSION_API_TOKEN_KEY])
      : chrome.storage.session.set({[SESSION_API_TOKEN_KEY]: rawApiToken})
  ]);

  return {
    ...merged,
    apiToken: rawApiToken
  };
}

export async function getInstanceStatus() {
  const result = await chrome.storage.local.get(["instanceStatus"]);
  return {
    ...DEFAULT_INSTANCE_STATUS,
    ...(result.instanceStatus || {}),
    features: normalizeFeatures((result.instanceStatus || {}).features)
  };
}

export async function saveInstanceStatus(status) {
  const merged = {
    ...DEFAULT_INSTANCE_STATUS,
    ...status,
    features: normalizeFeatures((status || {}).features)
  };
  await chrome.storage.local.set({instanceStatus: merged});
  return merged;
}

export async function clearInstanceStatus() {
  await chrome.storage.local.set({instanceStatus: DEFAULT_INSTANCE_STATUS});
}

export async function getLastPushResult() {
  const result = await chrome.storage.local.get(["lastPushResult"]);
  return {
    ...DEFAULT_LAST_PUSH_RESULT,
    ...(result.lastPushResult || {})
  };
}

export async function saveLastPushResult(pushResult) {
  const merged = {
    ...DEFAULT_LAST_PUSH_RESULT,
    ...(pushResult || {})
  };
  await chrome.storage.local.set({lastPushResult: merged});
  return merged;
}

export async function clearLastPushResult() {
  await chrome.storage.local.set({lastPushResult: DEFAULT_LAST_PUSH_RESULT});
}

export async function clearAllExtensionState() {
  await Promise.all([
    chrome.storage.local.set({
      settings: DEFAULT_SETTINGS,
      instanceStatus: DEFAULT_INSTANCE_STATUS,
      lastPushResult: DEFAULT_LAST_PUSH_RESULT
    }),
    chrome.storage.session.remove([SESSION_API_TOKEN_KEY, CONTEXT_MENU_STASH_KEY])
  ]);
}

function isFreshStash(stash) {
  if (!stash || typeof stash !== "object") {
    return false;
  }

  const createdAt = Number(stash.createdAt);
  if (!Number.isFinite(createdAt) || createdAt <= 0) {
    return false;
  }

  return Date.now() - createdAt <= CONTEXT_MENU_STASH_TTL_MS;
}

export async function setContextMenuStash(stash) {
  const record = {
    ...(stash || {}),
    createdAt: Date.now()
  };
  await chrome.storage.session.set({[CONTEXT_MENU_STASH_KEY]: record});
  return record;
}

export async function peekContextMenuStash() {
  const result = await chrome.storage.session.get([CONTEXT_MENU_STASH_KEY]);
  const stash = result[CONTEXT_MENU_STASH_KEY];
  if (!isFreshStash(stash)) {
    return null;
  }

  return stash;
}

export async function consumeContextMenuStash() {
  const result = await chrome.storage.session.get([CONTEXT_MENU_STASH_KEY]);
  const stash = result[CONTEXT_MENU_STASH_KEY];
  await chrome.storage.session.remove([CONTEXT_MENU_STASH_KEY]);
  if (!isFreshStash(stash)) {
    return null;
  }

  return stash;
}

export async function clearContextMenuStash() {
  await chrome.storage.session.remove([CONTEXT_MENU_STASH_KEY]);
}
