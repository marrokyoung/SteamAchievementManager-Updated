using System;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Threading.Tasks;  // Still needed for GetGames
using System.Web.Http;
using SAM.Service.Core;
using SAM.Service.Models;

namespace SAM.Service.Controllers
{
    [RoutePrefix("api")]
    public class SteamController : ApiController
    {
        private ISteamClientManager ClientManager => ServiceContext.ClientManager;
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
                var gameName = client.GetAppName((uint)request.AppId);

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
                    var client = ClientManager.GetRawClient();
                    var response = await Task.Run(() => GameListCache.GetGames(client, includeUnowned, refresh));
                    return Ok(response);
                }

                // Initialize with AppId 0 (neutral client) if not already initialized
                try
                {
                    ClientManager.GetRawClient();
                }
                catch (InvalidOperationException)
                {
                    ClientManager.InitializeForApp(0);
                }

                var client2 = ClientManager.GetRawClient();
                var response2 = await Task.Run(() => GameListCache.GetGames(client2, includeUnowned, refresh));

                return Ok(response2);
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
                var steamId = client.GetSteamId();

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
                    client.GetAchievementAndUnlockTime(
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
                        client.GetStatValue(def.Id, out int intVal);
                        value = intVal;
                    }
                    else
                    {
                        client.GetStatValue(def.Id, out float floatVal);
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

                var gameName = client.GetAppName((uint)appId);

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
            catch (System.IO.FileNotFoundException)
            {
                return Content(HttpStatusCode.NotFound, new ErrorResponse
                {
                    Error = "SchemaNotFound",
                    Message = $"Schema file not found. Launch the desktop app for AppId {appId} once to trigger Steam's schema download, then try again.",
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
                    if (!client.SetAchievement(update.Id, update.Unlocked))
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
                        client.GetStatValue(def.Id, out int currentValue);

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

                        if (!client.SetStatValue(def.Id, newValue))
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
                        client.GetStatValue(def.Id, out float currentValue);

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

                        if (!client.SetStatValue(def.Id, newValue))
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

                if (!client.StoreStats())
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

                if (!client.ResetAllStats(achievementsToo))
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

        /// <summary>
        /// GET /api/games/{appId}/image - Serve game image (local Steam cache or CDN redirect)
        /// Serves local standard art if available, otherwise redirects to CDN header.
        /// Client handles GET-based fallbacks if CDN header fails.
        /// </summary>
        [HttpGet]
        [Route("games/{appId}/image")]
        public IHttpActionResult GetGameImage(uint appId)
        {
            try
            {
                // Validate appId
                if (appId == 0)
                {
                    return BadRequest("Invalid appId");
                }

                // Resolve local image path and type
                var (localPath, sourceType) = SteamImageResolver.ResolveLocalImagePath(appId);

                // Serve local STANDARD art if available (best case)
                if (localPath != null &&
                    sourceType == SteamImageResolver.ImageSourceType.Standard &&
                    System.IO.File.Exists(localPath))
                {
                    API.SecurityLogger.Log(API.LogLevel.Info, API.LogContext.HTTP,
                        $"Image serve: appId={appId} source=local path={localPath}");
                    return ServeLocalFile(localPath);
                }

                // No local standard art - redirect to CDN header (client handles fallbacks via GET)
                API.SecurityLogger.Log(API.LogLevel.Info, API.LogContext.HTTP,
                    $"Image redirect: appId={appId} target=https://cdn.cloudflare.steamstatic.com/steam/apps/{appId}/header.jpg");
                return Redirect($"https://cdn.cloudflare.steamstatic.com/steam/apps/{appId}/header.jpg");
            }
            catch (System.IO.IOException ex)
            {
                API.SecurityLogger.Log(API.LogLevel.Warning, API.LogContext.HTTP,
                    $"Failed to serve image for AppId {appId}: {ex.Message}");

                // Fallback to CDN header on read error
                return Redirect($"https://cdn.cloudflare.steamstatic.com/steam/apps/{appId}/header.jpg");
            }
            catch (Exception ex)
            {
                API.SecurityLogger.Log(API.LogLevel.Error, API.LogContext.HTTP,
                    $"Unexpected error serving image for AppId {appId}: {ex.Message}");
                return InternalServerError(ex);
            }
        }

        /// <summary>
        /// GET /api/games/{appId}/logo - Serve local logo or redirect to CDN logo
        /// This is the fallback endpoint after all splash art options are exhausted
        /// </summary>
        [HttpGet]
        [Route("games/{appId}/logo")]
        public IHttpActionResult GetGameLogo(uint appId)
        {
            try
            {
                // Validate appId
                if (appId == 0)
                {
                    return BadRequest("Invalid appId");
                }

                // Resolve local image path and type
                var (localPath, sourceType) = SteamImageResolver.ResolveLocalImagePath(appId);

                // Serve local logo if available (reuse streaming logic with cache headers)
                if (localPath != null &&
                    sourceType == SteamImageResolver.ImageSourceType.Logo &&
                    System.IO.File.Exists(localPath))
                {
                    return ServeLocalFile(localPath);
                }

                // No local logo - redirect to CDN logo
                return Redirect($"https://cdn.cloudflare.steamstatic.com/steam/apps/{appId}/logo.png");
            }
            catch (System.IO.IOException ex)
            {
                API.SecurityLogger.Log(API.LogLevel.Warning, API.LogContext.HTTP,
                    $"Failed to serve logo for AppId {appId}: {ex.Message}");

                // Fallback to CDN logo on read error
                return Redirect($"https://cdn.cloudflare.steamstatic.com/steam/apps/{appId}/logo.png");
            }
            catch (Exception ex)
            {
                API.SecurityLogger.Log(API.LogLevel.Error, API.LogContext.HTTP,
                    $"Unexpected error serving logo for AppId {appId}: {ex.Message}");
                return InternalServerError(ex);
            }
        }

        /// <summary>
        /// Helper method to serve local files with proper headers (ETag, cache control)
        /// </summary>
        private IHttpActionResult ServeLocalFile(string localPath)
        {
            var fileInfo = new System.IO.FileInfo(localPath);
            var extension = System.IO.Path.GetExtension(localPath).ToLowerInvariant();
            var contentType = extension switch
            {
                ".jpg" or ".jpeg" => "image/jpeg",
                ".png" => "image/png",
                ".webp" => "image/webp",
                _ => "application/octet-stream"
            };

            // StreamContent owns the FileStream and will dispose it
            var fileStream = new System.IO.FileStream(localPath, System.IO.FileMode.Open, System.IO.FileAccess.Read, System.IO.FileShare.Read);
            var streamContent = new System.Net.Http.StreamContent(fileStream);

            streamContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue(contentType);
            streamContent.Headers.ContentLength = fileInfo.Length;

            var response = new System.Net.Http.HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = streamContent
            };

            // Cache headers (1 hour max-age)
            response.Headers.CacheControl = new System.Net.Http.Headers.CacheControlHeaderValue
            {
                Public = true,
                MaxAge = TimeSpan.FromHours(1)
            };

            // Add Last-Modified/ETag for conditional requests
            response.Content.Headers.LastModified = fileInfo.LastWriteTimeUtc;
            response.Headers.ETag = new System.Net.Http.Headers.EntityTagHeaderValue(
                $"\"{fileInfo.LastWriteTimeUtc.Ticks:X}-{fileInfo.Length:X}\""
            );

            // StreamContent will dispose fileStream when response is disposed
            return ResponseMessage(response);
        }

        private static string TranslateError(int id) => id switch
        {
            2 => "Generic error (usually means you don't own the game)",
            _ => $"Error code {id}"
        };
    }
}
