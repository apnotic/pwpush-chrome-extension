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
- Comprehensive i18n strings for all Request UI elements
- Security enhancements for Request input validation and sanitization

### Changed

- Updated README with Request feature documentation and security considerations
- Enhanced instance detection to probe for Request API support
- Improved status messages to cover both Push and Request creation flows

### Fixed

- None

## [0.5.0] - Previous Release

Initial public release with Push support.
