using FormRequestSystem.Project.DTOs.Fleet;
using FormRequestSystem.Project.Models;

namespace FormRequestSystem.Project.Repositories;

public interface ISignatureRepository
{
    Task<SignatureFileRecord> CreateAsync(
        long ownerUserId,
        SignatureMetadataRequest request,
        CancellationToken cancellationToken = default);

    Task<SignatureFileRecord?> GetAsync(
        long signatureFileId,
        CancellationToken cancellationToken = default);

    Task<bool> CanUserReadAsync(
        long signatureFileId,
        long userId,
        CancellationToken cancellationToken = default);
}

