using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Owin.Testing;
using Moq;
using SAM.Service.Core;
using SAM.Service.Models;
using SAM.Service.Tests.Helpers;
using Xunit;

namespace SAM.Service.Tests
{
    public class SteamControllerTests : IDisposable
    {
        private const string TestToken = "test-token-123";
        private readonly TestServer _server;
        private readonly Mock<ISteamClientManager> _mockManager;
        private readonly Mock<ISteamClientFacade> _mockFacade;

        public SteamControllerTests()
        {
            Environment.SetEnvironmentVariable("SAM_API_TOKEN", TestToken);
            _mockManager = new Mock<ISteamClientManager>();
            _mockFacade = new Mock<ISteamClientFacade>();
            ServiceContext.Initialize(_mockManager.Object, new GameListCache());
            _server = TestServer.Create<TestStartup>();
        }

        public void Dispose()
        {
            _server?.Dispose();
        }

        private HttpRequestMessage AuthRequest(HttpMethod method, string url, string json = null)
        {
            var request = new HttpRequestMessage(method, url);
            request.Headers.Add("X-SAM-Auth", TestToken);
            if (json != null)
            {
                request.Content = new StringContent(json, Encoding.UTF8, "application/json");
            }
            return request;
        }

        // -- Initialize -----------------------------------------------

        [Fact]
        public async Task Initialize_NullBody_Returns400()
        {
            var request = AuthRequest(HttpMethod.Post, "/api/init");
            var response = await _server.HttpClient.SendAsync(request);
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }

        [Fact]
        public async Task Initialize_ZeroAppId_Returns400()
        {
            var request = AuthRequest(HttpMethod.Post, "/api/init", "{\"appId\":0}");
            var response = await _server.HttpClient.SendAsync(request);
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }

        [Fact]
        public async Task Initialize_ClientInitException_Returns503()
        {
            _mockManager.Setup(m => m.InitializeForApp(It.IsAny<long>()))
                .Throws(new API.ClientInitializeException(
                    API.ClientInitializeFailure.ConnectToGlobalUser, "Steam not running"));

            var request = AuthRequest(HttpMethod.Post, "/api/init", "{\"appId\":440}");
            var response = await _server.HttpClient.SendAsync(request);

            Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
            var body = await response.Content.ReadAsStringAsync();
            Assert.Contains("steam_connect_failed", body);
        }

        [Fact]
        public async Task Initialize_Success_Returns200()
        {
            _mockManager.Setup(m => m.InitializeForApp(It.IsAny<long>()));
            _mockManager.Setup(m => m.GetClient()).Returns(_mockFacade.Object);
            _mockFacade.Setup(f => f.GetAppName(It.IsAny<uint>())).Returns("Team Fortress 2");

            var request = AuthRequest(HttpMethod.Post, "/api/init", "{\"appId\":440}");
            var response = await _server.HttpClient.SendAsync(request);

            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var body = await response.Content.ReadAsStringAsync();
            Assert.Contains("440", body);
            Assert.Contains("Team Fortress 2", body);
            Assert.Contains("connected", body);
        }

        // -- GetGameData -----------------------------------------------

        [Fact]
        public async Task GetGameData_SchemaNotFound_Returns404()
        {
            _mockManager.Setup(m => m.InitializeForApp(It.IsAny<long>()));
            _mockManager.Setup(m => m.GetClient()).Returns(_mockFacade.Object);
            _mockFacade.Setup(f => f.GetSteamId()).Returns(76561198000000000UL);
            _mockManager.Setup(m => m.RequestUserStatsAsync(It.IsAny<ulong>(), It.IsAny<int>()))
                .ReturnsAsync(new API.Types.UserStatsReceived { Result = 1 });
            _mockManager.Setup(m => m.GetSchema(It.IsAny<long>()))
                .Throws(new FileNotFoundException("Schema not found"));

            var request = AuthRequest(HttpMethod.Get, "/api/game/440/data");
            var response = await _server.HttpClient.SendAsync(request);

            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
            var body = await response.Content.ReadAsStringAsync();
            Assert.Contains("SchemaNotFound", body);
        }

