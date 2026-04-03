using Owin;
using SAM.Service.Middleware;

namespace SAM.Service.Tests.Helpers
{
    /// <summary>
    /// Auth middleware only, followed by a terminal 200 handler.
    /// Isolates middleware behavior from controller routing.
    /// </summary>
    public class AuthOnlyStartup
    {
        public void Configuration(IAppBuilder app)
        {
            app.Use<AuthenticationMiddleware>();

            // Terminal handler: if auth passes, return 200
            app.Run(context =>
            {
                context.Response.StatusCode = 200;
                context.Response.ContentType = "application/json";
                return context.Response.WriteAsync("{\"passed\":true}");
            });
        }
    }
}
