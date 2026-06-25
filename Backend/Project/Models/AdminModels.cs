namespace GatePassSystem.Project.Models;

public sealed class AdminUserRecord
{
    public long UserId { get; init; }
    public long? EmployeeRecordId { get; init; }
    public string? EmployeeId { get; init; }
    public string Username { get; init; } = string.Empty;
    public string DisplayName { get; init; } = string.Empty;
    public string? DepartmentName { get; init; }
    public long? DepartmentId { get; init; }
    public string? PositionName { get; init; }
    public DateTime? DateHired { get; init; }
    public string AccountTypeCode { get; init; } = string.Empty;
    public string AccountStatusCode { get; init; } = string.Empty;
    public bool MustChangePassword { get; init; }
    public DateTime? LastLoginAt { get; init; }
    public DateTime CreatedAt { get; init; }
    public string RoleCodesCsv { get; init; } = string.Empty;
    public string ApprovalDepartmentNamesCsv { get; init; } = string.Empty;
    public IReadOnlyList<string> RoleCodes =>
        string.IsNullOrWhiteSpace(RoleCodesCsv)
            ? []
            : RoleCodesCsv.Split(',', StringSplitOptions.RemoveEmptyEntries);
    public IReadOnlyList<string> DepartmentNames =>
        new[] { DepartmentName }
            .Concat(
                string.IsNullOrWhiteSpace(ApprovalDepartmentNamesCsv)
                    ? []
                    : ApprovalDepartmentNamesCsv.Split(
                        '|',
                        StringSplitOptions.RemoveEmptyEntries))
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .Select(name => name!)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
}

public sealed class DepartmentAdminRecord
{
    public long DepartmentId { get; init; }
    public string DepartmentCode { get; init; } = string.Empty;
    public string DepartmentName { get; init; } = string.Empty;
    public string? Description { get; init; }
    public bool IsActive { get; init; }
    public long ActiveEmployeeCount { get; init; }
}

public sealed class RoleAdminRecord
{
    public long RoleId { get; init; }
    public string RoleCode { get; init; } = string.Empty;
    public string RoleName { get; init; } = string.Empty;
    public string? Description { get; init; }
    public bool IsSystemRole { get; init; }
    public bool IsActive { get; init; }
    public long ActiveUserCount { get; init; }
    public string PermissionCodesCsv { get; init; } = string.Empty;
    public IReadOnlyList<string> PermissionCodes =>
        string.IsNullOrWhiteSpace(PermissionCodesCsv)
            ? []
            : PermissionCodesCsv.Split(',', StringSplitOptions.RemoveEmptyEntries);
}

public sealed class PermissionAdminRecord
{
    public long PermissionId { get; init; }
    public string PermissionCode { get; init; } = string.Empty;
    public string? Description { get; init; }
}
