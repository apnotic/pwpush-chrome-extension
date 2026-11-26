/**
 * Generate instance-aware copy for no-token notices and subscription gating.
 * OSS never mentions subscriptions. Commercial subscription wording is produced
 * only here, from the authenticated version payload.
 */

function normalizeEdition(edition) {
  return String(edition || "").trim().toLowerCase();
}

function isOssEdition(edition) {
  return normalizeEdition(edition) === "oss";
}

/**
 * Get the push tab no-token notice text.
 * @param {object} options
 * @param {string} options.edition - Instance edition ('oss', 'commercial', etc.)
 * @param {boolean} options.fileAttachmentsEnabled - Whether file attachments are enabled
 * @param {boolean} [options.apiTokenAuthEnabled=true] - Whether API token auth is supported
 * @returns {string} The notice text
 */
export function getPushNoTokenNotice({ edition, fileAttachmentsEnabled, apiTokenAuthEnabled = true }) {
  if (!apiTokenAuthEnabled) {
    return "API token authentication is not supported on this instance.";
  }

  const isOSS = isOssEdition(edition);

  if (fileAttachmentsEnabled) {
    if (isOSS) {
      return "Add an API token in Settings to unlock Name, Note and file attachments.";
    }
    return "Add an API token in Settings to unlock Name and Note fields. File attachments also require a paid subscription.";
  }

  return "Add an API token in Settings to unlock Name and Note fields.";
}

/**
 * Get the request tab no-token notice text.
 * @param {object} options
 * @param {string} options.edition - Instance edition ('oss', 'commercial', etc.)
 * @param {boolean} [options.apiTokenAuthEnabled=true] - Whether API token auth is supported
 * @returns {string} The notice text
 */
export function getRequestNoTokenNotice({ edition, apiTokenAuthEnabled = true }) {
  if (!apiTokenAuthEnabled) {
    return "API token authentication is not supported on this instance.";
  }

  if (isOssEdition(edition)) {
    return "Requests require an API token.";
  }

  return "Requests require an API token. Basic Requests are free with any account. Paid subscriptions add branding, custom domains and file attachments.";
}

/**
 * Determine if the push auth notice should be shown.
 * @param {object} options
 * @param {boolean} options.hasToken - Whether user has an API token configured
 * @param {boolean} [options.apiTokenAuthEnabled=true] - Whether API token auth is supported
 * @returns {boolean} Whether to show the notice
 */
export function shouldShowPushAuthNotice({ hasToken, apiTokenAuthEnabled = true }) {
  return !hasToken && apiTokenAuthEnabled;
}

/**
 * Label and hint for the request notify-emails field.
 * OSS copy never mentions a subscription. Commercial copy does only when
 * the authenticated version payload says the workspace is not subscribed,
 * or when an older server omits `subscription` entirely.
 */
export function getNotifyEmailsCopy({ edition, subscription = null }) {
  if (isOssEdition(edition)) {
    return {
      label: "Notify emails (optional)",
      hint: ""
    };
  }

  if (subscription && subscription.subscribed === false) {
    const workspaceName = workspaceLabel(subscription);
    return {
      label: "Notify emails (optional)",
      hint: `Email notifications require a paid plan for workspace "${workspaceName}".`
    };
  }

  if (subscription && subscription.subscribed === true) {
    return {
      label: "Notify emails (optional)",
      hint: ""
    };
  }

  return {
    label: "Notify emails (optional, paid subscription required)",
    hint: "Email notifications require a paid subscription. The server will reject this request if your account doesn't have access."
  };
}

/**
 * Subscription-aware attachment gating and the paid-plan hint.
 *
 * Feature flags use `features.pushes.file_attachments` (and the request equivalent).
 * When that flag is false the caller hides the attachment controls. This helper
 * only adds a subscription hint for a commercial workspace that is known to be
 * unsubscribed. Missing `subscription` (older servers) falls back to feature flags
 * with no new hint.
 */
export function getSubscriptionCopy({ edition, hasToken, subscription = null, features = {}, baseUrl = "" }) {
  const attachmentsEnabled = Boolean(features?.pushes?.file_attachments?.enabled);

  if (isOssEdition(edition) || !hasToken || !subscription) {
    return {
      fileAttachmentsEnabled: isOssEdition(edition) || hasToken ? attachmentsEnabled : false,
      subscriptionHint: "",
      subscriptionLinkUrl: "",
      subscriptionLinkLabel: ""
    };
  }

  if (subscription.subscribed) {
    return {
      fileAttachmentsEnabled: attachmentsEnabled,
      subscriptionHint: "",
      subscriptionLinkUrl: "",
      subscriptionLinkLabel: ""
    };
  }

  const unavailable = unavailablePaidFeatures(features);
  if (!unavailable.length) {
    return {
      fileAttachmentsEnabled: attachmentsEnabled,
      subscriptionHint: "",
      subscriptionLinkUrl: "",
      subscriptionLinkLabel: ""
    };
  }

  const workspaceName = workspaceLabel(subscription);
  return {
    fileAttachmentsEnabled: attachmentsEnabled,
    subscriptionHint: `${joinLabels(unavailable)} require a paid plan for workspace "${workspaceName}".`,
    subscriptionLinkUrl: resolveBillingUrl(baseUrl),
    subscriptionLinkLabel: "View billing"
  };
}

/**
 * Subtle connection-card label such as "Pro · Acme".
 * Empty unless the workspace is subscribed and a plan or name is present.
 */
export function getSubscriptionBadge(subscription) {
  if (!subscription || !subscription.subscribed) {
    return "";
  }

  const planName = String(subscription.plan_name || "").trim();
  const workspaceName = String(subscription.workspace_name || "").trim();

  if (planName && workspaceName) {
    return `${planName} · ${workspaceName}`;
  }

  return planName || workspaceName || "";
}

/**
 * Commercial instances expose /billing (hosted regions redirect to sign-in).
 * Returns "" when the base URL is not a usable https origin.
 */
export function resolveBillingUrl(baseUrl) {
  if (!baseUrl || typeof baseUrl !== "string") {
    return "";
  }

  let url;
  try {
    url = new URL(baseUrl.trim());
  } catch (_error) {
    return "";
  }

  if (url.protocol !== "https:" || !url.hostname) {
    return "";
  }

  url.pathname = "/billing";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function workspaceLabel(subscription) {
  const name = String(subscription?.workspace_name || "").trim();
  return name || "this workspace";
}

function unavailablePaidFeatures(features) {
  const labels = [];
  const pushFilesOff = isExplicitlyDisabled(features?.pushes?.file_attachments);
  const requestFilesOff = isExplicitlyDisabled(features?.requests?.file_attachments);
  if (pushFilesOff || requestFilesOff) {
    labels.push("File attachments");
  }
  if (isExplicitlyDisabled(features?.pushes?.email_auto_dispatch)) {
    labels.push("email notifications");
  }
  return labels;
}

function isExplicitlyDisabled(value) {
  if (value === false) {
    return true;
  }
  return Boolean(value && typeof value === "object" && value.enabled === false);
}

function joinLabels(labels) {
  if (labels.length <= 1) {
    return labels[0] || "";
  }
  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}
