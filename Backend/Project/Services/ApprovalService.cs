using System.Text.Json;
using FormRequestSystem.Project.DTOs.Common;
using FormRequestSystem.Project.DTOs.GatePass;
using FormRequestSystem.Project.Models;
using FormRequestSystem.Project.Repositories;

namespace FormRequestSystem.Project.Services;

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

        if (approve && request.VehicleId.HasValue)
        {
            if (!request.ExpectedOutAt.HasValue || !request.ExpectedInAt.HasValue)
            {
                return ServiceResult<ApprovalDecisionResult>.Failure(
                    "SCHEDULE_TIME_REQUIRED",
                    "Set the HRAD schedule start and end before forwarding.");
            }

            if (request.ExpectedInAt <= request.ExpectedOutAt)
            {
                return ServiceResult<ApprovalDecisionResult>.Failure(
                    "INVALID_SCHEDULE_RANGE",
                    "Schedule end must be later than schedule start.");
            }

            var tripType = request.TripType?.Trim().ToUpperInvariant();
            var formTypeCode = request.FormTypeCode?.Trim().ToUpperInvariant();
            var willReturn = request.WillReturn == true;
            var allowedTripType = string.Equals(formTypeCode, "MATERIAL_GATE_PASS", StringComparison.OrdinalIgnoreCase) || !willReturn
                ? "HATID"
                : "BOTH";

            if (string.IsNullOrWhiteSpace(tripType))
            {
                return ServiceResult<ApprovalDecisionResult>.Failure(
                    "TRIP_TYPE_REQUIRED",
                    "Select the trip type before forwarding.");
            }

            if (!string.Equals(tripType, allowedTripType, StringComparison.OrdinalIgnoreCase))
            {
                return ServiceResult<ApprovalDecisionResult>.Failure(
                    "INVALID_TRIP_TYPE",
                    allowedTripType == "HATID"
                        ? "This request only allows Hatid lang."
                        : "This request only allows Hatid at Sundo.");
            }

            var hasSecondaryWindow =
                request.SecondaryExpectedOutAt.HasValue ||
                request.SecondaryExpectedInAt.HasValue;

            if (hasSecondaryWindow &&
                !string.Equals(tripType, "BOTH", StringComparison.OrdinalIgnoreCase))
            {
                return ServiceResult<ApprovalDecisionResult>.Failure(
                    "SECONDARY_WINDOW_NOT_ALLOWED",
                    "Split schedule windows are only allowed for Hatid at Sundo.");
            }

            if (request.SecondaryExpectedOutAt.HasValue != request.SecondaryExpectedInAt.HasValue)
            {
                return ServiceResult<ApprovalDecisionResult>.Failure(
                    "SCHEDULE_TIME_REQUIRED",
                    "Set both split schedule times before forwarding.");
            }

            if (request.SecondaryExpectedOutAt.HasValue &&
                request.SecondaryExpectedInAt <= request.SecondaryExpectedOutAt)
            {
                return ServiceResult<ApprovalDecisionResult>.Failure(
                    "INVALID_SCHEDULE_RANGE",
                    "The split schedule end must be later than the split schedule start.");
            }

            if (request.SecondaryExpectedOutAt.HasValue &&
                request.SecondaryExpectedOutAt <= request.ExpectedInAt)
            {
                return ServiceResult<ApprovalDecisionResult>.Failure(
                    "INVALID_SCHEDULE_RANGE",
                    "Split schedule windows must leave a gap between the primary and secondary trips.");
            }
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
            request.ExpectedOutAt?.UtcDateTime,
            request.ExpectedInAt?.UtcDateTime,
            request.SecondaryExpectedOutAt?.UtcDateTime,
            request.SecondaryExpectedInAt?.UtcDateTime,
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

