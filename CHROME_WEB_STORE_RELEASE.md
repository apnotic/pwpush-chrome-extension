# Chrome Web Store Release Guide (Apnotic LLC)

This checklist is for publishing this extension as the official Apnotic listing.

## 1) Account readiness

- Use an Apnotic-controlled Google account in the Chrome Developer Dashboard.
- Confirm account details, recovery methods, and organization ownership continuity.
- Ensure dashboard access for at least one backup maintainer.

## 2) Pre-submit engineering checks

- Update extension version in `manifest.json`.
- Run:
  - `npm run validate:manifest`
  - `npm run package`
- Verify ZIP contains `manifest.json` at root.
- Confirm requested permissions are minimal and justified:
  - `storage`
  - host permissions for Password Pusher endpoints
  - optional host permissions for custom self-hosted instances
- Confirm extension does not execute remote hosted code.

## 3) Listing assets to prepare

- Extension title (<= 45 chars recommended)
- Short summary (<= 132 chars)
- Full description (single-purpose language)
- 128x128 extension icon (required by store listing)
- Screenshots (recommended 1280x800 or 640x400)
- Optional promo assets (small/large tiles)
- Support URL (Apnotic support/docs endpoint)
- Homepage/Docs URL (`https://docs.pwpush.com`)

## 4) Privacy and disclosures

- Privacy tab:
  - Provide single purpose statement.
  - Justify each permission and host permission.
  - Declare remote code usage accurately (`No` expected).
  - Complete data usage declarations/certifications.
- Add privacy policy URL in dashboard if handling any user data.
- Ensure in-product behavior matches declarations exactly.

## 5) Submission flow

- Upload `dist/password-pusher-connector.zip` as a new item or update.
- Complete tabs:
  - Package
  - Store listing
  - Privacy
  - Distribution
  - Test instructions (if reviewer credentials or setup instructions are needed)
- Submit for review with deferred publishing enabled for controlled launch timing.

## 6) Launch and post-launch operations

- Publish during a planned release window after approval.
- Validate install, onboarding, and `/api/v2/version` detection on:
  - `oss.pwpush.com`
  - `eu.pwpush.com`
  - `us.pwpush.com`
  - at least one self-hosted instance
- Monitor dashboard/email for policy feedback or takedown notices.
- Keep a rollback SOP:
  - unpublish item
  - revoke compromised tokens
  - release patched version
