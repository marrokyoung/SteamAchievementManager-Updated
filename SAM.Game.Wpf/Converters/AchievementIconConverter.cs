using System;
using System.Globalization;
using System.Windows;
using System.Windows.Data;
using System.Windows.Media.Imaging;
using SAM.Game.Wpf.ViewModels;

namespace SAM.Game.Wpf.Converters
{
    internal class AchievementIconConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value is not string id)
            {
                return DependencyProperty.UnsetValue;
            }

            if (parameter is not DependencyObject dep)
            {
                return DependencyProperty.UnsetValue;
            }

            var window = Window.GetWindow(dep);
            if (window?.DataContext is MainViewModel vm && vm.AchievementIcons.TryGetValue(id, out BitmapImage img))
            {
                return img;
            }

            return DependencyProperty.UnsetValue;
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) => throw new NotSupportedException();
    }
}
