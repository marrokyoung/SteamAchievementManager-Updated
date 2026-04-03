namespace SAM.Service.Models
{
    public class StatDto
    {
        public string Id { get; set; }
        public string DisplayName { get; set; }
        public string Type { get; set; } // "int" or "float"
        public object Value { get; set; }
        public object MinValue { get; set; }
        public object MaxValue { get; set; }
        public bool IncrementOnly { get; set; }
        public bool IsProtected { get; set; }
    }
}
