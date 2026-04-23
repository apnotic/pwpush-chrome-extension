import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {
  createPush,
  getPushPreview,
  listAccounts,
  normalizeBaseUrl,
  requestJson
} from "../../src/lib/api-client.js";

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

  it("returns invalid_json for ok responses that cannot be parsed", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("invalid json");
      }
    });

    const result = await requestJson("/api/v2/version", {
      baseUrl: "https://example.com"
    });

    expect(result.ok).toBe(false);
    expect(result.errorType).toBe("invalid_json");
  });

  it("maps 404 into a user-friendly API error", async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({})
    });

    const result = await requestJson("/api/v2/version", {
      baseUrl: "https://example.com"
    });

    expect(result.ok).toBe(false);
    expect(result.errorType).toBe("http_error");
    expect(result.errorMessage).toContain("endpoint was not found");
  });
});

describe("createPush", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("uses html_url directly when provided by API", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        url_token: "abc123",
        html_url: "https://example.com/p/abc123"
      })
    });

    const result = await createPush("secret", {
      baseUrl: "https://example.com",
      instanceType: "oss"
    });

    expect(result.ok).toBe(true);
    expect(result.data.shareUrl).toBe("https://example.com/p/abc123");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to preview lookup when html_url is missing", async () => {
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          url_token: "abc123"
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          url: "https://example.com/p/abc123"
        })
      });

    const result = await createPush("secret", {
      baseUrl: "https://example.com",
      instanceType: "oss"
    });

    expect(result.ok).toBe(true);
    expect(result.data.shareUrl).toBe("https://example.com/p/abc123");
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("returns invalid_response if no share URL can be resolved", async () => {
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          url_token: "abc123"
        })
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({})
      });

    const result = await createPush("secret", {
      baseUrl: "https://example.com",
      instanceType: "oss"
    });

    expect(result.ok).toBe(false);
    expect(result.errorType).toBe("invalid_response");
  });
});

describe("getPushPreview", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns invalid_request when token is missing", async () => {
    const result = await getPushPreview("", {
      baseUrl: "https://example.com"
    });

    expect(result.ok).toBe(false);
    expect(result.errorType).toBe("invalid_request");
  });

  it("maps preview url field to shareUrl", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        url: "https://example.com/p/abc123"
      })
    });

    const result = await getPushPreview("abc123", {
      baseUrl: "https://example.com"
    });

    expect(result.ok).toBe(true);
    expect(result.data.shareUrl).toBe("https://example.com/p/abc123");
  });
});

describe("listAccounts", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("requires an API token", async () => {
    const result = await listAccounts({
      baseUrl: "https://example.com",
      token: ""
    });

    expect(result.ok).toBe(false);
    expect(result.errorType).toBe("missing_token");
  });

  it("filters invalid accounts and normalizes names", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ([
        {id: 1, name: "Primary"},
        {id: 2},
        {name: "No ID"}
      ])
    });

    const result = await listAccounts({
      baseUrl: "https://example.com",
      token: "token-123"
    });

    expect(result.ok).toBe(true);
    expect(result.data.accounts).toEqual([
      {id: "1", name: "Primary"},
      {id: "2", name: "Account 2"}
    ]);
  });
});
