using System.Windows;

namespace SAM.Game.Wpf.Views
{
    public partial class MainWindow : Window
    {
        public MainWindow()
        {
            InitializeComponent();
        }

        private async void OnLoaded(object sender, RoutedEventArgs e)
        {
            if (DataContext is ViewModels.MainViewModel vm)
            {
                // TODO: pass real appId; using placeholder 480 for now
                await vm.LoadAsync(480);
            }
        }
    }
}
