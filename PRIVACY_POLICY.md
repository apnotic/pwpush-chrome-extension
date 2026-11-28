# Password Pusher Chrome Extension Privacy Policy

Last updated: 2026-11-28

Apnotic LLC provides the Password Pusher Chrome extension.

## Data handled by the extension

- Password Pusher server URL selected by the user.
- Optional API bearer token entered by the user.
- Server capability/version metadata retrieved from `/api/v2/version` and related API probes.
- Optional workspace selection metadata (for supported hosted Pro workflows).
- Non-sensitive push defaults (such as expire-after days/views and retrieval-step preference).
- Right-click preference for whether selected text is pushed immediately (off by default).

The extension does **not** persist a history/trail of past pushes across popup sessions.
Pushed payload content and selected text are used only to create a push request and are not stored as retained history in extension local storage.
Right-clicked selected text and link URLs may be held briefly in Chrome session storage so the popup can prefill them. That stash is cleared as soon as the popup reads it, after a short unused timeout, or when the browser session ends. It is never written to local storage and is not logged.
Passphrases entered in advanced options are not stored as persistent settings.

## How data is used

- Data is used only to connect the extension to the configured Password Pusher instance.
- Data is stored in Chrome extension storage on the user's browser profile.
- Data is not sold and is not used for advertising.
- Requests are sent directly from the user's browser to the configured Password Pusher server.

### API token storage behavior

- Users can enable or disable **Remember token on this browser**.
- If enabled, the API token is stored in extension local storage.
- If disabled, the API token is stored only for the current browser session and cleared when the session ends.

## Data sharing

- Extension settings are not shared with third parties by Apnotic through this extension.
- API requests are sent directly from the user's browser to the configured Password Pusher server.

## Data retention

- Stored extension configuration values remain until the user changes settings, removes extension data, or uninstalls the extension.
- Session-only token values (when Remember token is disabled) are cleared at browser session end.
- Last push result history is not retained across popup sessions.

## Security and encryption

- The extension does not load remote executable code.
- Selected text capture is user-triggered and on-demand only (popup button or right-click menu).
- Right-clicked text and links are not persisted beyond the short session stash described above.
- For Password Pusher platform encryption and security architecture, see:
  - https://docs.pwpush.com/docs/security/

## Contact

Apnotic LLC
https://apnotic.com
https://docs.pwpush.com
