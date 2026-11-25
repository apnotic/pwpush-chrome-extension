# Chrome Web Store Listing Information

**Last Updated**: November 25, 2026

This document tracks all information needed for Chrome Web Store submission and review. It serves as the single source of truth for store listing metadata, permission justifications, and compliance documentation.

---

## Extension Overview

**Name**: Password Pusher

**Version**: 0.6.0

**Single Purpose Statement**: 
Create secure, expiring Password Pusher links and requests directly from the browser without navigating away from the current page.

**Detailed Single Purpose**: 
This extension connects to Password Pusher APIv2 instances (official hosted services or self-hosted deployments) to create expiring, self-destructing text and URL pushes, and secure pull-model requests. Users can share sensitive information with automatic expiration controls and request secrets from others without leaving their browser or current workflow.

---

## Store Listing Copy

### Short Description (132 characters max)
Create secure Password Pusher links from your browser in seconds. Connect to any Password Pusher APIv2 instance.

### Detailed Description

The Password Pusher Chrome Extension connects your browser to Password Pusher APIv2 instances so you can create expiring, self-destructing links and secure requests without leaving the page you're on.

**What you can do:**
- **Push text** typed into the popup or selected on any webpage (when you click to add it)
- **Push the current tab URL** to share links securely
- **Create secure requests** to ask others to send you sensitive information (Pro instances with API token)
- **Attach files** to pushes and requests (Pro instances with paid subscription)
- **Configure expiry controls** (days/views), optional retrieval step, and optional passphrase
- **Add optional name and note** to pushes for organization (requires API token)
- **Email notifications** for requests (Pro instances with paid subscription)
- **Generate and download QR codes** for created pushes
- **Connect to official hosted services** (oss.pwpush.com, us.pwpush.com, eu.pwpush.com) or any self-hosted Password Pusher instance

**Works with:**
- Official open source service: https://oss.pwpush.com
- Hosted Pro regions: https://us.pwpush.com and https://eu.pwpush.com
- Any private/self-hosted Password Pusher instance running APIv2

**Key features:**
- **Fast workflow**: create pushes and requests without navigating away from your current tab
- **Security-first defaults**: Password Pusher expiry controls prevent permanent exposure
- **Pull-model requests**: ask others to securely send you information (Pro instances)
- **File attachments**: attach files to pushes and requests (Pro paid tier)
- **Instance-aware**: automatically detects edition (OSS vs commercial), API capabilities, and authentication requirements
- **Real-time updates**: UI adapts instantly when you change server or add an API token
- **Self-hosted friendly**: request runtime host permissions for custom domains

Password Pusher is an open source tool for sharing sensitive content with automatic expiration. Learn more at https://pwpush.com and https://docs.pwpush.com

---

## Permissions Justification

Every permission and host permission is documented below with a specific, plain-English justification for the Chrome Web Store review team.

### Required Permissions

#### `storage`
**Why needed**: Persist user-configured extension settings across browser sessions, including:
- Selected Password Pusher server URL (official hosted service or custom self-hosted instance)
- Optional API bearer token (stored in browser local storage only, never transmitted elsewhere)
- Non-sensitive push defaults (expire-after days/views, retrieval step preference)
- Server capability/version metadata retrieved from API probes
- Optional workspace selection (for hosted Pro workflows)

The extension does not persist a history of past pushes or push payloads. Settings remain local to the user's browser and are not transmitted to third parties.

#### `activeTab`
**Why needed**: Read the active tab URL only when the user clicks "Push Current URL" in the popup, and open created push links when the user clicks "Open Link". The extension does not access tab content or URLs automatically in the background.

#### `scripting`
**Why needed**: Inject a small content script on-demand to detect whether the current page has user-selected text, and read that text only when the user explicitly clicks "Add selected text" in the popup. No persistent content scripts run on all pages. Text capture is user-triggered only.

### Host Permissions

