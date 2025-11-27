using System;
using System.Collections.Concurrent;

namespace SAM.Service.Core
{
    public class SchemaCache : IDisposable
    {
        private readonly ConcurrentDictionary<long, GameSchema> _cache = new();

        public GameSchema GetOrLoad(long appId, Func<GameSchema> loader)
        {
            return _cache.GetOrAdd(appId, _ => loader());
        }

        public void Invalidate(long appId)
        {
            _cache.TryRemove(appId, out _);
        }

        public void Dispose()
        {
            _cache.Clear();
        }
    }
}
