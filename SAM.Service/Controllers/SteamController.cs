using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Threading.Tasks;
using System.Web.Http;
using SAM.Service.Core;
using SAM.Service.Models;

namespace SAM.Service.Controllers
{
    [RoutePrefix("api")]
    public class SteamController : ApiController
    {
        private SteamClientManager ClientManager => ServiceContext.ClientManager;
        private GameListCache GameListCache => ServiceContext.GameListCache;

        /// <summary>
        /// GET /health - Health check endpoint (no auth required, handled in middleware)
        /// </summary>
        [HttpGet]
        [Route("~/health")]
        [AllowAnonymous]
        public IHttpActionResult Health()
        {
            return Ok(new { status = "healthy", timestamp = DateTime.UtcNow });
        }

        /// <summary>
        /// POST /api/init - Initialize Steam client for specific AppId
        /// </summary>
        [HttpPost]
        [Route("init")]
        public IHttpActionResult Initialize([FromBody] InitRequest request)
        {
            try
            {
                if (request == null || request.AppId <= 0)
                {
                    return BadRequest("Invalid AppId");
                }

                API.SecurityLogger.Log(API.LogLevel.Info, API.LogContext.HTTP,
                    $"POST /api/init - AppId {request.AppId}");

                ClientManager.InitializeForApp(request.AppId);

                var client = ClientManager.GetClient();
                var gameName = client.SteamApps001.GetAppData((uint)request.AppId, "name");

                API.SecurityLogger.Log(API.LogLevel.Info, API.LogContext.HTTP,
                    $"Successfully initialized for AppId {request.AppId}");

                return Ok(new
                {
                    appId = request.AppId,
                    gameName = gameName,
                    status = "connected"
                });
            }
            catch (ArgumentException ex)
            {
                return BadRequest(ex.Message);
            }
            catch (API.ClientInitializeException ex)
            {
                // Extract error details from exception methods
                int httpStatus = ex.GetHttpStatusCode();
                string errorCode = ex.GetErrorCode();
                bool recoverable = ex.IsRecoverable();

                API.SecurityLogger.Log(API.LogLevel.Warning, API.LogContext.HTTP,
                    $"Init failed with {errorCode} (HTTP {httpStatus}): {ex.Message}");

                return Content((HttpStatusCode)httpStatus, new ErrorResponse
                {
                    Error = errorCode,
                    Message = ex.Message,
                    ErrorCode = errorCode,
                    StatusCode = httpStatus,
                    Recoverable = recoverable
                });
            }
            catch (Exception ex)
            {
                API.SecurityLogger.Log(API.LogLevel.Error, API.LogContext.HTTP,
                    $"Unexpected error in /api/init: {ex.Message}");

                return InternalServerError(ex);
            }
        }

        /// <summary>
        /// GET /api/games?includeUnowned=false&refresh=false - List games
        /// </summary>
        [HttpGet]
        [Route("games")]
        public async Task<IHttpActionResult> GetGames([FromUri] bool includeUnowned = false, [FromUri] bool refresh = false)
        {
            try
            {
                // In forced mode, skip AppId 0 init and reuse existing client
                if (ServiceContext.ForcedAppId != null)
                {
                    var client = ClientManager.GetClient();
                    var games = await Task.Run(() => GameListCache.GetGames(client, includeUnowned, refresh));
                    return Ok(games);
                }

                // Initialize with AppId 0 (neutral client) if not already initialized
                try
                {
                    ClientManager.GetClient();
                }
                catch (InvalidOperationException)
                {
                    ClientManager.InitializeForApp(0);
                }

                var client2 = ClientManager.GetClient();
                var games2 = await Task.Run(() => GameListCache.GetGames(client2, includeUnowned, refresh));

                return Ok(games2);
            }
            catch (API.ClientInitializeException ex)
            {
                int httpStatus = ex.GetHttpStatusCode();
                string errorCode = ex.GetErrorCode();

                API.SecurityLogger.Log(API.LogLevel.Warning, API.LogContext.HTTP,
                    $"GetGames init failed: {errorCode}");

                return Content((HttpStatusCode)httpStatus, new ErrorResponse
                {
                    Error = errorCode,
                    Message = ex.Message,
                    ErrorCode = errorCode,
                    StatusCode = httpStatus
                });
            }
            catch (Exception ex)
            {
                return InternalServerError(ex);
            }
        }

