namespace GatePassSystem.Project.Models;

public sealed class VehicleRecord
{
    public long VehicleId { get; init; }
    public string VehicleName { get; init; } = string.Empty;
    public string PlateNumber { get; init; } = string.Empty;
    public string? VehicleType { get; init; }
    public int? Capacity { get; init; }
    public long? DefaultDriverId { get; init; }
    public string VehicleStatusCode { get; init; } = string.Empty;
    public string AvailabilityStatusCode { get; init; } = string.Empty;
    public string? Remarks { get; init; }
    public bool IsActive { get; init; }
}

public sealed class DriverRecord
{
    public long DriverId { get; init; }
    public long? EmployeeRecordId { get; init; }
    public string FullName { get; init; } = string.Empty;
    public string DriverTypeCode { get; init; } = string.Empty;
    public string? LicenseNumber { get; init; }
    public DateTime? LicenseExpiryDate { get; init; }
    public bool IsActive { get; init; }
}

public sealed class SecurityQueueItem
{
    public long GatePassId { get; init; }
    public string GatePassNo { get; init; } = string.Empty;
    public string ControlNo { get; init; } = string.Empty;
    public string GatePassStatusCode { get; init; } = string.Empty;
    public string StatusName { get; init; } = string.Empty;
    public bool WillReturn { get; init; }
    public DateTime ExpectedOutAt { get; init; }
    public DateTime? ExpectedInAt { get; init; }
    public DateTime? ActualOutAt { get; init; }
    public DateTime? ActualInAt { get; init; }
    public long? EmployeeRecordId { get; init; }
    public string EmployeeId { get; init; } = string.Empty;
    public string FullName { get; init; } = string.Empty;
    public string DepartmentName { get; init; } = string.Empty;
    public string? VehicleName { get; init; }
    public string? PlateNumber { get; init; }
    public string? DriverName { get; init; }
}

public sealed class SignatureFileRecord
{
    public long SignatureFileId { get; init; }
    public long OwnerUserId { get; init; }
    public string FileName { get; init; } = string.Empty;
    public string ContentType { get; init; } = string.Empty;
    public string StoragePath { get; init; } = string.Empty;
    public string ContentSha256 { get; init; } = string.Empty;
    public int? WidthPercent { get; init; }
    public int? YOffset { get; init; }
    public bool IsActive { get; init; }
    public DateTime CreatedAt { get; init; }
}

public sealed class DashboardSnapshot
{
    public long TotalApplications { get; init; }
    public long PendingApplications { get; init; }
    public long ApprovedApplications { get; init; }
    public long RejectedApplications { get; init; }
    public long CurrentlyOutside { get; init; }
    public long CompletedTransactions { get; init; }
    public IReadOnlyList<DashboardStatusCount> StatusCounts { get; init; } = [];
}

public sealed class DashboardStatusCount
{
    public string GatePassStatusCode { get; init; } = string.Empty;
    public long RecordCount { get; init; }
}