        [Fact]
        public async Task GetGameData_Timeout_Returns408()
        {
            _mockManager.Setup(m => m.InitializeForApp(It.IsAny<long>()));
            _mockManager.Setup(m => m.GetClient()).Returns(_mockFacade.Object);
            _mockFacade.Setup(f => f.GetSteamId()).Returns(76561198000000000UL);
            _mockManager.Setup(m => m.RequestUserStatsAsync(It.IsAny<ulong>(), It.IsAny<int>()))
                .ThrowsAsync(new TimeoutException("Stats request timed out"));

            var request = AuthRequest(HttpMethod.Get, "/api/game/440/data");
            var response = await _server.HttpClient.SendAsync(request);

            Assert.Equal(HttpStatusCode.RequestTimeout, response.StatusCode);
        }

        [Fact]
        public async Task GetGameData_Success_Returns200()
        {
            _mockManager.Setup(m => m.InitializeForApp(It.IsAny<long>()));
            _mockManager.Setup(m => m.GetClient()).Returns(_mockFacade.Object);
            _mockFacade.Setup(f => f.GetSteamId()).Returns(76561198000000000UL);
            _mockManager.Setup(m => m.RequestUserStatsAsync(It.IsAny<ulong>(), It.IsAny<int>()))
                .ReturnsAsync(new API.Types.UserStatsReceived { Result = 1 });
            _mockManager.Setup(m => m.GetSchema(440))
                .Returns(new GameSchema
                {
                    AppId = 440,
                    Achievements = new List<AchievementDefinitionDto>
                    {
                        new AchievementDefinitionDto
                        {
                            Id = "TF_PLAY_GAME_EVERYCLASS",
                            Name = "Head of the Class",
                            Description = "Play a complete round with every class.",
                            Permission = 0
                        }
                    },
                    Stats = new List<StatDefinitionDto>
                    {
                        new StatDefinitionDto
                        {
                            Id = "Scout.accum.iDominations",
                            DisplayName = "Scout Dominations",
                            Type = "int",
                            MinValue = 0,
                            MaxValue = 1000000,
                            Permission = 0
                        }
                    }
                });

            bool isAchieved = true;
            uint unlockTime = 1609459200;
            _mockFacade.Setup(f => f.GetAchievementAndUnlockTime("TF_PLAY_GAME_EVERYCLASS",
                    out isAchieved, out unlockTime))
                .Returns(true);

            int statVal = 42;
            _mockFacade.Setup(f => f.GetStatValue("Scout.accum.iDominations", out statVal))
                .Returns(true);

            _mockFacade.Setup(f => f.GetAppName(440u)).Returns("Team Fortress 2");

            var request = AuthRequest(HttpMethod.Get, "/api/game/440/data");
            var response = await _server.HttpClient.SendAsync(request);

            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var body = await response.Content.ReadAsStringAsync();
            Assert.Contains("TF_PLAY_GAME_EVERYCLASS", body);
            Assert.Contains("Scout.accum.iDominations", body);
            Assert.Contains("440", body);
        }

        // -- UpdateAchievements ----------------------------------------

        [Fact]
        public async Task UpdateAchievements_EmptyUpdates_Returns400()
        {
            var request = AuthRequest(HttpMethod.Post, "/api/game/440/achievements",
                "{\"updates\":[]}");
            var response = await _server.HttpClient.SendAsync(request);
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }

        [Fact]
        public async Task UpdateAchievements_NotFound_Returns400()
        {
            _mockManager.Setup(m => m.InitializeForApp(It.IsAny<long>()));
            _mockManager.Setup(m => m.GetClient()).Returns(_mockFacade.Object);
            _mockManager.Setup(m => m.GetSchema(440))
                .Returns(new GameSchema
                {
                    AppId = 440,
                    Achievements = new List<AchievementDefinitionDto>(),
                    Stats = new List<StatDefinitionDto>()
                });

            var request = AuthRequest(HttpMethod.Post, "/api/game/440/achievements",
                "{\"updates\":[{\"id\":\"NONEXISTENT\",\"unlocked\":true}]}");
            var response = await _server.HttpClient.SendAsync(request);

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            var body = await response.Content.ReadAsStringAsync();
            Assert.Contains("not found", body);
        }