        /// <summary>
        /// GET /api/game/{appId}/data - Get achievements and stats with current values
        /// </summary>
        [HttpGet]
        [Route("game/{appId}/data")]
        public async Task<IHttpActionResult> GetGameData(long appId)
        {
            try
            {
                // Ensure client is initialized for this app
                ClientManager.InitializeForApp(appId);

                var client = ClientManager.GetClient();
                var steamId = client.SteamUser.GetSteamId();

                // Request stats asynchronously
                var statsResult = await ClientManager.RequestUserStatsAsync(steamId);

                if (statsResult.Result != 1)
                {
                    return Content(HttpStatusCode.Forbidden, new ErrorResponse
                    {
                        Error = "StatsRequestFailed",
                        Message = $"Failed to retrieve stats: {TranslateError(statsResult.Result)}",
                        StatusCode = 403
                    });
                }

                // Load schema
                var schema = ClientManager.GetSchema(appId);

                // Build response with current values
                var achievements = schema.Achievements.Select(def =>
                {
                    client.SteamUserStats.GetAchievementAndUnlockTime(
                        def.Id, out bool isAchieved, out uint unlockTime);

                    return new AchievementDto
                    {
                        Id = def.Id,
                        Name = def.Name,
                        Description = def.Description,
                        IsAchieved = isAchieved,
                        UnlockTime = isAchieved && unlockTime > 0
                            ? DateTimeOffset.FromUnixTimeSeconds(unlockTime).UtcDateTime
                            : (DateTime?)null,
                        IconNormal = def.IconNormal,
                        IconLocked = def.IconLocked,
                        IsHidden = def.IsHidden,
                        IsProtected = (def.Permission & 2) != 0
                    };
                }).ToList();

                var stats = schema.Stats.Select(def =>
                {
                    object value = null;
                    if (def.Type == "int")
                    {
                        client.SteamUserStats.GetStatValue(def.Id, out int intVal);
                        value = intVal;
                    }
                    else
                    {
                        client.SteamUserStats.GetStatValue(def.Id, out float floatVal);
                        value = floatVal;
                    }

                    return new StatDto
                    {
                        Id = def.Id,
                        DisplayName = def.DisplayName,
                        Type = def.Type,
                        Value = value,
                        MinValue = def.MinValue,
                        MaxValue = def.MaxValue,
                        IncrementOnly = def.IncrementOnly,
                        IsProtected = (def.Permission & 2) != 0
                    };
                }).ToList();

                var gameName = client.SteamApps001.GetAppData((uint)appId, "name");

                return Ok(new GameDataResponse
                {
                    AppId = appId,
                    GameName = gameName,
                    Achievements = achievements,
                    Stats = stats
                });
            }
            catch (ArgumentException ex)
            {
                return BadRequest(ex.Message);
            }
            catch (System.IO.FileNotFoundException ex)
            {
                return Content(HttpStatusCode.NotFound, new ErrorResponse
                {
                    Error = "SchemaNotFound",
                    Message = $"Schema file not found. Launch SAM.Game.exe {appId} first to trigger download.",
                    StatusCode = 404
                });
            }
            catch (TimeoutException ex)
            {
                return Content(HttpStatusCode.RequestTimeout, new ErrorResponse
                {
                    Error = "Timeout",
                    Message = ex.Message,
                    StatusCode = 408
                });
            }
            catch (API.ClientInitializeException ex)
            {
                int httpStatus = ex.GetHttpStatusCode();
                string errorCode = ex.GetErrorCode();

                API.SecurityLogger.Log(API.LogLevel.Warning, API.LogContext.HTTP,
                    $"GetGameData init failed for AppId {appId}: {errorCode}");

                return Content((HttpStatusCode)httpStatus, new ErrorResponse
                {
                    Error = errorCode,
                    Message = ex.Message,
                    ErrorCode = errorCode,
                    StatusCode = httpStatus
                });
            }
            catch (Exception ex)
            {
                return InternalServerError(ex);
            }
        }

