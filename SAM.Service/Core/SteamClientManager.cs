using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using SAM.API;

namespace SAM.Service.Core
{
    public class SteamClientManager : IDisposable
    {
        private readonly object _lock = new();
        private readonly CancellationTokenSource _pollerCancellation;
        private readonly Task _pollerTask;
        private readonly SchemaCache _schemaCache;

        private Client _currentClient;
        private long _currentAppId = -1;
        private API.Callbacks.UserStatsReceived _userStatsCallback;
        private TaskCompletionSource<API.Types.UserStatsReceived> _pendingStatsRequest;
        private const int POLLER_INTERVAL_MS = 50;

        public SteamClientManager()
        {
            _schemaCache = new SchemaCache();
            _pollerCancellation = new CancellationTokenSource();

            // Start background callback poller
            _pollerTask = Task.Run(() => CallbackPollerLoop(_pollerCancellation.Token));
        }

        /// <summary>
        /// Initialize Steam client for a specific AppId (idempotent)
        /// </summary>
        public void InitializeForApp(long appId)
        {
            lock (_lock)
            {
                // Validate AppId range (0 is allowed for neutral client)
                if (appId < 0 || appId > 1000000000)
                {
                    throw new ArgumentException(
                        $"AppId must be between 0 and 1,000,000,000");
                }

                // Already initialized for this app?
                if (_currentClient != null && _currentAppId == appId)
                {
                    return;
                }

                // Dispose existing client if switching apps
                DisposeCurrentClient();

                try
                {
                    _currentClient = new Client();
                    _currentClient.Initialize(appId);
                    _currentAppId = appId;

                    // Register UserStatsReceived callback
                    _userStatsCallback = _currentClient.CreateAndRegisterCallback<API.Callbacks.UserStatsReceived>();
                    _userStatsCallback.OnRun += OnUserStatsReceived;

                    API.SecurityLogger.Log(API.LogLevel.Info, API.LogContext.Native,
                        $"Steam client initialized for AppId {appId}");
                }
                catch (Exception ex)
                {
                    // Clean up on failure
                    DisposeCurrentClient();

                    // Determine error type
                    string errorCode = "init_failed";
                    if (ex.Message.Contains("Steam") || ex.Message.Contains("steam"))
                    {
                        errorCode = "steam_not_running";
                    }

                    throw new InvalidOperationException(errorCode, ex);
                }
            }
        }

        /// <summary>
        /// Get current client (throws if not initialized)
        /// </summary>
        public Client GetClient()
        {
            lock (_lock)
            {
                if (_currentClient == null)
                {
                    throw new InvalidOperationException(
                        "Steam client not initialized. Call /init first.");
                }
                return _currentClient;
            }
        }

        /// <summary>
        /// Request user stats with callback awaiting
        /// </summary>
        public async Task<API.Types.UserStatsReceived> RequestUserStatsAsync(
            ulong steamId, int timeoutMs = 5000)
        {
            TaskCompletionSource<API.Types.UserStatsReceived> tcs;

            lock (_lock)
            {
                var client = GetClient();

                // Create new TaskCompletionSource for this request
                tcs = new TaskCompletionSource<API.Types.UserStatsReceived>();
                _pendingStatsRequest = tcs;

                // Request stats
                var callHandle = client.SteamUserStats.RequestUserStats(steamId);
                if (callHandle == API.CallHandle.Invalid)
                {
                    _pendingStatsRequest = null;
                    throw new Exception("RequestUserStats returned invalid handle");
                }
            }

            // Wait for callback with timeout
            var completedTask = await Task.WhenAny(
                tcs.Task,
                Task.Delay(timeoutMs));

            if (completedTask != tcs.Task)
            {
                lock (_lock)
                {
                    _pendingStatsRequest = null;
                }
                throw new TimeoutException("RequestUserStats callback timed out");
            }

            return await tcs.Task;
        }

        private void OnUserStatsReceived(API.Types.UserStatsReceived param)
        {
            lock (_lock)
            {
                _pendingStatsRequest?.TrySetResult(param);
                _pendingStatsRequest = null;
            }
        }

        /// <summary>
        /// Get cached schema or load from disk
        /// </summary>
        public GameSchema GetSchema(long appId)
        {
            return _schemaCache.GetOrLoad(appId, () =>
            {
                lock (_lock)
                {
                    var client = GetClient();
                    return SchemaLoader.LoadSchema(appId, client);
                }
            });
        }

        private void CallbackPollerLoop(CancellationToken token)
        {
            while (!token.IsCancellationRequested)
            {
                try
                {
                    lock (_lock)
                    {
                        _currentClient?.RunCallbacks(false);
                    }
                }
                catch (Exception ex)
                {
                    API.SecurityLogger.Log(API.LogLevel.Error, API.LogContext.Callback,
                        $"Callback poller error: {ex.Message}");
                }

                Thread.Sleep(POLLER_INTERVAL_MS);
            }
        }

        private void DisposeCurrentClient()
        {
            if (_currentClient != null)
            {
                try
                {
                    _currentClient.Dispose();
                }
                catch (Exception ex)
                {
                    API.SecurityLogger.Log(API.LogLevel.Error, API.LogContext.Native,
                        $"Error disposing client: {ex.Message}");
                }
                finally
                {
                    _currentClient = null;
                    _currentAppId = -1;
                }
            }
        }

        public void Dispose()
        {
            _pollerCancellation?.Cancel();
            try
            {
                _pollerTask?.Wait(1000);
            }
            catch { }

            DisposeCurrentClient();
            _pollerCancellation?.Dispose();
            _schemaCache?.Dispose();
        }
    }
}
