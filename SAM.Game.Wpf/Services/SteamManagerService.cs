using System;
using System.Collections.Generic;
using System.Globalization;
using System.Threading.Tasks;
using SAM.API;
using SAM.API.Callbacks;
using SAM.Game.Wpf.Models;
using SAM.Game.Wpf.Vdf;

namespace SAM.Game.Wpf.Services
{
    internal sealed class SteamManagerService : IDisposable
    {
        private readonly Client _client = new();
        private bool _initialized;

        public async Task InitializeAsync(long appId)
        {
            if (_initialized)
            {
                return;
            }

            await Task.Run(() =>
            {
                _client.Initialize(appId);
            }).ConfigureAwait(false);

            _initialized = true;
        }

        public string GetGameName(uint appId)
        {
            return _client.SteamApps001.GetAppData(appId, "name");
        }

        public async Task<(IReadOnlyList<AchievementItem> achievements, IReadOnlyList<StatItem> stats)> LoadAsync()
        {
            if (!_initialized)
            {
                throw new InvalidOperationException("Service not initialized.");
            }

            return await Task.Run(() =>
            {
                var achievements = new List<AchievementItem>();
                var stats = new List<StatItem>();

                var schema = LoadSchema();

                // Request current stats
                var steamId = _client.SteamUser.GetSteamId();
                var callHandle = _client.SteamUserStats.RequestUserStats(steamId);
                if (callHandle == CallHandle.Invalid)
                {
                    throw new InvalidOperationException("Failed to request user stats.");
                }

                // Pump callbacks until received
                bool received = false;
                var receivedCallback = _client.CreateAndRegisterCallback<UserStatsReceived>();
                receivedCallback.OnRun += _ =>
                {
                    received = true;
                };

                int waitMs = 0;
                while (!received && waitMs < 5000)
                {
                    _client.RunCallbacks(false);
                    System.Threading.Thread.Sleep(50);
                    waitMs += 50;
                }

                if (!received)
                {
                    throw new TimeoutException("Timed out waiting for stats.");
                }

                // Achievements
                int achievementCount = _client.SteamUserStats.GetNumAchievements();
                for (int i = 0; i < achievementCount; i++)
                {
                    string id = _client.SteamUserStats.GetAchievementName((uint)i);
                    if (string.IsNullOrWhiteSpace(id))
                    {
                        continue;
                    }

                    if (_client.SteamUserStats.GetAchievementAndUnlockTime(id, out bool unlocked, out var unlockTime) == false)
                    {
                        continue;
                    }

                    schema.AchievementDisplay.TryGetValue(id, out var display);

                    achievements.Add(new AchievementItem
                    {
                        Id = id,
                        Name = string.IsNullOrWhiteSpace(display.Name) ? id : display.Name,
                        Description = display.Description ?? string.Empty,
                        Unlocked = unlocked,
                        UnlockTime = unlockTime > 0 ? DateTimeOffset.FromUnixTimeSeconds(unlockTime).LocalDateTime.ToString(CultureInfo.CurrentCulture) : string.Empty
                    });
                }

                // Stats
                foreach (var statDef in schema.Stats)
                {
                    string value = string.Empty;
                    bool ok = false;
                    if (statDef.Type == "int")
                    {
                        ok = _client.SteamUserStats.GetStatValue(statDef.Id, out int intVal);
                        value = intVal.ToString(CultureInfo.CurrentCulture);
                    }
                    else if (statDef.Type == "float")
                    {
                        ok = _client.SteamUserStats.GetStatValue(statDef.Id, out float floatVal);
                        value = floatVal.ToString(CultureInfo.CurrentCulture);
                    }

                    if (!ok)
                    {
                        continue;
                    }

                    stats.Add(new StatItem
                    {
                        Id = statDef.Id,
                        DisplayName = string.IsNullOrWhiteSpace(statDef.DisplayName) ? statDef.Id : statDef.DisplayName,
                        Value = value,
                        IsIncrementOnly = statDef.IncrementOnly,
                        IsProtected = statDef.PermissionProtected
                    });
                }

                return ((IReadOnlyList<AchievementItem>)achievements, (IReadOnlyList<StatItem>)stats);
            }).ConfigureAwait(false);
        }

