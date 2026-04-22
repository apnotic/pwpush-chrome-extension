export function normalizeBaseUrl(rawValue) {
  if (!rawValue || typeof rawValue !== "string") {
    throw new Error("A server URL is required.");
  }

  let parsed;
  try {
    parsed = new URL(rawValue.trim());
  } catch (error) {
    throw new Error("Enter a valid URL, including https://.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Only https:// URLs are supported.");
  }

  return parsed.origin;
}

export async function requestJson(pathname, options = {}) {
  const {
    baseUrl,
    token = "",
    method = "GET",
    body,
    accountId = "",
    timeoutMs = 8000
  } = options;

  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const requestUrl = new URL(pathname, `${normalizedBaseUrl}/`);
  if (accountId && accountId.toString().trim()) {
    requestUrl.searchParams.set("account_id", accountId.toString().trim());
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
  const headers = {
    Accept: "application/json"
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (body) {
    headers["Content-Type"] = "application/json";
  }

  try {
    const response = await fetch(requestUrl, {
      method,
      headers,
      body: body ? JSON.stringify(appendAccountIdToBody(body, accountId)) : undefined,
      signal: controller.signal
    });

    let data = null;
    let parseError = null;
    try {
      data = await response.json();
    } catch (error) {
      parseError = error;
    }

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        data,
        errorType: "http_error",
        errorMessage: parseApiError(response.status, data)
      };
    }

    if (parseError) {
      return {
        ok: false,
        status: response.status,
        data: null,
        errorType: "invalid_json",
        errorMessage: "The server response was not valid JSON."
      };
    }

    return {
      ok: true,
      status: response.status,
      data
    };
  } catch (error) {
    if (error.name === "AbortError") {
      return {
        ok: false,
        status: 0,
        data: null,
        errorType: "timeout",
        errorMessage: "Request timed out. Please try again."
      };
    }

    return {
      ok: false,
      status: 0,
      data: null,
      errorType: "network_error",
      errorMessage: "Unable to reach this server. Check URL, network, or CORS settings."
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

export async function createPush(payload, options = {}) {
  const {
    baseUrl,
    token = "",
    accountId = "",
    instanceType = "unknown",
    expireAfterDays = 7,
    expireAfterViews = 5,
    retrievalStep = false,
    passphrase = ""
  } = options;

  const pushPayload = buildPushPayload(payload, {
    instanceType,
    expireAfterDays,
    expireAfterViews,
    retrievalStep,
    passphrase
  });

  const createResult = await requestJson("/api/v2/pushes", {
    baseUrl,
    token,
    accountId,
    method: "POST",
    body: {
      push: pushPayload
    }
  });

  if (!createResult.ok) {
    return createResult;
  }

  const createData = createResult.data || {};
  const urlToken = createData.url_token || "";
  const shareUrl = createData.html_url || await resolvePreviewUrl({
    baseUrl,
    token,
    accountId,
    urlToken
  });

  if (!shareUrl) {
    return {
      ok: false,
      status: createResult.status,
      data: createData,
      errorType: "invalid_response",
      errorMessage: "Push created but no share URL was returned."
    };
  }

  return {
    ok: true,
    status: createResult.status,
    data: {
      ...createData,
      urlToken,
      shareUrl
    }
  };
}

export async function getPushPreview(urlToken, options = {}) {
  const {baseUrl, token = "", accountId = ""} = options;

  if (!urlToken) {
    return {
      ok: false,
      status: 0,
      data: null,
      errorType: "invalid_request",
      errorMessage: "Missing push token for preview lookup."
    };
  }

  const tokenPath = encodeURIComponent(urlToken);
  const result = await requestJson(`/api/v2/pushes/${tokenPath}/preview`, {
    baseUrl,
    token,
    accountId
  });

  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    status: result.status,
    data: {
      ...result.data,
      shareUrl: (result.data || {}).url || ""
    }
  };
}

export async function listAccounts(options = {}) {
  const {baseUrl, token = ""} = options;

  if (!token || !token.trim()) {
    return {
      ok: false,
      status: 0,
      data: null,
      errorType: "missing_token",
      errorMessage: "Add an API token to load available accounts."
    };
  }

  const result = await requestJson("/api/v2/accounts", {
    baseUrl,
    token
  });

  if (!result.ok) {
    return result;
  }

  const rawAccounts = Array.isArray(result.data) ? result.data : [];
  const accounts = rawAccounts
    .filter((account) => account && account.id)
    .map((account) => ({
      id: String(account.id),
      name: String(account.name || `Account ${account.id}`)
    }));

  return {
    ok: true,
    status: result.status,
    data: {
      accounts
    }
  };
}

function buildPushPayload(payload, options = {}) {
  const {
    instanceType = "unknown",
    expireAfterDays = 7,
    expireAfterViews = 5,
    retrievalStep = false,
    passphrase = ""
  } = options;

  const sanitizedPayload = String(payload || "").trim();
  const push = {
    payload: sanitizedPayload,
    expire_after_views: clampToRange(expireAfterViews, 1, 100),
    retrieval_step: Boolean(retrievalStep)
  };

  if (passphrase) {
    push.passphrase = passphrase;
  }

  if (instanceType === "pro") {
    push.expire_after_duration = mapDaysToDurationEnum(expireAfterDays);
  } else {
    push.expire_after_days = clampToRange(expireAfterDays, 1, 90);
  }

  return push;
}

async function resolvePreviewUrl({baseUrl, token, accountId, urlToken}) {
  if (!urlToken) {
    return "";
  }

  const previewResult = await getPushPreview(urlToken, {baseUrl, token, accountId});
  if (!previewResult.ok) {
    return "";
  }

  return (previewResult.data || {}).shareUrl || "";
}

function appendAccountIdToBody(body, accountId) {
  if (!body || typeof body !== "object" || !accountId || !accountId.toString().trim()) {
    return body;
  }

  return {
    ...body,
    account_id: accountId.toString().trim()
  };
}

function mapDaysToDurationEnum(daysValue) {
  const days = clampToRange(daysValue, 1, 90);
  if (days === 1) return 6;
  if (days === 2) return 7;
  if (days === 3) return 8;
  if (days === 4) return 9;
  if (days === 5) return 10;
  if (days === 6) return 11;
  if (days === 7) return 12;
  if (days <= 14) return 13;
  if (days <= 21) return 14;
  if (days <= 30) return 15;
  if (days <= 60) return 16;
  return 17;
}

function clampToRange(value, min, max) {
  const numeric = Number.parseInt(value, 10);
  if (Number.isNaN(numeric)) {
    return min;
  }

  return Math.min(max, Math.max(min, numeric));
}

function parseApiError(status, data) {
  if (data && typeof data === "object") {
    if (typeof data.error === "string" && data.error.trim()) {
      return data.error;
    }

    if (typeof data.message === "string" && data.message.trim()) {
      return data.message;
    }
  }

  switch (status) {
    case 401:
      return "Authentication is required for this request.";
    case 403:
      return "Access is forbidden for this request.";
    case 404:
      return "This endpoint was not found on the selected server. You may need to upgrade your instance to the latest version.";
    default:
      return `Request failed with status ${status}.`;
  }
}
