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
3. Click **Load unpacked** and select `extensions/chrome`.

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

## Security notes

- only `storage` permission is required
- preset host permissions are pre-granted for official cloud endpoints
- custom hosts are requested at runtime via optional host permissions
- no remote executable code is loaded
