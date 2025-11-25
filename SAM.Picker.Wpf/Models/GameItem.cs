namespace SAM.Picker.Wpf.Models
{
    internal class GameItem
    {
        public uint Id { get; set; }
        public string Name { get; set; }
        public string Type { get; set; }
        public string ImageUrl { get; set; }
        public bool Owned { get; set; }
    }
}
