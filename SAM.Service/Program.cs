using System;
using System.Net;
using System.Threading;
using Microsoft.Owin.Hosting;
using SAM.Service.Core;

namespace SAM.Service
{
    class Program
    {
        private static IDisposable _webApp;
        private static SteamClientManager _clientManager;
        private static GameListCache _gameListCache;
        private static CancellationTokenSource _shutdownToken;

        static void Main(string[] args)
        {
            Console.WriteLine("Steam Achievement Manager - HTTP Service");
            Console.WriteLine("=========================================");

            // Parse base URL from args or environment variable
            string baseUrl = Environment.GetEnvironmentVariable("SAM_BASE_URL")
                ?? "http://127.0.0.1:8787";

            if (args.Length > 0)
            {
                baseUrl = args[0];
            }

            // Read forced AppId from environment
            string forcedAppIdStr = Environment.GetEnvironmentVariable("SAM_FORCE_APP_ID");
            long? forcedAppId = null;

            if (!string.IsNullOrWhiteSpace(forcedAppIdStr))
            {
                if (long.TryParse(forcedAppIdStr, out long parsed) && parsed > 0)
                {
                    forcedAppId = parsed;
                    Console.WriteLine($"Forced AppId mode: {forcedAppId}");
                }
                else
                {
                    Console.WriteLine($"Invalid SAM_FORCE_APP_ID: {forcedAppIdStr}");
                    Environment.Exit(1);
                }
            }

            _shutdownToken = new CancellationTokenSource();

            try
            {
                // Initialize managers
                _clientManager = new SteamClientManager();
                _gameListCache = new GameListCache();

                // Auto-initialize if forced mode
                if (forcedAppId.HasValue)
                {
                    try
                    {
                        Console.WriteLine($"Auto-initializing for AppId {forcedAppId.Value}...");
                        _clientManager.InitializeForApp(forcedAppId.Value);
                        Console.WriteLine("Auto-initialization successful");
                    }
                    catch (API.ClientInitializeException ex)
                    {
                        PrintFatalException(ex);
                        Cleanup();
                        Environment.Exit(1);
                    }
                }

                ServiceContext.Initialize(_clientManager, _gameListCache, forcedAppId);

                // Start OWIN web server
                _webApp = WebApp.Start<Startup>(baseUrl);
                Console.WriteLine($"Service listening on {baseUrl}");
                Console.WriteLine("Press Ctrl+C to stop...");

                // Wait for shutdown signal
                Console.CancelKeyPress += OnShutdown;
                _shutdownToken.Token.WaitHandle.WaitOne();
            }
            catch (Exception ex)
            {
                PrintFatalException(ex);
                Environment.Exit(1);
            }
            finally
            {
                Cleanup();
            }
        }

        private static void PrintFatalException(Exception ex)
        {
            Console.WriteLine($"Fatal error: {ex.Message}");
            if (ex.InnerException != null)
            {
                Console.WriteLine($"Inner exception: {ex.InnerException.Message}");
            }

            var httpListenerEx = FindHttpListenerException(ex);
            if (httpListenerEx != null && httpListenerEx.ErrorCode == 5)
            {
                Console.WriteLine("Access denied starting HTTP listener. Run once as Administrator:");
                Console.WriteLine("  netsh http add urlacl url=http://127.0.0.1:8787/ user=Everyone");
            }

            Console.WriteLine($"Stack trace: {ex.StackTrace}");
        }

        private static HttpListenerException FindHttpListenerException(Exception ex)
        {
            while (ex != null)
            {
                if (ex is HttpListenerException listenerEx)
                {
                    return listenerEx;
                }
                ex = ex.InnerException;
            }
            return null;
        }

        private static void OnShutdown(object sender, ConsoleCancelEventArgs e)
        {
            e.Cancel = true;
            Console.WriteLine("\nShutting down...");
            _shutdownToken.Cancel();
        }

        private static void Cleanup()
        {
            try
            {
                _webApp?.Dispose();
                _clientManager?.Dispose();
                _gameListCache?.Dispose();
                _shutdownToken?.Dispose();
                Console.WriteLine("Service stopped.");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error during cleanup: {ex.Message}");
            }
        }
    }
}
