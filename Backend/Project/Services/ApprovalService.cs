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

        var decisionContext = await approvalRepository.GetDecisionContextAsync(
            gatePassId,
            actorUserId,
            cancellationToken);
        if (decisionContext is null)
        {
            return ServiceResult<ApprovalDecisionResult>.Failure(
                "APPROVAL_NOT_AVAILABLE",
                "This request is not available for your approval.");
        }

        var resolvedTripType = request.TripType?.Trim().ToUpperInvariant();
        if (approve && decisionContext.ApprovalStepCode == "HRAD_ASSIGN")
        {
            if (!string.Equals(
                    decisionContext.VehicleUsageCode,
                    "COMPANY",
                    StringComparison.OrdinalIgnoreCase) ||
                !request.VehicleId.HasValue || request.VehicleId.Value <= 0)
            {
                return ServiceResult<ApprovalDecisionResult>.Failure(
                    "VEHICLE_REQUIRED",
                    "Select the company vehicle before forwarding.");
            }

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

            resolvedTripType = string.IsNullOrWhiteSpace(decisionContext.VehicleTripTypeCode)
                ? resolvedTripType
                : decisionContext.VehicleTripTypeCode.Trim().ToUpperInvariant();
            var dropOffOnly =
                string.Equals(
                    decisionContext.FormTypeCode,
                    "MATERIAL_GATE_PASS",
                    StringComparison.OrdinalIgnoreCase) ||
                !decisionContext.WillReturn;
            // Bug 1: when the associate returns, they may request Hatid at Sundo (BOTH),
            // Hatid lang (HATID, drop-off only) or Sundo lang (SUNDO, pick-up only).
            // A material pass or a no-return (time-out only) trip can only be a drop-off.
            var allowedTripTypes = dropOffOnly
                ? new[] { "HATID" }
                : new[] { "BOTH", "HATID", "SUNDO" };

            if (string.IsNullOrWhiteSpace(resolvedTripType))
            {
                return ServiceResult<ApprovalDecisionResult>.Failure(
                    "TRIP_TYPE_REQUIRED",
                    "Select the trip type before forwarding.");
            }

            if (Array.IndexOf(allowedTripTypes, resolvedTripType) < 0)
            {
                return ServiceResult<ApprovalDecisionResult>.Failure(
                    "INVALID_TRIP_TYPE",
                    dropOffOnly
                        ? "This request only allows Hatid lang."
                        : "Select Hatid at Sundo, Hatid lang, or Sundo lang.");
            }

            var hasSecondaryWindow =
                request.SecondaryExpectedOutAt.HasValue ||
                request.SecondaryExpectedInAt.HasValue;

            if (hasSecondaryWindow &&
                !string.Equals(resolvedTripType, "BOTH", StringComparison.OrdinalIgnoreCase))
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

        ApprovalMutation? mutation;
        try
        {
            mutation = await approvalRepository.DecideAsync(
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
                resolvedTripType,
                request.ExpectedOutAt?.UtcDateTime,
                request.ExpectedInAt?.UtcDateTime,
                request.SecondaryExpectedOutAt?.UtcDateTime,
                request.SecondaryExpectedInAt?.UtcDateTime,
                traceId,
                cancellationToken);
        }
        catch (VehicleReservationConflictException exception)
        {
            return ServiceResult<ApprovalDecisionResult>.Failure(
                "VEHICLE_UNAVAILABLE",
                exception.Message);
        }

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

