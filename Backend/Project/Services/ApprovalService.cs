using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using GatePassSystem.Project.DTOs.Common;
using GatePassSystem.Project.DTOs.GatePass;
using GatePassSystem.Project.Models;
using GatePassSystem.Project.Repositories;

namespace GatePassSystem.Project.Services;

public sealed class ApprovalService(
    IApprovalRepository approvalRepository,
    IOperationsRepository operationsRepository,
    TimeProvider timeProvider) : IApprovalService
{
    public Task<IReadOnlyList<ApprovalQueueItem>> GetQueueAsync(
        long approverUserId,
        CancellationToken cancellationToken = default) =>
        approvalRepository.GetQueueAsync(
            approverUserId,
            cancellationToken);

    public async Task<ServiceResult<ApprovalDecisionResult>> DecideAsync(
        long gatePassId,
        long actorUserId,
        bool approve,
        ApprovalDecisionRequest request,
        string traceId,
        CancellationToken cancellationToken = default)
    {
        if (!approve && string.IsNullOrWhiteSpace(request.Comment))
        {
            return ServiceResult<ApprovalDecisionResult>.Failure(
                "REJECTION_REASON_REQUIRED",
                "A rejection reason is required.");
        }

        var rawQrToken = approve
            ? Convert.ToHexString(RandomNumberGenerator.GetBytes(32))
            : null;
        var qrHash = rawQrToken is null ? null : Sha256(rawQrToken);
        DateTime? qrExpiresAt = approve
            ? timeProvider.GetUtcNow().AddDays(7).UtcDateTime
            : null;

        var mutation = await approvalRepository.DecideAsync(
            gatePassId,
            actorUserId,
            approve,
            request.Comment,
            request.SignatureFileId,
            qrHash,
            qrExpiresAt,
            traceId,
            cancellationToken);

        if (mutation is null)
        {
            return ServiceResult<ApprovalDecisionResult>.Failure(
                "APPROVAL_NOT_AVAILABLE",
                "This request is not available for your approval.");
        }

        var issuedQrToken =
            mutation.NewStatus == "APPROVED" ? rawQrToken : null;

        await operationsRepository.WriteAuditAsync(
            actorUserId,
            approve ? "GATE_PASS_APPROVED" : "GATE_PASS_REJECTED",
            "GATE_PASS",
            gatePassId,
            JsonSerializer.Serialize(new
            {
                mutation.PreviousStatus,
                mutation.NewStatus,
                request.Comment
            }),
            null,
            null,
            traceId,
            cancellationToken);

        return ServiceResult<ApprovalDecisionResult>.Success(
            new ApprovalDecisionResult(
                gatePassId,
                mutation.PreviousStatus,
                mutation.NewStatus,
                mutation.NextApprovalStep,
                issuedQrToken));
    }

    private static string Sha256(string value) =>
        Convert.ToHexString(
            SHA256.HashData(Encoding.UTF8.GetBytes(value)));
}
