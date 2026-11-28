import {readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {beforeEach, describe, expect, it, vi} from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const localesDir = join(__dirname, "../../_locales");
const LOCALES = ["en", "de", "es", "fr", "it", "nl"];

async function loadClipboardModule({
  writeText = null,
  clipboardMissing = false,
  offscreen = null,
  sendMessage = null,
  getContexts = null
} = {}) {
  vi.resetModules();
  vi.unstubAllGlobals();

  if (clipboardMissing) {
    vi.stubGlobal("navigator", {});
  } else {
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: writeText || vi.fn(async () => {})
      }
    });
  }

  global.chrome = {
    offscreen: offscreen || undefined,
    runtime: {
      sendMessage: sendMessage || vi.fn(async () => ({ok: true})),
      getURL: (path) => `chrome-extension://test/${path}`,
      getContexts: getContexts || undefined
    }
  };

  return import("../../src/lib/clipboard.js");
}

describe("copyTextWithClipboardApi", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("writes text with the Clipboard API and returns true", async () => {
    const writeText = vi.fn(async () => {});
    const {copyTextWithClipboardApi} = await loadClipboardModule({writeText});

    expect(await copyTextWithClipboardApi("https://oss.pwpush.com/p/dummy-url-token")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("https://oss.pwpush.com/p/dummy-url-token");
  });

  it("returns false when writeText rejects", async () => {
    const writeText = vi.fn(async () => {
      throw new Error("NotAllowedError");
    });
    const {copyTextWithClipboardApi} = await loadClipboardModule({writeText});

    expect(await copyTextWithClipboardApi("https://oss.pwpush.com/p/dummy-url-token")).toBe(false);
  });

  it("returns false when the Clipboard API is missing", async () => {
    const {copyTextWithClipboardApi} = await loadClipboardModule({clipboardMissing: true});
    expect(await copyTextWithClipboardApi("https://oss.pwpush.com/p/dummy-url-token")).toBe(false);
  });

  it("returns false for empty text without calling writeText", async () => {
    const writeText = vi.fn(async () => {});
    const {copyTextWithClipboardApi} = await loadClipboardModule({writeText});

    expect(await copyTextWithClipboardApi("")).toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });
});

