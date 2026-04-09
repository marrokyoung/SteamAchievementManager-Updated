using System.Collections.Generic;

namespace SAM.Service.Models
{
    public class GameListResponse
    {
        public List<GameDto> Games { get; set; }
        public bool LibraryReady { get; set; }
    }
}
