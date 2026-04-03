/* Copyright (c) 2024 Rick (rick 'at' gibbed 'dot' us)
 *
 * This software is provided 'as-is', without any express or implied
 * warranty. In no event will the authors be held liable for any damages
 * arising from the use of this software.
 *
 * Permission is granted to anyone to use this software for any purpose,
 * including commercial applications, and to alter it and redistribute it
 * freely, subject to the following restrictions:
 *
 * 1. The origin of this software must not be misrepresented; you must not
 *    claim that you wrote the original software. If you use this software
 *    in a product, an acknowledgment in the product documentation would
 *    be appreciated but is not required.
 *
 * 2. Altered source versions must be plainly marked as such, and must not
 *    be misrepresented as being the original software.
 *
 * 3. This notice may not be removed or altered from any source
 *    distribution.
 */

using System;
using System.Collections.Generic;
using System.Globalization;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;

namespace SAM.API
{
    /// <summary>
    /// Store metadata fallback for demo detection when local app metadata is incomplete.
    /// </summary>
    public static class SteamStoreAppTypeResolver
    {
        private const string APP_DETAILS_URL =
            "https://store.steampowered.com/api/appdetails?appids={0}&l=english&cc=US";

        private static readonly object _CacheLock = new();
        private static readonly Dictionary<uint, CacheEntry> _Cache = new();
        private static readonly TimeSpan _SuccessTtl = TimeSpan.FromHours(24);
        private static readonly TimeSpan _FailureTtl = TimeSpan.FromMinutes(15);

        private sealed class CacheEntry
        {
            public bool HasValue;
            public bool IsDemo;
            public DateTime CachedAtUtc;
        }

        public static bool TryGetIsDemo(uint appId, out bool isDemo)
        {
            var now = DateTime.UtcNow;
            lock (_CacheLock)
            {
                if (_Cache.TryGetValue(appId, out var cached) == true)
                {
                    var ttl = cached.HasValue == true ? _SuccessTtl : _FailureTtl;
                    if (now - cached.CachedAtUtc < ttl)
                    {
                        isDemo = cached.IsDemo;
                        return cached.HasValue;
                    }
                }
            }

            bool hasValue = TryFetchIsDemo(appId, out bool fetchedIsDemo);

            lock (_CacheLock)
            {
                _Cache[appId] = new CacheEntry
                {
                    HasValue = hasValue,
                    IsDemo = fetchedIsDemo,
                    CachedAtUtc = now,
                };
            }

            isDemo = fetchedIsDemo;
            return hasValue;
        }

        private static bool TryFetchIsDemo(uint appId, out bool isDemo)
        {
            isDemo = false;

            try
            {
                var url = string.Format(
                    CultureInfo.InvariantCulture,
                    APP_DETAILS_URL,
                    appId);

                byte[] bytes;
                using (var downloader = new SafeWebClient(SecurityConfig.MAX_XML_SIZE_BYTES))
                {
                    bytes = downloader.DownloadData(new Uri(url));
                }

                string json = Encoding.UTF8.GetString(bytes);
                if (TryExtractAppDataObject(json, appId, out var dataJson) == false)
                {
                    return false;
                }

                bool demoByType = Regex.IsMatch(
                    dataJson,
                    "\"type\"\\s*:\\s*\"demo\"",
                    RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

                bool hasFullGameLink = Regex.IsMatch(
                    dataJson,
                    "\"fullgame\"\\s*:\\s*\\{",
                    RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

                bool hasDemoCategory = Regex.IsMatch(
                    dataJson,
                    "\"description\"\\s*:\\s*\"Game demo\"",
                    RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

                isDemo = demoByType || hasFullGameLink || hasDemoCategory;
                return true;
            }
            catch (WebException ex)
            {
                SecurityLogger.LogWithRateLimit(
                    LogLevel.Warning,
                    LogContext.HTTP,
                    $"store_demo_{appId}",
                    $"Store demo lookup failed for app {appId}: {ex.Status}");
                return false;
            }
            catch (Exception ex)
            {
                SecurityLogger.LogWithRateLimit(
                    LogLevel.Warning,
                    LogContext.Parse,
                    $"store_demo_parse_{appId}",
                    $"Store demo lookup parse error for app {appId}: {ex.Message}");
                return false;
            }
        }

        private static bool TryExtractAppDataObject(string json, uint appId, out string dataJson)
        {
            dataJson = null;
            if (string.IsNullOrEmpty(json) == true)
            {
                return false;
            }

            int appObjectStart = FindPropertyObjectStart(json, $"\"{appId}\"");
            if (appObjectStart < 0 ||
                TryExtractJsonObject(json, appObjectStart, out var appObjectJson) == false)
            {
                return false;
            }

            bool success = Regex.IsMatch(
                appObjectJson,
                "\"success\"\\s*:\\s*true",
                RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
            if (success == false)
            {
                return false;
            }

            int dataObjectStart = FindPropertyObjectStart(appObjectJson, "\"data\"");
            if (dataObjectStart < 0)
            {
                return false;
            }

            return TryExtractJsonObject(appObjectJson, dataObjectStart, out dataJson);
        }

        private static int FindPropertyObjectStart(string json, string propertyLiteral)
        {
            int keyIndex = json.IndexOf(propertyLiteral, StringComparison.Ordinal);
            if (keyIndex < 0)
            {
                return -1;
            }

            int colonIndex = json.IndexOf(':', keyIndex + propertyLiteral.Length);
            if (colonIndex < 0)
            {
                return -1;
            }

            for (int i = colonIndex + 1; i < json.Length; i++)
            {
                char c = json[i];
                if (char.IsWhiteSpace(c))
                {
                    continue;
                }

                return c == '{'
                    ? i
                    : -1;
            }

            return -1;
        }

        private static bool TryExtractJsonObject(string json, int objectStart, out string objectJson)
        {
            objectJson = null;

            if (objectStart < 0 ||
                objectStart >= json.Length ||
                json[objectStart] != '{')
            {
                return false;
            }

            int depth = 0;
            bool inString = false;
            bool escaped = false;

            for (int i = objectStart; i < json.Length; i++)
            {
                char c = json[i];

                if (inString == true)
                {
                    if (escaped == true)
                    {
                        escaped = false;
                        continue;
                    }

                    if (c == '\\')
                    {
                        escaped = true;
                    }
                    else if (c == '"')
                    {
                        inString = false;
                    }

                    continue;
                }

                if (c == '"')
                {
                    inString = true;
                    continue;
                }

                if (c == '{')
                {
                    depth++;
                    continue;
                }

                if (c == '}')
                {
                    depth--;
                    if (depth == 0)
                    {
                        objectJson = json.Substring(objectStart, i - objectStart + 1);
                        return true;
                    }
                }
            }

            return false;
        }
    }
}
