<div align="center">

[![Password Pusher](https://pwpush.fra1.cdn.digitaloceanspaces.com/branding/logos/horizontal-logo-small.png)](https://pwpush.com/)

**Create secure Password Pusher links from your browser in seconds.**

[![Try it free](https://img.shields.io/badge/Try_it_free-pwpush.com-0ea5e9?style=for-the-badge)](https://pwpush.com)
[![Documentation](https://img.shields.io/badge/Docs-docs.pwpush.com-64748b?style=for-the-badge)](https://docs.pwpush.com)

</div>

---

## What is this extension?

The **Password Pusher Chrome Extension** connects your browser to Password Pusher APIv2 instances so you can create expiring, self-destructing links without leaving the page you're on.

Use it with:

- `https://oss.pwpush.com` (OSS public service)
- `https://eu.pwpush.com` (Pro hosted EU)
- `https://us.pwpush.com` (Pro hosted US)
- any private/self-hosted `https://` Password Pusher instance

---

## Why use it?

| | |
|---|---|
| **⚡ Fast sharing workflow** | Push the current tab URL, or add highlighted text when you choose to. |
| **🔒 Security-first defaults** | Password Pusher expiry controls, optional retrieval step, and optional passphrase support. |
| **🌍 Works across editions** | Connect to OSS, hosted Pro, or self-hosted instances with runtime host permissions. |
| **🧭 Instance-aware UX** | Automatically detects edition/version and surfaces API capability status in settings. |

---

## Features

### Create pushes from browser context

- **Push text** typed into the popup. **Add selected text** copies the page selection only when you click it.
- **Push current URL** from the active tab.
- **Advanced options** for expiry (days/views), retrieval step, and passphrase.

### Connection and workspace awareness

- Detects instance metadata via `GET /api/v2/version`.
- Distinguishes OSS vs commercial editions.
- Probes API capabilities and displays them in settings.
- Supports hosted Pro workspace selection when using an API token.

### Result handling

- Shows the latest generated share URL.
- One-click copy/open actions.
- QR generation and PNG download from the popup.

---

## Quick Start

### 1) Load unpacked extension (development)

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this repository folder (`pwpush-chrome-extension`).

### 2) Configure a server

1. Open extension **Settings**.
2. Choose `oss`, `us`, `eu`, or enter a custom self-hosted URL.
3. Optionally add an API bearer token.
4. Click **Test connection**, then **Save configuration**.

### 3) Create a push

1. Click the extension icon.
2. Enter text, or click **Add selected text** to copy a highlight from the page.
3. Set expiry options if needed, then click **Push**. Use **Push Current URL** to share the page address instead.
4. Copy/open the link or generate/download a QR PNG.

---

## Development

### Validate and test

```bash
npm run validate:manifest
npm test
```

### Run smoke E2E (Playwright)

```bash
npm run test:e2e
```

### Build Chrome Web Store package

```bash
npm run package
```

Build output: `dist/password-pusher-chrome-extension.zip`

CI workflow: `.github/workflows/chrome-extension-tests.yml`

---

## Security Notes

- Required extension permissions:
  - `storage` - persist extension configuration (server URL, optional API token, workspace, and non-sensitive defaults).
  - `activeTab` - read the active tab URL when you use the popup, and open created links.
  - `scripting` - read selected text only when you click **Add selected text**.
- Preset host permissions are pre-granted for official cloud endpoints (`oss`, `us`, `eu`).
- Custom hosts are requested at runtime through optional host permissions (`https://*/*`).
- Selected-text capture is on-demand only (no persistent all-pages content script).
- Push payloads/selected text are not persisted by the extension.
- The popup does not keep a historical trail of past pushes across sessions.
- Passphrases entered in advanced options are not stored as persistent settings.
- Remote executable code is not loaded.
- For Password Pusher platform encryption and security architecture, see [The Security & Encryption of Password Pusher](https://docs.pwpush.com/docs/security/).

---

## Documentation

- Product docs: [docs.pwpush.com](https://docs.pwpush.com)
- API v2 docs: [docs.pwpush.com/docs/api-v2](https://docs.pwpush.com/docs/api-v2/)
- Editions and feature migration: [docs.pwpush.com/docs/editions](https://docs.pwpush.com/docs/editions/)

---

## Open Source

This extension is part of the Password Pusher ecosystem and is intended to be open-sourced for community use and contribution.
