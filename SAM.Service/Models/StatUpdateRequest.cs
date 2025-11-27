using System.Collections.Generic;

namespace SAM.Service.Models
{
    public class StatUpdateRequest
    {
        public List<StatUpdate> Updates { get; set; }
    }

    public class StatUpdate
    {
        public string Id { get; set; }
        public object Value { get; set; } // int or float
    }
}
