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
        long? vehicleId,
        long? driverId,
        bool? putOnHold,
        string? tripType,
        string traceId,
        CancellationToken cancellationToken = default);

    Task<ApprovalMutation?> CancelAsync(
        long gatePassId,
        long actorUserId,
        string remarks,
        string traceId,
        CancellationToken cancellationToken = default);
}

