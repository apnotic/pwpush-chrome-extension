import {beforeEach, describe, expect, it, vi} from "vitest";
import {
  clearAllExtensionState,
  clearLastPushResult,
  getLastPushResult,
  getSettings,
  saveLastPushResult,
  saveSettings
} from "../../src/lib/storage.js";

function createStorageApi() {
  const localMemory = {};
  const sessionMemory = {};

  function createApi(memory) {
    return {
      get: vi.fn(async (keys) => {
        if (Array.isArray(keys)) {
          return keys.reduce((result, key) => {
            result[key] = memory[key];
            return result;
          }, {});
        }

        if (typeof keys === "string") {
          return {[keys]: memory[keys]};
        }

        return {};
      }),
      set: vi.fn(async (values) => {
        Object.assign(memory, values);
      }),
      remove: vi.fn(async (keys) => {
        const keyList = Array.isArray(keys) ? keys : [keys];
        for (const key of keyList) {
          delete memory[key];
        }
      })
    };
  }

  return {
    localMemory,
    sessionMemory,
    localApi: createApi(localMemory),
    sessionApi: createApi(sessionMemory)
  };
}

describe("storage defaults and merges", () => {
  let storage;

  beforeEach(() => {
    storage = createStorageApi();
    global.chrome = {
      storage: {
        local: storage.localApi,
        session: storage.sessionApi
      }
    };
  });

  it("merges settings and keeps lastPushOptions defaults", async () => {
    await saveSettings({baseUrl: "https://example.com"});
    const settings = await getSettings();

    expect(settings.baseUrl).toBe("https://example.com");
    expect(settings.lastPushOptions.expireAfterDays).toBe(7);
    expect(settings.lastPushOptions.expireAfterViews).toBe(5);
  });

  it("stores and returns qrPngDataUrl in last push result", async () => {
    await saveLastPushResult({
      shareUrl: "https://example.com/p/abc",
      qrPngDataUrl: "data:image/png;base64,abc123"
    });

    const lastPush = await getLastPushResult();
    expect(lastPush.shareUrl).toBe("https://example.com/p/abc");
    expect(lastPush.qrPngDataUrl).toBe("data:image/png;base64,abc123");
  });

  it("clears last push result trail", async () => {
    await saveLastPushResult({
      shareUrl: "https://example.com/p/abc",
      qrPngDataUrl: "data:image/png;base64,abc123"
    });

    await clearLastPushResult();
    const lastPush = await getLastPushResult();
    expect(lastPush.shareUrl).toBe("");
    expect(lastPush.qrPngDataUrl).toBe("");
    expect(lastPush.createdAt).toBe(null);
  });

  it("persists token in local storage when remember token is enabled", async () => {
    const saved = await saveSettings({
      baseUrl: "https://example.com",
      apiToken: "token-local",
      rememberApiToken: true
    });

    expect(saved.apiToken).toBe("token-local");
    expect(storage.localMemory.settings.apiToken).toBe("token-local");
    expect(storage.localMemory.settings.rememberApiToken).toBe(true);
    expect(storage.sessionMemory.sessionApiToken).toBe(undefined);
  });

  it("stores token in session when remember token is disabled", async () => {
    const saved = await saveSettings({
      baseUrl: "https://example.com",
      apiToken: "token-session",
      rememberApiToken: false
    });

    expect(saved.apiToken).toBe("token-session");
    expect(storage.localMemory.settings.apiToken).toBe("");
    expect(storage.localMemory.settings.rememberApiToken).toBe(false);
    expect(storage.sessionMemory.sessionApiToken).toBe("token-session");

    const settings = await getSettings();
    expect(settings.apiToken).toBe("token-session");
    expect(settings.rememberApiToken).toBe(false);
  });

  it("clears session token on full state reset", async () => {
    await saveSettings({
      baseUrl: "https://example.com",
      apiToken: "token-session",
      rememberApiToken: false
    });
    expect(storage.sessionMemory.sessionApiToken).toBe("token-session");

    await clearAllExtensionState();
    expect(storage.sessionMemory.sessionApiToken).toBe(undefined);
    expect(storage.localMemory.settings.apiToken).toBe("");
  });
});
