using GatePassSystem.Project.DTOs.Admin;
using GatePassSystem.Project.DTOs.Common;
using GatePassSystem.Project.Models;
using GatePassSystem.Project.Repositories;

namespace GatePassSystem.Project.Services;

public sealed class AdminService(
    IAdminRepository repository,
    IPasswordHasher passwordHasher) : IAdminService
{
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
        CancellationToken cancellationToken = default) =>
        repository.SaveDepartmentAsync(departmentId, request, cancellationToken);

    public Task ArchiveDepartmentAsync(long departmentId, CancellationToken cancellationToken = default) =>
        repository.ArchiveDepartmentAsync(departmentId, cancellationToken);

    public Task<IReadOnlyList<RoleAdminRecord>> GetRolesAsync(
        bool includeInactive,
        CancellationToken cancellationToken = default) =>
        repository.GetRolesAsync(includeInactive, cancellationToken);

    public Task<long> SaveRoleAsync(
        long? roleId,
        SaveRoleRequest request,
        CancellationToken cancellationToken = default) =>
        repository.SaveRoleAsync(roleId, request, cancellationToken);

    public Task ArchiveRoleAsync(long roleId, CancellationToken cancellationToken = default) =>
        repository.ArchiveRoleAsync(roleId, cancellationToken);

    public Task<IReadOnlyList<PermissionAdminRecord>> GetPermissionsAsync(
        CancellationToken cancellationToken = default) =>
        repository.GetPermissionsAsync(cancellationToken);
}
