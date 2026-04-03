using System.Collections.Generic;
using SAM.Service.Models;

namespace SAM.Service.Core
{
    public class GameSchema
    {
        public long AppId { get; set; }
        public List<AchievementDefinitionDto> Achievements { get; set; }
        public List<StatDefinitionDto> Stats { get; set; }
    }
}