        private (Dictionary<string, (string Name, string Description)> AchievementDisplay, List<StatDefinition> Stats) LoadSchema()
        {
            var achievementDisplay = new Dictionary<string, (string, string)>(StringComparer.OrdinalIgnoreCase);
            var statDefs = new List<StatDefinition>();

            try
            {
                string install = Steam.GetInstallPath();
                string fileName = $"UserGameStatsSchema_{_client.SteamUtils.GetAppId()}.bin";
                string path = System.IO.Path.Combine(install, "appcache", "stats", fileName);
                var kv = KeyValue.LoadAsBinary(path);
                if (kv == null)
                {
                    return (achievementDisplay, statDefs);
                }

                var currentLanguage = _client.SteamApps008.GetCurrentGameLanguage();
                var statsNode = kv[_client.SteamUtils.GetAppId().ToString(CultureInfo.InvariantCulture)]["stats"];
                if (statsNode.Valid == false || statsNode.Children == null)
                {
                    return (achievementDisplay, statDefs);
                }

                foreach (var stat in statsNode.Children)
                {
                    if (stat.Valid == false)
                    {
                        continue;
                    }

                    var rawType = stat["type_int"].Valid
                                      ? stat["type_int"].AsInteger(0)
                                      : stat["type"].AsInteger(0);
                    var type = (API.Types.UserStatType)rawType;
                    switch (type)
                    {
                        case API.Types.UserStatType.Integer:
                        {
                            var id = stat["name"].AsString("");
                            string name = GetLocalizedString(stat["display"]["name"], currentLanguage, id);
                            statDefs.Add(new StatDefinition
                            {
                                Id = id,
                                DisplayName = name,
                                Type = "int",
                                IncrementOnly = stat["incrementonly"].AsBoolean(false),
                                PermissionProtected = (stat["permission"].AsInteger(0) & 2) != 0
                            });
                            break;
                        }
                        case API.Types.UserStatType.Float:
                        case API.Types.UserStatType.AverageRate:
                        {
                            var id = stat["name"].AsString("");
                            string name = GetLocalizedString(stat["display"]["name"], currentLanguage, id);
                            statDefs.Add(new StatDefinition
                            {
                                Id = id,
                                DisplayName = name,
                                Type = "float",
                                IncrementOnly = stat["incrementonly"].AsBoolean(false),
                                PermissionProtected = (stat["permission"].AsInteger(0) & 2) != 0
                            });
                            break;
                        }
                        case API.Types.UserStatType.Achievements:
                        case API.Types.UserStatType.GroupAchievements:
                        {
                            if (stat.Children != null)
                            {
                                foreach (var bits in stat.Children)
                                {
                                    if (string.Compare(bits.Name, "bits", StringComparison.InvariantCultureIgnoreCase) != 0)
                                    {
                                        continue;
                                    }
                                    if (bits.Valid == false || bits.Children == null)
                                    {
                                        continue;
                                    }

                                    foreach (var bit in bits.Children)
                                    {
                                        string id = bit["name"].AsString("");
                                        string name = GetLocalizedString(bit["display"]["name"], currentLanguage, id);
                                        string desc = GetLocalizedString(bit["display"]["desc"], currentLanguage, "");
                                        achievementDisplay[id] = (name, desc);
                                    }
                                }
                            }
                            break;
                        }
                        default:
                        {
                            break;
                        }
                    }
                }
            }
            catch
            {
                // Ignore schema parse errors
            }

            return (achievementDisplay, statDefs);
        }

        private static string GetLocalizedString(KeyValue kv, string language, string defaultValue)
        {
            var name = kv[language].AsString("");
            if (string.IsNullOrEmpty(name) == false)
            {
                return name;
            }

            if (language != "english")
            {
                name = kv["english"].AsString("");
                if (string.IsNullOrEmpty(name) == false)
                {
                    return name;
                }
            }

            name = kv.AsString("");
            if (string.IsNullOrEmpty(name) == false)
            {
                return name;
            }

            return defaultValue;
        }

        private sealed class StatDefinition
        {
            public string Id { get; set; }
            public string DisplayName { get; set; }
            public string Type { get; set; }
            public bool IncrementOnly { get; set; }
            public bool PermissionProtected { get; set; }
        }

        public void Dispose()
        {
            _client.Dispose();
        }
    }
}