        /// <summary>
        /// POST /api/game/{appId}/achievements - Update achievements (batched)
        /// </summary>
        [HttpPost]
        [Route("game/{appId}/achievements")]
        public IHttpActionResult UpdateAchievements(long appId,
            [FromBody] AchievementUpdateRequest request)
        {
            try
            {
                if (request?.Updates == null || request.Updates.Count == 0)
                {
                    return BadRequest("No updates provided");
                }

                // Ensure client is initialized for this app
                ClientManager.InitializeForApp(appId);

                var client = ClientManager.GetClient();
                var schema = ClientManager.GetSchema(appId);
                var updatedCount = 0;

                foreach (var update in request.Updates)
                {
                    // Validate achievement exists
                    var def = schema.Achievements.FirstOrDefault(a => a.Id == update.Id);
                    if (def == null)
                    {
                        return BadRequest($"Achievement '{update.Id}' not found");
                    }

                    // Check if protected
                    if ((def.Permission & 2) != 0)
                    {
                        return Content(HttpStatusCode.Forbidden, new ErrorResponse
                        {
                            Error = "Protected",
                            Message = $"Achievement '{update.Id}' is protected and cannot be modified",
                            StatusCode = 403
                        });
                    }

                    // Apply update
                    if (!client.SteamUserStats.SetAchievement(update.Id, update.Unlocked))
                    {
                        return InternalServerError(new Exception(
                            $"Failed to set achievement '{update.Id}'"));
                    }

                    updatedCount++;
                }

                return Ok(new { updated = updatedCount });
            }
            catch (API.ClientInitializeException ex)
            {
                int httpStatus = ex.GetHttpStatusCode();
                string errorCode = ex.GetErrorCode();

                API.SecurityLogger.Log(API.LogLevel.Warning, API.LogContext.HTTP,
                    $"UpdateAchievements init failed for AppId {appId}: {errorCode}");

                return Content((HttpStatusCode)httpStatus, new ErrorResponse
                {
                    Error = errorCode,
                    Message = ex.Message,
                    ErrorCode = errorCode,
                    StatusCode = httpStatus
                });
            }
            catch (InvalidOperationException ex)
            {
                return Content((HttpStatusCode)428, new ErrorResponse
                {
                    Error = "NotInitialized",
                    Message = ex.Message,
                    StatusCode = 428
                });
            }
            catch (Exception ex)
            {
                return InternalServerError(ex);
            }
        }

