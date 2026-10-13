export function extractFirstSvg(html) {
  const svgMatches = String(html || "").match(/<svg[\s\S]*?<\/svg>/gi) || [];
  if (svgMatches.length === 0) {
    return "";
  }

  let bestSvg = svgMatches[0];
  let bestScore = scoreSvgCandidate(bestSvg);

  for (let index = 1; index < svgMatches.length; index += 1) {
    const candidate = svgMatches[index];
    const score = scoreSvgCandidate(candidate);
    if (score > bestScore) {
      bestScore = score;
      bestSvg = candidate;
    }
  }

  return bestSvg;
}

const TRUSTED_PUSH_PATH = /^\/(?:p|q|f|r|c)\/[^/]+(?:\/r)?(?:\/preview)?$/;

export function toConfiguredShareUrl(shareUrl, baseUrl) {
  const base = configuredHttpsOrigin(baseUrl);
  const parsed = parseShareUrl(shareUrl, base);
  const pathname = normalizePushPath(parsed.pathname);

  if (!TRUSTED_PUSH_PATH.test(pathname)) {
    throw new Error("Push URL is not a Password Pusher link on the configured server.");
  }

  const trusted = new URL(base.origin);
  trusted.pathname = pathname;
  trusted.search = "";
  trusted.hash = "";
  return trusted.toString();
}

export function buildPreviewUrl(shareUrl, baseUrl = "") {
  const trustedShareUrl = baseUrl
    ? toConfiguredShareUrl(shareUrl, baseUrl)
    : assertSafePushUrl(shareUrl);
  const parsed = new URL(trustedShareUrl);
  const trimmedPath = parsed.pathname.endsWith("/") ? parsed.pathname.slice(0, -1) : parsed.pathname;
  parsed.pathname = trimmedPath.endsWith("/preview") ? trimmedPath : `${trimmedPath}/preview`;
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

export function buildPreviewUrlFromToken(urlToken, baseUrl) {
  const token = String(urlToken || "").trim();
  const normalizedBaseUrl = String(baseUrl || "").trim();
  if (!token) {
    throw new Error("Push token is required for QR generation.");
  }
  if (!normalizedBaseUrl) {
    throw new Error("Configured server URL is required for token preview lookup.");
  }

  const parsedBaseUrl = new URL(ensureTrailingSlash(normalizedBaseUrl));
  parsedBaseUrl.pathname = `/p/${encodeURIComponent(token)}/preview`;
  parsedBaseUrl.search = "";
  return parsedBaseUrl.toString();
}

function configuredHttpsOrigin(baseUrl) {
  let parsed;
  try {
    parsed = new URL(String(baseUrl || "").trim());
  } catch (_error) {
    throw new Error("Configured server URL is required.");
  }

  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error("Configured server URL must use https.");
  }

  return new URL(parsed.origin);
}

function parseShareUrl(shareUrl, base) {
  const rawValue = String(shareUrl || "").trim();
  if (!rawValue) {
    throw new Error("Push URL is invalid for QR generation.");
  }

  try {
    return new URL(rawValue);
  } catch (_error) {
    return new URL(rawValue, `${base.origin}/`);
  }
}

function normalizePushPath(pathname) {
  const trimmed = String(pathname || "").replace(/\/+$/, "");
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function assertSafePushUrl(shareUrl) {
  let parsed;
  try {
    parsed = new URL(String(shareUrl || "").trim());
  } catch (_error) {
    throw new Error("Push URL is invalid for QR generation.");
  }

  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error("Push URL is not a Password Pusher link on the configured server.");
  }

  const pathname = normalizePushPath(parsed.pathname);
  if (!TRUSTED_PUSH_PATH.test(pathname)) {
    throw new Error("Push URL is not a Password Pusher link on the configured server.");
  }

  parsed.pathname = pathname;
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

function ensureTrailingSlash(rawUrl) {
  const normalized = String(rawUrl || "").trim();
  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

function scoreSvgCandidate(svgMarkup) {
  const markup = String(svgMarkup || "");
  const lower = markup.toLowerCase();

  let score = 0;
  if (/(id|class|aria-label|data-[a-z0-9_-]+)\s*=\s*['"][^'"]*qr[^'"]*['"]/i.test(markup)) {
    score += 150;
  }
  if (lower.includes("qrcode")) {
    score += 100;
  }

  const shapeCount = (markup.match(/<(rect|path|circle|line|polygon)\b/gi) || []).length;
  score += Math.min(shapeCount, 300);
  score += Math.min(markup.length / 100, 50);

  return score;
}
