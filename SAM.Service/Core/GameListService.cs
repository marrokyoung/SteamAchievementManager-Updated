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
                var imageUrl = GetGameImageUrl(client, kv.Key);

                games.Add(new GameDto
                {
                    Id = kv.Key,
                    Name = name ?? $"App {kv.Key}",
                    Type = kv.Value,
                    ImageUrl = imageUrl,
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

        private static string GetGameImageUrl(Client client, uint appId)
        {
            var currentLanguage = client.SteamApps008.GetCurrentGameLanguage();

            // Try small_capsule for current language
            var candidate = client.SteamApps001.GetAppData(appId,
                $"small_capsule/{currentLanguage}");
            if (!string.IsNullOrEmpty(candidate))
            {
                return $"https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/{appId}/{candidate}";
            }

            // Fallback to English if not current language
            if (currentLanguage != "english")
            {
                candidate = client.SteamApps001.GetAppData(appId, "small_capsule/english");
                if (!string.IsNullOrEmpty(candidate))
                {
                    return $"https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/{appId}/{candidate}";
                }
            }

            // Fallback to logo
            candidate = client.SteamApps001.GetAppData(appId, "logo");
            if (!string.IsNullOrEmpty(candidate))
            {
                return $"https://cdn.steamstatic.com/steamcommunity/public/images/apps/{appId}/{candidate}.jpg";
            }

            return null;
        }
    }
}
