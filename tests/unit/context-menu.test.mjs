import {beforeEach, describe, expect, it, vi} from "vitest";

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

async function setupContextMenuTest({
  settings = {
    baseUrl: "https://oss.pwpush.com",
    apiToken: "",
    instantPushSelectedText: false,
    lastPushOptions: {
      expireAfterDays: 7,
      expireAfterViews: 5,
      retrievalStep: true,
      passphrase: "should-not-be-sent"
    }
  },
  instanceStatus = {instanceType: "oss"},
  createPushImpl = null,
  openPopupImpl = null,
  copyResult = false
} = {}) {
  vi.resetModules();
  const storage = createStorageApi();
  storage.localMemory.settings = settings;
  storage.localMemory.instanceStatus = instanceStatus;

  const createPush = createPushImpl || vi.fn(async () => ({
    ok: true,
    status: 201,
    data: {
      urlToken: "dummy-url-token",
      shareUrl: "https://oss.pwpush.com/p/dummy-url-token",
      expires_at: "2026-12-05T00:00:00.000Z",
      views_remaining: 5
    }
  }));
  const openPopup = openPopupImpl || vi.fn(async () => {
    throw new Error("openPopup requires a user gesture");
  });
  const openOptionsPage = vi.fn(async () => {});
  const setBadgeText = vi.fn(async () => {});
  const setBadgeBackgroundColor = vi.fn(async () => {});
  const setTitle = vi.fn(async () => {});
  const executeScript = vi.fn(async () => [{result: copyResult}]);
  const contextMenusCreate = vi.fn(async () => {});
  const contextMenusRemoveAll = vi.fn(async () => {});

  global.chrome = {
    runtime: {
      openOptionsPage,
      getURL: (path) => `chrome-extension://test/${path}`
    },
    i18n: {
      getMessage: vi.fn(() => "")
    },
    storage: {
      local: storage.localApi,
      session: storage.sessionApi
    },
    action: {
      openPopup,
      setBadgeText,
      setBadgeBackgroundColor,
      setTitle
    },
    scripting: {
      executeScript
    },
    contextMenus: {
      create: contextMenusCreate,
      removeAll: contextMenusRemoveAll,
      onClicked: {addListener: vi.fn()}
    }
  };

  vi.doMock("../../src/lib/api-client.js", () => ({
    createPush
  }));

  const module = await import("../../src/lib/context-menu.js");
  return {
    module,
    storage,
    createPush,
    openPopup,
    openOptionsPage,
    setBadgeText,
    setTitle,
    executeScript,
    contextMenusCreate,
    contextMenusRemoveAll
  };
}

