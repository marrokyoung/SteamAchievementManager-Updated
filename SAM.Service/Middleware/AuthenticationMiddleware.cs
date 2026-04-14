using System;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Owin;

namespace SAM.Service.Middleware
{
    public class AuthenticationMiddleware : OwinMiddleware
    {
        private const string API_TOKEN_HEADER = "X-SAM-Auth";
        private readonly string _expectedToken;
        private readonly string _expectedTokenFingerprint;
        private readonly string _serviceInstanceId;

        public AuthenticationMiddleware(OwinMiddleware next) : base(next)
        {
            // Read from environment variable (required)
            _expectedToken = Environment.GetEnvironmentVariable("SAM_API_TOKEN");
            _expectedTokenFingerprint = TokenFingerprint(_expectedToken);
            _serviceInstanceId = Environment.GetEnvironmentVariable("SAM_SERVICE_INSTANCE_ID") ?? "unknown";

            if (string.IsNullOrEmpty(_expectedToken))
            {
                throw new InvalidOperationException(
                    "SAM_API_TOKEN environment variable must be set. " +
                    "Example: set SAM_API_TOKEN=your-secret-token-here");
            }

            Console.WriteLine($"API authentication enabled (instance={_serviceInstanceId}, token={_expectedTokenFingerprint})");
        }

        public override async Task Invoke(IOwinContext context)
        {
            var path = context.Request.Path.Value;
            var method = context.Request.Method;

            // Skip auth for health check
            if (path == "/health")
            {
                await Next.Invoke(context);
                return;
            }

            // Skip auth for game image endpoints (public art; <img> cannot send headers)
            // Includes both /image and /logo endpoints
            if (method == "GET" &&
                path?.StartsWith("/api/games/", StringComparison.OrdinalIgnoreCase) == true)
            {
                if (path.EndsWith("/image", StringComparison.OrdinalIgnoreCase) ||
                    path.EndsWith("/logo", StringComparison.OrdinalIgnoreCase))
                {
                    await Next.Invoke(context);
                    return;
                }
            }

            var token = context.Request.Headers.Get(API_TOKEN_HEADER);
            if (string.IsNullOrEmpty(token) || token != _expectedToken)
            {
                Console.WriteLine(
                    $"Auth failed instance={_serviceInstanceId} method={method} path={path} " +
                    $"expected={_expectedTokenFingerprint} actual={TokenFingerprint(token)}");
                context.Response.StatusCode = 401;
                context.Response.ContentType = "application/json";
                await context.Response.WriteAsync("{\"error\":\"Unauthorized\",\"message\":\"Missing or invalid auth token\"}");
                return;
            }

            await Next.Invoke(context);
        }

        private static string TokenFingerprint(string token)
        {
            if (string.IsNullOrEmpty(token))
            {
                return "missing";
            }

            using (var sha256 = SHA256.Create())
            {
                var bytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(token));
                return BitConverter.ToString(bytes, 0, 4).Replace("-", "").ToLowerInvariant();
            }
        }
    }
}
