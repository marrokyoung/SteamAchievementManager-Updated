using System;
using System.Windows;
using System.Windows.Input;

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

        private void OnMinimizeClick(object sender, RoutedEventArgs e)
        {
            WindowState = WindowState.Minimized;
        }

        private void OnMaximizeClick(object sender, RoutedEventArgs e)
        {
            WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;
        }

        private void OnCloseClick(object sender, RoutedEventArgs e)
        {
            Close();
        }

        private void OnTitleBarMouseDown(object sender, MouseButtonEventArgs e)
        {
            if (e.ChangedButton == MouseButton.Left)
            {
                if (e.ClickCount == 2)
                {
                    OnMaximizeClick(sender, e);
                }
                else
                {
                    DragMove();
                }
            }
        }
    }
}
