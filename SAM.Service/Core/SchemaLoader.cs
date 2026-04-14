using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using SAM.API;
using SAM.Service.Models;

namespace SAM.Service.Core
{
    public static class SchemaLoader
    {
        public static GameSchema LoadSchema(long appId, Client client)
        {
            string path;
            try
            {
                string fileName = $"UserGameStatsSchema_{appId}.bin";
                path = Steam.GetInstallPath();
                path = Path.Combine(path, "appcache", "stats", fileName);

                if (!File.Exists(path))
                {
                    throw new FileNotFoundException($"Schema file not found: {path}");
                }
            }
            catch (Exception ex)
            {
                throw new Exception($"Failed to locate schema for AppId {appId}: {ex.Message}", ex);
            }

            // Reuse SAM.Schema's KeyValue parser.
            var kv = SAM.Schema.KeyValue.LoadAsBinary(path) ?? throw new Exception($"Failed to parse schema file for AppId {appId}");
            var currentLanguage = client.SteamApps008.GetCurrentGameLanguage();

            var achievements = new List<AchievementDefinitionDto>();
            var stats = new List<StatDefinitionDto>();

            var statsNode = kv[appId.ToString(CultureInfo.InvariantCulture)]["stats"];
            if (!statsNode.Valid || statsNode.Children == null)
            {
                throw new Exception($"Invalid schema structure for AppId {appId}");
            }

            foreach (var stat in statsNode.Children)
            {
                if (!stat.Valid) continue;

                var rawType = stat["type_int"].Valid
                    ? stat["type_int"].AsInteger(0)
                    : stat["type"].AsInteger(-1);

                // Older games (e.g. Castle Crashers) store type as a string
                // name like "ACHIEVEMENTS" or "INT" instead of an integer.
                if (rawType < 0)
                {
                    rawType = stat["type"].AsString("") switch
                    {
                        var s when s.Equals("INT", StringComparison.OrdinalIgnoreCase) => 1,
                        var s when s.Equals("FLOAT", StringComparison.OrdinalIgnoreCase) => 2,
                        var s when s.Equals("AVGRATE", StringComparison.OrdinalIgnoreCase) => 3,
                        var s when s.Equals("ACHIEVEMENTS", StringComparison.OrdinalIgnoreCase) => 4,
                        var s when s.Equals("GROUPACHIEVEMENTS", StringComparison.OrdinalIgnoreCase) => 5,
                        _ => 0
                    };
                }

                var type = (API.Types.UserStatType)rawType;

                switch (type)
                {
                    case API.Types.UserStatType.Integer:
                        stats.Add(new StatDefinitionDto
                        {
                            Id = stat["name"].AsString(""),
                            DisplayName = GetLocalizedString(stat["display"]["name"], currentLanguage,
                                stat["name"].AsString("")),
                            Type = "int",
                            MinValue = stat["min"].AsInteger(int.MinValue),
                            MaxValue = stat["max"].AsInteger(int.MaxValue),
                            IncrementOnly = stat["incrementonly"].AsBoolean(false),
                            DefaultValue = stat["default"].AsInteger(0),
                            Permission = stat["permission"].AsInteger(0)
                        });
                        break;

                    case API.Types.UserStatType.Float:
                    case API.Types.UserStatType.AverageRate:
                        stats.Add(new StatDefinitionDto
                        {
                            Id = stat["name"].AsString(""),
                            DisplayName = GetLocalizedString(stat["display"]["name"], currentLanguage,
                                stat["name"].AsString("")),
                            Type = "float",
                            MinValue = stat["min"].AsFloat(float.MinValue),
                            MaxValue = stat["max"].AsFloat(float.MaxValue),
                            IncrementOnly = stat["incrementonly"].AsBoolean(false),
                            DefaultValue = stat["default"].AsFloat(0.0f),
                            Permission = stat["permission"].AsInteger(0)
                        });
                        break;

                    case API.Types.UserStatType.Achievements:
                    case API.Types.UserStatType.GroupAchievements:
                        if (stat.Children != null)
                        {
                            foreach (var bits in stat.Children.Where(
                                b => string.Compare(b.Name, "bits", StringComparison.InvariantCultureIgnoreCase) == 0))
                            {
                                if (!bits.Valid || bits.Children == null) continue;

                                foreach (var bit in bits.Children)
                                {
                                    string id = bit["name"].AsString("");
                                    achievements.Add(new AchievementDefinitionDto
                                    {
                                        Id = id,
                                        Name = GetLocalizedString(bit["display"]["name"], currentLanguage, id),
                                        Description = GetLocalizedString(bit["display"]["desc"], currentLanguage, ""),
                                        IconNormal = bit["display"]["icon"].AsString(""),
                                        IconLocked = bit["display"]["icon_gray"].AsString(""),
                                        IsHidden = bit["display"]["hidden"].AsBoolean(false),
                                        Permission = bit["permission"].AsInteger(0)
                                    });
                                }
                            }
                        }
                        break;
                }
            }

            return new GameSchema
            {
                AppId = appId,
                Achievements = achievements,
                Stats = stats
            };
        }

        private static string GetLocalizedString(SAM.Schema.KeyValue kv, string language, string defaultValue)
        {
            var name = kv[language].AsString("");
            if (!string.IsNullOrEmpty(name)) return name;

            if (language != "english")
            {
                name = kv["english"].AsString("");
                if (!string.IsNullOrEmpty(name)) return name;
            }

            name = kv.AsString("");
            return !string.IsNullOrEmpty(name) ? name : defaultValue;
        }
    }
}
