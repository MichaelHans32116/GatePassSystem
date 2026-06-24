using System.Net.Http.Headers;
using GatePassSystem.Api.Infrastructure;
using GatePassSystem.Project.Models;
using GatePassSystem.Project.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace GatePassSystem.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/signatures")]
public sealed class SignaturesController(
    ISignatureService signatureService,
    ISignatureStorage signatureStorage,
    IHttpClientFactory httpClientFactory,
    IOptions<SignatureStorageOptions> storageOptions) : ApiControllerBase
{
    [HttpPost]
    [RequestSizeLimit(5 * 1024 * 1024)]
    public async Task<ActionResult<ApiResponse<SignatureFileRecord>>> Upload(
        IFormFile file,
        [FromForm] int? widthPercent,
        [FromForm] int? yOffset,
        CancellationToken cancellationToken)
    {
        var metadata = await signatureStorage.SaveAsync(
            CurrentUserId,
            file,
            widthPercent,
            yOffset,
            cancellationToken);
        var record = await signatureService.RegisterAsync(
            CurrentUserId,
            metadata,
            cancellationToken);
        return Success(record, "Signature uploaded.");
    }

    [HttpGet("{id:long}")]
    public async Task<IActionResult> Download(
        long id,
        CancellationToken cancellationToken)
    {
        var signature = await signatureService.GetAsync(id, cancellationToken);
        if (signature is null)
        {
            return NotFound(new ApiErrorResponse(
                "SIGNATURE_NOT_FOUND",
                "Signature was not found.",
                null,
                HttpContext.TraceIdentifier));
        }

        var canRead =
            User.HasClaim("permission", "gatepass.read.all") ||
            User.HasClaim("permission", "gatepass.scan") ||
            await signatureService.CanReadAsync(
                id,
                CurrentUserId,
                cancellationToken);
        if (!canRead)
        {
            return NotFound();
        }

        var stream = await signatureStorage.OpenReadAsync(
            signature.StoragePath,
            cancellationToken);
        return stream is null
            ? NotFound()
            : File(stream, signature.ContentType, signature.FileName);
    }

    [HttpPost("process-background")]
    [RequestSizeLimit(5 * 1024 * 1024)]
    public async Task<IActionResult> ProcessBackground(
        IFormFile file,
        CancellationToken cancellationToken)
    {
        if (file.Length == 0 ||
            file.Length > storageOptions.Value.MaxFileSizeBytes)
        {
            return UnprocessableEntity(new ApiErrorResponse(
                "INVALID_SIGNATURE_FILE",
                "Signature must be a non-empty PNG or JPEG up to 5 MB.",
                null,
                HttpContext.TraceIdentifier));
        }

        using var form = new MultipartFormDataContent();
        await using var stream = file.OpenReadStream();
        using var content = new StreamContent(stream);
        content.Headers.ContentType = MediaTypeHeaderValue.Parse(file.ContentType);
        form.Add(content, "file", file.FileName);

        using var client = httpClientFactory.CreateClient("SignatureBackgroundRemoval");
        HttpResponseMessage response;
        try
        {
            response = await client.PostAsync(
                storageOptions.Value.BackgroundRemovalUrl,
                form,
                cancellationToken);
        }
        catch (HttpRequestException)
        {
            return BackgroundRemovalUnavailable();
        }

        using (response)
        {
            if (!response.IsSuccessStatusCode)
            {
                return BackgroundRemovalUnavailable();
            }

            var bytes = await response.Content.ReadAsByteArrayAsync(
                cancellationToken);
            return File(bytes, "image/png");
        }
    }

    private ObjectResult BackgroundRemovalUnavailable() =>
        StatusCode(
            StatusCodes.Status503ServiceUnavailable,
            new ApiErrorResponse(
                "BACKGROUND_REMOVAL_UNAVAILABLE",
                "The optional background-removal helper is unavailable.",
                null,
                HttpContext.TraceIdentifier));
}
