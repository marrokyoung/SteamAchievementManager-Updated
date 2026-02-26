using System;
using System.Collections.Generic;
using SAM.API;
using SAM.Service.Models;

namespace SAM.Service.Core
{
    public class GameListCache : IDisposable
    {
        // Cache version - increment when GameDto schema changes or image selection logic changes
        private const int CACHE_VERSION = 6; // Bumped after store metadata fallback for demo detection

        private class CacheEntry
        {
            public int Version { get; set; }
            public List<GameDto> Games { get; set; }
            public DateTime LastRefresh { get; set; }
        }

        private readonly Dictionary<bool, CacheEntry> _cache = new Dictionary<bool, CacheEntry>();
        private const int SOFT_TTL_HOURS = 12;

        public List<GameDto> GetGames(Client client, bool includeUnowned, bool forceRefresh)
        {
            if (!_cache.TryGetValue(includeUnowned, out var entry))
            {
                entry = new CacheEntry();
                _cache[includeUnowned] = entry;
            }

            bool isStale = (DateTime.UtcNow - entry.LastRefresh).TotalHours > SOFT_TTL_HOURS;

            // Check cache version - invalidate if mismatched
            if (entry.Version != CACHE_VERSION && entry.Games != null)
            {
                SecurityLogger.Log(LogLevel.Info, LogContext.Cache,
                    $"Cache version mismatch ({entry.Version} vs {CACHE_VERSION}), invalidating");
                entry.Games = null;
                forceRefresh = true;
            }

            if (forceRefresh || entry.Games == null || isStale)
            {
                entry.Games = GameListService.DownloadAndParseGameList(client, includeUnowned);
                entry.LastRefresh = DateTime.UtcNow;
                entry.Version = CACHE_VERSION;
            }

            return entry.Games;
        }

        public void Dispose()
        {
            _cache.Clear();
        }
    }
}