describe("copyTextViaOffscreen", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("creates an offscreen document, copies, and closes it", async () => {
    const createDocument = vi.fn(async () => {});
    const closeDocument = vi.fn(async () => {});
    const sendMessage = vi.fn(async () => ({ok: true}));
    const {copyTextViaOffscreen, OFFSCREEN_CLIPBOARD_PATH} = await loadClipboardModule({
      offscreen: {
        createDocument,
        closeDocument,
        hasDocument: vi.fn(async () => false)
      },
      sendMessage
    });

    expect(await copyTextViaOffscreen("https://oss.pwpush.com/p/dummy-url-token")).toBe(true);
    expect(createDocument).toHaveBeenCalledWith({
      url: OFFSCREEN_CLIPBOARD_PATH,
      reasons: ["CLIPBOARD"],
      justification: "Write the created share URL to the clipboard after an instant push."
    });
    expect(sendMessage).toHaveBeenCalledWith({
      type: "copyToClipboard",
      target: "offscreen",
      text: "https://oss.pwpush.com/p/dummy-url-token"
    });
    expect(closeDocument).toHaveBeenCalledTimes(1);
  });

  it("closes the offscreen document when copy reports failure", async () => {
    const closeDocument = vi.fn(async () => {});
    const {copyTextViaOffscreen} = await loadClipboardModule({
      offscreen: {
        createDocument: vi.fn(async () => {}),
        closeDocument,
        hasDocument: vi.fn(async () => false)
      },
      sendMessage: vi.fn(async () => ({ok: false}))
    });

    expect(await copyTextViaOffscreen("https://oss.pwpush.com/p/dummy-url-token")).toBe(false);
    expect(closeDocument).toHaveBeenCalledTimes(1);
  });

  it("closes the offscreen document when sendMessage throws", async () => {
    const closeDocument = vi.fn(async () => {});
    const sendMessage = vi.fn(async () => {
      throw new Error("Could not establish connection. Receiving end does not exist.");
    });
    const {copyTextViaOffscreen} = await loadClipboardModule({
      offscreen: {
        createDocument: vi.fn(async () => {}),
        closeDocument,
        hasDocument: vi.fn(async () => false)
      },
      sendMessage
    });

    expect(await copyTextViaOffscreen("https://oss.pwpush.com/p/dummy-url-token")).toBe(false);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(closeDocument).toHaveBeenCalledTimes(1);
  });

  it("retries sendMessage once if the offscreen listener is not ready", async () => {
    const closeDocument = vi.fn(async () => {});
    const sendMessage = vi.fn()
      .mockRejectedValueOnce(new Error("Could not establish connection. Receiving end does not exist."))
      .mockResolvedValueOnce({ok: true});
    const {copyTextViaOffscreen} = await loadClipboardModule({
      offscreen: {
        createDocument: vi.fn(async () => {}),
        closeDocument,
        hasDocument: vi.fn(async () => false)
      },
      sendMessage
    });

    expect(await copyTextViaOffscreen("https://oss.pwpush.com/p/dummy-url-token")).toBe(true);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(closeDocument).toHaveBeenCalledTimes(1);
  });

  it("returns false when the offscreen API is missing", async () => {
    const {copyTextViaOffscreen} = await loadClipboardModule({
      offscreen: null
    });
    expect(await copyTextViaOffscreen("https://oss.pwpush.com/p/dummy-url-token")).toBe(false);
  });

  it("skips createDocument when an offscreen document already exists", async () => {
    const createDocument = vi.fn(async () => {});
    const closeDocument = vi.fn(async () => {});
    const {copyTextViaOffscreen} = await loadClipboardModule({
      offscreen: {
        createDocument,
        closeDocument,
        hasDocument: vi.fn(async () => true)
      },
      sendMessage: vi.fn(async () => ({ok: true}))
    });

    expect(await copyTextViaOffscreen("https://oss.pwpush.com/p/dummy")).toBe(true);
    expect(createDocument).not.toHaveBeenCalled();
    expect(closeDocument).toHaveBeenCalledTimes(1);
  });
});

describe("copyTextWithExecCommand", () => {
  it("copies from the offscreen textarea and clears it", async () => {
    const {copyTextWithExecCommand} = await loadClipboardModule();
    const textarea = {value: "", focus: vi.fn(), select: vi.fn()};
    const doc = {
      querySelector: vi.fn(() => textarea),
      execCommand: vi.fn(() => true)
    };

    expect(copyTextWithExecCommand("https://oss.pwpush.com/p/dummy-url-token", doc)).toBe(true);
    expect(textarea.focus).toHaveBeenCalled();
    expect(textarea.select).toHaveBeenCalled();
    expect(doc.execCommand).toHaveBeenCalledWith("copy");
    expect(textarea.value).toBe("");
  });

  it("returns false when the textarea is missing", async () => {
    const {copyTextWithExecCommand} = await loadClipboardModule();
    const doc = {
      querySelector: vi.fn(() => null),
      execCommand: vi.fn(() => true)
    };

    expect(copyTextWithExecCommand("https://oss.pwpush.com/p/dummy-url-token", doc)).toBe(false);
    expect(doc.execCommand).not.toHaveBeenCalled();
  });

  it("returns false when execCommand throws", async () => {
    const {copyTextWithExecCommand} = await loadClipboardModule();
    const textarea = {value: "keep", focus: vi.fn(), select: vi.fn()};
    const doc = {
      querySelector: vi.fn(() => textarea),
      execCommand: vi.fn(() => {
        throw new Error("copy blocked");
      })
    };

    expect(copyTextWithExecCommand("https://oss.pwpush.com/p/dummy-url-token", doc)).toBe(false);
    expect(textarea.value).toBe("");
  });
});

describe("clipboard i18n", () => {
  it("defines popupCopiedToClipboard in every locale", () => {
    for (const locale of LOCALES) {
      const messages = JSON.parse(readFileSync(join(localesDir, locale, "messages.json"), "utf8"));
      expect(messages.popupCopiedToClipboard?.message, locale).toBeTruthy();
    }
  });
});
