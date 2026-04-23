import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {detectInstance} from "../../src/lib/instance-detection.js";

describe("detectInstance", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns disconnected status when version endpoint fails", async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({})
    });

    const result = await detectInstance({
      baseUrl: "https://example.com",
      token: "token-123"
    });

    expect(result.connected).toBe(false);
    expect(result.error).toContain("endpoint was not found");
    expect(result.features.supportsAccountsApi).toBe("unknown");
    expect(result.features.supportsRequestsApi).toBe("unknown");
  });

  it("classifies commercial edition as pro and maps feature probes", async () => {
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          edition: "commercial",
          api_version: "2",
          application_version: "3.0.0"
        })
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({})
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({})
      });

    const result = await detectInstance({
      baseUrl: "https://example.com",
      token: "token-123"
    });

    expect(result.connected).toBe(true);
    expect(result.instanceType).toBe("pro");
    expect(result.features.supportsAccountsApi).toBe("enabled");
    expect(result.features.supportsRequestsApi).toBe("disabled");
  });

  it("classifies oss edition correctly", async () => {
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          edition: "oss",
          api_version: "2",
          application_version: "2.6.0"
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ([])
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({})
      });

    const result = await detectInstance({
      baseUrl: "https://example.com",
      token: ""
    });

    expect(result.connected).toBe(true);
    expect(result.instanceType).toBe("oss");
    expect(result.features.supportsAccountsApi).toBe("enabled");
    expect(result.features.supportsRequestsApi).toBe("unknown");
  });
});
