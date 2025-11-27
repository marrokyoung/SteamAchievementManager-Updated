using System;
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

            _shutdownToken = new CancellationTokenSource();

            try
            {
                // Initialize managers (no Steam connection yet)
                _clientManager = new SteamClientManager();
                _gameListCache = new GameListCache();
                ServiceContext.Initialize(_clientManager, _gameListCache);

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
                Console.WriteLine($"Fatal error: {ex.Message}");
                Console.WriteLine($"Stack trace: {ex.StackTrace}");
                Environment.Exit(1);
            }
            finally
            {
                Cleanup();
            }
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
