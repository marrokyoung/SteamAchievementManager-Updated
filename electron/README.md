# Steam Achievement Manager (Electron)

This folder contains the desktop Electron app for Steam Achievement Manager.

This app is Windows desktop only. Opening the renderer output in a plain browser is unsupported because the UI depends on the Electron preload bridge.

## What This App Runs

- Electron main process: `electron/main`
- Preload bridge: `electron/preload`
- React renderer: `electron/web/src`
- SAM service binary (spawned by Electron): `../bin/net48/SAM.Service.exe` in development, bundled in packaged builds

## Requirements

- Windows (the service is .NET Framework + x86)
- Steam installed, running, and logged in
- Node.js 20+ and npm
- .NET SDK (for building `SAM.Service`)
- .NET Framework 4.8 targeting pack

## First-Time Setup

From the repository root:

```powershell
cd electron
npm install
```

Build the service binary used by local Electron development:

```powershell
dotnet build ..\SAM.Service\SAM.Service.csproj -c Debug -p:Platform=x86 -o ..\bin\net48
```

If this machine has not reserved the default local HTTP URL yet, run once as Administrator:

```powershell
netsh http add urlacl url=http://127.0.0.1:8787/ user=Everyone
```

## Development

Start the Electron app with Vite dev server:

```powershell
cd electron
npm run dev
```

Notes:

- Electron starts `SAM.Service.exe` automatically and injects auth token/base URL.
- If you change service code, rebuild the service before relaunching Electron.
- The app uses `http://127.0.0.1:8787` by default.

Optional override for port/base URL:

```powershell
$env:SAM_BASE_URL="http://127.0.0.1:9090"
npm run dev
```

## Build

Build renderer + Electron main/preload outputs:

```powershell
cd electron
npm run build
```

Outputs:

- Renderer: `electron/dist`
- Main/Preload: `electron/dist-electron`

## Test Suite

Run tests in watch mode:

```powershell
cd electron
npm run test
```

Run tests once (CI/local verification):

```powershell
cd electron
npm run test:run
```

Current tests include:

- Layout back-navigation behavior (manager/non-manager flows, unsaved-changes prompt, atomic restart guard)
- Shared navigation context state (`hasUnsavedChanges`, `isNavigatingBack`)

## Package Installer

Build service (Release), then package with `electron-builder`:

```powershell
cd electron
npm run package
```

This runs:

- `npm run build:service` -> builds `SAM.Service` to `../upload/net48`
- `npm run clean:dist`
- `npm run build`
- `electron-builder`

Packaging outputs:

- `electron/dist/Steam Achievement Manager Setup <version>.exe`
- `electron/dist/latest.yml`

## Releases and Updates

- Packaged builds check GitHub Releases for updates automatically on app launch.
- Tags matching `v*` trigger `.github/workflows/release.yml`, which publishes the installer and `latest.yml`.
- `.github/workflows/package-smoke.yml` validates packaging on clean Windows CI runners.
- Browser-hosted and PWA deployments are not supported release targets.

## Troubleshooting

- `SAM.Service.exe` missing in development:
  - Re-run the Debug service build command to `..\bin\net48`.
- Service startup/auth errors:
  - Ensure Steam is running and you are logged in.
  - Ensure no stale service instance is still running.
- URL access denied:
  - Run the `netsh http add urlacl ...` command once as Administrator.
- Test command not found:
  - Re-run `npm install` in `electron`.