        /// <summary>
        /// POST /api/game/{appId}/stats - Update stats (batched with validation)
        /// </summary>
        [HttpPost]
        [Route("game/{appId}/stats")]
        public IHttpActionResult UpdateStats(long appId, [FromBody] StatUpdateRequest request)
        {
            try
            {
                if (request?.Updates == null || request.Updates.Count == 0)
                {
                    return BadRequest("No updates provided");
                }

                // Ensure client is initialized for this app
                ClientManager.InitializeForApp(appId);

                var client = ClientManager.GetClient();
                var schema = ClientManager.GetSchema(appId);
                var updatedCount = 0;

                foreach (var update in request.Updates)
                {
                    // Validate stat exists
                    var def = schema.Stats.FirstOrDefault(s => s.Id == update.Id);
                    if (def == null)
                    {
                        return BadRequest($"Stat '{update.Id}' not found");
                    }

                    // Check if protected
                    if ((def.Permission & 2) != 0)
                    {
                        return Content(HttpStatusCode.Forbidden, new ErrorResponse
                        {
                            Error = "Protected",
                            Message = $"Stat '{update.Id}' is protected and cannot be modified",
                            StatusCode = 403
                        });
                    }

                    // Apply validation and update based on type
                    if (def.Type == "int")
                    {
                        if (update.Value == null ||
                            !int.TryParse(update.Value.ToString(),
                                System.Globalization.NumberStyles.Integer,
                                System.Globalization.CultureInfo.InvariantCulture,
                                out int newValue))
                        {
                            return BadRequest($"Invalid integer value for stat '{update.Id}'");
                        }

                        // Get current value for increment-only check
                        client.SteamUserStats.GetStatValue(def.Id, out int currentValue);

                        // Validate increment-only
                        if (def.IncrementOnly && newValue < currentValue)
                        {
                            return BadRequest(
                                $"Stat '{update.Id}' is increment-only and cannot be decreased");
                        }

                        // Clamp to min/max
                        int minValue = Convert.ToInt32(def.MinValue);
                        int maxValue = Convert.ToInt32(def.MaxValue);

                        if (newValue < minValue)
                        {
                            newValue = minValue;
                            API.SecurityLogger.LogWithRateLimit(API.LogLevel.Warning,
                                API.LogContext.Validation, $"stat_{def.Id}",
                                $"Stat '{def.Id}' clamped to min: {minValue}");
                        }
                        else if (newValue > maxValue)
                        {
                            newValue = maxValue;
                            API.SecurityLogger.LogWithRateLimit(API.LogLevel.Warning,
                                API.LogContext.Validation, $"stat_{def.Id}",
                                $"Stat '{def.Id}' clamped to max: {maxValue}");
                        }

                        if (!client.SteamUserStats.SetStatValue(def.Id, newValue))
                        {
                            return InternalServerError(new Exception(
                                $"Failed to set stat '{update.Id}'"));
                        }
                    }
                    else // float
                    {
                        if (update.Value == null ||
                            !float.TryParse(update.Value.ToString(),
                                System.Globalization.NumberStyles.Float | System.Globalization.NumberStyles.AllowThousands,
                                System.Globalization.CultureInfo.InvariantCulture,
                                out float newValue))
                        {
                            return BadRequest($"Invalid float value for stat '{update.Id}'");
                        }

                        // Reject NaN/Infinity (check after parsing)
                        if (float.IsNaN(newValue) || float.IsInfinity(newValue))
                        {
                            return BadRequest(
                                $"Stat '{update.Id}' cannot be NaN or Infinity");
                        }

                        // Get current value for increment-only check
                        client.SteamUserStats.GetStatValue(def.Id, out float currentValue);

                        // Validate increment-only
                        if (def.IncrementOnly && newValue < currentValue)
                        {
                            return BadRequest(
                                $"Stat '{update.Id}' is increment-only and cannot be decreased");
                        }

                        // Clamp to min/max
                        float minValue = Convert.ToSingle(def.MinValue);
                        float maxValue = Convert.ToSingle(def.MaxValue);

                        if (newValue < minValue)
                        {
                            newValue = minValue;
                            API.SecurityLogger.LogWithRateLimit(API.LogLevel.Warning,
                                API.LogContext.Validation, $"stat_{def.Id}",
                                $"Stat '{def.Id}' clamped to min: {minValue}");
                        }
                        else if (newValue > maxValue)
                        {
                            newValue = maxValue;
                            API.SecurityLogger.LogWithRateLimit(API.LogLevel.Warning,
                                API.LogContext.Validation, $"stat_{def.Id}",
                                $"Stat '{def.Id}' clamped to max: {maxValue}");
                        }

                        if (!client.SteamUserStats.SetStatValue(def.Id, newValue))
                        {
                            return InternalServerError(new Exception(
                                $"Failed to set stat '{update.Id}'"));
                        }
                    }

                    updatedCount++;
                }

                return Ok(new { updated = updatedCount });
            }
            catch (API.ClientInitializeException ex)
            {
                int httpStatus = ex.GetHttpStatusCode();
                string errorCode = ex.GetErrorCode();

                API.SecurityLogger.Log(API.LogLevel.Warning, API.LogContext.HTTP,
                    $"UpdateStats init failed for AppId {appId}: {errorCode}");

                return Content((HttpStatusCode)httpStatus, new ErrorResponse
                {
                    Error = errorCode,
                    Message = ex.Message,
                    ErrorCode = errorCode,
                    StatusCode = httpStatus
                });
            }
            catch (InvalidOperationException ex)
            {
                return Content((HttpStatusCode)428, new ErrorResponse
                {
                    Error = "NotInitialized",
                    Message = ex.Message,
                    StatusCode = 428
                });
            }
            catch (Exception ex)
            {
                return InternalServerError(ex);
            }
        }

