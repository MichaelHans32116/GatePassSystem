namespace FormRequestSystem.Project.DTOs.Admin;

public sealed class AdminUserQuery
{
    public string? Search { get; init; }
    public string? RoleCode { get; init; }
    public long? DepartmentId { get; init; }
    public string? AccountStatusCode { get; init; } = "ACTIVE";
    public DateOnly? HiredFrom { get; init; }
    public DateOnly? HiredTo { get; init; }
    public int Page { get; init; } = 1;
    public int PageSize { get; init; } = 100;
}

public sealed record SaveAdminUserRequest(
    string? EmployeeId,
    string Username,
    string DisplayName,
    string AccountTypeCode,
    string AccountStatusCode,
    bool MustChangePassword,
    string? Password,
    IReadOnlyList<string> RoleCodes);

public sealed record SaveDepartmentRequest(
    string DepartmentCode,
    string DepartmentName,
    string? Description,
    bool IsActive);

public sealed record SaveRoleRequest(
    string RoleCode,
    string RoleName,
    string? Description,
    bool IsActive,
    IReadOnlyList<string> PermissionCodes);

