using System.Security.Cryptography;
using GatePassSystem.Project.DTOs.Fleet;

namespace GatePassSystem.Api.Infrastructure;

public sealed class SignatureStorageOptions
{
    public string RootPath { get; init; } = "Data/signatures";
    public long MaxFileSizeBytes { get; init; } = 5 * 1024 * 1024;
    public string BackgroundRemovalUrl { get; init; } =
        "http://127.0.0.1:8000/remove-background";
    public string CompressUrl { get; init; } =
        "http://127.0.0.1:8000/compress";
}

public interface ISignatureStorage
{
    Task<SignatureMetadataRequest> SaveAsync(
        long ownerUserId,
        IFormFile file,
        int? widthPercent,
        int? yOffset,
        bool compress,
        CancellationToken cancellationToken);

    Task<Stream?> OpenReadAsync(
        string storagePath,
        CancellationToken cancellationToken);
}

public sealed class SignatureStorage(
    IWebHostEnvironment environment,
    IHttpClientFactory httpClientFactory,
    Microsoft.Extensions.Options.IOptions<SignatureStorageOptions> options)
    : ISignatureStorage
{
    private static readonly IReadOnlyDictionary<string, string> Extensions =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["image/png"] = ".png",
            ["image/jpeg"] = ".jpg"
        };

    private readonly SignatureStorageOptions _options = options.Value;

    public async Task<SignatureMetadataRequest> SaveAsync(
        long ownerUserId,
        IFormFile file,
        int? widthPercent,
        int? yOffset,
        bool compress,
        CancellationToken cancellationToken)
    {
        if (file.Length == 0 ||
            file.Length > _options.MaxFileSizeBytes ||
            !Extensions.TryGetValue(file.ContentType, out var extension))
        {
            throw new InvalidOperationException(
                "Signature must be a non-empty PNG or JPEG up to 5 MB.");
        }

        var contentType = file.ContentType;
        byte[]? compressedBytes = null;
        if (compress)
        {
            compressedBytes = await TryCompressAsync(file, cancellationToken);
            if (compressedBytes is not null)
            {
                contentType = "image/jpeg";
                extension = ".jpg";
            }
        }

        var root = Path.GetFullPath(
            Path.Combine(environment.ContentRootPath, _options.RootPath));
        Directory.CreateDirectory(root);

        var relativePath = Path.Combine(
            ownerUserId.ToString(),
            $"{Guid.NewGuid():N}{extension}");
        var absolutePath = Path.GetFullPath(Path.Combine(root, relativePath));
        if (!absolutePath.StartsWith(root, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Invalid signature path.");
        }

        Directory.CreateDirectory(Path.GetDirectoryName(absolutePath)!);
        await using var output = new FileStream(
            absolutePath,
            FileMode.CreateNew,
            FileAccess.Write,
            FileShare.None,
            81920,
            true);
        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);

        if (compressedBytes is not null)
        {
            hash.AppendData(compressedBytes);
            await output.WriteAsync(
                compressedBytes.AsMemory(),
                cancellationToken);
        }
        else
        {
            await using var input = file.OpenReadStream();
            var buffer = new byte[81920];
            int read;
            while ((read = await input.ReadAsync(buffer, cancellationToken)) > 0)
            {
                hash.AppendData(buffer, 0, read);
                await output.WriteAsync(
                    buffer.AsMemory(0, read),
                    cancellationToken);
            }
        }

        return new SignatureMetadataRequest(
            Path.GetFileName(file.FileName),
            contentType,
            absolutePath,
            Convert.ToHexString(hash.GetHashAndReset()),
            widthPercent,
            yOffset);
    }

    private async Task<byte[]?> TryCompressAsync(
        IFormFile file,
        CancellationToken cancellationToken)
    {
        try
        {
            using var form = new MultipartFormDataContent();
            await using var stream = file.OpenReadStream();
            using var content = new StreamContent(stream);
            content.Headers.ContentType =
                System.Net.Http.Headers.MediaTypeHeaderValue.Parse(file.ContentType);
            form.Add(content, "file", file.FileName);

            using var client = httpClientFactory.CreateClient(
                "SignatureBackgroundRemoval");
            using var response = await client.PostAsync(
                _options.CompressUrl,
                form,
                cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                return null;
            }

            return await response.Content.ReadAsByteArrayAsync(cancellationToken);
        }
        catch (HttpRequestException)
        {
            return null;
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            // HttpClient timeout (45s) surfaces as a cancellation, not HttpRequestException.
            // Fall back to storing the original bytes rather than failing the upload.
            return null;
        }
    }

    public Task<Stream?> OpenReadAsync(
        string storagePath,
        CancellationToken cancellationToken)
    {
        if (!File.Exists(storagePath))
        {
            return Task.FromResult<Stream?>(null);
        }

        Stream stream = new FileStream(
            storagePath,
            FileMode.Open,
            FileAccess.Read,
            FileShare.Read,
            81920,
            true);
        return Task.FromResult<Stream?>(stream);
    }
}
