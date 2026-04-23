import {describe, expect, it, vi} from "vitest";

async function setupServiceWorkerTest({
  settings = {baseUrl: "https://example.com", apiToken: "token-123"},
  detectStatus = {
    connected: true,
    checkedAt: "2026-01-01T00:00:00.000Z",
    instanceType: "pro"
  },
  detectError = null
} = {}) {
  vi.resetModules();

  let onInstalledListener = null;
  let onMessageListener = null;

  const openOptionsPage = vi.fn(async () => {});
  const getSettings = vi.fn(async () => settings);
  const saveInstanceStatus = vi.fn(async (status) => status);
  const detectInstance = detectError
    ? vi.fn(async () => {
      throw detectError;
    })
    : vi.fn(async () => detectStatus);

  global.chrome = {
    runtime: {
      openOptionsPage,
      onInstalled: {
        addListener: vi.fn((callback) => {
          onInstalledListener = callback;
        })
      },
      onMessage: {
        addListener: vi.fn((callback) => {
          onMessageListener = callback;
        })
      }
    }
  };

  vi.doMock("../../src/lib/storage.js", () => ({
    getSettings,
    saveInstanceStatus
  }));

  vi.doMock("../../src/lib/instance-detection.js", () => ({
    detectInstance
  }));

  await import("../../src/background/service-worker.js");

  return {
    onInstalledListener,
    onMessageListener,
    openOptionsPage,
    getSettings,
    saveInstanceStatus,
    detectInstance
  };
}

async function flushAsyncCallbacks() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("background/service-worker", () => {
  it("opens options page on install", async () => {
    const setup = await setupServiceWorkerTest();
    expect(typeof setup.onInstalledListener).toBe("function");

    await setup.onInstalledListener();
    expect(setup.openOptionsPage).toHaveBeenCalledTimes(1);
  });

  it("ignores unknown runtime messages", async () => {
    const setup = await setupServiceWorkerTest();
    const sendResponse = vi.fn();

    const keepChannelOpen = setup.onMessageListener({type: "unknown"}, {}, sendResponse);
    expect(keepChannelOpen).toBe(false);
    expect(sendResponse).not.toHaveBeenCalled();
  });

  it("returns configured-instance status for recheck message", async () => {
    const setup = await setupServiceWorkerTest({
      settings: {baseUrl: "https://example.com", apiToken: "token-123"},
      detectStatus: {connected: true, instanceType: "pro"}
    });
    const sendResponse = vi.fn();

    const keepChannelOpen = setup.onMessageListener({type: "recheckInstance"}, {}, sendResponse);
    expect(keepChannelOpen).toBe(true);

    await flushAsyncCallbacks();
    expect(setup.detectInstance).toHaveBeenCalledWith({
      baseUrl: "https://example.com",
      token: "token-123"
    });
    expect(setup.saveInstanceStatus).toHaveBeenCalledWith({connected: true, instanceType: "pro"});
    expect(sendResponse).toHaveBeenCalledWith({
      ok: true,
      status: {connected: true, instanceType: "pro"}
    });
  });

  it("handles missing baseUrl by saving disconnected state", async () => {
    const setup = await setupServiceWorkerTest({
      settings: {baseUrl: "", apiToken: ""}
    });
    const sendResponse = vi.fn();

    setup.saveInstanceStatus.mockResolvedValue({
      connected: false,
      error: "No server has been configured yet."
    });

    setup.onMessageListener({type: "recheckInstance"}, {}, sendResponse);
    await flushAsyncCallbacks();

    expect(setup.detectInstance).not.toHaveBeenCalled();
    expect(setup.saveInstanceStatus).toHaveBeenCalledWith({
      connected: false,
      error: "No server has been configured yet."
    });
    expect(sendResponse).toHaveBeenCalledWith({
      ok: true,
      status: {
        connected: false,
        error: "No server has been configured yet."
      }
    });
  });

  it("returns structured error responses when recheck fails", async () => {
    const setup = await setupServiceWorkerTest({
      settings: {baseUrl: "https://example.com", apiToken: "token-123"},
      detectError: new Error("Boom")
    });
    const sendResponse = vi.fn();

    setup.onMessageListener({type: "recheckInstance"}, {}, sendResponse);
    await flushAsyncCallbacks();

    expect(sendResponse).toHaveBeenCalledWith({
      ok: false,
      error: "Boom"
    });
  });
});
