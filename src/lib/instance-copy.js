/**
 * Generate instance-aware copy for no-token notices.
 * Handles OSS vs commercial editions and feature availability.
 */

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
    // Older instance without token auth support - graceful degradation
    return "API token authentication is not supported on this instance.";
  }

  const isOSS = edition === "oss";
  
  if (fileAttachmentsEnabled) {
    // Attachments are enabled
    if (isOSS) {
      return "Add an API token in Settings to unlock Name, Note and file attachments.";
    } else {
      // Commercial/Pro
      return "Add an API token in Settings to unlock Name and Note fields. File attachments also require a paid subscription.";
    }
  } else {
    // Attachments are disabled
    return "Add an API token in Settings to unlock Name and Note fields.";
  }
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

  const isOSS = edition === "oss";
  
  if (isOSS) {
    // OSS instances don't have paid features
    return "Requests require an API token.";
  } else {
    // Commercial/Pro
    return "Requests require an API token. Basic Requests are free with any account. Paid subscriptions add branding, custom domains and file attachments.";
  }
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