        [Fact]
        public async Task UpdateAchievements_Protected_Returns403()
        {
            _mockManager.Setup(m => m.InitializeForApp(It.IsAny<long>()));
            _mockManager.Setup(m => m.GetClient()).Returns(_mockFacade.Object);
            _mockManager.Setup(m => m.GetSchema(440))
                .Returns(new GameSchema
                {
                    AppId = 440,
                    Achievements = new List<AchievementDefinitionDto>
                    {
                        new AchievementDefinitionDto { Id = "PROTECTED_ACH", Permission = 2 }
                    },
                    Stats = new List<StatDefinitionDto>()
                });

            var request = AuthRequest(HttpMethod.Post, "/api/game/440/achievements",
                "{\"updates\":[{\"id\":\"PROTECTED_ACH\",\"unlocked\":true}]}");
            var response = await _server.HttpClient.SendAsync(request);

            Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
            var body = await response.Content.ReadAsStringAsync();
            Assert.Contains("Protected", body);
        }

        [Fact]
        public async Task UpdateAchievements_NotInitialized_Returns428()
        {
            _mockManager.Setup(m => m.InitializeForApp(It.IsAny<long>()))
                .Throws(new InvalidOperationException("Not initialized"));

            var request = AuthRequest(HttpMethod.Post, "/api/game/440/achievements",
                "{\"updates\":[{\"id\":\"ACH1\",\"unlocked\":true}]}");
            var response = await _server.HttpClient.SendAsync(request);

            Assert.Equal((HttpStatusCode)428, response.StatusCode);
            var body = await response.Content.ReadAsStringAsync();
            Assert.Contains("NotInitialized", body);
        }

        // -- UpdateStats -----------------------------------------------

        [Fact]
        public async Task UpdateStats_EmptyUpdates_Returns400()
        {
            var request = AuthRequest(HttpMethod.Post, "/api/game/440/stats",
                "{\"updates\":[]}");
            var response = await _server.HttpClient.SendAsync(request);
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }

        [Fact]
        public async Task UpdateStats_Protected_Returns403()
        {
            _mockManager.Setup(m => m.InitializeForApp(It.IsAny<long>()));
            _mockManager.Setup(m => m.GetClient()).Returns(_mockFacade.Object);
            _mockManager.Setup(m => m.GetSchema(440))
                .Returns(new GameSchema
                {
                    AppId = 440,
                    Achievements = new List<AchievementDefinitionDto>(),
                    Stats = new List<StatDefinitionDto>
                    {
                        new StatDefinitionDto
                        {
                            Id = "PROTECTED_STAT",
                            Type = "int",
                            Permission = 2,
                            MinValue = 0,
                            MaxValue = 100
                        }
                    }
                });

            var request = AuthRequest(HttpMethod.Post, "/api/game/440/stats",
                "{\"updates\":[{\"id\":\"PROTECTED_STAT\",\"value\":50}]}");
            var response = await _server.HttpClient.SendAsync(request);

            Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
            var body = await response.Content.ReadAsStringAsync();
            Assert.Contains("Protected", body);
        }

        // -- Store -----------------------------------------------------

        [Fact]
        public async Task Store_NotInitialized_Returns428()
        {
            _mockManager.Setup(m => m.InitializeForApp(It.IsAny<long>()))
                .Throws(new InvalidOperationException("Not initialized"));

            var request = AuthRequest(HttpMethod.Post, "/api/game/440/store");
            var response = await _server.HttpClient.SendAsync(request);

            Assert.Equal((HttpStatusCode)428, response.StatusCode);
        }

        [Fact]
        public async Task Store_Success_Returns200()
        {
            _mockManager.Setup(m => m.InitializeForApp(It.IsAny<long>()));
            _mockManager.Setup(m => m.GetClient()).Returns(_mockFacade.Object);
            _mockFacade.Setup(f => f.StoreStats()).Returns(true);

            var request = AuthRequest(HttpMethod.Post, "/api/game/440/store");
            var response = await _server.HttpClient.SendAsync(request);

            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var body = await response.Content.ReadAsStringAsync();
            Assert.Contains("Changes stored successfully", body);
        }

        // -- Reset -----------------------------------------------------

        [Fact]
        public async Task Reset_NotInitialized_Returns428()
        {
            _mockManager.Setup(m => m.InitializeForApp(It.IsAny<long>()))
                .Throws(new InvalidOperationException("Not initialized"));

            var request = AuthRequest(HttpMethod.Post, "/api/game/440/reset");
            var response = await _server.HttpClient.SendAsync(request);

            Assert.Equal((HttpStatusCode)428, response.StatusCode);
        }
    }
}
