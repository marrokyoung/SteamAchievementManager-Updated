namespace SAM.Service.Models
{
    public class StatDefinitionDto
    {
        public string Id { get; set; }
        public string DisplayName { get; set; }
        public string Type { get; set; } // "int" or "float"
        public object MinValue { get; set; }
        public object MaxValue { get; set; }
        public bool IncrementOnly { get; set; }
        public object DefaultValue { get; set; }
        public int Permission { get; set; }
    }
}
