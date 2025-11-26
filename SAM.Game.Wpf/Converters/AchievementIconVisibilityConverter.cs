using System;
using System.Globalization;
using System.Windows;
using System.Windows.Data;
using SAM.Game.Wpf.ViewModels;

namespace SAM.Game.Wpf.Converters
{
    internal class AchievementIconVisibilityConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value is not string id)
            {
                return Visibility.Collapsed;
            }

            if (parameter is not DependencyObject dep)
            {
                return Visibility.Collapsed;
            }

            var window = Window.GetWindow(dep);
            if (window?.DataContext is MainViewModel vm && vm.AchievementIcons.ContainsKey(id))
            {
                return Visibility.Visible;
            }

            return Visibility.Collapsed;
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) => throw new NotSupportedException();
    }
}
