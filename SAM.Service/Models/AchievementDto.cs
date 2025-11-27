using System;

namespace SAM.Service.Models
{
    public class AchievementDto
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public string Description { get; set; }
        public bool IsAchieved { get; set; }
        public DateTime? UnlockTime { get; set; }
        public string IconNormal { get; set; }
        public string IconLocked { get; set; }
        public bool IsHidden { get; set; }
        public bool IsProtected { get; set; }
    }
}
