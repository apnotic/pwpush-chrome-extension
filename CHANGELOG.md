# Changelog

All notable changes to the Password Pusher Chrome Extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
