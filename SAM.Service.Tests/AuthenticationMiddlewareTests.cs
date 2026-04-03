using System;
using System.Net;
using System.Net.Http;
using System.Threading.Tasks;
using Microsoft.Owin.Testing;
using SAM.Service.Tests.Helpers;
using Xunit;

[assembly: Xunit.CollectionBehavior(DisableTestParallelization = true)]

namespace SAM.Service.Tests
{
    public class AuthenticationMiddlewareTests : IDisposable
    {
        private const string TestToken = "test-token-123";
        private readonly TestServer _server;

        public AuthenticationMiddlewareTests()
        {
            Environment.SetEnvironmentVariable("SAM_API_TOKEN", TestToken);
            _server = TestServer.Create<AuthOnlyStartup>();
        }

        public void Dispose()
        {
            _server?.Dispose();
        }

        [Fact]
        public async Task Health_NoAuth_Returns200()
        {
            var response = await _server.HttpClient.GetAsync("/health");
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }

        [Fact]
        public async Task GameImage_NoAuth_PassesThrough()
        {
            var response = await _server.HttpClient.GetAsync("/api/games/123/image");
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }

        [Fact]
        public async Task GameLogo_NoAuth_PassesThrough()
        {
            var response = await _server.HttpClient.GetAsync("/api/games/123/logo");
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }

        [Fact]
        public async Task MissingToken_Returns401()
        {
            var request = new HttpRequestMessage(HttpMethod.Post, "/api/init");
            var response = await _server.HttpClient.SendAsync(request);

            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
            var body = await response.Content.ReadAsStringAsync();
            Assert.Contains("Unauthorized", body);
        }

        [Fact]
        public async Task WrongToken_Returns401()
        {
            var request = new HttpRequestMessage(HttpMethod.Post, "/api/init");
            request.Headers.Add("X-SAM-Auth", "wrong-token");
            var response = await _server.HttpClient.SendAsync(request);

            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
            var body = await response.Content.ReadAsStringAsync();
            Assert.Contains("Unauthorized", body);
        }

        [Fact]
        public async Task ValidToken_PassesThrough()
        {
            var request = new HttpRequestMessage(HttpMethod.Post, "/api/init");
            request.Headers.Add("X-SAM-Auth", TestToken);
            var response = await _server.HttpClient.SendAsync(request);

            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var body = await response.Content.ReadAsStringAsync();
            Assert.Contains("passed", body);
        }
    }
}
