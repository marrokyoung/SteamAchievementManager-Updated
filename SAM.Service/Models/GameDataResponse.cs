using System.Collections.Generic;

namespace SAM.Service.Models
{
    public class GameDataResponse
    {
        public long AppId { get; set; }
        public string GameName { get; set; }
        public List<AchievementDto> Achievements { get; set; }
        public List<StatDto> Stats { get; set; }
    }
}
