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
  - Graceful degradation: Request tab disabled with explanation on unsupported instances
- **File Attachment Support**: Added file uploads for both Pushes and Requests (Pro/paid tier)
  - File picker UI with selected file display (name, size, icon, remove button)
  - Client-side validation: max 10 files, 50MB per file
  - Multipart/form-data upload via new `requestMultipart()` function
  - Capability detection from version endpoint features
  - Clear notices when files require authentication or paid subscription
  - Secure handling: no innerHTML, no file persistence, no new permissions
- Comprehensive i18n strings for Request and file attachment UI elements
- Security enhancements for input validation and sanitization

### Changed

- Updated README with Request and file attachment documentation
- Enhanced instance detection to store full version data for capability detection
- Improved status messages to cover Push, Request, and file upload flows
- Popup now listens for storage changes to update capabilities in real-time

### Fixed

- Popup now updates Request/file attachment availability when endpoint changes in settings
  - Added `chrome.storage.onChanged` listener to detect instance status updates
  - Capabilities refresh automatically when switching between instances
  - Prevents stale "not supported" messages after changing to supporting instance

## [0.5.0] - Previous Release

Initial public release with Push support.
