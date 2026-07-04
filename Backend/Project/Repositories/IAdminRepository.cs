using FormRequestSystem.Project.DTOs.Admin;
using FormRequestSystem.Project.DTOs.Common;
using FormRequestSystem.Project.Models;

namespace FormRequestSystem.Project.Repositories;

public interface IAdminRepository
{
    Task<PagedResult<AdminUserRecord>> GetUsersAsync(
        AdminUserQuery query,
        CancellationToken cancellationToken = default);
    Task<long> SaveUserAsync(
        long? userId,
        SaveAdminUserRequest request,
        long changedByUserId,
        string? passwordHash,
        CancellationToken cancellationToken = default);
    Task ArchiveUserAsync(
        long userId,
        CancellationToken cancellationToken = default);
    Task<IReadOnlyList<DepartmentAdminRecord>> GetDepartmentsAsync(
        bool includeInactive,
        CancellationToken cancellationToken = default);
    Task<long> SaveDepartmentAsync(
        long? departmentId,
        SaveDepartmentRequest request,
        CancellationToken cancellationToken = default);
    Task ArchiveDepartmentAsync(
        long departmentId,
        CancellationToken cancellationToken = default);
    Task<IReadOnlyList<RoleAdminRecord>> GetRolesAsync(
        bool includeInactive,
        CancellationToken cancellationToken = default);
    Task<long> SaveRoleAsync(
        long? roleId,
        SaveRoleRequest request,
        CancellationToken cancellationToken = default);
    Task ArchiveRoleAsync(
        long roleId,
        CancellationToken cancellationToken = default);
    Task<IReadOnlyList<PermissionAdminRecord>> GetPermissionsAsync(
        CancellationToken cancellationToken = default);
}

