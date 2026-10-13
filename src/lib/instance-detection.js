import {confirmPasswordPusher, requestJson} from "./api-client.js";

export async function detectInstance({baseUrl, token = ""}) {
  const checkedAt = new Date().toISOString();
  const confirmation = await confirmPasswordPusher(baseUrl);

  if (!confirmation.ok) {
    return {
      connected: false,
      checkedAt,
      apiVersion: null,
      applicationVersion: null,
      edition: null,
      instanceType: null,
      features: {
        supportsWorkspacesApi: "unknown",
        supportsRequestsApi: "unknown"
      },
      error: confirmation.errorMessage
    };
  }

  const versionPayload = confirmation.version || {};
  const edition = String(versionPayload.edition || "").toLowerCase();
  const instanceType = edition === "commercial" ? "pro" : edition === "oss" ? "oss" : "unknown";

  const [workspacesProbe, requestsProbe] = await Promise.all([
    probeFeature("/api/v2/workspaces", {baseUrl, token}),
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
      supportsWorkspacesApi: workspacesProbe,
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
