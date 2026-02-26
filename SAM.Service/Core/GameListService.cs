using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Xml.XPath;
using SAM.API;
using SAM.Service.Models;

namespace SAM.Service.Core
{
    public static class GameListService
    {
        private const string GAMES_XML_URL = "https://gib.me/sam/games.xml";

        public static List<GameDto> DownloadAndParseGameList(Client client, bool includeUnowned)
        {
            var games = new List<GameDto>();
            int ownedCount = 0;
            int skippedCount = 0;

            // Download game list XML
            byte[] bytes;
            using (var downloader = new SafeWebClient(SecurityConfig.MAX_XML_SIZE_BYTES))
            {
                try
                {
                    bytes = downloader.DownloadData(new Uri(GAMES_XML_URL));
                }
                catch (WebException ex) when (ex.Status == WebExceptionStatus.MessageLengthLimitExceeded)
                {
                    throw new InvalidOperationException("Game list file exceeds maximum size", ex);
                }
            }

            // Parse XML with secure reader
            var pairs = new List<KeyValuePair<uint, string>>();
            using (var stream = new MemoryStream(bytes, false))
            {
                var xmlSettings = new System.Xml.XmlReaderSettings
                {
                    DtdProcessing = System.Xml.DtdProcessing.Prohibit,
                    XmlResolver = null,
                    MaxCharactersFromEntities = 0,
                    MaxCharactersInDocument = SecurityConfig.MAX_XML_SIZE_BYTES
                };

                using (var xmlReader = System.Xml.XmlReader.Create(stream, xmlSettings))
                {
                    var document = new XPathDocument(xmlReader);
                    var navigator = document.CreateNavigator();
                    var nodes = navigator.Select("/games/game");

                    while (nodes.MoveNext())
                    {
                        string type = nodes.Current.GetAttribute("type", "");
                        if (string.IsNullOrEmpty(type))
                        {
                            type = "normal";
                        }
                        pairs.Add(new KeyValuePair<uint, string>((uint)nodes.Current.ValueAsLong, type));
                    }
                }
            }

            // Filter by ownership and build game list
            foreach (var kv in pairs)
            {
                bool owns = client.SteamApps008.IsSubscribedApp(kv.Key);
                if (!owns && !includeUnowned)
                {
                    skippedCount++;
                    continue;
                }

                var name = client.SteamApps001.GetAppData(kv.Key, "name");
                var type = ResolveGameType(client, kv.Key, kv.Value, name);
                var (imageUrl, imageType) = GetGameImageUrl(kv.Key);

                games.Add(new GameDto
                {
                    Id = kv.Key,
                    Name = name ?? $"App {kv.Key}",
                    Type = type,
                    ImageUrl = imageUrl,
                    ImageType = imageType,
                    Owned = owns
                });

                if (owns)
                {
                    ownedCount++;
                }
            }

            // Log owned/skipped counts for debugging
            SecurityLogger.Log(LogLevel.Info, LogContext.Native,
                $"Game list: {ownedCount} owned, {skippedCount} skipped");

            return games.OrderBy(g => g.Name).ToList();
        }

        private static string ResolveGameType(Client client, uint appId, string listType, string appName)
        {
            var normalizedType = NormalizeGameType(listType);
            if (!string.Equals(normalizedType, "normal", StringComparison.Ordinal))
            {
                return normalizedType;
            }

            var appType = client.SteamApps001.GetAppData(appId, "type");
            if (string.Equals(appType, "demo", StringComparison.OrdinalIgnoreCase))
            {
                return "demo";
            }

            bool nameHintsDemo = ContainsWholeWord(appName, "demo");

            // Local fallback for missing type metadata.
            if (string.IsNullOrWhiteSpace(appType) && nameHintsDemo)
            {
                return "demo";
            }

            // Some demo apps do not expose a local "type" and may not include "Demo" in localized names.
            // In that case, use the Store appdetails metadata as secondary signal.
            if (string.IsNullOrWhiteSpace(appType) ||
                nameHintsDemo)
            {
                if (SteamStoreAppTypeResolver.TryGetIsDemo(appId, out bool isStoreDemo) == true &&
                    isStoreDemo == true)
                {
                    return "demo";
                }
            }

            return normalizedType;
        }

        private static bool ContainsWholeWord(string text, string word)
        {
            if (string.IsNullOrEmpty(text))
            {
                return false;
            }

            int idx = text.IndexOf(word, StringComparison.OrdinalIgnoreCase);
            while (idx >= 0)
            {
                bool startOk = idx == 0 || !char.IsLetterOrDigit(text[idx - 1]);
                bool endOk = idx + word.Length >= text.Length || !char.IsLetterOrDigit(text[idx + word.Length]);
                if (startOk && endOk)
                {
                    return true;
                }
                idx = text.IndexOf(word, idx + 1, StringComparison.OrdinalIgnoreCase);
            }
            return false;
        }

        private static string NormalizeGameType(string type)
        {
            if (string.IsNullOrWhiteSpace(type))
            {
                return "normal";
            }

            var normalized = type.Trim().ToLowerInvariant();
            return normalized switch
            {
                "normal" => "normal",
                "game" => "normal",
                "demo" => "demo",
                "mod" => "mod",
                "junk" => "junk",
                _ => normalized
            };
        }

        private static (string url, string imageType) GetGameImageUrl(uint appId)
        {
            // Return the image endpoint - server handles the fallback logic.
            return ($"/api/games/{appId}/image", null);
        }
    }
}
