# Changelog

All notable changes to the Password Pusher Chrome Extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.7.0] - 2026-11-28

### Added

- **Right-click menus**: "Push selected text…" (selection) and "Push this link…" (link)
  - Default confirm-first flow stashes the payload in `chrome.storage.session`, opens the popup for review, and clears the stash after the popup reads it
  - If `openPopup()` is unavailable, a toolbar badge and title ask the user to click the extension icon
  - Optional Settings toggle **Push selected text immediately** (off by default) creates a push with saved expiry defaults and no passphrase, then tries to copy the share link on the page
  - Link pushes always confirm first, even when the instant-text toggle is on
  - No server configured opens Settings; API/network errors surface via badge and popup
  - New `contextMenus` permission only; selected text is never written to local storage or logged

### Changed

- **Options Page Layout**: Reorganized to two-column layout on wide screens for better use of space
  - **Wide viewports (>800px)**: Two-column CSS Grid layout with independent column flow
    - Left column: Brand header + Server selection/configuration card
    - Right column: Detected instance card + About card
    - Max-width: 1280px with 24px gap between columns
    - Columns flow independently using flexbox (no shared grid rows that cause uneven gaps)
    - Consistent 24px vertical spacing between all cards
  - **Narrow viewports (≤800px)**: Single-column stacked layout (responsive)
    - Collapses to original single-column design for usability on small screens
  - **Keyboard navigation**: Tab order preserved (left column first, then right column)
  - **No behavioral changes**: All existing functionality intact (save, test connection, token field, instance status, storage)

### Added

- **Request Tab "What are Requests?" Link**: Added educational link in instance-not-supported empty state
  - Link text: "What are Requests?" (i18n in all 6 locales)
  - Points to: https://eu.pwpush.com/requests
  - Opens safely in new tab with `target="_blank" rel="noopener noreferrer"`
  - Helps users understand Requests feature when unavailable

### Fixed

- **Active Tab Styling Polish**: Fixed Request tab showing light background and pale underline when active
  - Added `!important` to `.tab.active` rules to override all state-specific styling (hover, focus)
  - Added `background: transparent` to `.tab:focus` to prevent focus state background
  - Both Push and Request tabs now display identical solid accent color and underline when active
  - Keyboard focus indicator (`:focus-visible`) still works correctly with outline
- **Push Tab Divider Polish**: Fixed stray divider line showing under textarea when name/note fields hidden
  - Divider (border-top on `.push-options`) now only shows when `#pushAuthFields` is visible
  - Uses CSS sibling combinator: `#pushAuthFields:not(.hidden) ~ .push-options { border-top: ... }`
  - Cleaner visual appearance when no token configured

- **Active Tab Styling**: Fixed Request tab not showing active state (blue text/underline)
  - Root cause: `.tab:hover` rule overrode `.tab.active` due to equal CSS specificity and later position
  - Fix: Changed `.tab:hover:not(:disabled)` to `.tab:hover:not(:disabled):not(.active)` to exclude active tabs from hover styling
  - Both Push and Request tabs now correctly display blue accent color and underline when active

### Changed

- **Push Tab "Text" Label**: Removed visible label above main textarea for cleaner UI
  - Maintains accessibility with `aria-label="Text"` on textarea element
  - Screen readers still announce the field properly
- **Push Tab Auth Notice**: Consolidated two separate notices into one unified notice below Push buttons
  - Previous: Two notices ("Add an API token... Name and Note" + "File attachments... paid subscription")
  - New: Single notice "Add an API token in Settings to unlock Name and Note fields. File attachments also require a paid subscription."
  - Positioned below Push/Push Current URL buttons with proper spacing (14px margin-top)
  - Hidden when API token is present; updates live via storage.onChanged listener
  - Cleaner UX, less visual clutter, better breathing room
- **Header Tagline**: Updated to reflect both Pushes and Requests functionality
  - Previous: "Securely share links and text with expiring pushes."
  - New: "Share secrets with expiring links, or request them securely."
  - Concise one-line explanation of extension capabilities at 430px width

