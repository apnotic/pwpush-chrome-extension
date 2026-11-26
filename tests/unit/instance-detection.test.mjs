import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {clearPasswordPusherConfirmationCache} from "../../src/lib/api-client.js";
import {detectInstance} from "../../src/lib/instance-detection.js";

describe("detectInstance", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    clearPasswordPusherConfirmationCache();
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
    expect(result.features.supportsWorkspacesApi).toBe("unknown");
    expect(result.features.supportsRequestsApi).toBe("unknown");
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it("does not probe with the token when version is not Password Pusher", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({service: "something-else"})
    });

    const result = await detectInstance({
      baseUrl: "https://other.example",
      token: "token-123"
    });

    expect(result.connected).toBe(false);
    expect(result.error).toContain("API token was not sent");
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(String(global.fetch.mock.calls[0][0])).toContain("/api/v2/version");
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
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
        ok: true,
        status: 200,
        json: async () => ({
          edition: "commercial",
          api_version: "2",
          application_version: "3.0.0",
          subscription: {
            workspace_id: 123,
            workspace_name: "Acme",
            subscribed: true,
            plan_name: "Pro"
          },
          features: {
            pushes: {file_attachments: {enabled: true}}
          }
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
    expect(result.subscription.workspace_name).toBe("Acme");
    expect(result.subscription.subscribed).toBe(true);
    expect(result.workspaceIdInvalid).toBe(false);
    expect(result.features.supportsWorkspacesApi).toBe("enabled");
    expect(result.features.supportsRequestsApi).toBe("disabled");
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
    expect(String(global.fetch.mock.calls[1][0])).toContain("/api/v2/version");
    expect(global.fetch.mock.calls[1][1].headers.Authorization).toBe("Bearer token-123");
    expect(String(global.fetch.mock.calls[2][0])).toContain("/api/v2/workspaces");
    expect(global.fetch.mock.calls[2][1].headers.Authorization).toBe("Bearer token-123");
  });

  it("classifies oss edition and treats the missing workspaces API as disabled", async () => {
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
        ok: false,
        status: 404,
        json: async () => ({})
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
    expect(result.subscription).toBeNull();
    expect(result.features.supportsWorkspacesApi).toBe("disabled");
    expect(result.features.supportsRequestsApi).toBe("unknown");
    expect(String(global.fetch.mock.calls[1][0])).toContain("/api/v2/workspaces");
  });

  it("retries a 401 workspace_id once without the parameter", async () => {
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
        json: async () => ({error: "not a member"})
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          edition: "commercial",
          api_version: "2",
          application_version: "3.0.0",
          subscription: {
            workspace_id: 5,
            workspace_name: "Default",
            subscribed: false,
            plan_name: "Free"
          },
          features: {
            pushes: {file_attachments: {enabled: false}}
          }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ([])
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({})
      });

    const result = await detectInstance({
      baseUrl: "https://eu.pwpush.com",
      token: "token-123",
      workspaceId: "999"
    });

    expect(result.connected).toBe(true);
    expect(result.workspaceIdInvalid).toBe(true);
    expect(result.subscription.workspace_name).toBe("Default");
    expect(String(global.fetch.mock.calls[1][0])).toContain("workspace_id=999");
    expect(global.fetch.mock.calls[1][1].headers.Authorization).toBe("Bearer token-123");
    expect(String(global.fetch.mock.calls[2][0])).toContain("/api/v2/version");
    expect(String(global.fetch.mock.calls[2][0])).not.toContain("workspace_id=");
  });

  it("does not flag the workspace when a 401 without workspace_id is a bad token", async () => {
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
        json: async () => ({error: "unauthorized"})
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({})
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({})
      });

    const result = await detectInstance({
      baseUrl: "https://eu.pwpush.com",
      token: "token-123"
    });

    expect(result.connected).toBe(true);
    expect(result.workspaceIdInvalid).toBe(false);
    expect(result.subscription).toBeNull();
  });
});