#### `https://oss.pwpush.com/*`, `https://eu.pwpush.com/*`, `https://us.pwpush.com/*`
**Why needed**: Make API requests to the official Password Pusher hosted services when the user selects one of these servers in settings. These are the preset server options that do not require additional runtime permission prompts.

API calls include:
- `GET /api/v2/version` to detect server capabilities and edition (OSS vs Pro)
- `POST /api/v2/p.json` to create text pushes
- `POST /api/v2/r.json` to create URL pushes
- Workspace enumeration for hosted Pro instances when the user provides an API token
- QR preview page fetch for QR code generation

### Optional Host Permissions

#### `https://*/*`
**Why needed**: Allow users to connect to self-hosted Password Pusher instances on custom domains. The extension requests host permission at runtime through Chrome's optional permissions UI only when the user enters a custom server URL in settings and clicks "Test connection". Permission is scoped to the specific domain entered, not all domains.

---

## Privacy & Data Use

### Data Collection
The extension collects and stores locally:
- Password Pusher server URL selected by the user
- Optional API bearer token entered by the user (stored in Chrome extension storage on the user's browser profile only)
- Server capability/version metadata retrieved from API probes (including whether Requests and file attachments are supported)
- Optional workspace selection metadata (for hosted Pro workflows)
- Non-sensitive push defaults (expire-after days/views, retrieval-step preference)

### Data NOT Collected or Stored
- Push or request payload content (text, URLs, or files) is not persisted after creation
- Selected text from webpages is not stored
- Passphrases entered in advanced options are not stored
- File contents are kept in memory only during upload and cleared immediately after
- History of past pushes or requests is not retained across popup sessions
- Email addresses entered in request notify fields are not stored

### Data Usage
- Data is used only to connect the extension to the configured Password Pusher instance
- Data is stored in Chrome extension storage on the user's browser profile
- Data is not sold and is not used for advertising
- API requests are sent directly from the user's browser to the configured Password Pusher server

### Data Sharing
- Extension settings are not shared with third parties by this extension
- API requests are sent directly from the user's browser to the configured Password Pusher server
- No analytics or tracking services are embedded in the extension

### Data Retention
- Stored extension configuration values remain until the user changes settings, removes extension data, or uninstalls the extension
- Session-only token values (when "Remember token" is disabled) are cleared at browser session end
- Push result metadata is not retained across popup sessions

### Security
- The extension does not load remote executable code
- Selected text capture is user-triggered and on-demand only
- File selection requires explicit user interaction through native file picker
- File contents never stored to disk by the extension (memory only during upload)
- API tokens are stored in Chrome extension storage, inaccessible to other extensions
- No new manifest permissions required for Requests or file attachments
- For Password Pusher platform encryption and security architecture, see https://docs.pwpush.com/docs/security/

### Privacy Policy URL
TODO: [Peter to provide public privacy policy URL for Chrome Web Store listing]

---

## Screenshots & Assets

### Required Screenshots
1. Popup interface showing push creation form with text input, expiry options, and "Push" button
2. Popup showing a created push with "Copy Link", "Open Link", and "Show QR" actions
3. Settings page showing server selection (hosted vs self-hosted) and configuration options
4. Settings page showing detected instance metadata (server type, API version, capabilities)

**Recommended dimensions**: 1280×800 or 640×400

### Icons
Current icon assets (all present in `src/icons/`):
- 16×16: `icon-16.png`
- 32×32: `icon-32.png`
- 48×48: `icon-48.png`
- 64×64: `icon-64.png`
- 128×128: `icon-128.png`

All icon files exist and are correctly sized.

---

## Category & Tags

**Primary Category**: Productivity

**Suggested Tags**: password, security, sharing, privacy, link, encryption, expiration

---

## Version History

### v0.6.0 (Current)
- **Request support** (pull-model): Create secure requests on Pro instances to ask others to send you information
- **File attachments**: Upload files with pushes and requests (Pro paid tier)
- **Push name and note fields**: Add optional name/note for organization (requires API token)
- **Request email notifications**: Notify recipients by email (Pro paid tier)
- **Authentication gating**: UI shows appropriate messages and hints based on instance capabilities and API token presence
- **Real-time capability updates**: UI adapts instantly when server or token changes (no popup reload needed)
- **Tabbed interface**: Separate Push and Request tabs for clear workflows
- Comprehensive i18n strings for all new features

### v0.5.0
- Multi-language support with internationalization (i18n)
- Workspace selection for hosted Pro instances
- Instance capability detection (Requests API, Workspaces API, Push API)
- QR code generation and download
- Selected text capture (on-demand, user-triggered)
- Runtime host permissions for self-hosted instances
- Settings persistence with API token remember/session-only options

---

## Pre-Publish Checklist

Review before submission:

- [x] Single purpose statement clearly describes what the extension does
- [x] Every permission has a specific, plain-English justification
- [x] Every host permission has a specific justification
- [x] Privacy policy is accurate and matches data use disclosure
- [ ] Privacy policy URL is live and publicly accessible (TODO: Peter to provide)
- [ ] At least 1 screenshot at recommended dimensions (TODO: capture screenshots)
- [x] All icon files referenced in manifest exist with correct dimensions
- [x] ZIP package excludes `.git/`, `node_modules/`, `.env`, `CHROMEWEBSTORE.md`
- [x] No remote executable code is loaded
- [x] Manifest V3 is used throughout

---

## Store Listing Language & Locales

**Primary Language**: English (US)

**Supported Locales**: English (en)

The extension includes i18n infrastructure (`_locales/en/messages.json`) and can support additional locales in future versions.

---

## Developer Account & Contact

**Developer Name**: TODO: [Peter to confirm public developer name for listing]

**Support Email**: TODO: [Peter to provide public support email]

**Website**: https://github.com/apnotic/pwpush-chrome-extension

---

## Notes for Review Team

This extension is the official browser companion for Password Pusher, an open source tool for secure sharing with automatic expiration. The extension:

1. Does not modify webpage content or appearance
2. Only reads tab URLs and selected text when the user explicitly requests it
3. Only reads files when the user explicitly selects them through native file picker
4. Stores all configuration data locally in Chrome extension storage
5. Makes API calls only to Password Pusher instances (official hosted services or user-configured self-hosted instances)
6. Does not embed analytics, tracking, or third-party services
7. Uses runtime host permissions for self-hosted instances to minimize default permissions
8. **New features (v0.6.0)** add no new manifest permissions:
   - Requests and file attachments use existing `storage` and `activeTab` permissions
   - File uploads use browser's native FormData API
   - File contents kept in memory only during upload, cleared immediately after
   - Authentication-gated features (name/note, email notifications) show appropriate hints when unavailable

The optional `https://*/*` host permission is requested at runtime only when users configure a custom server URL, and Chrome's permission UI scopes it to the specific domain entered.

---

## Compliance & Policies

### Single Purpose Policy
This extension has a single, well-defined purpose: create Password Pusher links directly from the browser. All features (push text, push URL, QR generation, server configuration) support this core function.

### User Data Policy
The extension complies with Chrome Web Store User Data Policy:
- Prominent disclosure of data handling in this document and privacy policy
- No data collection beyond what is necessary for core functionality
- No data sharing with third parties
- Secure handling of user-configured API tokens (stored locally only)

### Permissions Policy
All permissions are justified above with specific, plain-English explanations. No permissions are requested that are not actively used for the stated functionality.

---

## TODO Items for Peter

Before submission, please provide or confirm:

- [ ] Public privacy policy URL for Chrome Web Store listing
- [ ] Public developer name for store listing
- [ ] Public support email for store listing
- [ ] Review and approve all store listing copy above
- [ ] Capture and provide at least 1 screenshot (1280×800 or 640×400)

---

*This file is maintained by Cursor agents following the chrome-extensions skill guidance. When creating or modifying the extension, agents must keep this file up to date, especially permission justifications.*
