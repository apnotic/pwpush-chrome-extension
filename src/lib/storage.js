const DEFAULT_SETTINGS = {
  baseUrl: "",
  presetKey: "",
  apiToken: "",
  rememberApiToken: true,
  selectedAccountId: null,
  availableAccounts: [],
  lastPushOptions: {
    expireAfterDays: 7,
    expireAfterViews: 5,
    retrievalStep: false,
    passphrase: ""
  }
};

const DEFAULT_INSTANCE_STATUS = {
  connected: false,
  checkedAt: null,
  apiVersion: null,
  applicationVersion: null,
  edition: null,
  instanceType: null,
  features: {
    supportsAccountsApi: "unknown",
    supportsRequestsApi: "unknown"
  },
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
  return {
    ...DEFAULT_SETTINGS,
    ...savedSettings,
    apiToken: effectiveApiToken,
    rememberApiToken,
    availableAccounts: Array.isArray(savedSettings.availableAccounts)
      ? savedSettings.availableAccounts
      : [],
    lastPushOptions: {
      ...DEFAULT_SETTINGS.lastPushOptions,
      ...(savedSettings.lastPushOptions || {})
    }
  };
}

export async function saveSettings(settings) {
  const rawApiToken = typeof (settings || {}).apiToken === "string"
    ? settings.apiToken.trim()
    : "";
  const rememberApiToken = (settings || {}).rememberApiToken !== false;
  const storedApiToken = rememberApiToken ? rawApiToken : "";

  const merged = {
    ...DEFAULT_SETTINGS,
    ...settings,
    apiToken: storedApiToken,
    rememberApiToken,
    availableAccounts: Array.isArray((settings || {}).availableAccounts)
      ? settings.availableAccounts
      : [],
    lastPushOptions: {
      ...DEFAULT_SETTINGS.lastPushOptions,
      ...((settings || {}).lastPushOptions || {})
    }
  };
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
    features: {
      ...DEFAULT_INSTANCE_STATUS.features,
      ...((result.instanceStatus || {}).features || {})
    }
  };
}

export async function saveInstanceStatus(status) {
  const merged = {
    ...DEFAULT_INSTANCE_STATUS,
    ...status,
    features: {
      ...DEFAULT_INSTANCE_STATUS.features,
      ...((status || {}).features || {})
    }
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
    chrome.storage.session.remove([SESSION_API_TOKEN_KEY])
  ]);
}
