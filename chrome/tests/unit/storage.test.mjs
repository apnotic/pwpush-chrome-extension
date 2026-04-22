import {beforeEach, describe, expect, it, vi} from "vitest";
import {getLastPushResult, getSettings, saveLastPushResult, saveSettings} from "../../src/lib/storage.js";

function createStorageApi() {
  const memory = {};

  return {
    memory,
    api: {
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
      })
    }
  };
}

describe("storage defaults and merges", () => {
  let storage;

  beforeEach(() => {
    storage = createStorageApi();
    global.chrome = {
      storage: {
        local: storage.api
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
});
