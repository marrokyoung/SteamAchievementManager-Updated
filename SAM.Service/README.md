# SAM.Service - HTTP API for Steam Achievement Manager

A headless .NET Framework 4.8 service that exposes Steam Achievement Manager functionality via JSON REST API.

## Requirements

- .NET Framework 4.8
- Steam client running and logged in
- Windows (x86 platform only)

## Setup

### 1. Set API Token (Required)

The service requires the `SAM_API_TOKEN` environment variable to be set before starting:

```cmd
REM Windows Command Prompt
set SAM_API_TOKEN=your-secret-token-here
SAM.Service.exe

REM PowerShell
$env:SAM_API_TOKEN="your-secret-token-here"
.\SAM.Service.exe
```

**Important:** Choose a strong, random token for production use. The Electron frontend must be configured with the same token.

### 2. URL Reservation (Administrator Required)

The service uses OWIN/HttpListener which requires URL namespace reservation on Windows. Run this **once** as Administrator:

```cmd
netsh http add urlacl url=http://127.0.0.1:8787/ user=Everyone
```

This allows non-admin users to run the service on port 8787.

**Alternative ports:** Set the `SAM_BASE_URL` environment variable before starting:

```cmd
set SAM_BASE_URL=http://127.0.0.1:9090
netsh http add urlacl url=http://127.0.0.1:9090/ user=Everyone
SAM.Service.exe
```

## Usage

### Starting the Service

```cmd
set SAM_API_TOKEN=my-token-123
SAM.Service.exe
```

Output:
```
Steam Achievement Manager - HTTP Service
=========================================
API authentication enabled
Service listening on http://127.0.0.1:8787
Press Ctrl+C to stop...
```

### API Endpoints

All endpoints (except `/health`) require the `X-SAM-Auth` header with your API token.

#### Health Check
```
GET /health
```
No authentication required. Returns `{"status":"healthy","timestamp":"..."}`.

#### Initialize for Game
```
POST /api/init
Content-Type: application/json
X-SAM-Auth: your-token

{"appId": 480}
```
Response: `{"appId":480,"gameName":"Spacewar","status":"connected"}`

#### List Games
```
GET /api/games?includeUnowned=false&refresh=false
X-SAM-Auth: your-token
```
- `includeUnowned`: Include games not owned by the user
- `refresh`: Force refresh from server (bypasses 12-hour cache)

Returns array of games with `id`, `name`, `type`, `imageUrl`, and `owned` fields.

#### Get Game Data
```
GET /api/game/480/data
X-SAM-Auth: your-token
```
Returns achievements and stats with current values for the specified AppId.

#### Update Achievements
```
POST /api/game/480/achievements
Content-Type: application/json
X-SAM-Auth: your-token

{
  "updates": [
    {"id": "ACH_WIN_ONE_GAME", "unlocked": true}
  ]
}
```

#### Update Stats
```
POST /api/game/480/stats
Content-Type: application/json
X-SAM-Auth: your-token

{
  "updates": [
    {"id": "NumGames", "value": 10}
  ]
}
```
Validates:
- Protected stats (cannot modify)
- Increment-only stats (cannot decrease)
- Min/max ranges with clamping
- NaN/Infinity rejection for floats

#### Store Changes
```
POST /api/game/480/store
Content-Type: application/json
X-SAM-Auth: your-token

{}
```
Commits pending changes to Steam backend.

#### Reset Stats
```
POST /api/game/480/reset
Content-Type: application/json
X-SAM-Auth: your-token

{"achievementsToo": true}
```

## Architecture

- **OWIN/Katana**: Self-hosted HTTP server (Microsoft.AspNet.WebApi.OwinSelfHost)
- **Authentication**: Token-based via `X-SAM-Auth` header
- **Client Management**: Single Steam client instance with hot-swapping between games
- **Caching**:
  - Game list: 12-hour soft TTL, separate cache for owned/all games
  - Schemas: In-memory per AppId
- **Validation**: Comprehensive stat validation (protected, increment-only, NaN/Infinity, min/max)

## Troubleshooting

### Error: "Access Denied" when starting

You need to add the URLACL reservation (see Setup step 2).

### Error: "SAM_API_TOKEN environment variable must be set"

The service requires an API token for security. Set the `SAM_API_TOKEN` environment variable before starting.

### Error: "Steam not running or initialization failed"

Ensure Steam is running and you're logged in before starting SAM.Service.

### 401 Unauthorized on API calls

Check that you're passing the correct token in the `X-SAM-Auth` header.

## Development

Build:
```cmd
dotnet build SAM.Service.csproj -c Debug -p:Platform=x86
```

Run:
```cmd
cd ..\bin\net48
set SAM_API_TOKEN=test-token
SAM.Service.exe
```