- **Popup Width**: Increased popup width from 390px to 430px for improved layout and readability
- **Request Empty State Copy**: Updated "Requests require authentication" message to clarify:
  - Heading: "Requests require an API token."
  - Details: "Basic Requests are free with any account. Paid subscriptions add branding, custom domains and file attachments."
- **Push File Attachments**: Completely hide file attachment section (picker, file list, limits) when no API token is configured
  - Shows friendly message: "File attachments require authentication and a paid subscription." with Settings link
  - Previously showed disabled controls; now cleaner UX with complete hiding
  - Selected files are cleared when token is removed (live via storage.onChanged listener)
  - Guards prevent file submission when hidden

### Fixed

- **CSS Specificity Bug**: Fixed double empty state display on Request tab (Pro instance without token)
  - Root cause: `.empty-state { display: flex; }` overrode `.hidden { display: none; }` due to equal specificity and CSS cascade order
  - Fix: Added `!important` to `.hidden` class to ensure it always wins regardless of other display rules
  - Both `popup.css` and `options.css` updated for consistency
  - Added automated Playwright visual tests to prevent regression

### Added

- **Request Support**: Added ability to create secure Requests (pull-model) on Pro/Commercial instances
  - New tabbed interface to switch between Push and Request modes
  - Request-specific options: name, message, note, expiry duration, passphrase, email notifications
  - Response file attachment support (when supported by instance tier)
  - Automatic capability detection via `/api/v2/version` endpoint
  - Graceful degradation: Request tab shows appropriate message based on instance and authentication
    - OSS instances: "Requests not supported on this instance"
    - Pro without token: "Requests require authentication" with Settings link
    - Pro with token: Full Request functionality available
- **File Attachment Support**: Added file uploads for both Pushes and Requests (Pro/paid tier)
  - File picker UI with selected file display (name, size, icon, remove button)
  - Client-side validation: max 10 files, 50MB per file
  - Multipart/form-data upload via new `requestMultipart()` function
  - Capability detection from version endpoint features
  - Clear notices when files require authentication or paid subscription
  - Secure handling: no innerHTML, no file persistence, no new permissions
- **Push Authentication Fields**: Name and Note fields for Pushes (optional, requires API token)
  - Only shown when API token is configured
  - Clear hint when unavailable: "Add an API token in Settings to use Name and Note fields"
- **Request Email Notifications**: Notify emails field for Requests (requires paid subscription)
  - Only shown when API token is configured
  - Labeled as requiring paid subscription
  - Graceful server rejection handling with readable error message
  - Note: Proper tier detection needs pwpush-pro API enhancement
- Comprehensive i18n strings for Request, file attachment, and authentication UI elements
- Security enhancements for input validation and sanitization

### Changed

- Updated README with Request and file attachment documentation
- Enhanced instance detection to store full version data for capability detection
- Improved status messages to cover Push, Request, and file upload flows
- Popup now listens for storage changes to update capabilities in real-time
- Request support detection now checks both instance capability AND API token presence
- Authentication-gated fields (Push name/note, Request notify emails) update live when token changes
- **Request tab empty state UX**: When instance supports Requests but no API token is configured, the entire form is now hidden and replaced with a friendly empty state message and prominent "Add API Token in Settings" button (instead of showing the form with an inline notice)

### Fixed

- Popup now updates Request/file attachment availability when endpoint changes in settings
  - Added `chrome.storage.onChanged` listener to detect instance status updates
  - Capabilities refresh automatically when switching between instances
  - Prevents stale "not supported" messages after changing to supporting instance
- Request tab now correctly detects when Pro instances require API token authentication
  - Distinguishes between "instance doesn't support Requests" (OSS) and "needs token" (Pro)
  - Shows appropriate message with Settings link when authentication is needed
- Authentication-gated fields (Push name/note, Request notify emails) now show/hide correctly
  - Update in real-time when API token is added or removed in Settings
  - No page reload needed

## [0.5.0] - Previous Release

Initial public release with Push support.
