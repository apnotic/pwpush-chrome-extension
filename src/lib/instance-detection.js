import {requestJson} from "./api-client.js";

export async function detectInstance({baseUrl, token = ""}) {
  const checkedAt = new Date().toISOString();
  const versionResult = await requestJson("/api/v2/version", {
    baseUrl,
    token: ""
  });

  if (!versionResult.ok) {
    return {
      connected: false,
      checkedAt,
      apiVersion: null,
      applicationVersion: null,
      edition: null,
      instanceType: null,
      features: {
        supportsAccountsApi: "unknown",
        supportsRequestsApi: "unknown"
      },
      error: versionResult.errorMessage
    };
  }

  const versionPayload = versionResult.data || {};
  const edition = String(versionPayload.edition || "").toLowerCase();
  const instanceType = edition === "commercial" ? "pro" : edition === "oss" ? "oss" : "unknown";

  const [accountsProbe, requestsProbe] = await Promise.all([
    probeFeature("/api/v2/accounts", {baseUrl, token}),
    probeFeature("/api/v2/requests", {baseUrl, token})
  ]);

  return {
    connected: true,
    checkedAt,
    apiVersion: versionPayload.api_version || null,
    applicationVersion: versionPayload.application_version || null,
    edition: versionPayload.edition || null,
    instanceType,
    features: {
      supportsAccountsApi: accountsProbe,
      supportsRequestsApi: requestsProbe
    },
    error: null
  };
}

async function probeFeature(pathname, {baseUrl, token}) {
  const result = await requestJson(pathname, {baseUrl, token});

  if (result.ok) {
    return "enabled";
  }

  if (result.status === 401 || result.status === 403) {
    return "enabled";
  }

  if (result.status === 404) {
    return "disabled";
  }

  return "unknown";
}
