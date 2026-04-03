using SAM.API;

namespace SAM.Service.Core
{
    /// <summary>
    /// Wraps a real API.Client, delegating each call to the appropriate sub-object.
    /// </summary>
    public class SteamClientFacade : ISteamClientFacade
    {
        private readonly Client _client;

        public SteamClientFacade(Client client)
        {
            _client = client;
        }

        public string GetAppName(uint appId)
            => _client.SteamApps001.GetAppData(appId, "name");

        public ulong GetSteamId()
            => _client.SteamUser.GetSteamId();

        public bool GetAchievementAndUnlockTime(string name, out bool isAchieved, out uint unlockTime)
            => _client.SteamUserStats.GetAchievementAndUnlockTime(name, out isAchieved, out unlockTime);

        public bool SetAchievement(string name, bool state)
            => _client.SteamUserStats.SetAchievement(name, state);

        public bool GetStatValue(string name, out int value)
            => _client.SteamUserStats.GetStatValue(name, out value);

        public bool GetStatValue(string name, out float value)
            => _client.SteamUserStats.GetStatValue(name, out value);

        public bool SetStatValue(string name, int value)
            => _client.SteamUserStats.SetStatValue(name, value);

        public bool SetStatValue(string name, float value)
            => _client.SteamUserStats.SetStatValue(name, value);

        public bool StoreStats()
            => _client.SteamUserStats.StoreStats();

        public bool ResetAllStats(bool achievementsToo)
            => _client.SteamUserStats.ResetAllStats(achievementsToo);
    }
}
