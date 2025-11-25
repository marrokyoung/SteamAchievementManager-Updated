using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Threading.Tasks;
using System.Xml;
using SAM.API;
using SAM.Picker.Wpf.Models;

namespace SAM.Picker.Wpf.Services
{
    internal sealed class SteamPickerService : IDisposable
    {
        private readonly Client _client = new();
        private bool _initialized;

        public async Task InitializeAsync()
        {
            if (_initialized)
            {
                return;
            }

            await Task.Run(() =>
            {
                _client.Initialize(0);
            }).ConfigureAwait(false);

            _initialized = true;
        }

        public async Task<IReadOnlyList<GameItem>> GetOwnedGamesAsync()
        {
            if (!_initialized)
            {
                throw new InvalidOperationException("Service not initialized. Call InitializeAsync first.");
            }

            return await Task.Run(() =>
            {
                var results = new List<GameItem>();

                byte[] bytes;
                using (var downloader = new SafeWebClient(SecurityConfig.MAX_XML_SIZE_BYTES))
                {
                    bytes = downloader.DownloadData(new Uri("https://gib.me/sam/games.xml"));
                }

                var seen = new HashSet<uint>();

                using (var stream = new MemoryStream(bytes, false))
                {
                    XmlReaderSettings xmlSettings = new()
                    {
                        DtdProcessing = DtdProcessing.Prohibit,
                        XmlResolver = null,
                        MaxCharactersFromEntities = 0,
                        MaxCharactersInDocument = SecurityConfig.MAX_XML_SIZE_BYTES
                    };

                    using (var xmlReader = XmlReader.Create(stream, xmlSettings))
                    {
                        while (xmlReader.Read())
                        {
                            if (xmlReader.NodeType != XmlNodeType.Element || xmlReader.Name != "game")
                            {
                                continue;
                            }

                            var idString = xmlReader.ReadElementContentAsString();
                            if (uint.TryParse(idString, NumberStyles.Integer, CultureInfo.InvariantCulture, out uint id) == false)
                            {
                                continue;
                            }

                            if (seen.Contains(id))
                            {
                                continue;
                            }

                            seen.Add(id);

                            string typeAttr = xmlReader.GetAttribute("type");
                            string type = string.IsNullOrWhiteSpace(typeAttr) ? "normal" : typeAttr;

                            if (_client.SteamApps008.IsSubscribedApp(id) == false)
                            {
                                continue;
                            }

                            string name = _client.SteamApps001.GetAppData(id, "name");
                            if (string.IsNullOrWhiteSpace(name))
                            {
                                name = id.ToString(CultureInfo.InvariantCulture);
                            }

                            results.Add(new GameItem
                            {
                                Id = id,
                                Name = name,
                                Type = type,
                                Owned = true,
                                ImageUrl = GetGameImageUrl(id)
                            });
                        }
                    }
                }

                return (IReadOnlyList<GameItem>)results;
            }).ConfigureAwait(false);
        }

        private string GetGameImageUrl(uint id)
        {
            string candidate;

            var currentLanguage = _client.SteamApps008.GetCurrentGameLanguage();

            candidate = _client.SteamApps001.GetAppData(id, $"small_capsule/{currentLanguage}");
            if (string.IsNullOrEmpty(candidate) == false)
            {
                return $"https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/{id}/{candidate}";
            }

            if (currentLanguage != "english")
            {
                candidate = _client.SteamApps001.GetAppData(id, "small_capsule/english");
                if (string.IsNullOrEmpty(candidate) == false)
                {
                    return $"https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/{id}/{candidate}";
                }
            }

            candidate = _client.SteamApps001.GetAppData(id, "logo");
            if (string.IsNullOrEmpty(candidate) == false)
            {
                return $"https://cdn.steamstatic.com/steamcommunity/public/images/apps/{id}/{candidate}.jpg";
            }

            return null;
        }

        public void Dispose()
        {
            _client.Dispose();
        }
    }
}
