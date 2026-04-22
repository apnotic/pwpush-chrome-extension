import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {normalizeBaseUrl, requestJson} from "../../src/lib/api-client.js";

describe("normalizeBaseUrl", () => {
  it("returns the origin only", () => {
    expect(normalizeBaseUrl("https://example.com/path?foo=bar")).toBe("https://example.com");
  });

  it("rejects non-https URLs", () => {
    expect(() => normalizeBaseUrl("http://example.com")).toThrow("Only https:// URLs are supported.");
  });
});

describe("requestJson", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("sends auth header and account_id in query/body", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ok: true})
    });

    const result = await requestJson("/api/v2/pushes", {
      baseUrl: "https://example.com",
      token: "token-123",
      method: "POST",
      accountId: "42",
      body: {
        push: {
          payload: "secret"
        }
      }
    });

    expect(result.ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const [requestUrl, requestOptions] = global.fetch.mock.calls[0];
    expect(String(requestUrl)).toContain("/api/v2/pushes");
    expect(String(requestUrl)).toContain("account_id=42");
    expect(requestOptions.headers.Authorization).toBe("Bearer token-123");
    expect(JSON.parse(requestOptions.body)).toEqual({
      push: {payload: "secret"},
      account_id: "42"
    });
  });

  it("returns timeout error when fetch aborts", async () => {
    global.fetch.mockRejectedValue({name: "AbortError"});

    const result = await requestJson("/api/v2/version", {
      baseUrl: "https://example.com",
      timeoutMs: 1
    });

    expect(result.ok).toBe(false);
    expect(result.errorType).toBe("timeout");
  });
});
