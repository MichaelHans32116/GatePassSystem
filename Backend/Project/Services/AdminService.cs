using FormRequestSystem.Project.DTOs.Admin;
using FormRequestSystem.Project.DTOs.Common;
using FormRequestSystem.Project.Models;
using FormRequestSystem.Project.Repositories;

namespace FormRequestSystem.Project.Services;

public sealed class AdminService(
    IAdminRepository repository,
    IPasswordHasher passwordHasher) : IAdminService
{
    private static readonly HashSet<string> AccountTypes =
        new(StringComparer.OrdinalIgnoreCase)
        {
            "EMPLOYEE",
            "SECURITY_AGENCY",
            "SYSTEM"
        };

    private static readonly HashSet<string> AccountStatuses =
        new(StringComparer.OrdinalIgnoreCase)
        {
            "ACTIVE",
            "LOCKED",
            "ARCHIVED"
        };

    public Task<PagedResult<AdminUserRecord>> GetUsersAsync(
        AdminUserQuery query,
        CancellationToken cancellationToken = default) =>
        repository.GetUsersAsync(query, cancellationToken);

    public Task<long> SaveUserAsync(
        long? userId,
        SaveAdminUserRequest request,
        long changedByUserId,
        CancellationToken cancellationToken = default)
    {
        var accountType = request.AccountTypeCode?.Trim();
        var accountStatus = request.AccountStatusCode?.Trim();

        if (string.IsNullOrWhiteSpace(request.Username) ||
            string.IsNullOrWhiteSpace(request.DisplayName) ||
            request.RoleCodes is null ||
            request.RoleCodes.All(string.IsNullOrWhiteSpace))
        {
            throw new InvalidOperationException(
                "Username, display name, and at least one role are required.");
        }

        if (string.IsNullOrWhiteSpace(accountType) ||
            !AccountTypes.Contains(accountType))
        {
            throw new InvalidOperationException("The selected account type is invalid.");
        }

        if (accountType.Equals("EMPLOYEE", StringComparison.OrdinalIgnoreCase) &&
            string.IsNullOrWhiteSpace(request.EmployeeId))
        {
            throw new InvalidOperationException(
                "An active Employee ID is required for an employee account.");
        }

        if (string.IsNullOrWhiteSpace(accountStatus) ||
            !AccountStatuses.Contains(accountStatus))
        {
            throw new InvalidOperationException("The selected account status is invalid.");
        }

        if (!userId.HasValue && string.IsNullOrWhiteSpace(request.Password))
        {
            throw new InvalidOperationException(
                "An initial password is required for a new user.");
        }

        var hash = string.IsNullOrWhiteSpace(request.Password)
            ? null
            : passwordHasher.Hash(request.Password);
        return repository.SaveUserAsync(
            userId,
            request,
            changedByUserId,
            hash,
            cancellationToken);
    }

    public Task ArchiveUserAsync(long userId, CancellationToken cancellationToken = default) =>
        repository.ArchiveUserAsync(userId, cancellationToken);

    public Task<IReadOnlyList<DepartmentAdminRecord>> GetDepartmentsAsync(
        bool includeInactive,
        CancellationToken cancellationToken = default) =>
        repository.GetDepartmentsAsync(includeInactive, cancellationToken);

    public Task<long> SaveDepartmentAsync(
        long? departmentId,
        SaveDepartmentRequest request,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.DepartmentCode) ||
            string.IsNullOrWhiteSpace(request.DepartmentName))
        {
            throw new InvalidOperationException(
                "Department code and department name are required.");
        }

        return repository.SaveDepartmentAsync(
            departmentId,
            request,
            cancellationToken);
    }

    public Task ArchiveDepartmentAsync(long departmentId, CancellationToken cancellationToken = default) =>
        repository.ArchiveDepartmentAsync(departmentId, cancellationToken);

    public Task<IReadOnlyList<RoleAdminRecord>> GetRolesAsync(
        bool includeInactive,
        CancellationToken cancellationToken = default) =>
        repository.GetRolesAsync(includeInactive, cancellationToken);

    public Task<long> SaveRoleAsync(
        long? roleId,
        SaveRoleRequest request,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.RoleCode) ||
            string.IsNullOrWhiteSpace(request.RoleName))
        {
            throw new InvalidOperationException(
                "Role code and role name are required.");
        }

        return repository.SaveRoleAsync(roleId, request, cancellationToken);
    }

    public Task ArchiveRoleAsync(long roleId, CancellationToken cancellationToken = default) =>
        repository.ArchiveRoleAsync(roleId, cancellationToken);

    public Task<IReadOnlyList<PermissionAdminRecord>> GetPermissionsAsync(
        CancellationToken cancellationToken = default) =>
        repository.GetPermissionsAsync(cancellationToken);
}

