using System;
using System.Threading.Tasks;
using Microsoft.Owin;

namespace SAM.Service.Middleware
{
    public class AuthenticationMiddleware : OwinMiddleware
    {
        private const string API_TOKEN_HEADER = "X-SAM-Auth";
        private readonly string _expectedToken;

        public AuthenticationMiddleware(OwinMiddleware next) : base(next)
        {
            // Read from environment variable (required)
            _expectedToken = Environment.GetEnvironmentVariable("SAM_API_TOKEN");

            if (string.IsNullOrEmpty(_expectedToken))
            {
                throw new InvalidOperationException(
                    "SAM_API_TOKEN environment variable must be set. " +
                    "Example: set SAM_API_TOKEN=your-secret-token-here");
            }

            Console.WriteLine("API authentication enabled");
        }

        public override async Task Invoke(IOwinContext context)
        {
            // Skip auth for health check
            if (context.Request.Path.Value == "/health")
            {
                await Next.Invoke(context);
                return;
            }

            var token = context.Request.Headers.Get(API_TOKEN_HEADER);
            if (string.IsNullOrEmpty(token) || token != _expectedToken)
            {
                context.Response.StatusCode = 401;
                context.Response.ContentType = "application/json";
                await context.Response.WriteAsync("{\"error\":\"Unauthorized\",\"message\":\"Missing or invalid auth token\"}");
                return;
            }

            await Next.Invoke(context);
        }
    }
}
