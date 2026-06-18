using GatePassSystem.Project.Models;

namespace GatePassSystem.Project.DTOs.Auth;

public sealed class AuthUserResponse
{
    public long Id { get; init; }
    public string? EmployeeId { get; init; }
    public string Username { get; init; } = string.Empty;
    public string FullName { get; init; } = string.Empty;
    public string? Department { get; init; }
    public string? Position { get; init; }
    public bool MustChangePassword { get; init; }
    public IReadOnlyList<string> Roles { get; init; } = [];
    public IReadOnlyList<string> Permissions { get; init; } = [];

    public static AuthUserResponse FromModel(AuthUser user) =>
        new()
        {
            Id = user.AccountId,
            EmployeeId = user.EmployeeId,
            Username = user.Username,
            FullName = user.DisplayName,
            Department = user.Department,
            Position = user.Position,
            MustChangePassword = user.MustChangePassword,
            Roles = user.Roles,
            Permissions = user.Permissions
        };
}
