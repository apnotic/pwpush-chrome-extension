import {confirmPasswordPusher, getVersionWithAuth, requestJson} from "./api-client.js";

export async function detectInstance({baseUrl, token = "", workspaceId = ""}) {
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
      subscription: null,
      workspaceIdInvalid: false,
      features: {
        supportsWorkspacesApi: "unknown",
        supportsRequestsApi: "unknown"
      },
      versionData: null,
      error: confirmation.errorMessage
    };
  }

  let versionPayload = confirmation.version || {};
  let subscriptionData = null;
  let workspaceIdInvalid = false;

  // If token is provided, fetch authenticated version to get subscription info
  if (token && token.trim()) {
    const authVersionResult = await getVersionWithAuth({
      baseUrl,
      token,
      workspaceId: workspaceId || ""
    });

    // Handle 401 with workspace_id: retry without it
    if (authVersionResult.needsRetryWithoutWorkspace) {
      workspaceIdInvalid = true;
      const retryResult = await getVersionWithAuth({
        baseUrl,
        token,
        workspaceId: ""
      });

      if (retryResult.ok && retryResult.data) {
        versionPayload = retryResult.data;
        subscriptionData = retryResult.data.subscription || null;
      }
    } else if (authVersionResult.ok && authVersionResult.data) {
      versionPayload = authVersionResult.data;
      subscriptionData = authVersionResult.data.subscription || null;
    }
  }

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
    subscription: subscriptionData,
    workspaceIdInvalid,
    features: {
      supportsWorkspacesApi: workspacesProbe,
      supportsRequestsApi: requestsProbe
    },
    versionData: versionPayload,
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
