using GatePassSystem.Project.DTOs.Fleet;
using GatePassSystem.Project.Models;

namespace GatePassSystem.Project.Repositories;

public interface ISignatureRepository
{
    Task<SignatureFileRecord> CreateAsync(
        long ownerUserId,
        SignatureMetadataRequest request,
        CancellationToken cancellationToken = default);

    Task<SignatureFileRecord?> GetAsync(
        long signatureFileId,
        CancellationToken cancellationToken = default);
}

