using System;
using System.Globalization;
using System.Windows.Data;

namespace SAM.Picker.Wpf.Converters
{
    internal class BoolToOwnedTextConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            return value is bool owned && owned ? "Owned" : "Not Owned";
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        {
            throw new NotSupportedException();
        }
    }
}
