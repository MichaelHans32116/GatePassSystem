namespace GatePassSystem.Project.Models;

public sealed class AuthUser
{
    public long AccountId { get; init; }
    public long? EmployeeRecordId { get; init; }
    public string? EmployeeId { get; init; }
    public string Username { get; init; } = string.Empty;
    public string DisplayName { get; init; } = string.Empty;
    public string PasswordHash { get; init; } = string.Empty;
    public string AccountStatus { get; init; } = string.Empty;
    public bool AccountAllowsLogin { get; init; }
    public bool MustChangePassword { get; init; }
    public long? DepartmentId { get; init; }
    public string? Department { get; init; }
    public string? Position { get; init; }
    public IReadOnlyList<string> Roles { get; init; } = [];
    public IReadOnlyList<string> Permissions { get; init; } = [];
    public IReadOnlyList<DepartmentAccessRecord> ManagedDepartments { get; init; } = [];
    public IReadOnlyList<DepartmentAccessRecord> RequestableDepartments { get; init; } = [];
}

public sealed class DepartmentAccessRecord
{
    public long DepartmentId { get; init; }
    public string DepartmentCode { get; init; } = string.Empty;
    public string DepartmentName { get; init; } = string.Empty;

    public DepartmentAccessRecord()
    {
    }

    public DepartmentAccessRecord(
        long departmentId,
        string departmentCode,
        string departmentName)
    {
        DepartmentId = departmentId;
        DepartmentCode = departmentCode;
        DepartmentName = departmentName;
    }
}
