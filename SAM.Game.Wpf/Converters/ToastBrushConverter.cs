using System;
using System.Globalization;
using System.Windows.Data;
using System.Windows.Media;

namespace SAM.Game.Wpf.Converters
{
    internal class ToastBrushConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            var severity = value as string;
            return severity switch
            {
                "success" => new SolidColorBrush(Color.FromRgb(63, 185, 80)),
                "error" => new SolidColorBrush(Color.FromRgb(248, 81, 73)),
                _ => new SolidColorBrush(Color.FromRgb(64, 128, 255))
            };
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) => throw new NotSupportedException();
    }
}
