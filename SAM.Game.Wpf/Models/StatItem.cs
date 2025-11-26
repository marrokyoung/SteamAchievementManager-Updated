using System;
using System.ComponentModel;
using System.Globalization;

namespace SAM.Game.Wpf.Models
{
    internal enum StatType
    {
        Int,
        Float
    }

    internal class StatItem : INotifyPropertyChanged, IDataErrorInfo
    {
        private string _value;
        private string _warning;
        private string _error;

        public string Id { get; set; }
        public string DisplayName { get; set; }
        public StatType Type { get; set; }
        public double Min { get; set; }
        public double Max { get; set; }
        public string OriginalValue { get; set; }
        public bool IsProtected { get; set; }
        public bool IsIncrementOnly { get; set; }

        public string Value
        {
            get => _value;
            set
            {
                _warning = null;
                _error = null;

                if (IsProtected && !string.Equals(_value, value, StringComparison.Ordinal))
                {
                    _error = "Stat is protected.";
                    OnPropertyChanged(nameof(Value));
                    OnPropertyChanged(nameof(HasError));
                    OnPropertyChanged(nameof(HasWarning));
                    return;
                }

                if (TryNormalize(value, out string normalized, out string warning, out string error))
                {
                    _value = normalized;
                    _warning = warning;
                    _error = error;
                }
                else
                {
                    _value = value;
                    _error = error;
                }

                OnPropertyChanged(nameof(Value));
                OnPropertyChanged(nameof(HasError));
                OnPropertyChanged(nameof(HasWarning));
                OnPropertyChanged(nameof(IsModified));
                OnPropertyChanged(nameof(Warning));
            }
        }

        public bool HasWarning => string.IsNullOrEmpty(_warning) == false;
        public bool HasError => string.IsNullOrEmpty(_error) == false;
        public string Warning => _warning;
        public bool IsModified => string.Equals(_value, OriginalValue, StringComparison.Ordinal) == false;

        public string Error => _error;
        public string this[string columnName] => columnName == nameof(Value) ? _error : null;

        public event PropertyChangedEventHandler PropertyChanged;

        private bool TryNormalize(string input, out string normalized, out string warning, out string error)
        {
            normalized = input;
            warning = null;
            error = null;

            if (string.IsNullOrWhiteSpace(input))
            {
                error = "Value is required.";
                return false;
            }

            var style = NumberStyles.Float | NumberStyles.AllowThousands;
            var culture = CultureInfo.CurrentCulture;

            switch (Type)
            {
                case StatType.Int:
                    if (int.TryParse(input, style, culture, out int intVal) == false)
                    {
                        error = "Invalid integer value.";
                        return false;
                    }

                    if (IsIncrementOnly && int.TryParse(OriginalValue, style, culture, out int origInt) && intVal < origInt)
                    {
                        error = "Increment-only: cannot decrease.";
                        return false;
                    }

                    int clampedInt = intVal;
                    if (intVal < Min)
                    {
                        clampedInt = (int)Min;
                        warning = $"Clamped to min {Min}.";
                    }
                    else if (intVal > Max)
                    {
                        clampedInt = (int)Max;
                        warning = $"Clamped to max {Max}.";
                    }

                    normalized = clampedInt.ToString(culture);
                    return true;

                case StatType.Float:
                    if (double.TryParse(input, style, culture, out double doubleVal) == false)
                    {
                        error = "Invalid number.";
                        return false;
                    }

                    if (double.IsNaN(doubleVal) || double.IsInfinity(doubleVal))
                    {
                        error = "NaN/Infinity not allowed.";
                        return false;
                    }

                    if (IsIncrementOnly && double.TryParse(OriginalValue, style, culture, out double origDouble) && doubleVal < origDouble)
                    {
                        error = "Increment-only: cannot decrease.";
                        return false;
                    }

                    double clampedDouble = doubleVal;
                    if (doubleVal < Min)
                    {
                        clampedDouble = Min;
                        warning = $"Clamped to min {Min}.";
                    }
                    else if (doubleVal > Max)
                    {
                        clampedDouble = Max;
                        warning = $"Clamped to max {Max}.";
                    }

                    normalized = clampedDouble.ToString(culture);
                    return true;

                default:
                    error = "Unknown stat type.";
                    return false;
            }
        }

        private void OnPropertyChanged(string propertyName)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        }
    }
}
