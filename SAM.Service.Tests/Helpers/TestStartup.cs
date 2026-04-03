using System.Web.Http;
using Microsoft.Owin.Cors;
using Newtonsoft.Json.Serialization;
using Owin;
using SAM.Service.Middleware;

namespace SAM.Service.Tests.Helpers
{
    /// <summary>
    /// Mirrors the production Startup.Configuration() exactly:
    /// CORS -> AuthMiddleware -> WebAPI with camelCase JSON.
    /// </summary>
    public class TestStartup
    {
        public void Configuration(IAppBuilder app)
        {
            var config = new HttpConfiguration();

            config.MapHttpAttributeRoutes();

            var jsonFormatter = config.Formatters.JsonFormatter;
            jsonFormatter.SerializerSettings.ContractResolver =
                new CamelCasePropertyNamesContractResolver();
            jsonFormatter.SerializerSettings.NullValueHandling =
                Newtonsoft.Json.NullValueHandling.Ignore;
            config.Formatters.Remove(config.Formatters.XmlFormatter);

            app.UseCors(CorsOptions.AllowAll);
            app.Use<AuthenticationMiddleware>();
            app.UseWebApi(config);
        }
    }
}