describe("context menus", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("registers selection and link menus", async () => {
    const setup = await setupContextMenuTest();
    await setup.module.registerContextMenus();

    expect(setup.contextMenusRemoveAll).toHaveBeenCalledTimes(1);
    expect(setup.contextMenusCreate).toHaveBeenCalledWith(expect.objectContaining({
      id: setup.module.MENU_PUSH_SELECTED_TEXT,
      contexts: ["selection"]
    }));
    expect(setup.contextMenusCreate).toHaveBeenCalledWith(expect.objectContaining({
      id: setup.module.MENU_PUSH_THIS_LINK,
      contexts: ["link"]
    }));
  });

  it("stashes selected text in session storage and falls back to a badge when openPopup fails", async () => {
    const setup = await setupContextMenuTest();
    await setup.module.handleContextMenuClick({
      menuItemId: setup.module.MENU_PUSH_SELECTED_TEXT,
      selectionText: "dummy-selected-secret"
    }, {id: 42, windowId: 1});

    expect(setup.storage.sessionMemory.contextMenuStash.kind).toBe("prefill");
    expect(setup.storage.sessionMemory.contextMenuStash.source).toBe("selection");
    expect(setup.storage.sessionMemory.contextMenuStash.payload).toBe("dummy-selected-secret");
    expect(setup.storage.localMemory.contextMenuStash).toBe(undefined);
    expect(setup.createPush).not.toHaveBeenCalled();
    expect(setup.openPopup).toHaveBeenCalledTimes(1);
    expect(setup.setBadgeText).toHaveBeenCalledWith({text: "1"});
    expect(setup.setTitle).toHaveBeenCalledWith(expect.objectContaining({
      title: expect.stringContaining("toolbar icon")
    }));
  });

  it("opens the popup and skips the badge when openPopup succeeds", async () => {
    const setup = await setupContextMenuTest({
      openPopupImpl: vi.fn(async () => {})
    });
    await setup.module.handleContextMenuClick({
      menuItemId: setup.module.MENU_PUSH_SELECTED_TEXT,
      selectionText: "dummy-selected-secret"
    }, {id: 42, windowId: 7});

    expect(setup.openPopup).toHaveBeenCalledWith({windowId: 7});
    expect(setup.setBadgeText).not.toHaveBeenCalled();
    expect(setup.storage.sessionMemory.contextMenuStash.payload).toBe("dummy-selected-secret");
  });

  it("stashes a link URL for confirm-first even when instant push is enabled", async () => {
    const setup = await setupContextMenuTest({
      settings: {
        baseUrl: "https://oss.pwpush.com",
        apiToken: "",
        instantPushSelectedText: true,
        lastPushOptions: {expireAfterDays: 7, expireAfterViews: 5, retrievalStep: true}
      }
    });

    await setup.module.handleContextMenuClick({
      menuItemId: setup.module.MENU_PUSH_THIS_LINK,
      linkUrl: "https://example.com/docs"
    }, {id: 9});

    expect(setup.createPush).not.toHaveBeenCalled();
    expect(setup.storage.sessionMemory.contextMenuStash).toMatchObject({
      kind: "prefill",
      source: "link",
      payload: "https://example.com/docs"
    });
  });

  it("rejects non-http links without storing them", async () => {
    const setup = await setupContextMenuTest();
    await setup.module.handleContextMenuClick({
      menuItemId: setup.module.MENU_PUSH_THIS_LINK,
      linkUrl: "javascript:alert(1)"
    }, {id: 9});

    expect(setup.createPush).not.toHaveBeenCalled();
    expect(setup.storage.sessionMemory.contextMenuStash.kind).toBe("error");
    expect(setup.storage.sessionMemory.contextMenuStash.payload).toBe("");
    expect(setup.setBadgeText).toHaveBeenCalledWith({text: "!"});
  });

  it("opens Settings when no server is configured", async () => {
    const setup = await setupContextMenuTest({
      settings: {baseUrl: "", apiToken: "", instantPushSelectedText: false}
    });

    await setup.module.handleContextMenuClick({
      menuItemId: setup.module.MENU_PUSH_SELECTED_TEXT,
      selectionText: "dummy-selected-secret"
    }, {id: 3});

    expect(setup.openOptionsPage).toHaveBeenCalledTimes(1);
    expect(setup.createPush).not.toHaveBeenCalled();
    expect(setup.storage.sessionMemory.contextMenuStash.kind).toBe("error");
    expect(setup.setBadgeText).toHaveBeenCalledWith({text: "!"});
  });

  it("creates an instant push without a passphrase and falls back to badge plus result stash when copy fails", async () => {
    const setup = await setupContextMenuTest({
      settings: {
        baseUrl: "https://oss.pwpush.com",
        apiToken: "",
        instantPushSelectedText: true,
        selectedWorkspaceId: null,
        lastPushOptions: {
          expireAfterDays: 3,
          expireAfterViews: 2,
          retrievalStep: false,
          passphrase: "ignored"
        }
      },
      copyResult: false
    });

    await setup.module.handleContextMenuClick({
      menuItemId: setup.module.MENU_PUSH_SELECTED_TEXT,
      selectionText: "dummy-instant-secret"
    }, {id: 11, url: "https://example.com"});

    expect(setup.createPush).toHaveBeenCalledWith("dummy-instant-secret", expect.objectContaining({
      baseUrl: "https://oss.pwpush.com",
      passphrase: "",
      expireAfterDays: 3,
      expireAfterViews: 2,
      retrievalStep: false
    }));
    expect(setup.storage.sessionMemory.contextMenuStash).toMatchObject({
      kind: "result",
      shareUrl: "https://oss.pwpush.com/p/dummy-url-token",
      copied: false
    });
    expect(setup.storage.sessionMemory.contextMenuStash.payload).toBe(undefined);
    expect(setup.setBadgeText).toHaveBeenCalledWith({text: "1"});
    expect(setup.executeScript).toHaveBeenCalled();
  });

  it("sets a copied badge when instant push clipboard injection succeeds", async () => {
    const setup = await setupContextMenuTest({
      settings: {
        baseUrl: "https://oss.pwpush.com",
        apiToken: "",
        instantPushSelectedText: true,
        lastPushOptions: {expireAfterDays: 7, expireAfterViews: 5, retrievalStep: true}
      },
      copyResult: true
    });

    await setup.module.handleContextMenuClick({
      menuItemId: setup.module.MENU_PUSH_SELECTED_TEXT,
      selectionText: "dummy-instant-secret"
    }, {id: 11});

    expect(setup.storage.sessionMemory.contextMenuStash.copied).toBe(true);
    expect(setup.openPopup).not.toHaveBeenCalled();
    expect(setup.setBadgeText).toHaveBeenCalledWith({text: "OK"});
  });

  it("stashes API errors and shows an error badge", async () => {
    const setup = await setupContextMenuTest({
      settings: {
        baseUrl: "https://oss.pwpush.com",
        apiToken: "",
        instantPushSelectedText: true,
        lastPushOptions: {expireAfterDays: 7, expireAfterViews: 5, retrievalStep: true}
      },
      createPushImpl: vi.fn(async () => ({
        ok: false,
        errorMessage: "Unable to reach this server. Check URL, network, or CORS settings."
      }))
    });

    await setup.module.handleContextMenuClick({
      menuItemId: setup.module.MENU_PUSH_SELECTED_TEXT,
      selectionText: "dummy-instant-secret"
    }, {id: 4});

    expect(setup.storage.sessionMemory.contextMenuStash).toMatchObject({
      kind: "error",
      payload: "dummy-instant-secret",
      message: "Unable to reach this server. Check URL, network, or CORS settings."
    });
    expect(setup.setBadgeText).toHaveBeenCalledWith({text: "!"});
  });

  it("ignores empty selected text", async () => {
    const setup = await setupContextMenuTest();
    await setup.module.handleContextMenuClick({
      menuItemId: setup.module.MENU_PUSH_SELECTED_TEXT,
      selectionText: "   "
    }, {id: 1});

    expect(setup.storage.sessionMemory.contextMenuStash).toBe(undefined);
    expect(setup.openPopup).not.toHaveBeenCalled();
  });

  it("clears the action badge and restores the default title", async () => {
    const setup = await setupContextMenuTest();
    await setup.module.clearActionAttention();
    expect(setup.setBadgeText).toHaveBeenCalledWith({text: ""});
    expect(setup.setTitle).toHaveBeenCalledWith({title: "Password Pusher"});
  });
});
