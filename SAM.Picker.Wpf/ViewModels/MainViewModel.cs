using System;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Globalization;
using System.Threading.Tasks;
using System.Windows.Data;
using SAM.Picker.Wpf.Models;
using SAM.Picker.Wpf.Services;

namespace SAM.Picker.Wpf.ViewModels
{
    internal class MainViewModel : ViewModelBase
    {
        private readonly SteamPickerService _service = new();
        private string _searchText;
        private bool _isLoading;
        private string _status = "Ready";
        private bool _showNormal = true;
        private bool _showDemo = true;
        private bool _showMod = true;
        private bool _showJunk = true;

        public ObservableCollection<GameItem> Games { get; } = new();
        public ICollectionView FilteredGames { get; }

        public string SearchText
        {
            get => _searchText;
            set
            {
                SetProperty(ref _searchText, value);
                FilteredGames.Refresh();
            }
        }

        public bool IsLoading
        {
            get => _isLoading;
            set => SetProperty(ref _isLoading, value);
        }

        public string Status
        {
            get => _status;
            set => SetProperty(ref _status, value);
        }

        public bool ShowNormal
        {
            get => _showNormal;
            set
            {
                SetProperty(ref _showNormal, value);
                FilteredGames.Refresh();
            }
        }

        public bool ShowDemo
        {
            get => _showDemo;
            set
            {
                SetProperty(ref _showDemo, value);
                FilteredGames.Refresh();
            }
        }

        public bool ShowMod
        {
            get => _showMod;
            set
            {
                SetProperty(ref _showMod, value);
                FilteredGames.Refresh();
            }
        }

        public bool ShowJunk
        {
            get => _showJunk;
            set
            {
                SetProperty(ref _showJunk, value);
                FilteredGames.Refresh();
            }
        }

        public MainViewModel()
        {
            var view = CollectionViewSource.GetDefaultView(Games);
            view.Filter = FilterGame;
            FilteredGames = view;
        }

        public async Task LoadAsync()
        {
            try
            {
                IsLoading = true;
                Status = "Connecting to Steam...";

                await _service.InitializeAsync().ConfigureAwait(true);

                Status = "Loading owned games...";
                var games = await _service.GetOwnedGamesAsync().ConfigureAwait(true);

                Games.Clear();
                foreach (var game in games)
                {
                    Games.Add(game);
                }

                FilteredGames.Refresh();
                Status = $"Loaded {Games.Count.ToString(CultureInfo.InvariantCulture)} games.";
            }
            catch (Exception ex)
            {
                Status = $"Failed to load games: {ex.Message}";
            }
            finally
            {
                IsLoading = false;
            }
        }

        private bool FilterGame(object obj)
        {
            if (obj is not GameItem game)
            {
                return false;
            }

            // Type filters
            bool typeAllowed = game.Type switch
            {
                "normal" => ShowNormal,
                "demo" => ShowDemo,
                "mod" => ShowMod,
                "junk" => ShowJunk,
                _ => true
            };

            if (!typeAllowed)
            {
                return false;
            }

            if (string.IsNullOrWhiteSpace(SearchText))
            {
                return true;
            }

            return game.Name?.IndexOf(SearchText, StringComparison.OrdinalIgnoreCase) >= 0;
        }
    }
}
