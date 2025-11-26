using System;
using System.Collections.Concurrent;
using System.IO;
using System.Net;
using System.Threading.Tasks;
using System.Windows.Media.Imaging;
using SAM.API;

namespace SAM.Game.Wpf.Services
{
    internal sealed class ImageCacheService : IDisposable
    {
        private readonly string _cacheDir;
        private readonly ConcurrentDictionary<string, BitmapImage> _memory = new();

        public ImageCacheService()
        {
            var appData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            _cacheDir = Path.Combine(appData, "SAM", "cache");
            Directory.CreateDirectory(_cacheDir);
        }

        public async Task<BitmapImage> GetAsync(string url, int maxBytes = 1 * 1024 * 1024)
        {
            if (string.IsNullOrWhiteSpace(url))
            {
                return null;
            }

            if (_memory.TryGetValue(url, out var cached))
            {
                return cached;
            }

            string fileName = Path.Combine(_cacheDir, SafeFileName(url));
            if (File.Exists(fileName))
            {
                try
                {
                    var img = LoadBitmap(fileName);
                    _memory[url] = img;
                    return img;
                }
                catch
                {
                    // ignore and re-download
                }
            }

            try
            {
                byte[] data;
                using (var client = new SafeWebClient(maxBytes))
                {
                    data = await client.DownloadDataTaskAsync(new Uri(url)).ConfigureAwait(false);
                }

                File.WriteAllBytes(fileName, data);
                var img = LoadBitmap(fileName);
                _memory[url] = img;
                return img;
            }
            catch
            {
                return null;
            }
        }

        private static BitmapImage LoadBitmap(string path)
        {
            var bmp = new BitmapImage();
            bmp.BeginInit();
            bmp.CacheOption = BitmapCacheOption.OnLoad;
            bmp.UriSource = new Uri(path);
            bmp.EndInit();
            bmp.Freeze();
            return bmp;
        }

        private static string SafeFileName(string url)
        {
            foreach (var c in Path.GetInvalidFileNameChars())
            {
                url = url.Replace(c, '_');
            }
            return url.GetHashCode().ToString("X");
        }

        public void Dispose()
        {
        }
    }
}
