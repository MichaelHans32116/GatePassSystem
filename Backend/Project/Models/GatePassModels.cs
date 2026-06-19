namespace GatePassSystem.Project.Models;

public sealed class RequesterContext
{
    public long UserId { get; init; }
    public long EmployeeRecordId { get; init; }
    public long DepartmentId { get; init; }
    public long PositionId { get; init; }
    public string EmployeeId { get; init; } = string.Empty;
    public string FullName { get; init; } = string.Empty;
    public IReadOnlyList<string> Roles { get; init; } = [];
}

public class GatePassRecord
{
    public long GatePassId { get; init; }
    public string GatePassNo { get; init; } = string.Empty;
    public long RequesterUserId { get; init; }
    public string EmployeeId { get; init; } = string.Empty;
    public string FullName { get; init; } = string.Empty;
    public string DepartmentName { get; init; } = string.Empty;
    public string PositionName { get; init; } = string.Empty;
    public string Destination { get; init; } = string.Empty;
    public string Purpose { get; init; } = string.Empty;
    public string GatePassStatusCode { get; init; } = string.Empty;
    public string StatusName { get; init; } = string.Empty;
    public string StatusGroup { get; init; } = string.Empty;
    public DateTime? AppliedAt { get; init; }
    public DateTime? ApprovalCompletedAt { get; init; }
    public DateTime? ApprovedAt { get; init; }
    public DateTime? RejectedAt { get; init; }
    public DateTime? CancelledAt { get; init; }
    public DateTime? ExpiredAt { get; init; }
    public DateTime ExpectedOutAt { get; init; }
    public DateTime? ExpectedInAt { get; init; }
    public DateTime? ActualOutAt { get; init; }
    public DateTime? ActualInAt { get; init; }
    public DateTime? CompletedAt { get; init; }
    public string? ApplicationOutcomeCode { get; init; }
    public DateTime CreatedAt { get; init; }
    public DateTime UpdatedAt { get; init; }
}

public sealed class GatePassDetail : GatePassRecord
{
    public bool WillReturn { get; init; }
    public string VehicleUsageCode { get; init; } = string.Empty;
    public long? VehicleId { get; init; }
    public string? VehicleName { get; init; }
    public string? PlateNumber { get; init; }
    public long? DriverId { get; init; }
    public string? DriverName { get; init; }
    public int VersionNo { get; init; }
    public IReadOnlyList<ApprovalStepRecord> ApprovalSteps { get; init; } = [];
    public IReadOnlyList<GatePassScanRecord> Scans { get; init; } = [];
}

public sealed class ApprovalStepRecord
{
    public long ApprovalStepId { get; init; }
    public long GatePassId { get; init; }
    public int SequenceNo { get; init; }
    public string ApprovalStepCode { get; init; } = string.Empty;
    public long AssignedApproverUserId { get; init; }
    public string ApproverName { get; init; } = string.Empty;
    public string ApprovalStatusCode { get; init; } = string.Empty;
    public string? Comments { get; init; }
    public DateTime? ActedAt { get; init; }
}

public sealed class ApprovalQueueItem
{
    public long GatePassId { get; init; }
    public string GatePassNo { get; init; } = string.Empty;
    public long ApprovalStepId { get; init; }
    public string ApprovalStepCode { get; init; } = string.Empty;
    public string EmployeeId { get; init; } = string.Empty;
    public string FullName { get; init; } = string.Empty;
    public string DepartmentName { get; init; } = string.Empty;
    public string Destination { get; init; } = string.Empty;
    public string Purpose { get; init; } = string.Empty;
    public DateTime ExpectedOutAt { get; init; }
    public DateTime? ExpectedInAt { get; init; }
    public DateTime? AppliedAt { get; init; }
}

public sealed class GatePassScanRecord
{
    public long ScanId { get; init; }
    public long? GatePassId { get; init; }
    public long ScannedByUserId { get; init; }
    public string ScanMethodCode { get; init; } = string.Empty;
    public string ScanActionCode { get; init; } = string.Empty;
    public string ResultCode { get; init; } = string.Empty;
    public string Message { get; init; } = string.Empty;
    public DateTime ScannedAt { get; init; }
}

public sealed record ApprovalMutation(
    long GatePassId,
    string PreviousStatus,
    string NewStatus,
    string? NextApprovalStep);
