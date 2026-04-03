using System.Threading.Tasks;

namespace SAM.Service.Core
{
    /// <summary>
    /// Abstraction over SteamClientManager for testability.
    /// </summary>
    public interface ISteamClientManager
    {
        void InitializeForApp(long appId);
        ISteamClientFacade GetClient();
        /// <summary>
        /// Returns the raw API.Client for operations that need the full client
        /// (e.g., GameListCache). Prefer GetClient() for testable code paths.
        /// </summary>
        API.Client GetRawClient();
        Task<API.Types.UserStatsReceived> RequestUserStatsAsync(ulong steamId, int timeoutMs = 5000);
        GameSchema GetSchema(long appId);
    }
}
