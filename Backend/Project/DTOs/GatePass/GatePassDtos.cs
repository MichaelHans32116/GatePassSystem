using System.ComponentModel.DataAnnotations;
using FormRequestSystem.Project.Models;

namespace FormRequestSystem.Project.DTOs.GatePass;

public sealed class CreateGatePassRequest
{
    public long? RequesterDepartmentId { get; init; }
    public long? PreparedBySignatureFileId { get; init; }

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

    [StringLength(20)]
    public string? VehicleTripTypeCode { get; init; }

    // Phase 17 item 1: false when the requestor files the pass for other
    // people only and does not go out with them. Defaults to true so older
    // clients keep the original "requestor is aboard" behavior.
    public bool IncludesRequestor { get; init; } = true;

    // Phase 11 / Requirement 5: optional additional associates/companions.
    // The directory-selected companions who accompany the requester. These
    // are stored line_no=2..N; line_no=1 is the primary (see service).
    [MaxLength(20)]
    public IReadOnlyList<AssociateRequest> Associates { get; init; } = [];
}

public sealed class CreateMaterialGatePassRequest
{
    public long? RequesterDepartmentId { get; init; }
    public long AuthorizedEmployeeId { get; init; }
    public DateOnly FormDate { get; init; }

    [StringLength(1000)]
    public string? Remarks { get; init; }

    public long? PreparedBySignatureFileId { get; init; }

    [Required]
    public string VehicleUsageCode { get; init; } = "NONE";

    [StringLength(255)]
    public string? PrivateVehicleDetails { get; init; }

    public IReadOnlyList<long> ProofFileIds { get; init; } = [];

    [Required, MinLength(1), MaxLength(20)]
    public IReadOnlyList<MaterialGatePassItemRequest> Items { get; init; } = [];

    // Phase 11 / Requirement 5: optional additional associates/companions.
    // The AuthorizedEmployeeId above remains the PRIMARY (line_no=1); these
    // are extra companions stored as line_no=2..N.
    [MaxLength(20)]
    public IReadOnlyList<AssociateRequest> Associates { get; init; } = [];
}

public sealed class MaterialGatePassItemRequest
{
    [StringLength(80)]
    public string? ItemNo { get; init; }

    [Required, StringLength(500)]
    public string Description { get; init; } = string.Empty;

    [Range(typeof(decimal), "0.001", "999999999.999")]
    public decimal Quantity { get; init; }

    [Required, StringLength(50)]
    public string Unit { get; init; } = string.Empty;
}

public sealed class AssociateRequest
{
    // Employee companions carry an employee_record_id and the service
    // resolves name/department from the directory. Phase 17 item 4:
    // IsEmployee=false marks outside companions (visitors, OJTs) — they have
    // no EmployeeId and FullName becomes the stored name instead.
    public long? EmployeeId { get; init; }

    public bool IsEmployee { get; init; } = true;

    [StringLength(255)]
    public string? FullName { get; init; }
}

public sealed class GatePassQuery
{
    public string? FormTypeCode { get; init; }
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
    long? SignatureFileId,
    long? VehicleId = null,
    long? DriverId = null,
    bool? PutOnHold = null,
    string? FormTypeCode = null,
    bool? WillReturn = null,
    string? TripType = null,
    DateTimeOffset? ExpectedOutAt = null,
    DateTimeOffset? ExpectedInAt = null,
    DateTimeOffset? SecondaryExpectedOutAt = null,
    DateTimeOffset? SecondaryExpectedInAt = null);

public sealed record ApprovalDecisionResult(
    long GatePassId,
    string PreviousStatus,
    string NewStatus,
    string? NextApprovalStep,
    string? QrToken);

public sealed record SecurityScanRequest(
    string? QrToken,
    string? ManualGatePassNo,
    long? SignatureFileId);

public sealed record SecurityScanResult(
    long? GatePassId,
    string ResultCode,
    string Message,
    string? RequestStatus,
    DateTimeOffset? RecordedAt,
    int? CooldownSecondsRemaining = null);

public sealed record QrTokenResponse(
    long GatePassId,
    string GatePassNo,
    string QrToken,
    DateTimeOffset? ExpiresAt);

public sealed record EmployeeLookupResponse(
    long EmployeeRecordId,
    string EmployeeId,
    string FullName,
    long? DepartmentId,
    string? DepartmentName,
    string PositionName);

