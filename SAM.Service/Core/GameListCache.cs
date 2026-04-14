using System;
using System.Collections.Generic;
using System.Linq;
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

        // Stabilization state: require two consecutive scans with the same owned-ID set
        // before caching results.  Prevents partial libraries from being locked in when
        // Steam is still loading subscriptions during a cold start.
        private readonly object _lock = new();
        private HashSet<uint> _previousOwnedIds;
        private bool _stabilized;

        public GameListResponse GetGames(Client client, bool includeUnowned, bool forceRefresh)
        {
            lock (_lock)
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

                // Serve from cache if valid. Owned-only results must still be
                // stabilized; if stabilization was reset, fetch a fresh scan.
                if (!forceRefresh && entry.Games != null && !isStale &&
                    (includeUnowned || _stabilized))
                {
                    return new GameListResponse { Games = entry.Games, LibraryReady = true };
                }

                // Fresh scan needed
                var result = GameListService.DownloadAndParseGameList(client, includeUnowned);

                // Only the owned-games library can come back partially populated while Steam
                // is still loading subscriptions. For includeUnowned=true, we don't need the
                // two-scan stabilization check, so cache and return the result immediately.
                if (includeUnowned)
                {
                    entry.Games = result;
                    entry.LastRefresh = DateTime.UtcNow;
                    entry.Version = CACHE_VERSION;
                    return new GameListResponse { Games = result, LibraryReady = true };
                }

                // Don't cache empty owned-games results — Steam may not have finished
                // loading subscriptions yet.
                if (result.Count == 0)
                {
                    SecurityLogger.Log(LogLevel.Info, LogContext.Cache,
                        "Empty owned-games result not cached (Steam may still be loading subscriptions)");
                    _previousOwnedIds = null;
                    _stabilized = false; // Force re-stabilization after Steam outage
                    return new GameListResponse { Games = result, LibraryReady = false };
                }

                // Stabilization: compare owned IDs across consecutive scans
                var currentOwnedIds = new HashSet<uint>(result.Where(g => g.Owned).Select(g => g.Id));

                // If already stabilized, only keep treating a forced/stale scan as ready
                // when it still matches the last cached stable owned-ID set. Otherwise,
                // re-enter the two-scan stabilization flow instead of caching a possible
                // partial library.
                if (_stabilized)
                {
                    var stableOwnedIds = entry.Games != null
                        ? new HashSet<uint>(entry.Games.Where(g => g.Owned).Select(g => g.Id))
                        : null;

                    if (stableOwnedIds != null && stableOwnedIds.SetEquals(currentOwnedIds))
                    {
                        entry.Games = result;
                        entry.LastRefresh = DateTime.UtcNow;
                        entry.Version = CACHE_VERSION;
                        return new GameListResponse { Games = result, LibraryReady = true };
                    }

                    SecurityLogger.Log(LogLevel.Info, LogContext.Cache,
                        $"Library changed during refresh: previous={stableOwnedIds?.Count ?? 0}, current={currentOwnedIds.Count} owned apps; re-stabilizing");
                    _stabilized = false;
                    _previousOwnedIds = currentOwnedIds;
                    return new GameListResponse { Games = result, LibraryReady = false };
                }

                if (_previousOwnedIds == null)
                {
                    // First scan — store IDs, don't cache yet
                    _previousOwnedIds = currentOwnedIds;
                    SecurityLogger.Log(LogLevel.Info, LogContext.Cache,
                        $"Library stabilization: first scan observed {currentOwnedIds.Count} owned apps");
                    return new GameListResponse { Games = result, LibraryReady = false };
                }

                if (_previousOwnedIds.SetEquals(currentOwnedIds))
                {
                    // Consecutive scans match — library is stable, cache it
                    _stabilized = true;
                    entry.Games = result;
                    entry.LastRefresh = DateTime.UtcNow;
                    entry.Version = CACHE_VERSION;
                    SecurityLogger.Log(LogLevel.Info, LogContext.Cache,
                        $"Library stabilized with {currentOwnedIds.Count} owned apps, caching");
                    return new GameListResponse { Games = result, LibraryReady = true };
                }

                // Scans differ — Steam still loading, update tracking set
                SecurityLogger.Log(LogLevel.Info, LogContext.Cache,
                    $"Library not stable: previous={_previousOwnedIds.Count}, current={currentOwnedIds.Count} owned apps");
                _previousOwnedIds = currentOwnedIds;
                return new GameListResponse { Games = result, LibraryReady = false };
            }
        }

        public void Dispose()
        {
            lock (_lock)
            {
                _cache.Clear();
                _previousOwnedIds = null;
                _stabilized = false;
            }
        }
    }
}
