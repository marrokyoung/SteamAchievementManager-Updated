using System;
using System.Collections.Generic;
using SAM.API;
using SAM.Service.Models;

namespace SAM.Service.Core
{
    public class GameListCache : IDisposable
    {
        private class CacheEntry
        {
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

            if (forceRefresh || entry.Games == null || isStale)
            {
                entry.Games = GameListService.DownloadAndParseGameList(client, includeUnowned);
                entry.LastRefresh = DateTime.UtcNow;
            }

            return entry.Games;
        }

        public void Dispose()
        {
            _cache.Clear();
        }
    }
}