        /// <summary>
        /// POST /api/game/{appId}/store - Commit pending changes to Steam
        /// </summary>
        [HttpPost]
        [Route("game/{appId}/store")]
        public IHttpActionResult Store(long appId)
        {
            try
            {
                // Ensure client is initialized for this app
                ClientManager.InitializeForApp(appId);

                var client = ClientManager.GetClient();

                if (!client.SteamUserStats.StoreStats())
                {
                    return InternalServerError(new Exception("StoreStats failed"));
                }

                return Ok(new { message = "Changes stored successfully" });
            }
            catch (API.ClientInitializeException ex)
            {
                int httpStatus = ex.GetHttpStatusCode();
                string errorCode = ex.GetErrorCode();

                API.SecurityLogger.Log(API.LogLevel.Warning, API.LogContext.HTTP,
                    $"Store init failed for AppId {appId}: {errorCode}");

                return Content((HttpStatusCode)httpStatus, new ErrorResponse
                {
                    Error = errorCode,
                    Message = ex.Message,
                    ErrorCode = errorCode,
                    StatusCode = httpStatus
                });
            }
            catch (InvalidOperationException ex)
            {
                return Content((HttpStatusCode)428, new ErrorResponse
                {
                    Error = "NotInitialized",
                    Message = ex.Message,
                    StatusCode = 428
                });
            }
            catch (Exception ex)
            {
                return InternalServerError(ex);
            }
        }

        /// <summary>
        /// POST /api/game/{appId}/reset - Reset all stats (and optionally achievements)
        /// </summary>
        [HttpPost]
        [Route("game/{appId}/reset")]
        public IHttpActionResult Reset(long appId, [FromBody] ResetRequest request)
        {
            try
            {
                // Ensure client is initialized for this app
                ClientManager.InitializeForApp(appId);

                var client = ClientManager.GetClient();

                bool achievementsToo = request?.AchievementsToo ?? false;

                if (!client.SteamUserStats.ResetAllStats(achievementsToo))
                {
                    return InternalServerError(new Exception("ResetAllStats failed"));
                }

                return Ok(new
                {
                    message = "Stats reset successfully",
                    achievementsReset = achievementsToo
                });
            }
            catch (API.ClientInitializeException ex)
            {
                int httpStatus = ex.GetHttpStatusCode();
                string errorCode = ex.GetErrorCode();

                API.SecurityLogger.Log(API.LogLevel.Warning, API.LogContext.HTTP,
                    $"Reset init failed for AppId {appId}: {errorCode}");

                return Content((HttpStatusCode)httpStatus, new ErrorResponse
                {
                    Error = errorCode,
                    Message = ex.Message,
                    ErrorCode = errorCode,
                    StatusCode = httpStatus
                });
            }
            catch (InvalidOperationException ex)
            {
                return Content((HttpStatusCode)428, new ErrorResponse
                {
                    Error = "NotInitialized",
                    Message = ex.Message,
                    StatusCode = 428
                });
            }
            catch (Exception ex)
            {
                return InternalServerError(ex);
            }
        }

        private static string TranslateError(int id) => id switch
        {
            2 => "Generic error (usually means you don't own the game)",
            _ => $"Error code {id}"
        };
    }
}
