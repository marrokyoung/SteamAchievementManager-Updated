# SAM.Service - HTTP API for Steam Achievement Manager

A headless .NET Framework 4.8 service that exposes Steam Achievement Manager functionality via JSON REST API.

## Requirements
- .NET Framework 4.8 targeting pack
- Steam client installed, running, and logged in
- Windows (x86 platform only)

## Development quick start (full app via Electron)
Most contributors should run the whole app through Electron; the main process will spawn `SAM.Service.exe` automatically.
```cmd
cd electron
npm install          # first time
npm run dev          # hot reload; spawns SAM.Service.exe from bin/net48 with a generated SAM_API_TOKEN
```
- If `SAM.Service.exe` is already running, stop it first to avoid file locks when Electron respawns it.
- Default service URL is `http://127.0.0.1:8787`.

## Standalone service setup
### 1) Set API token (required)
```cmd
:: Command Prompt
set SAM_API_TOKEN=your-secret-token-here
SAM.Service.exe

:: PowerShell
$env:SAM_API_TOKEN="your-secret-token-here"
.\SAM.Service.exe
```
Use a strong random token; the Electron frontend must use the same token.

### 2) URL reservation (run once as Administrator)
```cmd
netsh http add urlacl url=http://127.0.0.1:8787/ user=Everyone
```
For a different port:
```cmd
set SAM_BASE_URL=http://127.0.0.1:9090
netsh http add urlacl url=http://127.0.0.1:9090/ user=Everyone
SAM.Service.exe
```

## Running the service manually
```cmd
set SAM_API_TOKEN=my-token-123
SAM.Service.exe
```
Expected output:
```
Steam Achievement Manager - HTTP Service
=========================================
API authentication enabled
Service listening on http://127.0.0.1:8787
Press Ctrl+C to stop...
```

## API endpoints
All endpoints (except `/health`) require `X-SAM-Auth` with your API token.

- Health: `GET /health`
- Initialize: `POST /api/init` body `{"appId":480}`
- List games: `GET /api/games?includeUnowned=false&refresh=false`
- Game data: `GET /api/game/{appId}/data`
- Update achievements: `POST /api/game/{appId}/achievements`
- Update stats: `POST /api/game/{appId}/stats`
- Store changes: `POST /api/game/{appId}/store`
- Reset stats: `POST /api/game/{appId}/reset`

## Architecture
- OWIN/Katana self-host (Microsoft.AspNet.WebApi.OwinSelfHost)
- Token auth via `X-SAM-Auth`
- Single Steam client instance, hot-swaps appId
- Caching: game list (12h soft TTL), schema per AppId
- Validation: protected/increment-only, min/max, NaN/Infinity rejection

## Builds & packaging
- Build service (Debug):
```cmd
dotnet build SAM.Service.csproj -c Debug -p:Platform=x86
```
- Build service (Release) via npm script (used by packaging):
```cmd
cd electron
npm run build:service
```
Outputs to `upload/net48`.
- Build renderer only:
```cmd
cd electron
npm run build
```
Outputs to `electron/dist`.
- Package Electron app (runs build:service, builds renderer, then electron-builder):
```cmd
cd electron
npm run package
```
Bundles `upload/net48` into `resources/sam-service` inside the packaged app.

## Troubleshooting
- “Access Denied” when starting: run the `netsh http add urlacl ...` command once as Administrator.
- “SAM_API_TOKEN environment variable must be set”: set the token before starting.
- “Steam not running or initialization failed”: start Steam and ensure you are logged in.
- 401 Unauthorized: ensure `X-SAM-Auth` matches `SAM_API_TOKEN`.

## Manual development run (service only)
```cmd
dotnet build SAM.Service.csproj -c Debug -p:Platform=x86
cd ..\bin\net48
set SAM_API_TOKEN=test-token
SAM.Service.exe
```
