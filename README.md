# Steam Achievement Manager

Steam Achievement Manager is a Windows desktop app for viewing and managing Steam achievements and stats.

This repository is the actively maintained Electron-based desktop release. It is the project users should download from and follow for current builds, updates, and release notes.

## Download

- Download page: https://marrokyoung.github.io/SteamAchievementManager-Updated/
- Latest release: https://github.com/marrokyoung/SteamAchievementManager-Updated/releases/latest

Releases ship as a one-click Windows installer and include in-app update support.

## What This Repository Contains

- `electron/` - Electron desktop app, installer packaging, updater integration, and React UI
- `SAM.Service/` - local backend/service launched by the desktop app
- `SAM.API/`, `SAM.Schema/` - supporting native and shared project code used by the app

## Requirements

- Windows
- Steam installed and running
- A logged-in Steam account
- Network access

## Development

See `electron/README.md` for local setup, development, tests, and packaging commands.

## Notes

- This project is not affiliated with Valve.
- The supported runtime for this app is the Windows Electron desktop build, not a browser-hosted/PWA deployment.

## Attribution

- This repository builds on the original Steam Achievement Manager codebase by Rick (`gibbed`).
- Original repository: https://github.com/gibbed/SteamAchievementManager
- This repository contains substantial modifications, a new Electron desktop app, and a different release/distribution flow, but it does not claim authorship of the original base architecture.

## License

GPL-3.0. See `LICENSE.txt`.
