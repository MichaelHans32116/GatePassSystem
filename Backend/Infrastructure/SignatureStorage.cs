using System.Security.Cryptography;
using GatePassSystem.Project.DTOs.Fleet;

namespace GatePassSystem.Api.Infrastructure;

public sealed class SignatureStorageOptions
{
    public string RootPath { get; init; } = "Data/signatures";
    public long MaxFileSizeBytes { get; init; } = 5 * 1024 * 1024;
    public string BackgroundRemovalUrl { get; init; } =
        "http://127.0.0.1:8000/remove-background";
}

public interface ISignatureStorage
{
    Task<SignatureMetadataRequest> SaveAsync(
        long ownerUserId,
        IFormFile file,
        int? widthPercent,
        int? yOffset,
        CancellationToken cancellationToken);

    Task<Stream?> OpenReadAsync(
        string storagePath,
        CancellationToken cancellationToken);
}

public sealed class SignatureStorage(
    IWebHostEnvironment environment,
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
        CancellationToken cancellationToken)
    {
        if (file.Length == 0 ||
            file.Length > _options.MaxFileSizeBytes ||
            !Extensions.TryGetValue(file.ContentType, out var extension))
        {
            throw new InvalidOperationException(
                "Signature must be a non-empty PNG or JPEG up to 5 MB.");
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
        await using var input = file.OpenReadStream();
        await using var output = new FileStream(
            absolutePath,
            FileMode.CreateNew,
            FileAccess.Write,
            FileShare.None,
            81920,
            true);
        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        var buffer = new byte[81920];
        int read;
        while ((read = await input.ReadAsync(buffer, cancellationToken)) > 0)
        {
            hash.AppendData(buffer, 0, read);
            await output.WriteAsync(
                buffer.AsMemory(0, read),
                cancellationToken);
        }

        return new SignatureMetadataRequest(
            Path.GetFileName(file.FileName),
            file.ContentType,
            absolutePath,
            Convert.ToHexString(hash.GetHashAndReset()),
            widthPercent,
            yOffset);
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
