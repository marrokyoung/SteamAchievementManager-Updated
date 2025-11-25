using System;
using System.Collections.Generic;
using System.Globalization;
using System.Threading.Tasks;
using SAM.API;
using SAM.API.Callbacks;
using SAM.Game.Wpf.Models;

namespace SAM.Game.Wpf.Services
{
    internal sealed class SteamManagerService : IDisposable
    {
        private readonly Client _client = new();
        private bool _initialized;

        public async Task InitializeAsync(long appId)
        {
            if (_initialized)
            {
                return;
            }

            await Task.Run(() =>
            {
                _client.Initialize(appId);
            }).ConfigureAwait(false);

            _initialized = true;
        }

        public string GetGameName(uint appId)
        {
            return _client.SteamApps001.GetAppData(appId, "name");
        }

        public async Task<(IReadOnlyList<AchievementItem> achievements, IReadOnlyList<StatItem> stats)> LoadAsync()
        {
            if (!_initialized)
            {
                throw new InvalidOperationException("Service not initialized.");
            }

            return await Task.Run(() =>
            {
                var achievements = new List<AchievementItem>();
                var stats = new List<StatItem>();

                // Request current stats
                var steamId = _client.SteamUser.GetSteamId();
                var callHandle = _client.SteamUserStats.RequestUserStats(steamId);
                if (callHandle == CallHandle.Invalid)
                {
                    throw new InvalidOperationException("Failed to request user stats.");
                }

                // Pump callbacks until received
                bool received = false;
                var receivedCallback = _client.CreateAndRegisterCallback<UserStatsReceived>();
                receivedCallback.OnRun += _ =>
                {
                    received = true;
                };

                int waitMs = 0;
                while (!received && waitMs < 5000)
                {
                    _client.RunCallbacks(false);
                    System.Threading.Thread.Sleep(50);
                    waitMs += 50;
                }

                if (!received)
                {
                    throw new TimeoutException("Timed out waiting for stats.");
                }

                // Achievements
                int achievementCount = _client.SteamUserStats.GetNumAchievements();
                for (int i = 0; i < achievementCount; i++)
                {
                    string id = _client.SteamUserStats.GetAchievementName((uint)i);
                    if (string.IsNullOrWhiteSpace(id))
                    {
                        continue;
                    }

                    if (_client.SteamUserStats.GetAchievementAndUnlockTime(id, out bool unlocked, out var unlockTime) == false)
                    {
                        continue;
                    }

                    achievements.Add(new AchievementItem
                    {
                        Id = id,
                        Name = id,
                        Description = string.Empty,
                        Unlocked = unlocked,
                        UnlockTime = unlockTime > 0 ? DateTimeOffset.FromUnixTimeSeconds(unlockTime).LocalDateTime.ToString(CultureInfo.CurrentCulture) : string.Empty
                    });
                }

                // Stats: schema parsing needed to enumerate; placeholder keeps list empty for now

                return ((IReadOnlyList<AchievementItem>)achievements, (IReadOnlyList<StatItem>)stats);
            }).ConfigureAwait(false);
        }

        public void Dispose()
        {
            _client.Dispose();
        }
    }
}
