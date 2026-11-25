# Agent Instructions for Password Pusher Chrome Extension

This file provides guidance for Cursor agents working in this repository.

## Chrome Extension Development

When creating or modifying this Chrome extension:

1. **Use the chrome-extensions skill**: The `.cursor/skills/chrome-extensions/` skill contains official Chrome team guidance for Manifest V3 development, common pitfalls, and Chrome Web Store publishing requirements. Consult it for all extension-related work.

2. **Use the modern-web-guidance skill**: The `.cursor/skills/modern-web-guidance/` skill provides best practices for HTML/CSS/JS, performance, accessibility, and modern web APIs. Use it when implementing UI features or client-side logic.

3. **Keep CHROMEWEBSTORE.md up to date**: Whenever you modify the extension in ways that affect its Chrome Web Store presence, update `CHROMEWEBSTORE.md`:
   - **Permissions changes**: If you add, remove, or modify permissions or host_permissions in `manifest.json`, update the Permissions Justification section with specific, plain-English reasons
   - **User-facing changes**: Update the feature list in descriptions and add an entry to Version History
   - **Privacy-relevant changes**: If data collection, storage, or transmission changes, update the Privacy & Data Use section
   - **New release**: Add a Version History entry with version number, date, and summary

4. **Follow Manifest V3 best practices**: 
   - Use `background.service_worker`, not `background.scripts`
   - Use `chrome.action`, not `chrome.browserAction`
   - Use `chrome.scripting.executeScript`, not `chrome.tabs.executeScript`
   - Separate `host_permissions` from `permissions`
   - No inline scripts or event handlers in HTML
   - Always use `async`/`await`, never `.then()` chains
   - Service workers must not store state in global variables (use `chrome.storage`)

5. **Test before committing**: Run validation and tests:
   ```bash
   npm run validate:manifest
   npm test
   npm run test:e2e  # requires Playwright Chromium installed
   ```

## Repository Structure

- `/src/background/` - Service worker (background script)
- `/src/popup/` - Extension popup UI
- `/src/options/` - Settings/options page
- `/src/lib/` - Shared libraries (storage, API client, i18n)
- `/src/icons/` - Extension icons (all sizes present and correct dimensions)
- `/_locales/en/` - Internationalization messages
- `/tests/` - Unit and E2E tests
- `/.cursor/skills/` - Chrome team official skills for agents (automatically loaded)

## Public Repository Constraints

**This is a public open-source repository**. Never commit or suggest committing:
- Internal URLs, hostnames, or infrastructure details
- Account names, workspace identifiers, or team names
- Email addresses (except public support emails Peter provides)
- API tokens, keys, secrets, or credentials
- Private repository details or references
- Business-internal notes, pricing, or roadmap details

Keep all documentation and code comments limited to public information. When information is needed that would be internal/private, mark it as a TODO for Peter rather than inventing placeholder values.

## Browser Support

Target modern Chrome and Chromium-based browsers. This extension uses Manifest V3 and assumes:
- Chrome/Edge 90+
- Modern JavaScript (ES2020+)
- No polyfills for Baseline Widely Available features

If you add features that require specific Chrome versions, document them in `CHROMEWEBSTORE.md`.

## Code Style

- Use modern JavaScript (ES modules, async/await, optional chaining, nullish coalescing)
- Prefer vanilla JS over frameworks for this extension
- Follow existing code patterns for consistency
- Use descriptive variable names
- Add comments only for non-obvious logic (avoid obvious narration)

## Testing

- Write unit tests for new utility functions in `/tests/unit/`
- E2E tests use Playwright in `/tests/e2e/`
- Test with unpacked extension in `chrome://extensions` (Developer mode)
- Test all permission scenarios (preset hosts vs custom self-hosted)

## Skills Update

The skills in `.cursor/skills/` come from Google Chrome's Modern Web Guidance project. To update them:

```bash
curl -o .cursor/skills/chrome-extensions/SKILL.md \
  https://raw.githubusercontent.com/GoogleChrome/modern-web-guidance/main/skills/chrome-extensions/SKILL.md

curl -o .cursor/skills/modern-web-guidance/SKILL.md \
  https://raw.githubusercontent.com/GoogleChrome/modern-web-guidance/main/skills/modern-web-guidance/SKILL.md
```

Then update the commit SHA and date in `.cursor/skills/README.md`.

---

**Summary**: Use the chrome-extensions skill, keep CHROMEWEBSTORE.md current (especially permission justifications), follow Manifest V3 best practices, and remember this is a public repository.
