namespace SAM.Service.Models
{
    public class ErrorResponse
    {
        public string Error { get; set; }
        public string Message { get; set; }
        public int StatusCode { get; set; }

        // Optional: only present for initialization errors
        public string ErrorCode { get; set; }
        public bool? Recoverable { get; set; }
    }
}
