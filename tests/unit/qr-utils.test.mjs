import {describe, expect, it} from "vitest";
import {buildPreviewUrl, buildPreviewUrlFromToken, extractFirstSvg} from "../../src/popup/qr-utils.js";

describe("buildPreviewUrl", () => {
  it("appends /preview for absolute share URLs", () => {
    expect(buildPreviewUrl("https://pwpush.example/p/abc123")).toBe("https://pwpush.example/p/abc123/preview");
  });

  it("does not duplicate /preview when already present", () => {
    expect(buildPreviewUrl("https://pwpush.example/p/abc123/preview")).toBe("https://pwpush.example/p/abc123/preview");
  });

  it("resolves relative share URL with configured base URL", () => {
    expect(buildPreviewUrl("/p/abc123", "https://pwpush.example")).toBe("https://pwpush.example/p/abc123/preview");
  });

  it("throws when a relative share URL has no base URL", () => {
    expect(() => buildPreviewUrl("/p/abc123")).toThrow("Push URL is invalid for QR generation.");
  });
});

describe("buildPreviewUrlFromToken", () => {
  it("builds preview URL from token and configured base URL", () => {
    expect(buildPreviewUrlFromToken("tnxljg8ihwq2lsldxq", "https://eu.pwpush.com"))
      .toBe("https://eu.pwpush.com/p/tnxljg8ihwq2lsldxq/preview");
  });

  it("encodes token path segments safely", () => {
    expect(buildPreviewUrlFromToken("a/b c", "https://eu.pwpush.com"))
      .toBe("https://eu.pwpush.com/p/a%2Fb%20c/preview");
  });

  it("throws without token", () => {
    expect(() => buildPreviewUrlFromToken("", "https://eu.pwpush.com"))
      .toThrow("Push token is required for QR generation.");
  });

  it("throws without configured base URL", () => {
    expect(() => buildPreviewUrlFromToken("abc123", ""))
      .toThrow("Configured server URL is required for token preview lookup.");
  });
});

describe("extractFirstSvg", () => {
  it("prefers QR-like svg over decorative svg", () => {
    const html = `
      <html>
        <body>
          <svg id="menu-icon"><rect /><rect /><rect /></svg>
          <svg id="qrcode">
            <rect /><rect /><rect /><rect /><rect /><rect /><rect /><rect /><rect /><rect />
          </svg>
        </body>
      </html>
    `;
    expect(extractFirstSvg(html)).toContain('id="qrcode"');
  });

  it("falls back to first svg when no qr hints exist", () => {
    const html = "<html><body><svg id='one'></svg><svg id='two'></svg></body></html>";
    expect(extractFirstSvg(html)).toBe("<svg id='one'></svg>");
  });

  it("returns empty string when no svg is present", () => {
    expect(extractFirstSvg("<html><body>No SVG here</body></html>")).toBe("");
  });
});
