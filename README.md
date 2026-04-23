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
| **⚡ Fast sharing workflow** | Push the current tab URL or highlighted text directly from the popup. |
| **🔒 Security-first defaults** | Password Pusher expiry controls, optional retrieval step, and optional passphrase support. |
| **🌍 Works across editions** | Connect to OSS, hosted Pro, or self-hosted instances with runtime host permissions. |
| **🧭 Instance-aware UX** | Automatically detects edition/version and surfaces API capability status in settings. |

---

## Features

### Create pushes from browser context

- **Push current URL** from the active tab.
- **Push selected text** from the active page using on-demand scripting.
- **Advanced options** for expiry (days/views), retrieval step, and passphrase.

### Connection and account awareness

- Detects instance metadata via `GET /api/v2/version`.
- Distinguishes OSS vs commercial editions.
- Probes API capabilities and displays them in settings.
- Supports hosted Pro account selection when using an API token.

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
2. Choose **Push Current URL** or **Push Selected Text**.
3. Optionally set advanced push options.
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

Build output: `dist/password-pusher-connector.zip`

CI workflow: `.github/workflows/chrome-extension-tests.yml`

---

## Security Notes

- Required extension permissions:
  - `storage` - persist extension configuration (server URL, optional API token, account, and non-sensitive defaults).
  - `tabs` - read active tab URL and open created links.
  - `activeTab` + `scripting` - read selected text only when explicitly requested by the user.
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
