using GatePassSystem.Project.Models;

namespace GatePassSystem.Project.Repositories;

public interface IApprovalRepository
{
    Task<IReadOnlyList<ApprovalQueueItem>> GetQueueAsync(
        long approverUserId,
        CancellationToken cancellationToken = default);

    Task<ApprovalMutation?> DecideAsync(
        long gatePassId,
        long actorUserId,
        bool approve,
        string? comment,
        long? signatureFileId,
        string? qrTokenHash,
        DateTime? qrExpiresAt,
        string traceId,
        CancellationToken cancellationToken = default);
}

