# Password Pusher Chrome Extension

This Chrome extension connects to Password Pusher APIv2 instances, including:

- `https://oss.pwpush.com`
- `https://eu.pwpush.com`
- `https://us.pwpush.com`
- private/self-hosted `https://` instances

## What it does

- prompts for instance selection on install
- tests `GET /api/v2/version`
- identifies instance edition (`oss` or `commercial`)
- probes selected API capabilities and shows them in settings/popup
- creates pushes directly from:
  - current browser tab URL
  - selected text on the current page
- shows a QR code in the popup based on the push preview/share URL

## Development

Load unpacked extension from this folder:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click **Load unpacked** and select `extensions`.

## Creating pushes from the popup

1. Click the extension icon.
2. Use **Push current URL** or **Push selected text**.
3. Optional: open **More options** for expiration/views/retrieval/passphrase.
4. Copy/open the generated link or click **Show QR**.

## Build package

```bash
npm run package
```

This writes a Chrome Web Store upload ZIP to `dist/password-pusher-connector.zip`.

## Testing

Run checks locally:

```bash
npm run validate:manifest
npm test
```

Optional extension smoke test (Playwright):

```bash
npm run test:e2e
```

Notes:

- Unit tests use Vitest (`tests/unit`).
- E2E smoke tests use Playwright (`tests/e2e`) and are run in CI on Linux.
- GitHub Actions workflow: `.github/workflows/chrome-extension-tests.yml`.

## Security notes

- required extension permissions:
  - `storage`: save settings, detected instance metadata, and latest push result
  - `tabs`: read active tab URL and open created push links
  - `activeTab` + `scripting`: read highlighted text only when user explicitly clicks **Push selected text**
- preset host permissions are pre-granted for official cloud endpoints (`oss`, `us`, `eu`)
- custom hosts are requested at runtime via optional host permissions (`https://*/*`)
- selected-text capture is on-demand only (no persistent all-pages content script)
- no remote executable code is loaded
