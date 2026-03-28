namespace SAM.Service.Models
{
    public class GameDto
    {
        public uint Id { get; set; }
        public string Name { get; set; }
        public string Type { get; set; }
        public string ImageUrl { get; set; }
        public string ImageType { get; set; }  // "logo", "capsule", or null for standard images
        public bool Owned { get; set; }
    }
}
