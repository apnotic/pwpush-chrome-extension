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

### Create pushes and requests from browser context

- **Push text** typed into the popup. **Add selected text** copies the page selection only when you click it.
- **Push current URL** from the active tab.
- **Create secure requests** to ask others to securely send you sensitive information (Pro/Commercial instances only).
- **Advanced options** for expiry (days/views), retrieval step, and passphrase.
- **Tabbed interface** to switch between Push and Request creation modes.

### Request support (Pro/Commercial instances)

- **Pull-model security**: Request sensitive data from others instead of having them push it insecurely.
- **Automatic detection**: Extension detects Request capability via `/api/v2/version` endpoint.
- **Request options**: Name, message, note, expiry, passphrase protection, email notifications.
- **Response file attachments**: Allow recipients to upload files (when supported by instance tier).
- **Graceful degradation**: Request tab is disabled with clear explanation on OSS instances that don't support Requests.

### Connection and workspace awareness

- Detects instance metadata via `GET /api/v2/version`.
- Distinguishes OSS vs commercial editions.
- Probes API capabilities (Workspaces, Requests) and displays them in settings.
- Supports hosted Pro workspace selection when using an API token.

### Result handling

- Shows the latest generated share URL (for both Pushes and Requests).
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

### 3) Create a push or request

#### To create a Push:

1. Click the extension icon.
2. Stay on the **Push** tab (default).
3. Enter text, or click **Add selected text** to copy a highlight from the page.
4. Set expiry options if needed, then click **Push**. Use **Push Current URL** to share the page address instead.
5. Copy/open the link or generate/download a QR PNG.

#### To create a Request (Pro/Commercial instances only):

1. Click the extension icon.
2. Switch to the **Request** tab.
3. Enter a request name and message describing what you need.
4. Optionally add a note, set expiry, enable file attachments, or add notification emails.
5. Click **Create Request**.
6. Share the generated URL with the person you're requesting information from.

**Note**: The Request tab is automatically disabled on OSS instances that don't support Requests. Configure a Pro/Commercial instance to use this feature.

---

## Development

### Prerequisites

- Node.js 20
- Install dependencies: `npm install`

### Validate and test

```bash
npm run validate:manifest
npm test
```

### Run smoke E2E (Playwright)

Install Playwright's Chromium once, and again after Playwright upgrades:

```bash
npx playwright install chromium
```

Then:

```bash
npm run test:e2e
```

The smoke test launches headed Chromium, so a display is required. On Linux without a GUI:

```bash
xvfb-run -a npm run test:e2e
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
  - `scripting` - when the popup opens, ask only whether the page has a selection. Read that text only when you click **Add selected text**.
- Preset host permissions are pre-granted for official cloud endpoints (`oss`, `us`, `eu`).
- Custom hosts are requested at runtime through optional host permissions (`https://*/*`).
- Selected-text capture is on-demand only (no persistent all-pages content script).
- Push/Request payloads and selected text are not persisted by the extension.
- The popup does not keep a historical trail of past pushes/requests across sessions.
- Passphrases entered in advanced options are not stored as persistent settings.
- Remote executable code is not loaded.
- **Request security**: Email addresses entered for notifications are sent to the configured Password Pusher instance and are not stored locally by the extension.
- **Input sanitization**: All user inputs are trimmed and validated before being sent to the API.
- **Capability detection**: The extension detects instance capabilities via the official `/api/v2/version` endpoint and disables unsupported features gracefully.
- For Password Pusher platform encryption and security architecture, see [The Security & Encryption of Password Pusher](https://docs.pwpush.com/docs/security/).

---

## Documentation

- Product docs: [docs.pwpush.com](https://docs.pwpush.com)
- API v2 docs: [docs.pwpush.com/docs/api-v2](https://docs.pwpush.com/docs/api-v2/)
- Editions and feature migration: [docs.pwpush.com/docs/editions](https://docs.pwpush.com/docs/editions/)

---

## Open Source

This extension is part of the Password Pusher ecosystem and is intended to be open-sourced for community use and contribution.
