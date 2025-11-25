using System;
using System.Collections.ObjectModel;
using SAM.Game.Wpf.Models;
using SAM.Game.Wpf.Services;
using System.Threading.Tasks;

namespace SAM.Game.Wpf.ViewModels
{
    internal class MainViewModel : ViewModelBase
    {
        private string _gameTitle = "Sample Game";
        private string _statusMessage = "Ready";
        private bool _isBusy;
        private readonly SteamManagerService _service = new();

        public ObservableCollection<AchievementItem> Achievements { get; } = new();
        public ObservableCollection<StatItem> Stats { get; } = new();

        public string GameTitle
        {
            get => _gameTitle;
            set => SetProperty(ref _gameTitle, value);
        }

        public string StatusMessage
        {
            get => _statusMessage;
            set => SetProperty(ref _statusMessage, value);
        }

        public bool IsBusy
        {
            get => _isBusy;
            set => SetProperty(ref _isBusy, value);
        }

        public MainViewModel()
        {
            SeedDesignData();
        }

        private void SeedDesignData()
        {
            Achievements.Add(new AchievementItem { Id = "ACH_1", Name = "First Steps", Description = "Complete the tutorial", Unlocked = true });
            Achievements.Add(new AchievementItem { Id = "ACH_2", Name = "Explorer", Description = "Discover all regions", Unlocked = false });
            Achievements.Add(new AchievementItem { Id = "ACH_3", Name = "Collector", Description = "Collect 100 items", Unlocked = false });

            Stats.Add(new StatItem { Id = "STAT_KILLS", DisplayName = "Total Kills", Value = "1200", IsIncrementOnly = true });
            Stats.Add(new StatItem { Id = "STAT_WINS", DisplayName = "Wins", Value = "35" });
            Stats.Add(new StatItem { Id = "STAT_TIME", DisplayName = "Playtime (hrs)", Value = "86.4", IsProtected = false });
        }

        public async Task LoadAsync(long appId)
        {
            IsBusy = true;
            StatusMessage = "Connecting to Steam...";

            try
            {
                await _service.InitializeAsync(appId).ConfigureAwait(true);

                var name = _service.GetGameName((uint)appId);
                if (!string.IsNullOrWhiteSpace(name))
                {
                    GameTitle = name;
                }

                StatusMessage = "Loading achievements and stats...";
                var (achievements, stats) = await _service.LoadAsync().ConfigureAwait(true);

                Achievements.Clear();
                foreach (var a in achievements)
                {
                    Achievements.Add(a);
                }

                Stats.Clear();
                foreach (var s in stats)
                {
                    Stats.Add(s);
                }

                StatusMessage = $"Loaded {Achievements.Count} achievements.";
            }
            catch (Exception ex)
            {
                StatusMessage = $"Failed to load: {ex.Message}";
            }
            finally
            {
                IsBusy = false;
            }
        }
    }
}
