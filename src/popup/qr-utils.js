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

export function buildPreviewUrl(shareUrl, baseUrl = "") {
  let parsed;

  try {
    parsed = new URL(String(shareUrl || "").trim());
  } catch (_error) {
    if (!baseUrl) {
      throw new Error("Push URL is invalid for QR generation.");
    }

    parsed = new URL(String(shareUrl || "").trim(), ensureTrailingSlash(baseUrl));
  }

  const trimmedPath = parsed.pathname.endsWith("/") ? parsed.pathname.slice(0, -1) : parsed.pathname;
  parsed.pathname = trimmedPath.endsWith("/preview") ? trimmedPath : `${trimmedPath}/preview`;
  parsed.search = "";
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
