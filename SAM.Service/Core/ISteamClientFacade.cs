namespace SAM.Service.Core
{
    /// <summary>
    /// Thin abstraction over the Steam Client operations that SteamController uses.
    /// Enables mocking without native Steam interop.
    /// </summary>
    public interface ISteamClientFacade
    {
        string GetAppName(uint appId);
        ulong GetSteamId();
        bool GetAchievementAndUnlockTime(string name, out bool isAchieved, out uint unlockTime);
        bool SetAchievement(string name, bool state);
        bool GetStatValue(string name, out int value);
        bool GetStatValue(string name, out float value);
        bool SetStatValue(string name, int value);
        bool SetStatValue(string name, float value);
        bool StoreStats();
        bool ResetAllStats(bool achievementsToo);
    }
}
