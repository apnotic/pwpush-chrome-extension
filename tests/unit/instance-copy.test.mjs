import {describe, it, expect} from "vitest";
import {getPushNoTokenNotice, getRequestNoTokenNotice, shouldShowPushAuthNotice} from "../../src/lib/instance-copy.js";

describe("instance-copy", () => {
  describe("getPushNoTokenNotice", () => {
    it("OSS with file attachments enabled", () => {
      const result = getPushNoTokenNotice({
        edition: "oss",
        fileAttachmentsEnabled: true
      });
      expect(result).toBe("Add an API token in Settings to unlock Name, Note and file attachments.");
      expect(result).not.toContain("paid");
      expect(result).not.toContain("subscription");
    });

    it("OSS with file attachments disabled", () => {
      const result = getPushNoTokenNotice({
        edition: "oss",
        fileAttachmentsEnabled: false
      });
      expect(result).toBe("Add an API token in Settings to unlock Name and Note fields.");
      expect(result).not.toContain("paid");
      expect(result).not.toContain("subscription");
      expect(result).not.toContain("file attachments");
    });

    it("Commercial with file attachments enabled", () => {
      const result = getPushNoTokenNotice({
        edition: "commercial",
        fileAttachmentsEnabled: true
      });
      expect(result).toBe("Add an API token in Settings to unlock Name and Note fields. File attachments also require a paid subscription.");
      expect(result).toContain("paid");
    });

    it("Commercial with file attachments disabled", () => {
      const result = getPushNoTokenNotice({
        edition: "commercial",
        fileAttachmentsEnabled: false
      });
      expect(result).toBe("Add an API token in Settings to unlock Name and Note fields.");
      expect(result).not.toContain("paid subscription");
      expect(result).not.toContain("file attachments");
    });

    it("Pro with file attachments enabled", () => {
      const result = getPushNoTokenNotice({
        edition: "pro",
        fileAttachmentsEnabled: true
      });
      expect(result).toBe("Add an API token in Settings to unlock Name and Note fields. File attachments also require a paid subscription.");
      expect(result).toContain("paid");
    });

    it("OSS without API token auth support", () => {
      const result = getPushNoTokenNotice({
        edition: "oss",
        fileAttachmentsEnabled: false,
        apiTokenAuthEnabled: false
      });
      expect(result).toBe("API token authentication is not supported on this instance.");
    });
  });

  describe("getRequestNoTokenNotice", () => {
    it("OSS edition", () => {
      const result = getRequestNoTokenNotice({
        edition: "oss"
      });
      expect(result).toBe("Requests require an API token.");
      expect(result).not.toContain("paid");
      expect(result).not.toContain("subscription");
      expect(result).not.toContain("free");
    });

    it("Commercial edition", () => {
      const result = getRequestNoTokenNotice({
        edition: "commercial"
      });
      expect(result).toBe("Requests require an API token. Basic Requests are free with any account. Paid subscriptions add branding, custom domains and file attachments.");
      expect(result).toContain("free");
      expect(result).toContain("Paid subscriptions");
    });

    it("Without API token auth support", () => {
      const result = getRequestNoTokenNotice({
        edition: "commercial",
        apiTokenAuthEnabled: false
      });
      expect(result).toBe("API token authentication is not supported on this instance.");
    });
  });

  describe("shouldShowPushAuthNotice", () => {
    it("shows notice when no token and auth enabled", () => {
      expect(shouldShowPushAuthNotice({
        hasToken: false,
        apiTokenAuthEnabled: true
      })).toBe(true);
    });

    it("hides notice when token present", () => {
      expect(shouldShowPushAuthNotice({
        hasToken: true,
        apiTokenAuthEnabled: true
      })).toBe(false);
    });

    it("hides notice when auth not enabled", () => {
      expect(shouldShowPushAuthNotice({
        hasToken: false,
        apiTokenAuthEnabled: false
      })).toBe(false);
    });

    it("defaults to auth enabled", () => {
      expect(shouldShowPushAuthNotice({
        hasToken: false
      })).toBe(true);
    });
  });
});
