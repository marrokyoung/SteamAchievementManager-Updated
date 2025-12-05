using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace SAM.Service.Core
{
    /// <summary>
    /// Resolves high-quality game images from local Steam cache with CDN fallback
    /// </summary>
    public static class SteamImageResolver
    {
        // Thread-safe cache of resolved image paths
        private static readonly ConcurrentDictionary<uint, string> _imagePathCache = new ConcurrentDictionary<uint, string>();
        private static readonly object _userLock = new object();
        private static string _cachedUserId;
        private static bool _userResolved;

        // Valid image extensions
        private static readonly string[] ValidExtensions = { ".jpg", ".jpeg", ".png", ".webp" };

        /// <summary>
        /// Resolves the local image path for a given app ID
        /// </summary>
        /// <param name="appId">Steam App ID</param>
        /// <returns>Absolute file path if found, null otherwise</returns>
        public static string ResolveLocalImagePath(uint appId)
        {
            // Check cache first
            if (_imagePathCache.TryGetValue(appId, out var cachedPath))
            {
                return cachedPath;
            }

            // Resolve and cache
            var resolvedPath = ResolveLocalImagePathInternal(appId);
            if (resolvedPath != null)
            {
                _imagePathCache.TryAdd(appId, resolvedPath);
            }

            return resolvedPath;
        }

        /// <summary>
        /// Clears the cached image path for a specific app (for future invalidation)
        /// </summary>
        public static void ClearCache(uint appId)
        {
            _imagePathCache.TryRemove(appId, out _);
        }

        /// <summary>
        /// Clears the entire image path cache
        /// </summary>
        public static void ClearAllCache()
        {
            _imagePathCache.Clear();
        }

        private static string ResolveLocalImagePathInternal(uint appId)
        {
            try
            {
                // Get Steam install path
                var steamPath = SAM.API.Steam.GetInstallPath();
                if (string.IsNullOrWhiteSpace(steamPath))
                {
                    API.SecurityLogger.Log(API.LogLevel.Warning, API.LogContext.Init,
                        "Steam install path not found, falling back to CDN for images");
                    return null;
                }

                // Normalize Steam path
                steamPath = Path.GetFullPath(steamPath);

                // Get active Steam user ID
                var userId = GetCachedOrActiveSteamUserId(steamPath);

                // Priority 1: Custom grid art (userdata/{userId}/config/grid/{appId}.ext)
                if (!string.IsNullOrEmpty(userId))
                {
                    var gridPath = Path.Combine(steamPath, "userdata", userId, "config", "grid");
                    var customGridPath = FindImageFile(gridPath, appId.ToString(), steamPath);
                    if (customGridPath != null) return customGridPath;
                }

                // Priority 2-5: Library cache (appcache/librarycache)
                var libraryCachePath = Path.Combine(steamPath, "appcache", "librarycache");

                // Priority 2: Library header (460×215 landscape)
                var headerPath = FindImageFile(libraryCachePath, $"{appId}_header", steamPath, new[] { ".jpg" });
                if (headerPath != null) return headerPath;

                // Priority 3: Hero banner
                var heroPath = FindImageFile(libraryCachePath, $"{appId}_hero", steamPath, new[] { ".jpg" });
                if (heroPath != null) return heroPath;

                // Priority 4: Library hero (multiple extensions)
                var libraryHeroPath = FindImageFile(libraryCachePath, $"{appId}_library_hero", steamPath);
                if (libraryHeroPath != null) return libraryHeroPath;

                // Priority 5: Portrait library (600x900)
                var library600Path = FindImageFile(libraryCachePath, $"{appId}_library_600x900", steamPath, new[] { ".jpg" });
                if (library600Path != null) return library600Path;

                return null; // No local image found
            }
            catch (Exception ex)
            {
                API.SecurityLogger.Log(API.LogLevel.Warning, API.LogContext.Init,
                    $"Error resolving local image for AppId {appId}: {ex.Message}");
                return null;
            }
        }

        private static string GetCachedOrActiveSteamUserId(string steamPath)
        {
            if (_userResolved)
            {
                return _cachedUserId;
            }

            lock (_userLock)
            {
                if (_userResolved)
                {
                    return _cachedUserId;
                }

                _cachedUserId = GetActiveSteamUserId(steamPath);
                _userResolved = true;
                return _cachedUserId;
            }
        }

        private static string GetActiveSteamUserId(string steamPath)
        {
            try
            {
                var loginUsersPath = Path.Combine(steamPath, "config", "loginusers.vdf");
                if (!File.Exists(loginUsersPath))
                {
                    API.SecurityLogger.Log(API.LogLevel.Warning, API.LogContext.Init,
                        "loginusers.vdf not found, falling back to latest userdata directory");
                    return GetLatestUserdataDirectory(steamPath);
                }

                // Parse loginusers.vdf to find MostRecent=1 user
                var content = File.ReadAllText(loginUsersPath);
                var userId = ParseMostRecentUser(content);

                if (string.IsNullOrEmpty(userId))
                {
                    API.SecurityLogger.Log(API.LogLevel.Warning, API.LogContext.Init,
                        "MostRecent user not found in loginusers.vdf, falling back to latest userdata by modification time");
                    return GetLatestUserdataDirectory(steamPath);
                }

                // Validate userdata directory exists
                var userdataPath = Path.Combine(steamPath, "userdata", userId);
                if (!Directory.Exists(userdataPath))
                {
                    API.SecurityLogger.LogWithRateLimit(API.LogLevel.Warning, API.LogContext.Init,
                        $"userdata_missing_{userId}",
                        $"Userdata directory not found for user {userId}, falling back to latest");
                    return GetLatestUserdataDirectory(steamPath);
                }

                return userId;
            }
            catch (Exception ex)
            {
                API.SecurityLogger.Log(API.LogLevel.Warning, API.LogContext.Init,
                    $"Error reading loginusers.vdf: {ex.Message}");
                return GetLatestUserdataDirectory(steamPath);
            }
        }

        private static string ParseMostRecentUser(string vdfContent)
        {
            // Simple VDF parser for MostRecent flag
            // Look for pattern: "users" { "steamid" { ... "MostRecent" "1" ... } }
            var lines = vdfContent.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
            string currentUserId = null;

            for (int i = 0; i < lines.Length; i++)
            {
                var line = lines[i].Trim();

                // Look for quoted Steam ID (64-bit number)
                if (line.StartsWith("\"") && line.Length > 2)
                {
                    var steamId = line.Trim('"', '\t', ' ');
                    if (ulong.TryParse(steamId, out _) && steamId.Length >= 17)
                    {
                        currentUserId = steamId;
                    }
                }

                // Check for MostRecent flag
                if (line.Contains("\"MostRecent\"") && line.Contains("\"1\"") && currentUserId != null)
                {
                    return currentUserId;
                }
            }

            return null;
        }

        private static string GetLatestUserdataDirectory(string steamPath)
        {
            try
            {
                var userdataPath = Path.Combine(steamPath, "userdata");
                if (!Directory.Exists(userdataPath))
                {
                    return null;
                }

                var directories = Directory.GetDirectories(userdataPath)
                    .Where(dir =>
                    {
                        var dirName = Path.GetFileName(dir);
                        return ulong.TryParse(dirName, out _); // Only numeric user IDs
                    })
                    .OrderByDescending(dir => Directory.GetLastWriteTimeUtc(dir))
                    .ToList();

                if (directories.Any())
                {
                    return Path.GetFileName(directories.First());
                }

                return null;
            }
            catch (Exception ex)
            {
                API.SecurityLogger.Log(API.LogLevel.Warning, API.LogContext.Init,
                    $"Error finding latest userdata directory: {ex.Message}");
                return null;
            }
        }

        private static string FindImageFile(string basePath, string fileNameWithoutExtension, string steamRoot, string[] extensionsToTry = null)
        {
            if (!Directory.Exists(basePath))
            {
                return null;
            }

            var extensions = extensionsToTry ?? ValidExtensions;

            foreach (var ext in extensions)
            {
                var candidatePath = Path.Combine(basePath, fileNameWithoutExtension + ext);

                if (File.Exists(candidatePath))
                {
                    // Validate path before returning
                    if (ValidateSteamPath(candidatePath, steamRoot))
                    {
                        return candidatePath;
                    }
                }
            }

            return null;
        }

        private static bool ValidateSteamPath(string path, string steamRoot)
        {
            try
            {
                // Normalize to absolute paths
                var fullPath = Path.GetFullPath(path);
                var normalizedSteamRoot = Path.GetFullPath(steamRoot);

                // Ensure steam root has trailing separator for accurate prefix matching
                if (!normalizedSteamRoot.EndsWith(Path.DirectorySeparatorChar.ToString()) &&
                    !normalizedSteamRoot.EndsWith(Path.AltDirectorySeparatorChar.ToString()))
                {
                    normalizedSteamRoot += Path.DirectorySeparatorChar;
                }

                // Check for traversal sequences
                if (fullPath.Contains(".."))
                {
                    API.SecurityLogger.Log(API.LogLevel.Error, API.LogContext.Security,
                        $"Path traversal detected: {path}");
                    return false;
                }

                // Check for reparse points (symlinks/junctions)
                var attributes = File.GetAttributes(fullPath);
                if ((attributes & FileAttributes.ReparsePoint) != 0)
                {
                    API.SecurityLogger.Log(API.LogLevel.Error, API.LogContext.Security,
                        $"Reparse point (symlink/junction) detected: {path}");
                    return false;
                }

                // Validate path is within Steam directory (trailing separator prevents sibling matches)
                if (!fullPath.StartsWith(normalizedSteamRoot, StringComparison.OrdinalIgnoreCase))
                {
                    API.SecurityLogger.Log(API.LogLevel.Error, API.LogContext.Security,
                        $"Path outside Steam directory: {path}");
                    return false;
                }

                // Validate file extension
                var extension = Path.GetExtension(fullPath).ToLowerInvariant();
                if (!ValidExtensions.Contains(extension))
                {
                    API.SecurityLogger.Log(API.LogLevel.Error, API.LogContext.Security,
                        $"Invalid file extension: {extension}");
                    return false;
                }

                return true;
            }
            catch (Exception ex)
            {
                API.SecurityLogger.Log(API.LogLevel.Error, API.LogContext.Security,
                    $"Path validation error: {ex.Message}");
                return false;
            }
        }
    }
}
