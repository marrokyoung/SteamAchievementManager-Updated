namespace SAM.Service.Models
{
    public class AchievementDefinitionDto
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public string Description { get; set; }
        public string IconNormal { get; set; }
        public string IconLocked { get; set; }
        public bool IsHidden { get; set; }
        public int Permission { get; set; }
    }
}
