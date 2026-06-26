using System.Text.Json;
using GatePassSystem.Project.DTOs.Common;
using GatePassSystem.Project.DTOs.GatePass;
using GatePassSystem.Project.Models;
using GatePassSystem.Project.Repositories;

namespace GatePassSystem.Project.Services;

public sealed class ApprovalService(
    IApprovalRepository approvalRepository,
    IOperationsRepository operationsRepository,
    IQrTokenService qrTokenService,
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
            ? qrTokenService.CreateToken(gatePassId)
            : null;
        var qrHash = rawQrToken is null
            ? null
            : qrTokenService.HashToken(rawQrToken);
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
            request.VehicleId,
            request.DriverId,
            request.PutOnHold,
            request.TripType,
            traceId,
            cancellationToken);

        if (mutation is null)
        {
            return ServiceResult<ApprovalDecisionResult>.Failure(
                "APPROVAL_NOT_AVAILABLE",
                "This request is not available for your approval.");
        }

        var issuedQrToken =
            mutation.NewStatus == "APPROVED"
                ? rawQrToken
                : null;

        await operationsRepository.WriteAuditAsync(
            actorUserId,
            approve ? "FORM_REQUEST_APPROVED" : "FORM_REQUEST_REJECTED",
            "FORM_REQUEST",
            gatePassId,
            JsonSerializer.Serialize(new
            {
                mutation.FormTypeCode,
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

}
