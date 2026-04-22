# Chrome Extension QA & Security Review Checklist

Date: 2026-04-23  
Project: `extensions`

Use this checklist to track remediation work in strict priority order.

## P0 - High Priority

- [x] **[Security] Remove raw SVG injection in popup**
  - **Location:** `src/popup/popup.js`
  - **Current behavior:** Remote-derived `qrSvg` is inserted into extension DOM using `innerHTML`.
  - **Risk:** Trust-boundary violation and XSS-style exposure in a privileged extension context.
  - **Fixed:** 2026-04-23
  - **What changed:**
    - Removed DOM insertion of remote SVG markup.
    - QR now renders as an image using generated PNG data (`qrPngDataUrl`).
    - Download now uses stored PNG data instead of reading SVG from DOM.
  - **Validation notes:**
    - No remote SVG/HTML string is inserted with `innerHTML`.
    - QR render/download code paths preserved.

## P1 - Medium Priority

- [x] **[Security/Privacy] Reduce content-script scope to least privilege**
  - **Location:** `manifest.json` + selected-text flow in popup
  - **Current behavior:** Content script runs on all `http://*/*` and `https://*/*` pages.
  - **Risk:** Unnecessarily broad host/page surface and larger Chrome Web Store review risk.
  - **Fixed:** 2026-04-23
  - **What changed:**
    - Removed wildcard content script usage from `manifest.json`.
    - Added `activeTab` and `scripting` permissions.
    - Updated popup selected-text flow to on-demand `chrome.scripting.executeScript`.
    - Deleted now-unused `src/content/selection.js`.
  - **Validation notes:**
    - No always-on content script across all sites.
    - Selected-text flow remains user-triggered and least-privilege.

## P2 - Low Priority

- [x] **[QA/Docs] Align README permission claims with actual manifest/runtime behavior**
  - **Location:** `README.md`
  - **Current behavior:** README says only `storage` permission is required.
  - **Risk:** Documentation mismatch can cause reviewer/user confusion and trust issues.
  - **Fixed:** 2026-04-23
  - **What changed:**
    - Security notes now document `storage`, `tabs`, `activeTab`, and `scripting`.
    - Added rationale for each permission and clarified optional host permission behavior.
    - Documented that selected-text capture is on-demand (not persistent).
  - **Validation notes:**
    - README security notes now align with current `manifest.json` and runtime behavior.

## Validation / Regression Checklist (after fixes)

- [x] `npm run validate:manifest` passes.
- [ ] Create push from current URL still works. *(manual browser verification pending)*
- [ ] Create push from selected text still works on supported pages. *(manual browser verification pending)*
- [ ] QR display and QR PNG download still work. *(manual browser verification pending)*
- [ ] Settings save/reload, account selection, and instance detection still work. *(manual browser verification pending)*
- [x] No new broad host/page permissions were introduced.
