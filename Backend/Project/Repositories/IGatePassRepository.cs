using GatePassSystem.Project.DTOs.Common;
using GatePassSystem.Project.DTOs.GatePass;
using GatePassSystem.Project.Models;

namespace GatePassSystem.Project.Repositories;

public interface IGatePassRepository
{
    Task<GatePassRecord> CreateDraftAsync(
        RequesterContext requester,
        CreateGatePassRequest request,
        bool requiresSuperior,
        bool requiresPresident,
        string traceId,
        CancellationToken cancellationToken = default);

    Task<long?> FindApproverAsync(
        string approvalStepCode,
        long requesterUserId,
        long? departmentId,
        long? positionId,
        CancellationToken cancellationToken = default);

    Task CreateApprovalRouteAsync(
        long gatePassId,
        IReadOnlyList<(string StepCode, long ApproverUserId)> route,
        CancellationToken cancellationToken = default);

    Task<GatePassRecord> SubmitAsync(
        long gatePassId,
        long actorUserId,
        string initialStatus,
        string traceId,
        CancellationToken cancellationToken = default);

    Task<GatePassDetail?> GetDetailAsync(
        long gatePassId,
        CancellationToken cancellationToken = default);

    Task<PagedResult<GatePassRecord>> GetPagedAsync(
        GatePassQuery query,
        long? requesterUserId,
        CancellationToken cancellationToken = default);
}

