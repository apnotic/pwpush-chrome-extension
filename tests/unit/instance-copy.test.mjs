import {describe, it, expect} from "vitest";
import {
  getNotifyEmailsCopy,
  getPushNoTokenNotice,
  getRequestNoTokenNotice,
  getSubscriptionBadge,
  getSubscriptionCopy,
  resolveBillingUrl,
  shouldShowPushAuthNotice
} from "../../src/lib/instance-copy.js";

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

  describe("getSubscriptionCopy", () => {
    describe("OSS instances", () => {
      it("never mentions subscriptions when features are enabled", () => {
        const result = getSubscriptionCopy({
          edition: "oss",
          hasToken: false,
          subscription: null,
          features: {
            pushes: {
              file_attachments: {enabled: true}
            }
          }
        });

        expect(result.fileAttachmentsEnabled).toBe(true);
        expect(result.subscriptionHint).toBe("");
      });

      it("respects feature flags without subscription hints", () => {
        const result = getSubscriptionCopy({
          edition: "oss",
          hasToken: true,
          subscription: null,
          features: {
            pushes: {
              file_attachments: {enabled: false}
            }
          }
        });

        expect(result.fileAttachmentsEnabled).toBe(false);
        expect(result.subscriptionHint).toBe("");
      });
    });

    describe("Commercial without token", () => {
      it("disables file attachments and shows no hint", () => {
        const result = getSubscriptionCopy({
          edition: "commercial",
          hasToken: false,
          subscription: null,
          features: {
            pushes: {
              file_attachments: {enabled: true}
            }
          }
        });

        expect(result.fileAttachmentsEnabled).toBe(false);
        expect(result.subscriptionHint).toBe("");
      });
    });

    describe("Commercial with token but no subscription key (older servers)", () => {
      it("falls back to current behavior without subscription hints", () => {
        const result = getSubscriptionCopy({
          edition: "commercial",
          hasToken: true,
          subscription: null,
          features: {
            pushes: {
              file_attachments: {enabled: true}
            }
          }
        });

        expect(result.fileAttachmentsEnabled).toBe(true);
        expect(result.subscriptionHint).toBe("");
      });

      it("respects disabled features without subscription hints", () => {
        const result = getSubscriptionCopy({
          edition: "commercial",
          hasToken: true,
          subscription: null,
          features: {
            pushes: {
              file_attachments: {enabled: false}
            }
          }
        });

        expect(result.fileAttachmentsEnabled).toBe(false);
        expect(result.subscriptionHint).toBe("");
      });
    });

    describe("Commercial with token and subscribed", () => {
      it("enables attachments when features allow", () => {
        const result = getSubscriptionCopy({
          edition: "commercial",
          hasToken: true,
          subscription: {
            workspace_id: 123,
            workspace_name: "Acme",
            subscribed: true,
            plan_name: "Pro"
          },
          features: {
            pushes: {
              file_attachments: {enabled: true}
            }
          }
        });

        expect(result.fileAttachmentsEnabled).toBe(true);
        expect(result.subscriptionHint).toBe("");
      });

      it("respects feature flags when subscribed", () => {
        const result = getSubscriptionCopy({
          edition: "commercial",
          hasToken: true,
          subscription: {
            workspace_id: 123,
            workspace_name: "Acme",
            subscribed: true,
            plan_name: "Pro"
          },
          features: {
            pushes: {
              file_attachments: {enabled: false}
            }
          }
        });

        expect(result.fileAttachmentsEnabled).toBe(false);
        expect(result.subscriptionHint).toBe("");
      });
    });

    describe("Commercial with token and not subscribed", () => {
      it("shows subscription hint when file attachments are disabled", () => {
        const result = getSubscriptionCopy({
          edition: "commercial",
          hasToken: true,
          subscription: {
            workspace_id: 123,
            workspace_name: "Acme Corp",
            subscribed: false,
            plan_name: "Free"
          },
          features: {
            pushes: {
              file_attachments: {enabled: false}
            }
          }
        });

        expect(result.fileAttachmentsEnabled).toBe(false);
        expect(result.subscriptionHint).toBe("File attachments require a paid plan for workspace \"Acme Corp\".");
      });

      it("shows no hint when all features are available despite no subscription", () => {
        const result = getSubscriptionCopy({
          edition: "commercial",
          hasToken: true,
          subscription: {
            workspace_id: 123,
            workspace_name: "Acme",
            subscribed: false,
            plan_name: "Free"
          },
          features: {
            pushes: {
              file_attachments: {enabled: true}
            }
          }
        });

        expect(result.fileAttachmentsEnabled).toBe(true);
        expect(result.subscriptionHint).toBe("");
      });

      it("uses workspace_name in hint when available", () => {
        const result = getSubscriptionCopy({
          edition: "commercial",
          hasToken: true,
          subscription: {
            workspace_id: 456,
            workspace_name: "My Test Workspace",
            subscribed: false
          },
          features: {
            pushes: {
              file_attachments: {enabled: false}
            }
          }
        });

        expect(result.subscriptionHint).toContain("My Test Workspace");
      });

      it("uses fallback text when workspace_name is missing", () => {
        const result = getSubscriptionCopy({
          edition: "commercial",
          hasToken: true,
          subscription: {
            workspace_id: 456,
            subscribed: false
          },
          features: {
            pushes: {
              file_attachments: {enabled: false}
            }
          }
        });

        expect(result.subscriptionHint).toContain("this workspace");
      });
    });

    describe("Edge cases", () => {
      it("handles missing features object", () => {
        const result = getSubscriptionCopy({
          edition: "oss",
          hasToken: false,
          subscription: null,
          features: {}
        });

        expect(result.fileAttachmentsEnabled).toBe(false);
        expect(result.subscriptionHint).toBe("");
      });

      it("handles unknown edition", () => {
        const result = getSubscriptionCopy({
          edition: "unknown",
          hasToken: true,
          subscription: {subscribed: false, workspace_name: "Test"},
          features: {
            pushes: {
              file_attachments: {enabled: false}
            }
          }
        });

        // Unknown editions treated like commercial
        expect(result.fileAttachmentsEnabled).toBe(false);
        expect(result.subscriptionHint).toBe("File attachments require a paid plan for workspace \"Test\".");
      });
    });
  });

  describe("getSubscriptionBadge", () => {
    it("returns empty string when subscription is null", () => {
      expect(getSubscriptionBadge(null)).toBe("");
    });

    it("returns empty string when not subscribed", () => {
      const badge = getSubscriptionBadge({
        workspace_id: 123,
        workspace_name: "Acme",
        subscribed: false,
        plan_name: "Free"
      });

      expect(badge).toBe("");
    });

    it("returns plan and workspace when both present", () => {
      const badge = getSubscriptionBadge({
        workspace_id: 123,
        workspace_name: "Acme Corp",
        subscribed: true,
        plan_name: "Pro"
      });

      expect(badge).toBe("Pro · Acme Corp");
    });

    it("returns only plan when workspace_name missing", () => {
      const badge = getSubscriptionBadge({
        workspace_id: 123,
        subscribed: true,
        plan_name: "Enterprise"
      });

      expect(badge).toBe("Enterprise");
    });

    it("returns only workspace when plan_name missing", () => {
      const badge = getSubscriptionBadge({
        workspace_id: 123,
        workspace_name: "My Workspace",
        subscribed: true
      });

      expect(badge).toBe("My Workspace");
    });

    it("returns empty string when both plan and workspace missing", () => {
      const badge = getSubscriptionBadge({
        workspace_id: 123,
        subscribed: true
      });

      expect(badge).toBe("");
    });
  });

  describe("paid-plan hint details", () => {
    it("names every explicitly disabled paid feature and links to instance billing", () => {
      const result = getSubscriptionCopy({
        edition: "commercial",
        hasToken: true,
        baseUrl: "https://eu.pwpush.com",
        subscription: {
          workspace_id: 7,
          workspace_name: "Acme",
          subscribed: false,
          plan_name: "Free"
        },
        features: {
          pushes: {
            file_attachments: {enabled: false},
            email_auto_dispatch: false
          },
          requests: {
            file_attachments: {enabled: false}
          }
        }
      });

      expect(result.fileAttachmentsEnabled).toBe(false);
      expect(result.subscriptionHint).toBe(
        "File attachments and email notifications require a paid plan for workspace \"Acme\"."
      );
      expect(result.subscriptionLinkUrl).toBe("https://eu.pwpush.com/billing");
      expect(result.subscriptionLinkLabel).toBe("View billing");
    });

    it("does not invent a billing link for a non-https base URL", () => {
      expect(resolveBillingUrl("http://eu.pwpush.com")).toBe("");
      expect(resolveBillingUrl("")).toBe("");
    });
  });

  describe("notify emails copy", () => {
    it("never mentions a subscription on OSS", () => {
      const copy = getNotifyEmailsCopy({
        edition: "oss",
        subscription: {subscribed: false, workspace_name: "Acme"}
      });
      expect(`${copy.label} ${copy.hint}`).not.toMatch(/paid|subscription/i);
    });

    it("keeps the older commercial wording when subscription is missing", () => {
      const copy = getNotifyEmailsCopy({edition: "commercial", subscription: null});
      expect(copy.hint).toContain("paid subscription");
    });

    it("names the workspace when the commercial workspace is not subscribed", () => {
      const copy = getNotifyEmailsCopy({
        edition: "Commercial",
        subscription: {subscribed: false, workspace_name: "Acme"}
      });
      expect(copy.hint).toBe("Email notifications require a paid plan for workspace \"Acme\".");
    });
  });

  describe("OSS payloads never produce subscription wording", () => {
    const payloads = [
      {},
      {pushes: {file_attachments: {enabled: false, requires_authentication: true}}},
      {pushes: {file_attachments: {enabled: true, requires_authentication: true}, email_auto_dispatch: false}},
      {pushes: {file_attachments: {enabled: false}}, requests: {enabled: false}},
      {requests: {enabled: true, file_attachments: {enabled: true, requires_authentication: true}}}
    ];

    for (const features of payloads) {
      for (const edition of ["oss", "OSS", "Oss"]) {
        for (const hasToken of [false, true]) {
          it(`edition ${edition}, token ${hasToken}, features ${JSON.stringify(features)}`, () => {
            const fileAttachmentsEnabled = Boolean(features.pushes?.file_attachments?.enabled);
            const pieces = [
              getPushNoTokenNotice({edition, fileAttachmentsEnabled}),
              getRequestNoTokenNotice({edition}),
              getNotifyEmailsCopy({edition, subscription: {subscribed: false, workspace_name: "Acme"}}).label,
              getNotifyEmailsCopy({edition, subscription: {subscribed: false, workspace_name: "Acme"}}).hint,
              getSubscriptionCopy({
                edition,
                hasToken,
                subscription: {subscribed: false, workspace_name: "Acme", plan_name: "Free"},
                features,
                baseUrl: "https://oss.pwpush.com"
              }).subscriptionHint,
              getSubscriptionBadge({subscribed: true, plan_name: "Pro", workspace_name: "Acme"})
            ];
            // Badge is plan display, not a subscription pitch. The hint and notices must stay clean.
            expect(pieces.slice(0, 5).join(" ").toLowerCase()).not.toMatch(/subscription|paid/);
          });
        }
      }
    }
  });
});
