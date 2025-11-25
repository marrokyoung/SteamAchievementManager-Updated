using System;
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
                long appId = 480;
                var args = Environment.GetCommandLineArgs();
                if (args.Length > 1 && long.TryParse(args[1], out long parsed))
                {
                    appId = parsed;
                }
                await vm.LoadAsync(appId);
            }
        }
    }
}
