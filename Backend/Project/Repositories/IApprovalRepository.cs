using FormRequestSystem.Project.Models;

namespace FormRequestSystem.Project.Repositories;

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
        DateTime? expectedOutAt,
        DateTime? expectedInAt,
        DateTime? secondaryExpectedOutAt,
        DateTime? secondaryExpectedInAt,
        string traceId,
        CancellationToken cancellationToken = default);
}


