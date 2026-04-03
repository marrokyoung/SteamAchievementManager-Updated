using System;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Owin.Testing;
using Moq;
using SAM.Service.Core;
using SAM.Service.Tests.Helpers;
using Xunit;

namespace SAM.Service.Tests
{
    public class HostedSmokeTests : IDisposable
    {
        private const string TestToken = "test-token-123";
        private readonly TestServer _server;

        public HostedSmokeTests()
        {
            Environment.SetEnvironmentVariable("SAM_API_TOKEN", TestToken);

            var mockManager = new Mock<ISteamClientManager>();
            ServiceContext.Initialize(mockManager.Object, new GameListCache());

            _server = TestServer.Create<TestStartup>();
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
            var body = await response.Content.ReadAsStringAsync();
            Assert.Contains("healthy", body);
        }

        [Fact]
        public async Task ProtectedRoute_BadAuth_Returns401()
        {
            var request = new HttpRequestMessage(HttpMethod.Post, "/api/init");
            request.Headers.Add("X-SAM-Auth", "bad-token");
            request.Content = new StringContent("{\"appId\":440}", Encoding.UTF8, "application/json");

            var response = await _server.HttpClient.SendAsync(request);

            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        }

        [Fact]
        public async Task Json_UsesCamelCase()
        {
            // Trigger an ErrorResponse which has PascalCase C# properties
            // (Error, Message, StatusCode, ErrorCode, Recoverable)
            // and verify they serialize as camelCase
            var mockManager = new Mock<ISteamClientManager>();
            mockManager.Setup(m => m.InitializeForApp(It.IsAny<long>()))
                .Throws(new API.ClientInitializeException(
                    API.ClientInitializeFailure.ConnectToGlobalUser, "Steam not running"));
            ServiceContext.Initialize(mockManager.Object, new GameListCache());

            var request = new HttpRequestMessage(HttpMethod.Post, "/api/init");
            request.Headers.Add("X-SAM-Auth", TestToken);
            request.Content = new StringContent("{\"appId\":440}", Encoding.UTF8, "application/json");

            var response = await _server.HttpClient.SendAsync(request);
            var body = await response.Content.ReadAsStringAsync();

            // Verify camelCase keys (not PascalCase)
            Assert.Contains("\"errorCode\"", body);
            Assert.Contains("\"statusCode\"", body);
            Assert.Contains("\"recoverable\"", body);
            // Verify PascalCase is NOT used
            Assert.DoesNotContain("\"ErrorCode\"", body);
            Assert.DoesNotContain("\"StatusCode\"", body);
            Assert.DoesNotContain("\"Recoverable\"", body);
        }
    }
}
