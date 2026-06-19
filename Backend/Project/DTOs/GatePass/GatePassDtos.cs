using System.ComponentModel.DataAnnotations;
using GatePassSystem.Project.Models;

namespace GatePassSystem.Project.DTOs.GatePass;

public sealed class CreateGatePassRequest
{
    [Required, StringLength(255)]
    public string Destination { get; init; } = string.Empty;

    [Required, StringLength(4000)]
    public string Purpose { get; init; } = string.Empty;

    public DateTimeOffset ExpectedOutAt { get; init; }
    public DateTimeOffset? ExpectedInAt { get; init; }
    public bool WillReturn { get; init; } = true;

    [Required]
    public string VehicleUsageCode { get; init; } = "NONE";

    public long? VehicleId { get; init; }

    [StringLength(255)]
    public string? PrivateVehicleDetails { get; init; }

    public long? DriverId { get; init; }
}

public sealed class GatePassQuery
{
    public string? StatusCode { get; init; }
    public long? DepartmentId { get; init; }
    public DateTimeOffset? FromAppliedAt { get; init; }
    public DateTimeOffset? ToAppliedAt { get; init; }
    public string? Search { get; init; }
    public int Page { get; init; } = 1;
    public int PageSize { get; init; } = 25;
}

public sealed record GatePassCreationResult(
    GatePassRecord GatePass,
    IReadOnlyList<string> ApprovalRoute);

public sealed record ApprovalDecisionRequest(
    string? Comment,
    long? SignatureFileId);

public sealed record ApprovalDecisionResult(
    long GatePassId,
    string PreviousStatus,
    string NewStatus,
    string? NextApprovalStep,
    string? QrToken);

public sealed record SecurityScanRequest(
    string? QrToken,
    string? ManualGatePassNo);

public sealed record SecurityScanResult(
    long? GatePassId,
    string ResultCode,
    string Message,
    string? RequestStatus,
    DateTimeOffset? RecordedAt);

public sealed record QrTokenResponse(
    long GatePassId,
    string GatePassNo,
    string QrToken,
    DateTimeOffset? ExpiresAt);
