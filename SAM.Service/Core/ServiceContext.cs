namespace SAM.Service.Core
{
    /// <summary>
    /// Singleton service locator for shared dependencies
    /// </summary>
    public static class ServiceContext
    {
        public static SteamClientManager ClientManager { get; private set; }
        public static GameListCache GameListCache { get; private set; }

        public static void Initialize(SteamClientManager clientManager, GameListCache gameListCache)
        {
            ClientManager = clientManager;
            GameListCache = gameListCache;
        }
    }
}
