using GatePassSystem.Project.DTOs.Common;
using GatePassSystem.Project.DTOs.GatePass;
using GatePassSystem.Project.Models;

namespace GatePassSystem.Project.Services;

public interface IApprovalService
{
    Task<IReadOnlyList<ApprovalQueueItem>> GetQueueAsync(
        long approverUserId,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<ApprovalDecisionResult>> DecideAsync(
        long gatePassId,
        long actorUserId,
        bool approve,
        ApprovalDecisionRequest request,
        string traceId,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<GatePassCancelResult>> CancelAsync(
        long gatePassId,
        long actorUserId,
        GatePassCancelRequest request,
        string traceId,
        CancellationToken cancellationToken = default);
}

