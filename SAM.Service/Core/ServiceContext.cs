namespace SAM.Service.Core
{
    /// <summary>
    /// Singleton service locator for shared dependencies
    /// </summary>
    public static class ServiceContext
    {
        public static SteamClientManager ClientManager { get; private set; }
        public static GameListCache GameListCache { get; private set; }
        public static long? ForcedAppId { get; private set; }

        public static void Initialize(SteamClientManager clientManager, GameListCache gameListCache, long? forcedAppId = null)
        {
            ClientManager = clientManager;
            GameListCache = gameListCache;
            ForcedAppId = forcedAppId;
        }
    }
}
