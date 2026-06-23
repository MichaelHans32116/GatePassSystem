using GatePassSystem.Project.Models;

namespace GatePassSystem.Project.DTOs.Auth;

public sealed class AuthUserResponse
{
    public long Id { get; init; }
    public string? EmployeeId { get; init; }
    public string Username { get; init; } = string.Empty;
    public string FullName { get; init; } = string.Empty;
    public long? DepartmentId { get; init; }
    public string? Department { get; init; }
    public string? Position { get; init; }
    public string? EmployeeQrToken { get; init; }
    public bool MustChangePassword { get; init; }
    public IReadOnlyList<string> Roles { get; init; } = [];
    public IReadOnlyList<string> Permissions { get; init; } = [];
    public IReadOnlyList<DepartmentAccessResponse> ManagedDepartments { get; init; } = [];
    public IReadOnlyList<DepartmentAccessResponse> RequestableDepartments { get; init; } = [];

    public static AuthUserResponse FromModel(
        AuthUser user,
        string? employeeQrToken = null) =>
        new()
        {
            Id = user.AccountId,
            EmployeeId = user.EmployeeId,
            Username = user.Username,
            FullName = user.DisplayName,
            DepartmentId = user.DepartmentId,
            Department = user.Department,
            Position = user.Position,
            EmployeeQrToken = employeeQrToken,
            MustChangePassword = user.MustChangePassword,
            Roles = user.Roles,
            Permissions = user.Permissions,
            ManagedDepartments = user.ManagedDepartments
                .Select(DepartmentAccessResponse.FromModel)
                .ToArray(),
            RequestableDepartments = user.RequestableDepartments
                .Select(DepartmentAccessResponse.FromModel)
                .ToArray()
        };
}

public sealed record DepartmentAccessResponse(
    long DepartmentId,
    string DepartmentCode,
    string DepartmentName)
{
    public static DepartmentAccessResponse FromModel(
        DepartmentAccessRecord department) =>
        new(
            department.DepartmentId,
            department.DepartmentCode,
            department.DepartmentName);
}
