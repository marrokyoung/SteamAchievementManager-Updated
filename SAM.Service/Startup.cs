using System.Web.Http;
using Microsoft.Owin;
using Microsoft.Owin.Cors;
using Newtonsoft.Json.Serialization;
using Owin;
using SAM.Service.Middleware;

[assembly: OwinStartup(typeof(SAM.Service.Startup))]

namespace SAM.Service
{
    public class Startup
    {
        public void Configuration(IAppBuilder app)
        {
            var config = new HttpConfiguration();

            // Enable attribute routing
            config.MapHttpAttributeRoutes();

            // JSON formatter configuration (camelCase, no XML)
            var jsonFormatter = config.Formatters.JsonFormatter;
            jsonFormatter.SerializerSettings.ContractResolver =
                new CamelCasePropertyNamesContractResolver();
            jsonFormatter.SerializerSettings.NullValueHandling =
                Newtonsoft.Json.NullValueHandling.Ignore;
            config.Formatters.Remove(config.Formatters.XmlFormatter);

            // CORS FIRST: allow localhost and Electron file://
            app.UseCors(CorsOptions.AllowAll);

            // THEN Auth middleware (checks X-SAM-Auth header, skips /health)
            app.Use<AuthenticationMiddleware>();

            // FINALLY Web API
            app.UseWebApi(config);
        }
    }
}
