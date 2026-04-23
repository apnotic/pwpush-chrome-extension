const DEFAULT_SETTINGS = {
  baseUrl: "",
  presetKey: "",
  apiToken: "",
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

export async function getSettings() {
  const result = await chrome.storage.local.get(["settings"]);
  const savedSettings = result.settings || {};
  return {
    ...DEFAULT_SETTINGS,
    ...savedSettings,
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
  const merged = {
    ...DEFAULT_SETTINGS,
    ...settings,
    availableAccounts: Array.isArray((settings || {}).availableAccounts)
      ? settings.availableAccounts
      : [],
    lastPushOptions: {
      ...DEFAULT_SETTINGS.lastPushOptions,
      ...((settings || {}).lastPushOptions || {})
    }
  };
  await chrome.storage.local.set({settings: merged});
  return merged;
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
  await chrome.storage.local.set({
    settings: DEFAULT_SETTINGS,
    instanceStatus: DEFAULT_INSTANCE_STATUS,
    lastPushResult: DEFAULT_LAST_PUSH_RESULT
  });
}
