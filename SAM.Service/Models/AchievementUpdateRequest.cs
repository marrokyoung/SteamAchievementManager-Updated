using System.Collections.Generic;

namespace SAM.Service.Models
{
    public class AchievementUpdateRequest
    {
        public List<AchievementUpdate> Updates { get; set; }
    }

    public class AchievementUpdate
    {
        public string Id { get; set; }
        public bool Unlocked { get; set; }
    }
}
