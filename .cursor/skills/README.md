# Modern Web Guidance Skills

This directory contains official AI coding skills from the Chrome team's [Modern Web Guidance](https://github.com/GoogleChrome/modern-web-guidance) project.

## Included Skills

### chrome-extensions
Build and publish Chrome Extensions using Manifest V3 best practices. Provides comprehensive guidance on extension development, including mandatory rules, common pitfalls, permissions, service workers, content scripts, and Chrome Web Store publishing requirements.

### modern-web-guidance
Search tool for modern web development best practices covering HTML/CSS/JS, performance, accessibility, security, and modern APIs. This skill helps agents stay current with evolving web platform features.

## Source

Skills downloaded from: https://github.com/GoogleChrome/modern-web-guidance

- **Repository**: GoogleChrome/modern-web-guidance
- **License**: Apache License 2.0
- **Last Updated**: November 2026 (commit 9e70fa4c)
- **Package Version**: modern-web-guidance@1.0.2

## Updating These Skills

To update these skills to the latest version:

1. Check for updates:
   ```bash
   npx modern-web-guidance@latest update
   ```

2. Or manually download from the repository:
   ```bash
   curl -o .cursor/skills/chrome-extensions/SKILL.md \
     https://raw.githubusercontent.com/GoogleChrome/modern-web-guidance/main/skills/chrome-extensions/SKILL.md
   
   curl -o .cursor/skills/modern-web-guidance/SKILL.md \
     https://raw.githubusercontent.com/GoogleChrome/modern-web-guidance/main/skills/modern-web-guidance/SKILL.md
   ```

3. Update the commit SHA and date in this README

## Usage by Cursor Agents

Cursor agents automatically discover skills in `.cursor/skills/` directories. When working on this repository, agents will reference these skills for:

- Building or modifying Chrome extension code
- Writing or updating `CHROMEWEBSTORE.md`
- Implementing modern web platform features
- Following Chrome Web Store compliance requirements

See `CHROMEWEBSTORE.md` and `AGENTS.md` in the repository root for how these skills integrate with this project.

## License

These skills are licensed under the Apache License 2.0 (see LICENSE file in this directory).

Copyright © Google Inc. and contributors to the Modern Web Guidance project.
