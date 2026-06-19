using GatePassSystem.Project.DTOs.Common;
using GatePassSystem.Project.DTOs.GatePass;
using GatePassSystem.Project.Models;

namespace GatePassSystem.Project.Services;

public interface IGatePassService
{
    Task<ServiceResult<GatePassCreationResult>> CreateAsync(
        long requesterUserId,
        CreateGatePassRequest request,
        string traceId,
        CancellationToken cancellationToken = default);

    Task<GatePassDetail?> GetDetailAsync(
        long gatePassId,
        CancellationToken cancellationToken = default);

    Task<PagedResult<GatePassRecord>> GetMyRequestsAsync(
        long requesterUserId,
        GatePassQuery query,
        CancellationToken cancellationToken = default);

    Task<PagedResult<GatePassRecord>> GetAllAsync(
        GatePassQuery query,
        CancellationToken cancellationToken = default);
}

