using FormRequestSystem.Project.DTOs.Common;
using FormRequestSystem.Project.DTOs.GatePass;
using FormRequestSystem.Project.Models;

namespace FormRequestSystem.Project.Services;

public interface IGatePassService
{
    Task<ServiceResult<GatePassCreationResult>> CreateAsync(
        long requesterUserId,
        CreateGatePassRequest request,
        string traceId,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<GatePassCreationResult>> CreateMaterialAsync(
        long requesterUserId,
        CreateMaterialGatePassRequest request,
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

    Task<ServiceResult<QrTokenResponse>> GetQrTokenAsync(
        long gatePassId,
        CancellationToken cancellationToken = default);

    Task<bool> DeleteForTestingAsync(
        long gatePassId,
        CancellationToken cancellationToken = default);
}

