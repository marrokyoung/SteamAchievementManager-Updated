using System.Collections.ObjectModel;
using SAM.Picker.Wpf.Models;

namespace SAM.Picker.Wpf.ViewModels
{
    internal class MainViewModel : ViewModelBase
    {
        private string _searchText;
        private bool _isLoading;

        public ObservableCollection<GameItem> Games { get; } = new();

        public string SearchText
        {
            get => _searchText;
            set => SetProperty(ref _searchText, value);
        }

        public bool IsLoading
        {
            get => _isLoading;
            set => SetProperty(ref _isLoading, value);
        }

        public MainViewModel()
        {
            SeedDesignData();
        }

        private void SeedDesignData()
        {
            Games.Add(new GameItem { Id = 480, Name = "Spacewar", Type = "normal", Owned = true });
            Games.Add(new GameItem { Id = 730, Name = "Counter-Strike 2", Type = "normal", Owned = true });
            Games.Add(new GameItem { Id = 570, Name = "Dota 2", Type = "normal", Owned = true });
            Games.Add(new GameItem { Id = 440, Name = "Team Fortress 2", Type = "normal", Owned = true });
            Games.Add(new GameItem { Id = 578080, Name = "PUBG: Battlegrounds", Type = "normal", Owned = false });
            Games.Add(new GameItem { Id = 550, Name = "Left 4 Dead 2", Type = "normal", Owned = true });
        }
    }
}
