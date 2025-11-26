using System;
using System.Collections.ObjectModel;
using SAM.Game.Wpf.Models;
using SAM.Game.Wpf.Services;
using System.Threading.Tasks;
using System.Linq;
using System.Collections.Generic;
using System.Windows.Media.Imaging;

namespace SAM.Game.Wpf.ViewModels
{
    internal class MainViewModel : ViewModelBase
    {
        private string _gameTitle = "Sample Game";
        private string _statusMessage = "Ready";
        private bool _isBusy;
        private readonly SteamManagerService _service = new();
        private readonly ImageCacheService _images = new();
        private long _currentAppId;

        public RelayCommand RefreshCommand { get; }
        public RelayCommand StoreCommand { get; }
        public RelayCommand ResetAllCommand { get; }
        public RelayCommand UnlockAllCommand { get; }
        public RelayCommand LockAllCommand { get; }

        public ObservableCollection<AchievementItem> Achievements { get; } = new();
        public ObservableCollection<StatItem> Stats { get; } = new();
        public Dictionary<string, BitmapImage> AchievementIcons { get; } = new();

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

            RefreshCommand = new RelayCommand(async () => await LoadAsync(_currentAppId), () => !_isBusy);
            StoreCommand = new RelayCommand(async () => await StoreAsync(), () => !_isBusy);
            ResetAllCommand = new RelayCommand(async () => await ResetAllAsync(), () => !_isBusy);
            UnlockAllCommand = new RelayCommand(() => BulkSetAchievements(true), () => !_isBusy);
            LockAllCommand = new RelayCommand(() => BulkSetAchievements(false), () => !_isBusy);
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
            _currentAppId = appId;
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
                await LoadAchievementIcons(achievements).ConfigureAwait(true);

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

        private async Task StoreAsync()
        {
            if (_isBusy)
            {
                return;
            }

            IsBusy = true;
            StatusMessage = "Storing changes...";

            try
            {
                await _service.StoreAsync(Achievements, Stats).ConfigureAwait(true);

                // Update originals
                foreach (var ach in Achievements)
                {
                    ach.OriginalUnlocked = ach.Unlocked;
                }

                foreach (var stat in Stats)
                {
                    stat.OriginalValue = stat.Value;
                }

                StatusMessage = "Stored successfully.";
            }
            catch (Exception ex)
            {
                StatusMessage = $"Store failed: {ex.Message}";
            }
            finally
            {
                IsBusy = false;
            }
        }

        private async Task ResetAllAsync()
        {
            if (_isBusy)
            {
                return;
            }

            IsBusy = true;
            StatusMessage = "Resetting stats/achievements...";

            try
            {
                await _service.ResetAllAsync(true).ConfigureAwait(true);
                await LoadAsync(_currentAppId).ConfigureAwait(true);
                StatusMessage = "Reset complete.";
            }
            catch (Exception ex)
            {
                StatusMessage = $"Reset failed: {ex.Message}";
            }
            finally
            {
                IsBusy = false;
            }
        }

        private void BulkSetAchievements(bool unlocked)
        {
            foreach (var ach in Achievements)
            {
                ach.Unlocked = unlocked;
            }
        }

        private async Task LoadAchievementIcons(IEnumerable<AchievementItem> achievements)
        {
            foreach (var ach in achievements)
            {
                // Prefer the normal icon if present
                var iconUrl = string.IsNullOrWhiteSpace(ach.IconUrl) ? null : ach.IconUrl;
                if (string.IsNullOrWhiteSpace(iconUrl))
                {
                    continue;
                }

                var img = await _images.GetAsync(iconUrl, maxBytes: API.SecurityConfig.MAX_ICON_SIZE_BYTES).ConfigureAwait(true);
                if (img != null)
                {
                    AchievementIcons[ach.Id] = img;
                }
            }
        }
    }
}
